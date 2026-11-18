/**
 * 生成模式：输入描述 -> 流式生成 -> （校验 / 自动修复）-> 接受后写入文档
 *
 * - runGenerateMode：单一类型（转图表 / 转公式）
 * - runUnifiedGenerateMode：统一 AI 助手弹窗，下拉切换内置指令与自定义指令
 *
 * 两者都支持在上一轮结果基础上继续调整（多轮对话）。
 * Mermaid / LaTeX 结果生成完先本地解析，失败时把报错回传给模型重新生成，
 * 最多 MAX_REPAIR_ATTEMPTS 次，弹窗显示「自动修复中 n/max」。
 *
 * @changelog
 * | 版本   | 变更说明                                      | 关联                           |
 * | v1.0.0 | 从 generator.ts 拆出，改用 AiSession          | REQ: AI 架构改造#3             |
 * | v2.0.0 | 多轮继续调整；Mermaid/LaTeX 校验与自动修复    | REQ: AI 体验短板-追问/输出校验 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { startCommand } from '@/services/ai/generation';
import { recordAiHistory } from '@/services/ai/history';
import type { AiRuntime } from '@/services/ai/runtime';
import { createAiSession, type AiSession } from '@/services/ai/session';
import type { AiTokenUsage } from '@/services/ai/usage';
import type { AiCommand } from '@/types/ai';

import { cleanOutput } from '../commit/clean-output';
import { commitResult } from '../commit/commit-result';
import {
  MAX_REPAIR_ATTEMPTS,
  buildRepairInstruction,
  validateGenerated,
  validationKindOf,
} from '../commit/validate-output';
import { buildPromptInput } from '../context/prompt-input';
import type { AiModeInput, AiRunContext } from '../types';
import {
  createGeneratorPopup,
  createUnifiedGeneratorPopup,
  type GeneratorCommandOption,
  type GeneratorPopupHandle,
  type GeneratorPopupType,
} from '../ui/generator-popup';

/** 用于按 id 延迟解析 AiCommand 的回调 */
export type CommandResolver = (commandId: string) => AiCommand | null;

/** 累加多次请求（含自动修复轮次）的用量 */
function addUsage(total: AiTokenUsage | null, usage: AiTokenUsage): AiTokenUsage {
  if (!total) return usage;
  return {
    promptTokens: total.promptTokens + usage.promptTokens,
    completionTokens: total.completionTokens + usage.completionTokens,
    estimated: total.estimated || usage.estimated,
  };
}

interface GenerateSession {
  session: AiSession;
  /** 用户发起新一轮（首轮或继续调整）前调用：重置修复计数与用量 */
  beginRound: () => void;
  /** 停止 / 关闭：丢弃进行中的请求与尚未完成的校验 */
  dispose: () => void;
}

/**
 * 创建带「校验 -> 自动修复」能力的生成会话。
 *
 * @param getCommand - 当前轮使用的指令（统一弹窗中可切换）
 */
function createGenerateSession(
  runtime: AiRuntime,
  getPopup: () => GeneratorPopupHandle,
  getCommand: () => AiCommand | null,
): GenerateSession {
  let repairs = 0;
  let usageTotal: AiTokenUsage | null = null;
  /** 每次新一轮 / 关闭时自增；异步校验结束后比对，丢弃过期结果 */
  let round = 0;

  const session = createAiSession(runtime, {
    onDelta: (delta) => getPopup().appendContent(delta),
    onReasoning: () => getPopup().setThinking(),
    onDone: (full, _info, usage) => void finish(full, usage),
    onError: (message) => getPopup().setError(message),
  });

  async function finish(full: string, usage: AiTokenUsage) {
    const current = round;
    const popup = getPopup();
    usageTotal = addUsage(usageTotal, usage);

    const command = getCommand();
    const kind = command ? validationKindOf(command.insertMode) : null;
    if (command && kind) {
      const error = await validateGenerated(kind, cleanOutput(command.insertMode, full));
      if (current !== round) return;
      if (error && repairs < MAX_REPAIR_ATTEMPTS) {
        repairs++;
        popup.setRepairing(repairs, MAX_REPAIR_ATTEMPTS);
        void session.followUp(buildRepairInstruction(kind, error));
        return;
      }
      popup.setDone();
      if (error) {
        popup.setNotice(
          `已自动修复 ${MAX_REPAIR_ATTEMPTS} 次仍未通过语法校验：${error}。可继续调整，或接受后手动修改。`,
          'warning',
        );
      } else if (repairs > 0) {
        popup.setNotice(`已自动修复语法错误（${repairs} 次）`, 'info');
      }
    } else {
      popup.setDone();
    }
    popup.setUsage(usageTotal);
  }

  return {
    session,
    beginRound: () => {
      round++;
      repairs = 0;
      usageTotal = null;
    },
    dispose: () => {
      round++;
      session.dispose();
    },
  };
}

/** 接受结果：写入文档并记录历史（转图表等无选区原文，用用户描述作为 originalText） */
function acceptResult(ctx: AiRunContext, result: string, userArg: string): void {
  commitResult(ctx, cleanOutput(ctx.command.insertMode, result));
  recordAiHistory(ctx.command, result, userArg || undefined);
}

/** 转图表 / 转公式 */
export function runGenerateMode(
  { ctx, runtime, prompt }: AiModeInput,
  popupType: GeneratorPopupType,
): void {
  let lastUserArg = '';
  const gen = createGenerateSession(
    runtime,
    () => popup,
    () => ctx.command,
  );

  const popup = createGeneratorPopup({
    view: ctx.view,
    pos: ctx.from,
    type: popupType,
    onStart: (arg) => {
      lastUserArg = arg;
      gen.beginRound();
      popup.switchToResult();
      void startCommand(gen.session, ctx.command, { ...prompt, arg });
    },
    onFollowUp: (instruction) => {
      gen.beginRound();
      void gen.session.followUp(instruction);
    },
    onAccept: (result) => {
      gen.dispose();
      acceptResult(ctx, result, lastUserArg);
    },
    // 停止：仅取消当前请求，弹窗内部回到输入阶段（对话记录保留，可继续调整）
    onReject: () => gen.dispose(),
    onRetry: () => gen.dispose(),
    onClose: () => gen.dispose(),
  });

  // 调用方已带参数（如斜杠命令 `/mermaid 登录流程`）时跳过输入阶段
  if (prompt.arg) popup.startWithArg(prompt.arg);
}

/** 统一 AI 助手弹窗 */
export function runUnifiedGenerateMode(params: {
  ctx: Omit<AiRunContext, 'command'>;
  runtime: AiRuntime;
  commandOptions: GeneratorCommandOption[];
  resolveCommand: CommandResolver;
  defaultCommandId?: string;
}): void {
  const { ctx, runtime, commandOptions, resolveCommand, defaultCommandId } = params;
  let activeCommand: AiCommand | null = null;
  let lastUserArg = '';

  const gen = createGenerateSession(
    runtime,
    () => popup,
    () => activeCommand,
  );

  const popup = createUnifiedGeneratorPopup({
    view: ctx.view,
    pos: ctx.from,
    commands: commandOptions,
    defaultCommandId,
    onStart: (commandId, arg) => {
      const command = resolveCommand(commandId);
      if (!command) return;
      activeCommand = command;
      lastUserArg = arg;
      gen.beginRound();
      popup.switchToResult();
      void startCommand(gen.session, command, buildPromptInput(ctx, command, runtime, { arg }));
    },
    onFollowUp: (_commandId, instruction) => {
      gen.beginRound();
      void gen.session.followUp(instruction);
    },
    onAccept: (_commandId, result) => {
      gen.dispose();
      if (activeCommand) acceptResult({ ...ctx, command: activeCommand }, result, lastUserArg);
    },
    onReject: () => gen.dispose(),
    onRetry: () => gen.dispose(),
    onClose: () => gen.dispose(),
  });
}

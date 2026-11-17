/**
 * 生成模式：输入描述 -> 流式生成 -> 接受后写入文档
 *
 * - runGenerateMode：单一类型（转图表 / 转公式）
 * - runUnifiedGenerateMode：统一 AI 助手弹窗，下拉切换内置指令与自定义指令
 *
 * @changelog
 * | 版本   | 变更说明                              | 关联               |
 * | v1.0.0 | 从 generator.ts 拆出，改用 AiSession | REQ: AI 架构改造#3 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { startCommand } from '@/services/ai/generation';
import type { AiRuntime } from '@/services/ai/runtime';
import { recordAiHistory } from '@/services/ai/history';
import { createAiSession, type AiSessionHandlers } from '@/services/ai/session';
import type { AiCommand } from '@/types/ai';

import { cleanOutput } from '../commit/clean-output';
import { commitResult } from '../commit/commit-result';
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

/** 生成类弹窗共用的会话回调 */
function popupHandlers(getPopup: () => GeneratorPopupHandle): AiSessionHandlers {
  return {
    onDelta: (delta) => getPopup().appendContent(delta),
    onReasoning: () => getPopup().setThinking(),
    onDone: (_full, _info, usage) => {
      getPopup().setDone();
      getPopup().setUsage(usage);
    },
    onError: (message) => getPopup().setError(message),
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
  const session = createAiSession(
    runtime,
    popupHandlers(() => popup),
  );

  const startWith = (arg: string) => {
    lastUserArg = arg;
    popup.switchToResult();
    void startCommand(session, ctx.command, { ...prompt, arg });
  };

  const popup = createGeneratorPopup({
    view: ctx.view,
    pos: ctx.from,
    type: popupType,
    onStart: startWith,
    onAccept: (result) => {
      session.dispose();
      acceptResult(ctx, result, lastUserArg);
    },
    // 重试：仅取消当前请求，弹窗内部回到输入阶段
    onReject: () => session.dispose(),
    onRetry: () => session.dispose(),
    onClose: () => session.dispose(),
  });

  // 调用方已带参数（如斜杠命令 `/mermaid 登录流程`）时跳过输入阶段
  if (prompt.arg) startWith(prompt.arg);
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

  const session = createAiSession(
    runtime,
    popupHandlers(() => popup),
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
      popup.switchToResult();
      void startCommand(session, command, {
        selection: ctx.selection,
        context: ctx.context,
        arg,
      });
    },
    onAccept: (_commandId, result) => {
      session.dispose();
      if (activeCommand) acceptResult({ ...ctx, command: activeCommand }, result, lastUserArg);
    },
    onReject: () => session.dispose(),
    onRetry: () => session.dispose(),
    onClose: () => session.dispose(),
  });
}

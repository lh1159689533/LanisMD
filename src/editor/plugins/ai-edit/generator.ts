/**
 * AI 指令入口：校验前置条件、收集上下文，按 insertMode 分发到对应交互模式
 *
 * 目录分层：
 * - context/：选区与文档上下文收集
 * - modes/：各交互模式（润色 / 翻译 / 解释 / 生成 / 插入），只负责 UI 如何响应会话事件
 * - commit/：结果清理与写回文档
 * - ui/：纯 DOM 弹窗组件
 * 流式生命周期统一由 `@/services/ai/session` 管理，运行时参数由 `@/services/ai/runtime` 解析。
 *
 * @changelog
 * | 版本   | 变更说明                                                  | 关联                      |
 * | v1.1.0 | Markdown 写回、思考中状态、截断提示、完整上下文按预算裁剪 | REQ: AI 功能修复#1/2/3/5  |
 * | v2.0.0 | 拆分为 context/modes/commit/ui，接入 AiSession 与 Runtime | REQ: AI 架构改造#1/2/3    |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import { resolveAiRuntime, type AiRuntime } from '@/services/ai/runtime';
import { useUIStore } from '@/stores/ui-store';
import type { AiCommand, AiPromptInput } from '@/types/ai';

import { buildDocumentContext } from './context/document';
import { buildRunContext, collectSelection } from './context/selection';
import { runExplainMode } from './modes/explain';
import { runGenerateMode, runUnifiedGenerateMode, type CommandResolver } from './modes/generate';
import { runInsertMode } from './modes/insert';
import { runPolishMode } from './modes/polish';
import { runTranslateMode } from './modes/translate';
import type { AiModeInput } from './types';
import { showFirstUseGuide } from './ui/first-use-guide';
import type { GeneratorCommandOption } from './ui/generator-popup';

export type { CommandResolver } from './modes/generate';

/**
 * 解析运行时；不可用时给出对应引导并返回 null。
 */
async function ensureRuntime(): Promise<AiRuntime | null> {
  const result = await resolveAiRuntime();
  if (result.ok) return result.runtime;

  if (result.reason === 'disabled') {
    useUIStore.getState().addToast({
      type: 'info',
      message: 'AI 助手未启用，请在 设置 -> AI 助手 中开启',
      duration: 3500,
    });
  } else {
    void showFirstUseGuide(result.reason);
  }
  return null;
}

/** 按 insertMode 分发到交互模式 */
function dispatchMode(input: AiModeInput): void {
  switch (input.ctx.command.insertMode) {
    case 'inline-diff':
      return runPolishMode(input);
    case 'popup-translate':
      return runTranslateMode(input);
    case 'popup-explain':
      return runExplainMode(input);
    case 'insert-as-mermaid':
      return runGenerateMode(input, 'mermaid');
    case 'insert-as-latex':
      return runGenerateMode(input, 'latex');
    default:
      return runInsertMode(input);
  }
}

/**
 * 执行一个 AI 指令。
 *
 * @param view - ProseMirror EditorView
 * @param command - 指令元数据
 * @param extra - 额外输入（如参数型指令的 arg、翻译目标语言等）
 * @param options.withDocumentContext - 附带选区周边的文档内容（按模型上下文长度裁剪）
 */
export async function runAiCommand(
  view: EditorView,
  command: AiCommand,
  extra?: Partial<AiPromptInput>,
  options?: { withDocumentContext?: boolean },
): Promise<void> {
  const ctx = buildRunContext(view, command);

  if (command.requireSelection && !ctx.selection.trim()) {
    window.alert('请先选中一段文本再使用此指令');
    return;
  }

  const runtime = await ensureRuntime();
  if (!runtime) return;

  const prompt: AiPromptInput = { selection: ctx.selection, context: ctx.context, ...extra };
  if (options?.withDocumentContext) {
    // 预算不足时返回 undefined，prompt 自动退化为仅选区模式
    prompt.fullDocument = buildDocumentContext(view, ctx.from, ctx.to, ctx.selection, runtime);
  }

  dispatchMode({ ctx, runtime, prompt });
}

/**
 * 打开统一 AI 助手弹窗（斜杠菜单入口）。
 *
 * @param commandOptions - 下拉选项列表
 * @param resolveCommand - 按 commandId 解析 AiCommand 的回调
 * @param defaultCommandId - 默认选中的指令 id
 */
export async function runUnifiedAiPopup(
  view: EditorView,
  commandOptions: GeneratorCommandOption[],
  resolveCommand: CommandResolver,
  defaultCommandId?: string,
): Promise<void> {
  if (commandOptions.length === 0) return;

  const runtime = await ensureRuntime();
  if (!runtime) return;

  runUnifiedGenerateMode({
    ctx: { view, ...collectSelection(view) },
    runtime,
    commandOptions,
    resolveCommand,
    defaultCommandId,
  });
}

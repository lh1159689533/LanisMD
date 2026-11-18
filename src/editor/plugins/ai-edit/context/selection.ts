/**
 * 选区与写作背景收集
 *
 * 选区以 Markdown（而非纯文本）形式提供给模型，保证格式能随 AI 结果一并写回。
 *
 * @changelog
 * | 版本   | 变更说明                                      | 关联                    |
 * | v1.0.0 | 从 generator.ts 抽出选区收集逻辑               | REQ: AI 架构改造#3      |
 * | v1.1.0 | 上下文改为结构化写作背景，按运行时 token 预算裁剪 | REQ: AI 体验短板-上下文 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import type { AiRuntime } from '@/services/ai/runtime';
import type { AiCommand } from '@/types/ai';

import { serializeRangeToMarkdown } from '../commit/markdown-bridge';
import type { AiRunContext } from '../types';
import { buildWritingContext } from './writing-context';

/** 当前选区范围与内容（不含写作背景） */
export interface SelectionInfo {
  from: number;
  to: number;
  selection: string;
}

/** 读取当前选区（Markdown） */
export function collectSelection(view: EditorView): SelectionInfo {
  const { from, to } = view.state.selection;
  const selection = from !== to ? serializeRangeToMarkdown(view, from, to) : '';
  return { from, to, selection };
}

/** 选区 + 写作背景（需要运行时信息以按模型窗口计算预算） */
export function collectRunTarget(
  view: EditorView,
  runtime: AiRuntime,
  info: SelectionInfo = collectSelection(view),
): Omit<AiRunContext, 'command'> {
  return {
    view,
    ...info,
    context: buildWritingContext(view, info.from, info.to, info.selection, runtime),
  };
}

/** 构造一次指令执行的运行上下文 */
export function buildRunContext(
  view: EditorView,
  command: AiCommand,
  runtime: AiRuntime,
  info?: SelectionInfo,
): AiRunContext {
  return { command, ...collectRunTarget(view, runtime, info) };
}

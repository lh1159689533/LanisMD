/**
 * 选区与光标上下文收集
 *
 * 选区以 Markdown（而非纯文本）形式提供给模型，保证格式能随 AI 结果一并写回。
 *
 * @changelog
 * | 版本   | 变更说明                        | 关联               |
 * | v1.0.0 | 从 generator.ts 抽出选区收集逻辑 | REQ: AI 架构改造#3 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import type { AiCommand } from '@/types/ai';

import { serializeRangeToMarkdown } from '../commit/markdown-bridge';
import type { AiRunContext } from '../types';

/** 光标前上下文的取值范围（文档位置数，约等于字符数） */
const CURSOR_CONTEXT_RANGE = 600;

/** 读取当前选区（Markdown）与光标所在块之前的上下文（纯文本） */
export function collectSelection(view: EditorView): Omit<AiRunContext, 'view' | 'command'> {
  const { state } = view;
  const { from, to } = state.selection;
  const selection = from !== to ? serializeRangeToMarkdown(view, from, to) : '';

  let context = '';
  try {
    const $pos = state.doc.resolve(from);
    const startPos = Math.max(0, $pos.start($pos.depth) - CURSOR_CONTEXT_RANGE);
    context = state.doc.textBetween(startPos, from, '\n', '\n');
  } catch {
    // 定位失败则留空，不影响指令执行
  }

  return { from, to, selection, context };
}

/** 构造一次指令执行的运行上下文 */
export function buildRunContext(view: EditorView, command: AiCommand): AiRunContext {
  return { view, command, ...collectSelection(view) };
}

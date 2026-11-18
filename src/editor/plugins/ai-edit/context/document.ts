/**
 * AI 指令的文档上下文构造
 *
 * 「完整上下文」润色需要附带文档内容。此前直接把整篇文档塞进 system prompt，
 * 长文档会超出模型上下文窗口。这里改为：按模型 contextLength 计算预算，
 * 以选区为中心保留前后文，并用标记指出选区所在位置（避免把选区再重复发送一遍）。
 *
 * @changelog
 * | 版本   | 变更说明                              | 关联                               |
 * | v1.0.0 | 初始实现：按 token 预算裁剪文档上下文 | REQ: AI 功能修复#5 TECH: 本文件头 |
 * | v1.1.0 | 上下文长度改由 AiRuntime 提供          | REQ: AI 架构改造#2/3             |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import { FRAGMENT_MARKER } from '@/services/ai/commands';
import { proportionalOutput } from '@/services/ai/generation';
import type { AiRuntime } from '@/services/ai/runtime';
import { computeContextBudget, fitSurroundingContext } from '@/services/ai/token-budget';

import { serializeRangeToMarkdown } from '../commit/markdown-bridge';

/**
 * 构造选区周边的文档上下文（Markdown）。
 *
 * @returns 裁剪后的上下文；预算不足时返回 undefined，调用方应退化为仅选区模式
 */
export function buildDocumentContext(
  view: EditorView,
  from: number,
  to: number,
  selection: string,
  runtime: AiRuntime,
): string | undefined {
  const budget = computeContextBudget({
    contextLength: runtime.contextLength,
    // 与润色指令的输出估算保持一致
    maxOutputTokens: proportionalOutput(selection, 1.5),
    // 选区会出现在 user 消息里，润色输出也约等于选区长度，因此按两倍预留
    reservedText: selection + selection,
  });
  if (budget <= 0) return undefined;

  const docSize = view.state.doc.content.size;
  return fitSurroundingContext({
    before: serializeRangeToMarkdown(view, 0, from),
    after: serializeRangeToMarkdown(view, to, docSize),
    marker: FRAGMENT_MARKER,
    budget,
  });
}

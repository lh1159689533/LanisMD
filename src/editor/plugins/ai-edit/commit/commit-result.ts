/**
 * AI 结果写入文档：按指令的 insertMode 选择写回方式
 *
 * Markdown 类结果统一走 markdown-bridge 解析写回；
 * Mermaid / LaTeX 结果直接构造对应节点（内容是代码，不能当 Markdown 解析）。
 *
 * @changelog
 * | 版本   | 变更说明                          | 关联               |
 * | v1.0.0 | 从 generator.ts 抽出结果写回逻辑 | REQ: AI 架构改造#3 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { NodeType } from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

import { setMermaidAutoEdit } from '../../mermaid-block';
import type { AiRunContext } from '../types';
import { insertMarkdownAfterBlock, replaceRangeWithMarkdown } from './markdown-bridge';

/** 根据 insertMode 将最终的 AI 文本写入文档 */
export function commitResult(ctx: AiRunContext, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  const { view, command } = ctx;
  switch (command.insertMode) {
    case 'replace-selection':
      replaceRangeWithMarkdown(view, ctx.from, ctx.to, trimmed);
      return;
    case 'insert-as-mermaid':
      insertCodeLikeBlock(view, ctx.to, trimmed, view.state.schema.nodes.code_block, {
        language: 'mermaid',
      });
      return;
    case 'insert-as-latex':
      insertCodeLikeBlock(view, ctx.to, trimmed, view.state.schema.nodes.math_block, {
        autoEdit: true,
      });
      return;
    default:
      insertMarkdownAfterBlock(view, ctx.to, trimmed);
  }
}

/** `pos` 所在块之后的位置 */
function blockEndPos(view: EditorView, pos: number): number {
  try {
    const $pos = view.state.doc.resolve(pos);
    return $pos.after($pos.depth);
  } catch {
    return pos;
  }
}

/**
 * 在 `pos` 所在块之后插入代码类块节点（mermaid code_block / math_block）。
 * 目标节点类型不存在时退化为 Markdown 段落插入。
 */
function insertCodeLikeBlock(
  view: EditorView,
  pos: number,
  text: string,
  nodeType: NodeType | undefined,
  attrs: Record<string, unknown>,
): void {
  if (!nodeType) {
    insertMarkdownAfterBlock(view, pos, text);
    return;
  }

  const { state, dispatch } = view;
  const insertPos = blockEndPos(view, pos);
  const node = nodeType.create(attrs, text.length > 0 ? [state.schema.text(text)] : undefined);

  // mermaid 块插入后自动进入编辑态，便于用户微调
  if (attrs.language === 'mermaid') setMermaidAutoEdit();

  const tr = state.tr.insert(insertPos, node);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
  dispatch(tr.scrollIntoView());
  view.focus();
}

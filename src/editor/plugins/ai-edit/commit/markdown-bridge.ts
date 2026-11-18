/**
 * AI 编辑与 Markdown 之间的桥接层
 *
 * 解决的问题：AI 的输入/输出都是 Markdown，而此前选区取的是纯文本（textBetween）、
 * 写回时也只按纯文本拼 hard_break，导致加粗/链接/行内代码等格式丢失、多段落被压成一段。
 *
 * 做法：
 * - 通过一个 ProseMirror 插件在 view 挂载时记下 Milkdown ctx，按需取 parser / serializer
 * - 选区 -> Markdown：用 serializer 序列化选区切片
 * - Markdown -> 文档：用 parser 解析为 doc，再以开放切片 replaceRange 回原位置，
 *   首尾段落与原文自然合并
 * - 任何一步失败都回退到旧的纯文本逻辑，保证功能可用
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                               |
 * | v1.0.0 | 初始实现：选区 Markdown 序列化与结果解析写回 | REQ: AI 功能修复#1 TECH: 本文件头 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { parserCtx, serializerCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import type { Node as ProseNode, ResolvedPos } from '@milkdown/kit/prose/model';
import { Slice } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

// ---------------------------------------------------------------------------
// ctx 注册
// ---------------------------------------------------------------------------

/** view -> Milkdown ctx 映射；用 WeakMap 避免编辑器销毁后内存泄漏 */
const ctxByView = new WeakMap<EditorView, Ctx>();

/**
 * 记录 view 对应的 Milkdown ctx。
 * 需在 editor-setup 中 `.use(aiMarkdownBridgePlugin)` 注册。
 */
export const aiMarkdownBridgePlugin = $prose(
  (ctx) =>
    new Plugin({
      key: new PluginKey('lanismd-ai-markdown-bridge'),
      view: (view) => {
        ctxByView.set(view, ctx);
        return {
          destroy: () => {
            ctxByView.delete(view);
          },
        };
      },
    }),
);

interface MarkdownTools {
  parse: (markdown: string) => ProseNode;
  serialize: (doc: ProseNode) => string;
}

function getTools(view: EditorView): MarkdownTools | null {
  const ctx = ctxByView.get(view);
  if (!ctx) return null;
  try {
    return { parse: ctx.get(parserCtx), serialize: ctx.get(serializerCtx) };
  } catch {
    return null;
  }
}

/** 去掉 serializer 末尾的换行，避免 prompt 与 diff 中出现多余空行 */
function trimTrailingNewlines(markdown: string): string {
  return markdown.replace(/\n+$/, '');
}

// ---------------------------------------------------------------------------
// 文档 -> Markdown
// ---------------------------------------------------------------------------

/** 判断 [from, to] 是否完全位于某个代码类文本块（code_block 等）内 */
function isInsideCodeBlock(view: EditorView, from: number, to: number): boolean {
  const { doc } = view.state;
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  return $from.sameParent($to) && Boolean($from.parent.type.spec.code);
}

/**
 * 将 [from, to] 范围序列化为 Markdown。
 *
 * - 位于同一文本块内：只序列化行内内容（不带 `## `、`- ` 等块级前缀），
 *   这样写回时可以无损地放回原块
 * - 跨块：带父级结构序列化（列表、引用等结构得以保留）
 * - 代码块内：返回原始文本（代码不应被 Markdown 转义）
 */
export function serializeRangeToMarkdown(view: EditorView, from: number, to: number): string {
  const { state } = view;
  const plain = () => state.doc.textBetween(from, to, '\n', '\n');
  if (from >= to) return '';

  const tools = getTools(view);
  if (!tools) return plain();

  try {
    if (isInsideCodeBlock(view, from, to)) return plain();

    const { schema } = state;
    const $from = state.doc.resolve(from);
    const $to = state.doc.resolve(to);

    let doc: ProseNode;
    if ($from.sameParent($to) && $from.parent.isTextblock) {
      const inline = state.doc.slice(from, to).content;
      doc = schema.topNodeType.create(null, schema.nodes.paragraph.create(null, inline));
    } else {
      // includeParents = true：切片内容相对于 doc，外层包裹节点被保留
      const slice = state.doc.slice(from, to, true);
      doc = schema.topNodeType.create(null, slice.content);
    }
    return trimTrailingNewlines(tools.serialize(doc));
  } catch (err) {
    console.warn('[ai-markdown-bridge] 序列化选区失败，回退纯文本', err);
    return plain();
  }
}

/** 将整篇文档序列化为 Markdown（失败时回退纯文本） */
export function serializeDocToMarkdown(view: EditorView): string {
  return serializeRangeToMarkdown(view, 0, view.state.doc.content.size);
}

// ---------------------------------------------------------------------------
// Markdown -> 文档
// ---------------------------------------------------------------------------

/** 解析 Markdown 为 doc 节点；失败或内容为空时返回 null */
function parseMarkdown(view: EditorView, markdown: string): ProseNode | null {
  const tools = getTools(view);
  if (!tools) return null;
  try {
    const doc = tools.parse(markdown);
    return doc && doc.childCount > 0 ? doc : null;
  } catch (err) {
    console.warn('[ai-markdown-bridge] 解析 Markdown 失败，回退纯文本', err);
    return null;
  }
}

/**
 * 判断解析结果中的节点能否与原文同层节点「合并」：
 * 类型相同即可合并；普通段落可并入任意非代码文本块（例如标题内的片段润色后仍是段落）。
 */
function isMergeable(original: ProseNode, incoming: ProseNode): boolean {
  if (original.type === incoming.type) return true;
  return incoming.type.name === 'paragraph' && original.isTextblock && !original.type.spec.code;
}

/**
 * 计算切片某一侧的开放深度：沿首（尾）子节点链逐层与原文位置的祖先节点比对，
 * 可合并则继续开放一层，直到遇到文本块或结构不再吻合。
 *
 * 效果：
 * - 段内润色：结果段落开放 1 层，内容并回原段落（保留标题等块类型）
 * - 跨列表项润色：结果 `- a\n- b` 开放到段落层，与原列表项一一合并，不会嵌套出新列表
 * - 结构不吻合（如段落中间生成了标题）：保持闭合，作为独立块插入
 */
function openDepth($pos: ResolvedPos, doc: ProseNode, side: 'start' | 'end'): number {
  let depth = 0;
  let node = side === 'start' ? doc.firstChild : doc.lastChild;
  while (node && depth < $pos.depth) {
    if (!isMergeable($pos.node(depth + 1), node)) break;
    depth++;
    if (node.isTextblock) break;
    node = side === 'start' ? node.firstChild : node.lastChild;
  }
  return depth;
}

/** 构造用于 replaceRange 的开放切片，使结果首尾与选区前后的原文自然衔接 */
function toOpenSlice(view: EditorView, from: number, to: number, doc: ProseNode): Slice {
  const { doc: current } = view.state;
  return new Slice(
    doc.content,
    openDepth(current.resolve(from), doc, 'start'),
    openDepth(current.resolve(to), doc, 'end'),
  );
}

/** 纯文本替换（旧逻辑，作为兜底）：按行拼接 hard_break */
function replaceWithPlainText(view: EditorView, from: number, to: number, text: string): void {
  const { state, dispatch } = view;
  const { schema } = state;
  const hardBreak = schema.nodes.hard_break;

  const nodes: ProseNode[] = [];
  text.split('\n').forEach((line, idx) => {
    if (idx > 0 && hardBreak) nodes.push(hardBreak.create());
    if (line.length > 0) nodes.push(schema.text(line));
  });
  if (nodes.length === 0) return;

  const tr = state.tr.replaceWith(from, to, nodes);
  const newPos = from + nodes.reduce((acc, n) => acc + n.nodeSize, 0);
  tr.setSelection(TextSelection.near(tr.doc.resolve(newPos)));
  dispatch(tr.scrollIntoView());
  view.focus();
}

/**
 * 用 Markdown 内容替换 [from, to]。
 *
 * 代码块内直接按纯文本插入；其余情况解析为文档切片后 replaceRange，
 * 解析失败时回退纯文本替换。
 */
export function replaceRangeWithMarkdown(
  view: EditorView,
  from: number,
  to: number,
  markdown: string,
): void {
  if (!markdown) return;

  if (isInsideCodeBlock(view, from, to)) {
    const tr = view.state.tr.insertText(markdown, from, to);
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return;
  }

  const doc = parseMarkdown(view, markdown);
  if (!doc) {
    replaceWithPlainText(view, from, to, markdown);
    return;
  }

  try {
    const { state, dispatch } = view;
    const tr = state.tr.replaceRange(from, to, toOpenSlice(view, from, to, doc));
    const endPos = tr.mapping.map(to);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(endPos, tr.doc.content.size))));
    dispatch(tr.scrollIntoView());
    view.focus();
  } catch (err) {
    console.warn('[ai-markdown-bridge] 结构化替换失败，回退纯文本', err);
    replaceWithPlainText(view, from, to, markdown);
  }
}

/** 纯文本插入（旧逻辑，作为兜底）：每行一个段落 */
function insertPlainParagraphs(view: EditorView, insertPos: number, text: string): void {
  const { state, dispatch } = view;
  const { schema } = state;
  const paragraph = schema.nodes.paragraph;
  if (!paragraph) return;

  const paragraphs = text
    .split('\n')
    .map((line) => paragraph.create(null, line.length > 0 ? [schema.text(line)] : []));
  if (paragraphs.length === 0) return;

  const tr = state.tr.insert(insertPos, paragraphs);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
  dispatch(tr.scrollIntoView());
  view.focus();
}

/**
 * 在 `pos` 所在块之后插入 Markdown 内容（解析为块级节点）。
 *
 * 优先插在当前块之后（保持在列表/引用内部）；若内容不符合该位置的 schema
 * （例如表格单元格内插入标题），退到顶层块之后。
 */
export function insertMarkdownAfterBlock(view: EditorView, pos: number, markdown: string): void {
  if (!markdown) return;
  const { state } = view;
  const $pos = state.doc.resolve(pos);
  const innerPos = $pos.depth > 0 ? $pos.after($pos.depth) : pos;
  const topPos = $pos.depth > 0 ? $pos.after(1) : pos;

  const doc = parseMarkdown(view, markdown);
  if (!doc) {
    insertPlainParagraphs(view, innerPos, markdown);
    return;
  }

  for (const insertPos of innerPos === topPos ? [innerPos] : [innerPos, topPos]) {
    try {
      const tr = view.state.tr.insert(insertPos, doc.content);
      tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
      view.dispatch(tr.scrollIntoView());
      view.focus();
      return;
    } catch {
      // 当前位置不接受该内容，尝试下一个候选位置
    }
  }
  insertPlainParagraphs(view, topPos, markdown);
}

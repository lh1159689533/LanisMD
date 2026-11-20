/**
 * 块级文档操作
 *
 * 供块手柄菜单与加号调用：准备插入位置、删除、转换类型、转为链接。
 * 所有操作都基于 BlockProvider 给出的 active 节点，并在执行前重新校验
 * 该位置上的节点是否仍是同一个，避免菜单打开期间文档变化导致误删。
 *
 * @changelog
 * | 版本   | 变更说明                                             | 关联                                               |
 * | v1.0.0 | 初始实现：块位置解析与六类操作                       | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * | v1.1.0 | 移除复制/剪切/副本；转为支持列表与链接；加号延迟插入 | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { ActiveNode } from '@milkdown/kit/plugin/block';
import { Fragment, type Node, type Schema } from '@milkdown/kit/prose/model';
import { TextSelection, type Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

import { createLinkDialog } from '../tooltip-toolbar';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 「转为」支持的目标类型 */
export type ConvertTarget =
  | { kind: 'paragraph' }
  | { kind: 'heading'; level: number }
  | { kind: 'bullet' }
  | { kind: 'ordered' }
  | { kind: 'task' }
  | { kind: 'code' };

/** 列表项上下文：激活块是列表或列表项时存在 */
interface ListContext {
  /** 列表节点及其起始位置 */
  list: Node;
  listPos: number;
  /** 列表项节点、起始位置及其在列表中的下标 */
  item: Node;
  itemPos: number;
  index: number;
}

/** 激活块解析结果 */
interface ResolvedBlock {
  node: Node;
  /** 节点起点与终点（终点为节点之后的位置） */
  pos: number;
  end: number;
  /** 列表项上下文；为 null 表示普通块 */
  listCtx: ListContext | null;
}

// ---------------------------------------------------------------------------
// 位置解析
// ---------------------------------------------------------------------------

function isListType(node: Node): boolean {
  const name = node.type.name;
  return name === 'bullet_list' || name === 'ordered_list';
}

/**
 * 解析 active 节点的位置信息。
 *
 * BlockProvider 会把「首个子节点」提升为其父节点：悬停列表项文字时 active
 * 是 list_item，悬停首项的编号区域时 active 可能是整个列表。后者统一映射到
 * 首个列表项，保证删除、转换都只作用于用户看到的那一项。
 *
 * 菜单从弹出到点击之间用户仍可能编辑文档，因此每次操作都要重新调用本函数，
 * 用 nodeAt(pos).eq(node) 确认位置未失效。
 */
function resolveBlock(view: EditorView, active: ActiveNode): ResolvedBlock | null {
  const { $pos, node } = active;
  if (!node) return null;

  const current = view.state.doc.nodeAt($pos.pos);
  if (!current || !current.eq(node)) return null;

  const pos = $pos.pos;
  const end = pos + node.nodeSize;

  if (isListType(node) && node.firstChild) {
    return {
      node,
      pos,
      end,
      listCtx: { list: node, listPos: pos, item: node.firstChild, itemPos: pos + 1, index: 0 },
    };
  }

  if (node.type.name === 'list_item' && $pos.depth >= 1 && isListType($pos.parent)) {
    return {
      node,
      pos,
      end,
      listCtx: {
        list: $pos.parent,
        listPos: $pos.before($pos.depth),
        item: node,
        itemPos: pos,
        index: $pos.index(),
      },
    };
  }

  return { node, pos, end, listCtx: null };
}

/** 激活块里承载文字的文本块（列表项取首段落） */
function getTextblock(block: ResolvedBlock): { node: Node; pos: number } | null {
  if (block.listCtx) {
    const first = block.listCtx.item.firstChild;
    return first?.isTextblock ? { node: first, pos: block.listCtx.itemPos + 1 } : null;
  }
  return block.node.isTextblock ? { node: block.node, pos: block.pos } : null;
}

// ---------------------------------------------------------------------------
// 列表拆分
// ---------------------------------------------------------------------------

/**
 * 用 middle 替换列表中 [from, to) 区间的列表项，必要时把列表拆成前后两段。
 *
 * 后半段若是有序列表，起始序号顺延，保证编号视觉连续。
 *
 * @returns middle 第一个节点在新文档中的起始位置
 */
function spliceList(tr: Transaction, ctx: ListContext, from: number, to: number, middle: Node[]) {
  const { list, listPos } = ctx;
  const before: Node[] = [];
  const after: Node[] = [];
  list.forEach((child, _offset, i) => {
    if (i < from) before.push(child);
    else if (i >= to) after.push(child);
  });

  const nodes: Node[] = [];
  if (before.length > 0) nodes.push(list.type.create(list.attrs, before));
  const middleStart = listPos + nodes.reduce((sum, n) => sum + n.nodeSize, 0);
  nodes.push(...middle);
  if (after.length > 0) {
    const attrs = { ...list.attrs };
    if (typeof attrs.order === 'number') attrs.order = attrs.order + to;
    nodes.push(list.type.create(attrs, after));
  }

  tr.replaceWith(listPos, listPos + list.nodeSize, nodes);
  return middleStart;
}

// ---------------------------------------------------------------------------
// 加号 / 在下方插入
// ---------------------------------------------------------------------------

/**
 * 为加号菜单里的命令准备落点：命令真正执行前才调用，菜单取消时文档不变。
 *
 * - 当前块是空段落：直接复用，光标放进去
 * - 当前块是列表项：在该项之后拆开列表插入空段落，紧贴在这一项下方
 * - 其它块：在当前块之后插入空段落
 *
 * 落点统一是「普通空段落」，斜杠命令的空段落分支（替换成标题/列表/代码块等）
 * 可以原样复用，不会出现把标题塞进 list_item 首位这类非法结构。
 *
 * @returns 是否准备成功；失败时调用方应放弃执行命令
 */
export function prepareInsertTarget(view: EditorView, active: ActiveNode): boolean {
  const block = resolveBlock(view, active);
  if (!block) return false;

  const { state } = view;
  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) return false;

  const tr = state.tr;
  let paragraphPos: number;

  if (block.listCtx) {
    const next = block.listCtx.index + 1;
    paragraphPos = spliceList(tr, block.listCtx, next, next, [paragraphType.create()]);
  } else if (block.node.type === paragraphType && block.node.content.size === 0) {
    paragraphPos = block.pos;
  } else {
    paragraphPos = block.end;
    tr.insert(paragraphPos, paragraphType.create());
  }

  tr.setSelection(TextSelection.create(tr.doc, paragraphPos + 1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

// ---------------------------------------------------------------------------
// 删除
// ---------------------------------------------------------------------------

/** 删除当前块（列表项只删这一项，删到空列表时连列表一起删） */
export function deleteActiveBlock(view: EditorView, active: ActiveNode): void {
  const block = resolveBlock(view, active);
  if (!block) return;

  let from = block.pos;
  let to = block.end;
  if (block.listCtx) {
    const { list, listPos, item, itemPos } = block.listCtx;
    if (list.childCount > 1) {
      from = itemPos;
      to = itemPos + item.nodeSize;
    } else {
      from = listPos;
      to = listPos + list.nodeSize;
    }
  }

  const { state, dispatch } = view;
  const tr = state.tr.delete(from, to);
  // schema 要求 doc 至少包含一个块，删空时补一个空段落
  const paragraphType = state.schema.nodes.paragraph;
  if (tr.doc.content.size === 0 && paragraphType) {
    tr.insert(0, paragraphType.create());
  }
  dispatch(tr.scrollIntoView());
  view.focus();
}

// ---------------------------------------------------------------------------
// 转为
// ---------------------------------------------------------------------------

/**
 * 取文本块的行内内容。
 *
 * 代码块里是带换行的纯文本，转成段落/标题时把换行替换为硬换行，
 * 否则 Markdown 序列化会把一段拆成多段。
 */
function inlineContentOf(schema: Schema, node: Node): Fragment {
  if (!node.type.spec.code) return node.content;
  const text = node.textContent;
  if (!text) return Fragment.empty;

  const hardbreak = schema.nodes.hardbreak ?? schema.nodes.hard_break;
  const parts: Node[] = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) parts.push(hardbreak ? hardbreak.create() : schema.text(' '));
    if (line) parts.push(schema.text(line));
  });
  return Fragment.from(parts);
}

/** 按目标类型生成文本块；不支持时返回 null */
function createTextblock(schema: Schema, source: Node, target: ConvertTarget): Node | null {
  const { paragraph, heading, code_block: codeBlock } = schema.nodes;
  if (target.kind === 'paragraph' && paragraph) {
    return paragraph.create(null, inlineContentOf(schema, source));
  }
  if (target.kind === 'heading' && heading) {
    return heading.create({ level: target.level }, inlineContentOf(schema, source));
  }
  if (target.kind === 'code' && codeBlock) {
    const text = source.textContent;
    return codeBlock.create(null, text ? schema.text(text) : null);
  }
  return null;
}

/** 列表类目标对应的列表节点名 */
function listTypeNameOf(target: ConvertTarget): 'bullet_list' | 'ordered_list' | null {
  if (target.kind === 'ordered') return 'ordered_list';
  if (target.kind === 'bullet' || target.kind === 'task') return 'bullet_list';
  return null;
}

/** 生成目标列表项属性：同步 listType/label，并按是否任务项设置 checked */
function listItemAttrsFor(base: Record<string, unknown>, target: ConvertTarget) {
  const attrs: Record<string, unknown> = { ...base };
  const ordered = target.kind === 'ordered';
  attrs.listType = ordered ? 'ordered' : 'bullet';
  attrs.label = ordered ? '1.' : '•';
  if (target.kind === 'task') {
    // 已是任务项则保留勾选状态
    if (typeof attrs.checked !== 'boolean') attrs.checked = false;
  } else {
    attrs.checked = null;
  }
  return attrs;
}

/** 当前块是否已经是目标类型（无需转换） */
function isSameType(block: ResolvedBlock, target: ConvertTarget): boolean {
  if (block.listCtx) {
    const listName = listTypeNameOf(target);
    if (!listName || block.listCtx.list.type.name !== listName) return false;
    const isTask = typeof block.listCtx.item.attrs.checked === 'boolean';
    return target.kind === 'task' ? isTask : !isTask;
  }
  const { node } = block;
  if (target.kind === 'paragraph') return node.type.name === 'paragraph';
  if (target.kind === 'heading') {
    return node.type.name === 'heading' && node.attrs.level === target.level;
  }
  if (target.kind === 'code') return node.type.name === 'code_block';
  return false;
}

/**
 * 是否开放「转为」子菜单。
 *
 * 普通文本块（段落/标题/代码块）和首子节点为段落的列表项可以转换；
 * 表格、图片、公式等原子块没有可迁移的行内内容，不开放。
 */
export function canConvertBlock(view: EditorView, active: ActiveNode): boolean {
  const block = resolveBlock(view, active);
  return !!block && !!getTextblock(block);
}

/** 普通文本块的转换：文本块之间直接替换，转列表时包一层列表与列表项 */
function convertPlainBlock(
  tr: Transaction,
  schema: Schema,
  block: ResolvedBlock,
  target: ConvertTarget,
) {
  const listName = listTypeNameOf(target);
  if (!listName) {
    const next = createTextblock(schema, block.node, target);
    if (next) tr.replaceWith(block.pos, block.end, next);
    return;
  }

  const listType = schema.nodes[listName];
  const { list_item: listItem, paragraph } = schema.nodes;
  if (!listType || !listItem || !paragraph) return;

  // 未列出的属性（如 spread）由 schema 默认值补齐
  const itemAttrs = listItemAttrsFor({}, target);
  const item = listItem.create(
    itemAttrs,
    paragraph.create(null, inlineContentOf(schema, block.node)),
  );
  tr.replaceWith(block.pos, block.end, listType.create(null, item));
}

/** 列表项的转换：同类列表只改属性；否则把该项从列表中拆出再生成目标结构 */
function convertListItem(tr: Transaction, schema: Schema, ctx: ListContext, target: ConvertTarget) {
  const { list, item, itemPos, index } = ctx;
  const listName = listTypeNameOf(target);

  if (listName && list.type.name === listName) {
    tr.setNodeMarkup(itemPos, null, listItemAttrsFor(item.attrs, target));
    return;
  }

  // 列表项除首段落外可能还带嵌套列表等子块，转换后原样保留在新块之后
  const rest: Node[] = [];
  item.forEach((child, _offset, i) => {
    if (i > 0) rest.push(child);
  });
  const first = item.firstChild;
  if (!first) return;

  let middle: Node[];
  if (listName) {
    const listType = schema.nodes[listName];
    if (!listType) return;
    const newItem = item.type.create(listItemAttrsFor(item.attrs, target), item.content);
    middle = [listType.create(null, newItem)];
  } else {
    const textblock = createTextblock(schema, first, target);
    if (!textblock) return;
    middle = [textblock, ...rest];
  }

  spliceList(tr, ctx, index, index + 1, middle);
}

/** 把当前块转换为指定类型 */
export function convertActiveBlock(
  view: EditorView,
  active: ActiveNode,
  target: ConvertTarget,
): void {
  const block = resolveBlock(view, active);
  if (!block || !getTextblock(block) || isSameType(block, target)) return;

  const { state, dispatch } = view;
  const tr = state.tr;
  if (block.listCtx) {
    convertListItem(tr, state.schema, block.listCtx, target);
  } else {
    convertPlainBlock(tr, state.schema, block, target);
  }
  if (!tr.docChanged) return;

  dispatch(tr.scrollIntoView());
  view.focus();
}

/**
 * 把当前块转为链接：弹出链接对话框，文本预填为块内文字，
 * 文字本身像 URL 时同时预填地址。确认后整块文字替换为一个链接。
 */
export function convertActiveBlockToLink(view: EditorView, active: ActiveNode): void {
  const block = resolveBlock(view, active);
  const textblock = block && getTextblock(block);
  if (!textblock) return;

  const text = textblock.node.textContent.trim();
  const href = /^(https?:\/\/|mailto:|www\.)\S+$/i.test(text) ? text : '';

  const overlay = createLinkDialog(view, text, href, (linkText, linkHref) => {
    // 对话框打开期间文档可能变化，提交时重新解析
    const latest = resolveBlock(view, active);
    const target = latest && getTextblock(latest);
    const linkType = view.state.schema.marks.link;
    if (!target || !linkType) return;

    const { state, dispatch } = view;
    const linkNode = state.schema.text(linkText, [linkType.create({ href: linkHref })]);
    const tr = state.tr;
    if (target.node.type.spec.code) {
      // 代码块不允许带 mark，整块换成含链接的段落
      const paragraph = state.schema.nodes.paragraph;
      if (!paragraph) return;
      tr.replaceWith(
        target.pos,
        target.pos + target.node.nodeSize,
        paragraph.create(null, linkNode),
      );
    } else {
      tr.replaceWith(target.pos + 1, target.pos + 1 + target.node.content.size, linkNode);
    }
    dispatch(tr.scrollIntoView());
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    const field = href ? '[data-field="text"]' : '[data-field="href"]';
    overlay.querySelector<HTMLInputElement>(field)?.focus();
  });
}

/**
 * Image Block - 在光标处插入块级节点（纯函数模块）
 *
 * image-block 是块级节点，不能放进 paragraph 内部。若直接对文本块内部位置调用
 * `tr.insert(pos, blockNode)`，ProseMirror 的 Fitter 会把当前段落从光标处劈开，
 * 在图片前后各留下一个段落；当光标位于空行时，结果就是「空行 + 图片 + 空行」，
 * 序列化后表现为多出的 `<br />`，视觉上图片被另起一行插入。
 *
 * 本模块按光标在当前文本块中的位置决定插入策略，保证图片落在「当前光标行」：
 * - 当前文本块为空          → 用图片替换该文本块
 * - 光标在文本块开头        → 插入到文本块之前
 * - 光标在文本块末尾        → 插入到文本块之后
 * - 光标在文本块中间        → 在光标处拆分文本块，图片插在两段之间
 * - 上下文不允许块级图片时（如表格单元格）→ 向上寻找可容纳的祖先，插到其后
 *
 * 不依赖 DOM / Tauri / store，可在 Node 中独立验证。
 *
 * @changelog
 * | 版本   | 变更说明                                         | 关联                                  |
 * | v1.0.0 | 初始实现：统一图片块插入位置，修复空行插入多出空段落 | BUGFIX: 图片插入未落在当前光标行        |
 * /@changelog
 *
 * @author hhhuilli
 */

import { Selection, TextSelection } from '@milkdown/kit/prose/state';
import type { Transaction } from '@milkdown/kit/prose/state';
import type { Node as ProseNode, ResolvedPos } from '@milkdown/kit/prose/model';

/** insertBlockAtCursor 的可选行为 */
export interface InsertBlockOptions {
  /** 插入后是否把光标移动到图片之后（粘贴等连续输入场景使用） */
  moveCursorAfter?: boolean;
}

/**
 * 判断 depth 层节点所在容器能否在其后（或替换它）放入 node
 */
function canPlaceAt($pos: ResolvedPos, depth: number, node: ProseNode, replace: boolean): boolean {
  if (depth < 1) return false;
  const container = $pos.node(depth - 1);
  const index = $pos.index(depth - 1);
  return replace
    ? container.canReplaceWith(index, index + 1, node.type)
    : container.canReplaceWith(index + 1, index + 1, node.type);
}

/**
 * 当前上下文无法容纳块级节点时，向上寻找第一个允许在其后插入的祖先，返回插入位置
 */
function findFallbackInsertPos($pos: ResolvedPos, node: ProseNode): number | null {
  for (let depth = $pos.depth; depth >= 1; depth--) {
    if (canPlaceAt($pos, depth, node, false)) return $pos.after(depth);
  }
  return null;
}

/**
 * 在 pos 所在的光标行插入块级节点，返回节点实际插入的起始位置（失败返回 null）。
 * 直接在传入的 tr 上追加步骤。
 */
export function insertBlockAtCursor(
  tr: Transaction,
  pos: number,
  node: ProseNode,
  options: InsertBlockOptions = {},
): number | null {
  const $pos = tr.doc.resolve(pos);
  const parent = $pos.parent;
  const depth = $pos.depth;
  let insertedAt: number | null = null;

  if (!parent.isTextblock || depth === 0) {
    // 已处于块级边界（如 doc 根部），直接插入
    tr.insert(pos, node);
    insertedAt = pos;
  } else if (parent.content.size === 0 && canPlaceAt($pos, depth, node, true)) {
    // 空行：用图片替换该空文本块，避免残留空段落
    insertedAt = $pos.before(depth);
    tr.replaceWith(insertedAt, $pos.after(depth), node);
  } else if (canPlaceAt($pos, depth, node, false)) {
    if ($pos.parentOffset === 0) {
      insertedAt = $pos.before(depth);
    } else if ($pos.parentOffset === parent.content.size) {
      insertedAt = $pos.after(depth);
    } else {
      // 光标位于文本中间：先拆分文本块，拆分点（两段之间）即插入位置
      tr.split(pos);
      insertedAt = pos + 1;
    }
    tr.insert(insertedAt, node);
  } else {
    insertedAt = findFallbackInsertPos($pos, node);
    if (insertedAt === null) return null;
    tr.insert(insertedAt, node);
  }

  if (options.moveCursorAfter) {
    placeCursorAfter(tr, insertedAt + node.nodeSize);
  }
  return insertedAt;
}

/**
 * 把光标放到 afterPos（图片块之后）的文本行中。
 * 紧随其后的是文本块则落在其开头；否则补一个空段落再落入，
 * 避免回退成选中图片的 NodeSelection —— 那样继续输入会直接覆盖图片。
 */
function placeCursorAfter(tr: Transaction, afterPos: number): void {
  const $after = tr.doc.resolve(afterPos);
  const next = $after.nodeAfter;
  if (next?.isTextblock) {
    tr.setSelection(TextSelection.create(tr.doc, afterPos + 1));
    return;
  }
  const paragraphType = tr.doc.type.schema.nodes.paragraph;
  const container = $after.parent;
  const index = $after.index();
  if (paragraphType && container.canReplaceWith(index, index, paragraphType)) {
    tr.insert(afterPos, paragraphType.create());
    tr.setSelection(TextSelection.create(tr.doc, afterPos + 1));
    return;
  }
  tr.setSelection(Selection.near($after, 1));
}

/**
 * Math Dollar Trigger Plugin
 *
 * 重新设计 $ 输入的交互逻辑：
 *
 * 1. 输入 $ 自动补全为 $$，光标在中间，但不触发任何公式
 * 2. 在 $$ 之间输入内容时，立即替换为 math_inline 节点并进入编辑态
 * 3. 光标移出空的 $$，按回车时创建 math_block（块级公式）
 *
 * 实现方式：
 * - InputRule：$ -> $$ 自动补全
 * - ProseMirror Plugin（appendTransaction）：检测 $X$ 模式，替换为 math_inline
 * - Keymap：Enter 键检测光标前后的 $$ 模式，触发块级公式
 */

import { InputRule } from '@milkdown/kit/prose/inputrules';
import { Plugin, PluginKey, TextSelection, NodeSelection } from '@milkdown/kit/prose/state';
import type { EditorState, Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

// ---------------------------------------------------------------------------
// Plugin Key
// ---------------------------------------------------------------------------

export const dollarTriggerPluginKey = new PluginKey('dollarTrigger');

// ---------------------------------------------------------------------------
// InputRule：输入 $ 自动补全为 $$
// ---------------------------------------------------------------------------

/**
 * 输入 $ 自动补全为 $$，光标放在两个 $ 之间
 * 排除以下情况：
 * - 前一个字符已经是 $（避免 $$$ 死循环）
 * - 在 code 节点内
 * 特殊处理：
 * - 光标在 $|$ 中间再输入 $，跳到第二个 $ 后面（方便快速输入 $$ 后按 Enter 建块）
 */
export function createDollarAutoCompleteRule(): InputRule {
  return new InputRule(/\$$/, (state, _match, start, end) => {
    // 排除 code mark
    const $pos = state.doc.resolve(start);
    const marks = $pos.marks();
    if (marks.some((m) => m.type.name === 'code_inline' || m.type.name === 'code')) {
      return null;
    }

    // 检查前一个字符是否是 $
    const hasDollarBefore = start > 0 &&
      state.doc.textBetween(start - 1, start, '\0') === '$';

    // 检查后一个字符是否是 $
    const hasDollarAfter = end < state.doc.content.size &&
      state.doc.textBetween(end, Math.min(end + 1, state.doc.content.size), '\0') === '$';

    // 特殊情况：光标在 $|$ 中间再输入 $
    // 此时 hasDollarBefore 和 hasDollarAfter 都为 true
    // 用户刚输入的 $ 变成了中间的字符，形成 $$|$
    // 但实际上 InputRule 收到的是用户输入的 $，start 处是 $ 输入位置
    // 如果前面是 $ 且后面也是 $，说明用户在 $|$ 中间输入了 $
    // 不插入这个 $，改为跳到后面的 $ 之后
    if (hasDollarBefore && hasDollarAfter) {
      const tr = state.tr;
      // 删除刚输入的 $（InputRule 已匹配 start..end）
      tr.delete(start, end);
      // 光标跳到后面的 $ 之后（注意删除后位置已偏移，原来 end 位置的 $ 现在在 start 位置）
      tr.setSelection(TextSelection.create(tr.doc, start + 1));
      return tr;
    }

    // 如果前面已经有 $，不补全（避免 $$$ 出现）
    if (hasDollarBefore) return null;

    // 如果后面已经有 $，不补全（光标在某个 $ 前面）
    if (hasDollarAfter) return null;

    // 正常情况：替换输入的 $ 为 $$，光标放在两个 $ 之间
    const tr = state.tr;
    tr.replaceWith(start, end, state.schema.text('$$'));
    // 光标在两个 $ 之间：start 是第一个 $ 的位置，start+1 是中间
    tr.setSelection(TextSelection.create(tr.doc, start + 1));

    return tr;
  });
}

// ---------------------------------------------------------------------------
// Plugin：监听 $X$ 模式，替换为 math_inline
// ---------------------------------------------------------------------------

/**
 * 创建 dollar trigger 监听插件
 *
 * 通过 appendTransaction 监听文档变更：
 * 当检测到 $X$（X 为非空文本）模式时，将其替换为 math_inline 节点并进入编辑态
 *
 * 触发条件：
 * - 文本中存在 $X$ 模式（X 是刚输入的字符）
 * - X 至少有一个字符
 * - 不是 $$ 开头（排除块级公式标记）
 */
export function createDollarTriggerPlugin(): Plugin {
  return new Plugin({
    key: dollarTriggerPluginKey,

    appendTransaction(transactions, _oldState, newState) {
      // 只处理有文档变更的 transaction
      const docChanged = transactions.some((tr) => tr.docChanged);
      if (!docChanged) return null;

      const { selection } = newState;
      if (!(selection instanceof TextSelection)) return null;
      if (!selection.empty) return null;

      const { $from } = selection;
      const parent = $from.parent;

      // 只在 inline 文本上下文中检测
      if (!parent.isTextblock) return null;

      const cursorPosInParent = $from.parentOffset;
      const parentText = parent.textContent;

      // 检测光标位置前方是否有 $X$ 模式
      // 光标应该在第二个 $ 的后面（因为用户刚输入了一个字符，导致 $|$ 变成 $X|$？
      // 不对，用户在 $|$ 中间输入字符，变成 $X|$，此时光标在 X 后面第二个 $ 前面
      // 实际上 $$ 是纯文本，用户在中间输入 X 后变成 $X$
      // 光标位置是在 X 之后，即 $X|$ —— cursorPosInParent 指向第二个 $ 之前

      // 向前查找最近的 $ 对
      // 从光标位置往前查找 $
      if (cursorPosInParent < 2) return null; // 至少需要 $X 两个字符在前

      // 检查光标后面是否紧跟 $
      if (cursorPosInParent >= parentText.length) return null;
      if (parentText[cursorPosInParent] !== '$') return null;

      // 从光标位置往前找最近的 $
      let dollarStart = -1;
      for (let i = cursorPosInParent - 1; i >= 0; i--) {
        if (parentText[i] === '$') {
          dollarStart = i;
          break;
        }
      }

      if (dollarStart === -1) return null;

      // 提取中间的内容
      const formulaText = parentText.slice(dollarStart + 1, cursorPosInParent);
      if (!formulaText || formulaText.length === 0) return null;

      // 排除 $$ 块级标记：前面还有一个 $ 的情况
      if (dollarStart > 0 && parentText[dollarStart - 1] === '$') return null;

      // 排除后面还有 $ 的情况（$X$$ 应该忽略）
      if (cursorPosInParent + 1 < parentText.length && parentText[cursorPosInParent + 1] === '$') {
        return null;
      }

      // 获取 math_inline 节点类型
      const mathInlineType = newState.schema.nodes.math_inline;
      if (!mathInlineType) return null;

      // 计算在文档中的绝对位置
      const parentStart = $from.start(); // 父节点内容起始的绝对位置
      const absStart = parentStart + dollarStart; // 第一个 $ 的绝对位置
      const absEnd = parentStart + cursorPosInParent + 1; // 第二个 $ 之后的绝对位置

      // 创建 math_inline 节点并替换 $X$
      const mathNode = mathInlineType.create({ value: formulaText });
      const tr = newState.tr.replaceWith(absStart, absEnd, mathNode);

      // 设置 NodeSelection 选中该节点（触发 selectNode -> 进入编辑态）
      tr.setSelection(NodeSelection.create(tr.doc, absStart));

      return tr;
    },
  });
}

// ---------------------------------------------------------------------------
// Enter 键处理：空 $$ 回车创建块级公式
// ---------------------------------------------------------------------------

/**
 * Enter 键命令：检测光标是否在空 $$ 旁边，如果是则创建块级公式
 *
 * 触发条件：
 * - 当前段落内容恰好是 $$（光标在 $$ 之后或之间）
 * - 按 Enter 时，删除 $$，替换为 math_block 节点
 */
export function dollarBlockEnterCmd(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
  view?: EditorView,
): boolean {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;
  if (!selection.empty) return false;

  const { $from } = selection;
  const parent = $from.parent;

  // 检查当前所在段落
  if (parent.type.name !== 'paragraph') return false;

  const text = parent.textContent;

  // 精确匹配：段落内容恰好是 $$（可能带前后空白）
  if (text.trim() !== '$$') return false;

  // 获取 math_block 节点类型
  const mathBlockType = state.schema.nodes.math_block;
  if (!mathBlockType) return false;

  if (dispatch) {
    // 替换整个段落为 math_block
    const parentPos = $from.before(); // 段落的起始位置
    const parentEnd = $from.after(); // 段落的结束位置

    const mathNode = mathBlockType.create();
    const tr = state.tr.replaceWith(parentPos, parentEnd, mathNode);

    // 光标定位到 math_block 内部
    const resolvedPos = tr.doc.resolve(parentPos + 1);
    tr.setSelection(TextSelection.near(resolvedPos));

    dispatch(tr.scrollIntoView());
  }

  // 聚焦回编辑器
  if (view) {
    view.focus();
  }

  return true;
}

/**
 * Math Inline - Backspace 进入编辑命令
 *
 * 当光标在 math_inline 节点右边紧邻位置按 Backspace 时，
 * 不删除节点，而是进入编辑态（对标 Typora 行为）。
 */

import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorState, Transaction } from '@milkdown/kit/prose/state';

/**
 * 自定义 Backspace 命令
 * 光标在 math_inline 右边界时，按 Backspace 进入编辑而不是删除
 */
export function mathInlineBackspaceCmd(
  state: EditorState,
  dispatch?: (tr: Transaction) => void,
): boolean {
  const { selection } = state;

  // 只处理空的文本光标
  if (!(selection instanceof TextSelection)) return false;
  if (!selection.empty) return false;

  const { $from } = selection;

  // 检查光标前面是否紧邻 math_inline 节点
  const nodeBefore = $from.nodeBefore;
  if (!nodeBefore || nodeBefore.type.name !== 'math_inline') return false;

  if (dispatch) {
    // 选中该 math_inline 节点（触发 selectNode -> 进入编辑）
    const nodePos = $from.pos - nodeBefore.nodeSize;
    const tr = state.tr.setSelection(NodeSelection.create(state.doc, nodePos));
    dispatch(tr);
  }

  return true;
}

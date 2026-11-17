/**
 * 节点复制 / 剪切辅助
 *
 * 供附件块、图片块右键菜单复用：先把目标节点设为 NodeSelection，
 * 再通过 document.execCommand 触发 ProseMirror 的复制/剪切处理，
 * 与默认右键菜单中「复制 / 剪切」的行为保持一致。
 *
 * @changelog
 * | 版本   | 变更说明                         | 关联                                          |
 * | v1.0.0 | 初始实现：节点复制/剪切辅助函数   | REQ: 20261104-node-context-menu TECH: 节点右键菜单 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { NodeSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

/**
 * 将目标位置设为节点选区（若已是该节点选区则跳过）。
 */
function selectNode(view: EditorView, nodePos: number): void {
  const { state, dispatch } = view;
  if (state.selection instanceof NodeSelection && state.selection.from === nodePos) {
    return;
  }
  try {
    const selection = NodeSelection.create(state.doc, nodePos);
    dispatch(state.tr.setSelection(selection));
  } catch {
    // 节点位置失效时忽略，交由后续 execCommand 兜底
  }
}

/**
 * 复制节点到剪贴板。
 */
export function copyNode(view: EditorView, nodePos: number): void {
  selectNode(view, nodePos);
  document.execCommand('copy');
  view.focus();
}

/**
 * 剪切节点（复制到剪贴板并从文档删除）。
 */
export function cutNode(view: EditorView, nodePos: number): void {
  selectNode(view, nodePos);
  document.execCommand('cut');
  view.focus();
}

/**
 * Link 右键菜单
 *
 * 在编辑器上注册捕获阶段的 contextmenu 监听：
 * - 右键落在链接上时：弹出链接专属菜单（访问链接 / 编辑 / 复制 / 取消链接），
 *   与悬浮工具栏操作保持一致，不再触发默认右键菜单。
 * - 右键其他区域：不拦截，交由默认右键菜单处理。
 *
 * 额外处理：WKWebView 的原生「右键选词」行为会在 mousedown 之后、
 * contextmenu 派发之前选中鼠标下的词，且不受 mousedown preventDefault 控制。
 * 因此在右键命中链接时先保存原始 DOM 选区，弹菜单前恢复，保证选区不变。
 *
 * @changelog
 * | 版本   | 变更说明                         | 关联                                          |
 * | v1.0.0 | 初始实现：链接右键菜单           | REQ: 20261104-node-context-menu TECH: 链接右键菜单 |
 * | v1.0.1 | 修复：右键链接不再触发选词       | REQ: 20261104-node-context-menu TECH: 链接右键菜单 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

import { showContextMenu, type ContextMenuItem } from '../context-menu/renderer';
import { openLink, copyLink, editLink, unlinkLink, findLinkAtPos } from './actions';
import { linkTooltipIcons } from './link-tooltip';

const linkContextMenuKey = new PluginKey('LINK_CONTEXT_MENU');

// ---------------------------------------------------------------------------
// DOM 选区保存 / 恢复（对抗 WKWebView 原生右键选词）
// ---------------------------------------------------------------------------

/** 保存的 DOM 选区快照（右键命中链接时记录） */
let savedDomSelection: {
  anchorNode: Node | null;
  anchorOffset: number;
  focusNode: Node | null;
  focusOffset: number;
} | null = null;

/**
 * 记录当前 DOM 选区快照
 *
 * 必须在 mousedown 捕获阶段调用：此时原生选词尚未发生，
 * 拿到的还是右键前的真实选区。
 */
function saveDomSelection(): void {
  const sel = window.getSelection();
  if (!sel) {
    savedDomSelection = null;
    return;
  }
  savedDomSelection = {
    anchorNode: sel.anchorNode,
    anchorOffset: sel.anchorOffset,
    focusNode: sel.focusNode,
    focusOffset: sel.focusOffset,
  };
}

/**
 * 恢复之前保存的 DOM 选区
 *
 * 在 contextmenu 捕获阶段（弹菜单前）调用，此时原生选词已完成，
 * 将选区还原为右键前的状态；选区未变化时不做任何操作。
 * 恢复 DOM 选区后，ProseMirror 会通过 selectionchange 自动同步内部状态。
 */
function restoreDomSelection(): void {
  const saved = savedDomSelection;
  savedDomSelection = null;
  if (!saved) return;

  const sel = window.getSelection();
  if (!sel) return;

  const unchanged =
    sel.anchorNode === saved.anchorNode &&
    sel.anchorOffset === saved.anchorOffset &&
    sel.focusNode === saved.focusNode &&
    sel.focusOffset === saved.focusOffset;
  if (unchanged) return;

  sel.setBaseAndExtent(
    saved.anchorNode,
    saved.anchorOffset,
    saved.focusNode,
    saved.focusOffset,
  );
}

function handleContextMenu(view: EditorView, e: MouseEvent): void {
  const link = findLinkAtPos(view, e.clientX, e.clientY);
  if (!link) return;

  e.preventDefault();
  e.stopPropagation();
  // 原生选词已在 mousedown 与 contextmenu 之间发生，弹菜单前恢复原选区
  restoreDomSelection();

  const items: ContextMenuItem[] = [
    {
      label: '访问链接',
      icon: linkTooltipIcons.open,
      action: () => openLink(view, link.href),
    },
    {
      label: '编辑',
      icon: linkTooltipIcons.edit,
      action: () => editLink(view, link.from, link.to, link.text, link.href),
    },
    {
      label: '复制',
      icon: linkTooltipIcons.copy,
      action: () => {
        void copyLink(link.href).catch((err) => {
          console.error('Failed to copy link:', err);
        });
      },
    },
    {
      label: '取消链接',
      icon: linkTooltipIcons.unlink,
      action: () => unlinkLink(view, link.from, link.to),
    },
  ];

  showContextMenu(items, e.clientX, e.clientY);
}

export const linkContextMenuPlugin = $prose(() => {
  return new Plugin({
    key: linkContextMenuKey,
    view(editorView) {
      const handler = (e: MouseEvent) => handleContextMenu(editorView, e);
      const mousedownHandler = (e: MouseEvent) => {
        // 仅右键且命中链接时保存选区快照，供 contextmenu 弹菜单前恢复
        if (e.button !== 2) return;
        if (!findLinkAtPos(editorView, e.clientX, e.clientY)) return;
        saveDomSelection();
      };

      // 捕获阶段监听，确保先于默认右键菜单（ai-edit 的冒泡监听）执行
      editorView.dom.addEventListener('contextmenu', handler, true);
      editorView.dom.addEventListener('mousedown', mousedownHandler, true);

      return {
        destroy() {
          editorView.dom.removeEventListener('contextmenu', handler, true);
          editorView.dom.removeEventListener('mousedown', mousedownHandler, true);
        },
      };
    },
  });
});

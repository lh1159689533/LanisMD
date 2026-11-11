/**
 * Image Block 右键菜单
 *
 * 在 image-block 上注册捕获阶段的 contextmenu 监听：
 * - 右键落在图片节点上时：先选中该图片（与点击选中一致），
 *   再弹出图片专属菜单（编辑 / 左对齐 / 居中 / 右对齐 / 删除），
 *   不再触发默认右键菜单。
 * - 右键其他区域：不拦截，交由默认右键菜单处理。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

import { showContextMenu, type ContextMenuItem } from '../context-menu/renderer';
import { copyNode, cutNode } from '../context-menu/node-actions';
import { findNodePos, toolbarIcons } from './toolbar';
import { selectImageBlock } from './resize';

/** 复制图标 */
const ICON_COPY =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

/** 剪切图标 */
const ICON_CUT =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>';

const imageBlockContextMenuPluginKey = new PluginKey('IMAGE_BLOCK_CONTEXT_MENU');

// ---------------------------------------------------------------------------
// 编辑操作注入（复用工具栏的编辑弹窗逻辑，由 index.ts 注册，避免循环依赖）
// ---------------------------------------------------------------------------

let openImageDialogForEditFn: ((view: EditorView, nodePos: number) => Promise<void>) | null = null;

export function setImageContextMenuEditHandler(
  fn: (view: EditorView, nodePos: number) => Promise<void>,
): void {
  openImageDialogForEditFn = fn;
}

// ---------------------------------------------------------------------------
// 节点操作（对齐 / 删除，与工具栏逻辑一致）
// ---------------------------------------------------------------------------

function getCurrentAlign(view: EditorView, nodePos: number): string {
  try {
    const resolvedPos = view.state.doc.resolve(nodePos);
    const node = resolvedPos.nodeAfter;
    if (node && (node.type.name === 'image-block' || node.type.name === 'image_block')) {
      return node.attrs.align || 'center';
    }
  } catch {
    // 读取失败时回退到默认居中
  }
  return 'center';
}

function setAlignment(
  view: EditorView,
  blockEl: HTMLElement,
  nodePos: number,
  align: string,
): void {
  try {
    const { state, dispatch } = view;
    const resolvedPos = state.doc.resolve(nodePos);
    const node = resolvedPos.nodeAfter;
    if (node && (node.type.name === 'image-block' || node.type.name === 'image_block')) {
      const tr = state.tr.setNodeMarkup(nodePos, undefined, {
        ...node.attrs,
        align,
      });
      dispatch(tr);
    }
  } catch (e) {
    console.warn('Failed to set alignment:', e);
  }
  // 同步 data-align 到容器 DOM，供 CSS 对齐样式使用
  blockEl.setAttribute('data-align', align);
  // 同步工具栏对齐按钮的激活态
  blockEl.querySelectorAll('.align-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.align === align);
  });
  view.focus();
}

function deleteImage(view: EditorView, nodePos: number): void {
  try {
    const { state, dispatch } = view;
    const resolvedPos = state.doc.resolve(nodePos);
    const node = resolvedPos.nodeAfter;
    if (node) {
      const tr = state.tr.delete(nodePos, nodePos + node.nodeSize);
      dispatch(tr);
    }
  } catch (e) {
    console.warn('Failed to delete image block:', e);
  }
  view.focus();
}

// ---------------------------------------------------------------------------
// 事件处理
// ---------------------------------------------------------------------------

function handleContextMenu(view: EditorView, e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const blockEl = target.closest('.milkdown-image-block') as HTMLElement | null;
  if (!blockEl) return;

  // 图片说明（caption）区域右击仍走默认菜单，保留复制/粘贴等文本操作
  if (target.closest('.image-caption')) return;

  // 空状态（上传条）没有实际图片，不拦截，交由默认菜单处理
  const imgEl = blockEl.querySelector('.image-wrapper img') as HTMLImageElement | null;
  if (!imgEl) return;

  e.preventDefault();
  e.stopPropagation();

  const nodePos = findNodePos(view, blockEl);
  if (nodePos == null) return;

  // 选中图片（与点击选中一致：显示选中态、缩放把手与工具栏）
  selectImageBlock(blockEl);

  const currentAlign = getCurrentAlign(view, nodePos);

  const items: ContextMenuItem[] = [
    {
      label: '编辑',
      icon: toolbarIcons.edit,
      action: () => {
        if (openImageDialogForEditFn) void openImageDialogForEditFn(view, nodePos);
      },
    },
    { label: '', separator: true },
    {
      label: '左对齐',
      icon: toolbarIcons.alignLeft,
      active: currentAlign === 'left',
      action: () => setAlignment(view, blockEl, nodePos, 'left'),
    },
    {
      label: '居中',
      icon: toolbarIcons.alignCenter,
      active: currentAlign === 'center',
      action: () => setAlignment(view, blockEl, nodePos, 'center'),
    },
    {
      label: '右对齐',
      icon: toolbarIcons.alignRight,
      active: currentAlign === 'right',
      action: () => setAlignment(view, blockEl, nodePos, 'right'),
    },
    { label: '', separator: true },
    {
      label: '复制',
      icon: ICON_COPY,
      action: () => copyNode(view, nodePos),
    },
    {
      label: '剪切',
      icon: ICON_CUT,
      action: () => cutNode(view, nodePos),
    },
    { label: '', separator: true },
    {
      label: '删除',
      icon: toolbarIcons.delete,
      danger: true,
      action: () => deleteImage(view, nodePos),
    },
  ];

  showContextMenu(items, e.clientX, e.clientY);
}

// ---------------------------------------------------------------------------
// 插件
// ---------------------------------------------------------------------------

export const imageBlockContextMenuPlugin = $prose(() => {
  return new Plugin({
    key: imageBlockContextMenuPluginKey,
    view(editorView) {
      const handler = (e: MouseEvent) => handleContextMenu(editorView, e);
      // 捕获阶段监听，确保先于默认右键菜单（ai-edit 的冒泡监听）执行
      editorView.dom.addEventListener('contextmenu', handler, true);

      return {
        destroy() {
          editorView.dom.removeEventListener('contextmenu', handler, true);
        },
      };
    },
  });
});

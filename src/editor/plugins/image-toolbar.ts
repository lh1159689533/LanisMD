/**
 * Image Block Toolbar Plugin
 *
 * 为 image-block 组件添加操作栏（悬浮在图片右上角）：
 * - 编辑按钮：点击弹出图片选择弹窗（本地/URL）
 * - 对齐按钮：左对齐 / 居中 / 右对齐
 * - 删除按钮：删除图片块
 *
 * 实现方式：监听编辑器 DOM 变化，为每个 image-block 注入操作栏。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { openImageDialogForEdit } from './image-block';

const imageToolbarPluginKey = new PluginKey('IMAGE_BLOCK_TOOLBAR');

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const toolbarIcons = {
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  alignLeft:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="17" y1="18" x2="3" y2="18"/></svg>',
  alignCenter:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="18" y1="18" x2="6" y2="18"/></svg>',
  alignRight:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>',
  delete:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};

// ---------------------------------------------------------------------------
// Toolbar creation
// ---------------------------------------------------------------------------

const TOOLBAR_ATTR = 'data-image-toolbar';

/**
 * Create the toolbar element for a given image block
 */
function createToolbar(
  view: EditorView,
  blockEl: HTMLElement,
  nodePos: number,
): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'image-block-toolbar';
  toolbar.setAttribute(TOOLBAR_ATTR, 'true');

  // Prevent toolbar clicks from affecting ProseMirror selection
  toolbar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Get current alignment
  const getCurrentAlign = (): string => {
    return blockEl.getAttribute('data-align') || 'center';
  };

  // Set alignment
  const setAlignment = (align: string) => {
    blockEl.setAttribute('data-align', align);
    // Update active states
    toolbar.querySelectorAll('.align-btn').forEach((btn) => {
      const btnEl = btn as HTMLElement;
      btnEl.classList.toggle('active', btnEl.dataset.align === align);
    });
  };

  // Edit button
  const editBtn = createToolbarButton(toolbarIcons.edit, '编辑图片', () => {
    openImageDialogForEdit(view, nodePos);
  });
  toolbar.appendChild(editBtn);

  // Separator
  toolbar.appendChild(createSeparator());

  // Align buttons
  const currentAlign = getCurrentAlign();
  const alignBtns = [
    { icon: toolbarIcons.alignLeft, align: 'left', title: '左对齐' },
    { icon: toolbarIcons.alignCenter, align: 'center', title: '居中' },
    { icon: toolbarIcons.alignRight, align: 'right', title: '右对齐' },
  ];

  alignBtns.forEach(({ icon, align, title }) => {
    const btn = createToolbarButton(icon, title, () => {
      setAlignment(align);
    });
    btn.classList.add('align-btn');
    btn.dataset.align = align;
    if (align === currentAlign) {
      btn.classList.add('active');
    }
    toolbar.appendChild(btn);
  });

  // Separator
  toolbar.appendChild(createSeparator());

  // Delete button
  const deleteBtn = createToolbarButton(toolbarIcons.delete, '删除图片', () => {
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
  });
  deleteBtn.classList.add('delete-btn');
  toolbar.appendChild(deleteBtn);

  return toolbar;
}

function createToolbarButton(
  icon: string,
  title: string,
  onClick: () => void,
): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'operation-item';
  btn.innerHTML = icon;
  btn.title = title;
  btn.type = 'button';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function createSeparator(): HTMLElement {
  const sep = document.createElement('div');
  sep.className = 'operation-separator';
  return sep;
}

// ---------------------------------------------------------------------------
// Find the position of an image-block node from its DOM element
// ---------------------------------------------------------------------------

function findNodePos(view: EditorView, blockEl: HTMLElement): number | null {
  // Walk through the document to find the image-block at this DOM position
  const pos = view.posAtDOM(blockEl, 0);
  if (pos == null) return null;

  // Resolve to find the actual node
  const $pos = view.state.doc.resolve(pos);

  // Check if the resolved position is inside or at an image-block
  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === 'image-block' || node.type.name === 'image_block') {
      return $pos.before(d);
    }
  }

  // Try the node at the resolved position
  const nodeAfter = $pos.nodeAfter;
  if (nodeAfter && (nodeAfter.type.name === 'image-block' || nodeAfter.type.name === 'image_block')) {
    return pos;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Plugin: inject toolbars into image-block elements
// ---------------------------------------------------------------------------

export const imageBlockToolbarPlugin = $prose(() => {
  return new Plugin({
    key: imageToolbarPluginKey,
    view(editorView) {
      const observer = new MutationObserver(() => {
        injectToolbars(editorView);
      });

      // Observe the editor DOM for changes
      observer.observe(editorView.dom, {
        childList: true,
        subtree: true,
      });

      // Initial injection
      setTimeout(() => injectToolbars(editorView), 100);

      return {
        update(view) {
          // Re-inject on document changes
          setTimeout(() => injectToolbars(view), 50);
        },
        destroy() {
          observer.disconnect();
        },
      };
    },
  });
});

function injectToolbars(view: EditorView) {
  const imageBlocks = view.dom.querySelectorAll('.milkdown-image-block');

  imageBlocks.forEach((block) => {
    const blockEl = block as HTMLElement;
    const imageWrapper = blockEl.querySelector('.image-wrapper');
    const imageEdit = blockEl.querySelector('.image-edit') as HTMLElement | null;

    // Inject delete button for empty state (upload bar)
    if (imageEdit && !imageWrapper) {
      injectDeleteButton(view, blockEl, imageEdit);
    }

    // Only inject toolbar for blocks that have an image (not empty state)
    if (!imageWrapper) return;

    // Check if toolbar already exists
    if (imageWrapper.querySelector(`[${TOOLBAR_ATTR}]`)) return;

    const nodePos = findNodePos(view, blockEl);
    if (nodePos == null) return;

    const toolbar = createToolbar(view, blockEl, nodePos);
    imageWrapper.appendChild(toolbar);
  });
}

const DELETE_BTN_ATTR = 'data-image-delete';

/**
 * Inject a delete button into the empty-state upload bar (.image-edit)
 */
function injectDeleteButton(
  view: EditorView,
  blockEl: HTMLElement,
  editBar: HTMLElement,
): void {
  // Check if delete button already exists
  if (editBar.querySelector(`[${DELETE_BTN_ATTR}]`)) return;

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.setAttribute(DELETE_BTN_ATTR, 'true');
  deleteBtn.type = 'button';
  deleteBtn.title = '删除';
  deleteBtn.innerHTML = toolbarIcons.delete;

  deleteBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  deleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const nodePos = findNodePos(view, blockEl);
      if (nodePos == null) return;
      const { state, dispatch } = view;
      const resolvedPos = state.doc.resolve(nodePos);
      const node = resolvedPos.nodeAfter;
      if (node) {
        const tr = state.tr.delete(nodePos, nodePos + node.nodeSize);
        dispatch(tr);
      }
    } catch (err) {
      console.warn('Failed to delete image block:', err);
    }
    view.focus();
  });

  editBar.appendChild(deleteBtn);
}

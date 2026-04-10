/**
 * Image Inline Toolbar Plugin
 *
 * 为行内图片添加操作栏（悬浮在图片上方）：
 * - 编辑按钮：点击弹出图片选择弹窗（本地/URL）
 * - 对齐按钮：左对齐 / 居中 / 右对齐（转为块级图片）
 * - 删除按钮：删除图片
 *
 * 实现方式：监听编辑器 DOM 变化，为每个选中的 inline image 显示操作栏。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, NodeSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

const imageInlineToolbarPluginKey = new PluginKey('IMAGE_INLINE_TOOLBAR');

// ---------------------------------------------------------------------------
// SVG Icons (same as image-block)
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

const TOOLBAR_CLASS = 'image-inline-toolbar';

// Forward declaration - will be set by editor-setup.ts
let openImageDialogForInlineEditFn: ((view: EditorView, nodePos: number) => Promise<void>) | null = null;

export function setOpenImageDialogForInlineEdit(fn: (view: EditorView, nodePos: number) => Promise<void>) {
  openImageDialogForInlineEditFn = fn;
}

// Track current toolbar state
let currentToolbarWrapper: HTMLElement | null = null;
let currentView: EditorView | null = null;
let currentNodePos: number | null = null;

const TOOLBAR_ATTR = 'data-inline-toolbar';

/**
 * Create the toolbar element for a given inline image
 */
function createToolbar(view: EditorView, wrapperEl: HTMLElement, nodePos: number): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = TOOLBAR_CLASS;
  toolbar.setAttribute(TOOLBAR_ATTR, 'true');

  // Store references for button callbacks
  currentView = view;
  currentNodePos = nodePos;
  currentToolbarWrapper = wrapperEl;

  // Prevent toolbar clicks from affecting ProseMirror selection
  toolbar.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Edit button
  const editBtn = createToolbarButton(toolbarIcons.edit, '编辑图片', () => {
    if (openImageDialogForInlineEditFn && currentView && currentNodePos != null) {
      openImageDialogForInlineEditFn(currentView, currentNodePos);
    }
  });
  toolbar.appendChild(editBtn);

  // Separator
  toolbar.appendChild(createSeparator());

  // Align buttons (these convert to block image)
  const alignBtns = [
    { icon: toolbarIcons.alignLeft, align: 'left', title: '左对齐（转块级）' },
    { icon: toolbarIcons.alignCenter, align: 'center', title: '居中（转块级）' },
    { icon: toolbarIcons.alignRight, align: 'right', title: '右对齐（转块级）' },
  ];

  alignBtns.forEach(({ icon, align, title }) => {
    const btn = createToolbarButton(icon, title, () => {
      if (currentView && currentNodePos != null) {
        convertToBlockImage(currentView, currentNodePos, align);
      }
    });
    btn.classList.add('align-btn');
    btn.dataset.align = align;
    toolbar.appendChild(btn);
  });

  // Separator
  toolbar.appendChild(createSeparator());

  // Delete button
  const deleteBtn = createToolbarButton(toolbarIcons.delete, '删除图片', () => {
    if (currentView && currentNodePos != null) {
      deleteInlineImage(currentView, currentNodePos);
    }
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

/**
 * Convert inline image to block image with specified alignment
 */
function convertToBlockImage(view: EditorView, nodePos: number, align: string) {
  try {
    const { state, dispatch } = view;
    const $pos = state.doc.resolve(nodePos);
    const node = $pos.nodeAfter;

    if (!node || node.type.name !== 'image') {
      console.warn('Node is not an inline image');
      return;
    }

    // Get the image-block node type
    const imageBlockType = state.schema.nodes['image-block'] || state.schema.nodes['image_block'];
    if (!imageBlockType) {
      console.warn('image-block node type not found in schema');
      return;
    }

    // Create new image-block node with the same src
    const newNode = imageBlockType.create({
      src: node.attrs.src,
      alt: node.attrs.alt,
      title: node.attrs.title,
      align: align,
    });

    // Find the paragraph containing this image
    let paragraphStart = nodePos;
    let paragraphEnd = nodePos + node.nodeSize;
    
    for (let d = $pos.depth; d >= 0; d--) {
      const parentNode = $pos.node(d);
      if (parentNode.type.name === 'paragraph') {
        paragraphStart = $pos.before(d);
        paragraphEnd = $pos.after(d);
        break;
      }
    }

    // Replace the inline image with block image
    // If the paragraph only contains the image, replace the whole paragraph
    // Otherwise, just replace the image and insert block after
    const parentParagraph = $pos.parent;
    const isOnlyChild = parentParagraph.childCount === 1 && parentParagraph.firstChild === node;

    let tr;
    if (isOnlyChild) {
      // Replace the entire paragraph with the block image
      tr = state.tr.replaceWith(paragraphStart, paragraphEnd, newNode);
    } else {
      // Delete the inline image and insert block image after the paragraph
      tr = state.tr
        .delete(nodePos, nodePos + node.nodeSize)
        .insert(paragraphEnd - node.nodeSize, newNode);
    }

    dispatch(tr);
    hideToolbar();
  } catch (e) {
    console.warn('Failed to convert to block image:', e);
  }
  view.focus();
}

/**
 * Delete inline image
 */
function deleteInlineImage(view: EditorView, nodePos: number) {
  try {
    const { state, dispatch } = view;
    const $pos = state.doc.resolve(nodePos);
    const node = $pos.nodeAfter;

    if (node) {
      const tr = state.tr.delete(nodePos, nodePos + node.nodeSize);
      dispatch(tr);
    }
  } catch (e) {
    console.warn('Failed to delete inline image:', e);
  }
  hideToolbar();
  view.focus();
}

/**
 * Find the position of an inline image node from its DOM element
 */
function findInlineImagePos(view: EditorView, wrapperEl: HTMLElement): number | null {
  const pos = view.posAtDOM(wrapperEl, 0);
  if (pos == null) return null;

  const $pos = view.state.doc.resolve(pos);

  const nodeAfter = $pos.nodeAfter;
  if (nodeAfter && nodeAfter.type.name === 'image') {
    return pos;
  }

  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === 'image') {
      return $pos.before(d);
    }
  }

  return null;
}

/**
 * Show toolbar for a selected inline image (inject into wrapper element)
 */
function showToolbar(view: EditorView, wrapperEl: HTMLElement, nodePos: number) {
  // If toolbar already exists in this wrapper, just update state
  const existingToolbar = wrapperEl.querySelector(`[${TOOLBAR_ATTR}]`);
  if (existingToolbar) {
    currentView = view;
    currentNodePos = nodePos;
    currentToolbarWrapper = wrapperEl;
    wrapperEl.classList.add('toolbar-visible');
    return;
  }

  // Remove toolbar from previous wrapper if any
  hideToolbar();

  // Create and inject toolbar into the wrapper
  const toolbar = createToolbar(view, wrapperEl, nodePos);
  wrapperEl.appendChild(toolbar);
  wrapperEl.classList.add('toolbar-visible');
}

/**
 * Hide the toolbar (remove from wrapper)
 */
function hideToolbar() {
  if (currentToolbarWrapper) {
    const toolbar = currentToolbarWrapper.querySelector(`[${TOOLBAR_ATTR}]`);
    if (toolbar) {
      toolbar.remove();
    }
    currentToolbarWrapper.classList.remove('toolbar-visible');
  }
  currentView = null;
  currentNodePos = null;
  currentToolbarWrapper = null;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const imageInlineToolbarPlugin = $prose(() => {
  return new Plugin({
    key: imageInlineToolbarPluginKey,
    view(editorView) {
      // Handle clicks outside to hide toolbar
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        // Don't hide if clicking on toolbar
        if (target.closest(`[${TOOLBAR_ATTR}]`)) {
          return;
        }

        // Don't hide if clicking on a selected inline image
        const inlineImage = target.closest('.milkdown-image-inline.selected, .milkdown-image-inline.toolbar-visible');
        if (inlineImage) {
          return;
        }

        // Hide toolbar
        hideToolbar();
      };

      // Handle Escape key
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && currentToolbarWrapper) {
          hideToolbar();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);

      return {
        update(view) {
          // Check if an inline image is selected
          const selection = view.state.selection;
          
          console.log('[ImageInlineToolbar] Selection update:', {
            selectionType: selection.constructor.name,
            isNodeSelection: selection instanceof NodeSelection,
            from: selection.from,
            to: selection.to,
          });
          
          // Check for NodeSelection on image (use instanceof instead of constructor.name)
          if (selection instanceof NodeSelection) {
            const node = selection.node;
            console.log('[ImageInlineToolbar] NodeSelection detected, node type:', node?.type?.name);
            
            if (node && node.type.name === 'image') {
              // Find the DOM element - use nodeDOM for NodeSelection
              try {
                // Method 1: Use view.nodeDOM to get the actual node's DOM element
                const nodeDOM = view.nodeDOM(selection.from);
                console.log('[ImageInlineToolbar] nodeDOM:', nodeDOM, nodeDOM?.nodeName);
                
                let wrapperEl: HTMLElement | null = null;
                
                if (nodeDOM) {
                  // nodeDOM might be the wrapper span or the img itself
                  if ((nodeDOM as HTMLElement).classList?.contains('milkdown-image-inline')) {
                    wrapperEl = nodeDOM as HTMLElement;
                  } else {
                    wrapperEl = (nodeDOM as HTMLElement).closest?.('.milkdown-image-inline') as HTMLElement;
                  }
                }
                
                // Method 2: Fallback - find by position using domAtPos and child nodes
                if (!wrapperEl) {
                  const domAtPos = view.domAtPos(selection.from);
                  const parentEl = domAtPos.node as HTMLElement;
                  const offset = domAtPos.offset;
                  
                  console.log('[ImageInlineToolbar] Fallback - DOM at pos:', {
                    parentEl,
                    nodeName: parentEl?.nodeName,
                    offset,
                    childNodes: parentEl?.childNodes?.length,
                  });
                  
                  // Try to find the child at the offset
                  if (parentEl.childNodes && offset < parentEl.childNodes.length) {
                    const childAtOffset = parentEl.childNodes[offset] as HTMLElement;
                    console.log('[ImageInlineToolbar] Child at offset:', childAtOffset, childAtOffset?.nodeName);
                    
                    if (childAtOffset?.classList?.contains('milkdown-image-inline')) {
                      wrapperEl = childAtOffset;
                    } else if (childAtOffset) {
                      wrapperEl = childAtOffset.closest?.('.milkdown-image-inline') as HTMLElement;
                    }
                  }
                }
                
                console.log('[ImageInlineToolbar] Found wrapper:', wrapperEl);
                
                if (wrapperEl) {
                  showToolbar(view, wrapperEl, selection.from);
                  return;
                }
              } catch (e) {
                console.warn('[ImageInlineToolbar] Error finding DOM element:', e);
              }
            }
          }

          // No inline image selected, hide toolbar
          hideToolbar();
        },
        destroy() {
          document.removeEventListener('mousedown', handleClickOutside);
          document.removeEventListener('keydown', handleKeyDown);
          hideToolbar();
        },
      };
    },
  });
});

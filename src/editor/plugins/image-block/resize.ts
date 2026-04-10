/**
 * Image Resize Plugin
 *
 * 为 image-block 添加四角缩放功能：
 * - 点击图片时显示选中状态和四角缩放把手
 * - 拖拽四角把手进行等比例缩放
 * - 点击其他地方取消选中
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

const imageResizePluginKey = new PluginKey('IMAGE_RESIZE');

// ---------------------------------------------------------------------------
// Corner handles creation
// ---------------------------------------------------------------------------

const HANDLES_ATTR = 'data-corner-handles';
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
type Corner = typeof CORNERS[number];

// Threshold for small image detection (width in pixels)
const SMALL_IMAGE_WIDTH_THRESHOLD = 200;

/**
 * Update the small-image class based on image width
 * Used for toolbar positioning (inside vs above image)
 */
function updateSmallImageClass(blockEl: HTMLElement, imgEl: HTMLImageElement) {
  const width = imgEl.getBoundingClientRect().width;
  if (width < SMALL_IMAGE_WIDTH_THRESHOLD) {
    blockEl.classList.add('small-image');
  } else {
    blockEl.classList.remove('small-image');
  }
}

/**
 * Create corner resize handles container
 */
function createCornerHandles(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'image-corner-handles';
  container.setAttribute(HANDLES_ATTR, 'true');

  for (const corner of CORNERS) {
    const handle = document.createElement('div');
    handle.className = 'image-corner-handle';
    handle.setAttribute('data-corner', corner);
    container.appendChild(handle);
  }

  return container;
}

// ---------------------------------------------------------------------------
// Find node position from DOM element
// ---------------------------------------------------------------------------

function findNodePos(view: EditorView, blockEl: HTMLElement): number | null {
  const pos = view.posAtDOM(blockEl, 0);
  if (pos == null) return null;

  const $pos = view.state.doc.resolve(pos);

  for (let d = $pos.depth; d >= 0; d--) {
    const node = $pos.node(d);
    if (node.type.name === 'image-block' || node.type.name === 'image_block') {
      return $pos.before(d);
    }
  }

  const nodeAfter = $pos.nodeAfter;
  if (nodeAfter && (nodeAfter.type.name === 'image-block' || nodeAfter.type.name === 'image_block')) {
    return pos;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Resize logic
// ---------------------------------------------------------------------------

interface ResizeState {
  view: EditorView;
  blockEl: HTMLElement;
  imgEl: HTMLImageElement;
  nodePos: number;
  corner: Corner;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  aspectRatio: number;
}

let currentResizeState: ResizeState | null = null;

/**
 * Start resize operation
 */
function startResize(
  e: MouseEvent,
  view: EditorView,
  blockEl: HTMLElement,
  imgEl: HTMLImageElement,
  nodePos: number,
  corner: Corner,
) {
  e.preventDefault();
  e.stopPropagation();

  const rect = imgEl.getBoundingClientRect();
  const startWidth = rect.width;
  const startHeight = rect.height;

  currentResizeState = {
    view,
    blockEl,
    imgEl,
    nodePos,
    corner,
    startX: e.clientX,
    startY: e.clientY,
    startWidth,
    startHeight,
    aspectRatio: startWidth / startHeight,
  };

  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeEnd);

  // Add resizing class for visual feedback
  blockEl.classList.add('image-resizing');
}

/**
 * Handle mouse move during resize
 */
function handleResizeMove(e: MouseEvent) {
  if (!currentResizeState) return;

  const {
    imgEl,
    corner,
    startX,
    startY,
    startWidth,
    aspectRatio,
  } = currentResizeState;

  const deltaX = e.clientX - startX;
  const deltaY = e.clientY - startY;

  // Calculate new width based on corner and movement direction
  let newWidth: number;

  switch (corner) {
    case 'se': // Bottom-right: increase size when moving right/down
      newWidth = startWidth + Math.max(deltaX, deltaY * aspectRatio);
      break;
    case 'sw': // Bottom-left: increase size when moving left/down
      newWidth = startWidth + Math.max(-deltaX, deltaY * aspectRatio);
      break;
    case 'ne': // Top-right: increase size when moving right/up
      newWidth = startWidth + Math.max(deltaX, -deltaY * aspectRatio);
      break;
    case 'nw': // Top-left: increase size when moving left/up
      newWidth = startWidth + Math.max(-deltaX, -deltaY * aspectRatio);
      break;
  }

  // Clamp width to reasonable bounds
  const minWidth = 50;
  const maxWidth = imgEl.closest('.milkdown-image-block')?.parentElement?.clientWidth || 800;
  newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

  // Apply new width (height will maintain aspect ratio via CSS)
  imgEl.style.width = `${newWidth}px`;
  imgEl.style.height = 'auto';
}

/**
 * Handle mouse up to end resize
 */
function handleResizeEnd() {
  if (!currentResizeState) return;

  const { view, blockEl, imgEl, nodePos } = currentResizeState;

  // Remove event listeners
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);

  // Remove resizing class
  blockEl.classList.remove('image-resizing');

  // Update small-image class for toolbar positioning
  updateSmallImageClass(blockEl, imgEl);

  // Calculate the ratio based on container width
  const containerWidth = blockEl.parentElement?.clientWidth || 800;
  const newWidth = imgEl.getBoundingClientRect().width;
  const ratio = newWidth / containerWidth;

  // Update the node's ratio attribute via ProseMirror transaction
  try {
    const { state, dispatch } = view;
    const resolvedPos = state.doc.resolve(nodePos);
    const node = resolvedPos.nodeAfter;
    if (node && (node.type.name === 'image-block' || node.type.name === 'image_block')) {
      const tr = state.tr.setNodeMarkup(nodePos, undefined, {
        ...node.attrs,
        ratio: ratio.toFixed(2),
      });
      dispatch(tr);
    }
  } catch (e) {
    console.warn('Failed to update image ratio:', e);
  }

  currentResizeState = null;
}

// ---------------------------------------------------------------------------
// Selection management
// ---------------------------------------------------------------------------

let selectedBlockEl: HTMLElement | null = null;

/**
 * Select an image block (shows resize handles and toolbar)
 */
function selectImageBlock(blockEl: HTMLElement) {
  // Deselect previous
  if (selectedBlockEl && selectedBlockEl !== blockEl) {
    selectedBlockEl.classList.remove('image-selected');
    selectedBlockEl.classList.remove('toolbar-hidden');
    selectedBlockEl.classList.remove('small-image');
  }
  
  blockEl.classList.add('image-selected');
  blockEl.classList.remove('toolbar-hidden'); // Ensure toolbar is visible when selecting
  selectedBlockEl = blockEl;

  // Update small-image class for toolbar positioning
  const imgEl = blockEl.querySelector('.image-wrapper img') as HTMLImageElement;
  if (imgEl) {
    updateSmallImageClass(blockEl, imgEl);
  }
}

/**
 * Deselect current image block (hides resize handles and toolbar)
 */
function deselectImageBlock() {
  if (selectedBlockEl) {
    selectedBlockEl.classList.remove('image-selected');
    selectedBlockEl.classList.remove('toolbar-hidden');
    selectedBlockEl.classList.remove('small-image');
    selectedBlockEl = null;
  }
}

/**
 * Hide toolbar but keep image selected (triggered by Escape key)
 */
function hideToolbarOnly() {
  if (selectedBlockEl) {
    selectedBlockEl.classList.add('toolbar-hidden');
  }
}

// ---------------------------------------------------------------------------
// Plugin: inject corner handles and manage selection
// ---------------------------------------------------------------------------

export const imageResizePlugin = $prose(() => {
  return new Plugin({
    key: imageResizePluginKey,
    view(editorView) {
      const observer = new MutationObserver(() => {
        injectCornerHandles(editorView);
      });

      // Observe the editor DOM for changes
      observer.observe(editorView.dom, {
        childList: true,
        subtree: true,
      });

      // Initial injection
      setTimeout(() => injectCornerHandles(editorView), 100);

      // Handle clicks outside to deselect
      // Only clicking on <img> element selects the image block
      // Clicking anywhere else (including image-block but not img) deselects
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        
        // Check if clicked on img element inside an image block
        const clickedImg = target.closest('.milkdown-image-block .image-wrapper img');
        
        if (clickedImg) {
          // Clicking on img - selection is handled by the img click handler
          return;
        }
        
        // Check if clicked on corner handles (should not deselect)
        const clickedHandle = target.closest('.image-corner-handle');
        if (clickedHandle) {
          return;
        }
        
        // Check if clicked on toolbar buttons (should not deselect)
        const clickedToolbar = target.closest('.image-block-toolbar');
        if (clickedToolbar) {
          return;
        }
        
        // Clicked elsewhere - deselect
        deselectImageBlock();
      };

      // Handle Escape key to hide toolbar but keep selection
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && selectedBlockEl) {
          hideToolbarOnly();
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);

      return {
        update(view) {
          setTimeout(() => injectCornerHandles(view), 50);
        },
        destroy() {
          observer.disconnect();
          document.removeEventListener('mousedown', handleClickOutside);
          document.removeEventListener('keydown', handleKeyDown);
          deselectImageBlock();
        },
      };
    },
  });
});

/**
 * Inject corner handles into image blocks
 */
function injectCornerHandles(view: EditorView) {
  const imageBlocks = view.dom.querySelectorAll('.milkdown-image-block');

  imageBlocks.forEach((block) => {
    const blockEl = block as HTMLElement;
    const imageWrapper = blockEl.querySelector('.image-wrapper') as HTMLElement | null;
    const imgEl = imageWrapper?.querySelector('img') as HTMLImageElement | null;

    // Only inject for blocks that have an image
    if (!imageWrapper || !imgEl) return;

    // Check if corner handles already exist
    if (imageWrapper.querySelector(`[${HANDLES_ATTR}]`)) return;

    const nodePos = findNodePos(view, blockEl);
    if (nodePos == null) return;

    // Create and inject corner handles
    const handles = createCornerHandles();
    imageWrapper.appendChild(handles);

    // Add click handler to select image
    const handleImageClick = (e: MouseEvent) => {
      e.stopPropagation();
      selectImageBlock(blockEl);
    };

    // Only add if not already added
    if (!imgEl.hasAttribute('data-resize-click-handler')) {
      imgEl.setAttribute('data-resize-click-handler', 'true');
      imgEl.addEventListener('click', handleImageClick);
    }

    // Add drag handlers to corner handles
    handles.querySelectorAll('.image-corner-handle').forEach((handle) => {
      const handleEl = handle as HTMLElement;
      const corner = handleEl.getAttribute('data-corner') as Corner;

      handleEl.addEventListener('mousedown', (e: MouseEvent) => {
        // Re-find nodePos in case document has changed
        const currentNodePos = findNodePos(view, blockEl);
        if (currentNodePos == null) return;
        
        startResize(e, view, blockEl, imgEl, currentNodePos, corner);
      });
    });
  });
}

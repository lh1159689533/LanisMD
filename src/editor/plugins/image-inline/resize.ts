/**
 * Image Inline Resize Plugin
 *
 * 为行内图片添加缩放功能：
 * - 选中图片时显示四角缩放把手
 * - 拖拽四角把手进行等比例缩放
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, NodeSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

const imageInlineResizePluginKey = new PluginKey('IMAGE_INLINE_RESIZE');

// ---------------------------------------------------------------------------
// Corner handles creation
// ---------------------------------------------------------------------------

const HANDLES_ATTR = 'data-inline-corner-handles';
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
type Corner = typeof CORNERS[number];

// Threshold for small image detection (width in pixels)
const SMALL_IMAGE_WIDTH_THRESHOLD = 200;

/**
 * Update the small-image class based on image width
 * Used for toolbar positioning (inside vs above image)
 */
function updateSmallImageClass(wrapperEl: HTMLElement, imgEl: HTMLImageElement) {
  const width = imgEl.getBoundingClientRect().width;
  if (width < SMALL_IMAGE_WIDTH_THRESHOLD) {
    wrapperEl.classList.add('small-image');
  } else {
    wrapperEl.classList.remove('small-image');
  }
}

/**
 * Create corner resize handles container
 */
function createCornerHandles(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'image-inline-corner-handles';
  container.setAttribute(HANDLES_ATTR, 'true');

  for (const corner of CORNERS) {
    const handle = document.createElement('div');
    handle.className = 'image-inline-corner-handle';
    handle.setAttribute('data-corner', corner);
    container.appendChild(handle);
  }

  return container;
}

// ---------------------------------------------------------------------------
// Find node position from DOM element
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Resize logic
// ---------------------------------------------------------------------------

interface ResizeState {
  view: EditorView;
  wrapperEl: HTMLElement;
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
  wrapperEl: HTMLElement,
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
    wrapperEl,
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
  wrapperEl.classList.add('image-inline-resizing');
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

  // Clamp width to reasonable bounds for inline images
  const minWidth = 20;
  const maxWidth = 400; // Inline images shouldn't be too large
  newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

  // Apply new width
  imgEl.style.width = `${newWidth}px`;
  imgEl.style.height = 'auto';
  imgEl.style.maxHeight = 'none';
}

/**
 * Handle mouse up to end resize
 */
function handleResizeEnd() {
  if (!currentResizeState) return;

  const { view, wrapperEl, imgEl, nodePos } = currentResizeState;

  // Remove event listeners
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeEnd);

  // Remove resizing class
  wrapperEl.classList.remove('image-inline-resizing');

  // Get the final width as a string (e.g., "150px")
  const newWidth = Math.round(imgEl.getBoundingClientRect().width);

  // Store width in a data attribute on the image
  // Note: The standard Milkdown image node may not have a width attr,
  // so we apply it via style. This will be persisted through CSS.
  // For Markdown export, this is typically stored as HTML img with width.
  imgEl.setAttribute('data-width', `${newWidth}`);
  imgEl.style.width = `${newWidth}px`;

  // Update small-image class for toolbar positioning
  updateSmallImageClass(wrapperEl, imgEl);

  currentResizeState = null;
}

// ---------------------------------------------------------------------------
// Handles management
// ---------------------------------------------------------------------------

let currentHandles: HTMLElement | null = null;
let currentSelectedWrapper: HTMLElement | null = null;

/**
 * Show handles for a selected inline image
 */
function showHandles(view: EditorView, wrapperEl: HTMLElement, nodePos: number) {
  // Remove existing handles
  hideHandles();

  const imgEl = wrapperEl.querySelector('img.image-inline') as HTMLImageElement;
  if (!imgEl) return;

  // Update small-image class for toolbar positioning
  updateSmallImageClass(wrapperEl, imgEl);

  // Create handles
  currentHandles = createCornerHandles();
  currentSelectedWrapper = wrapperEl;

  // Append handles to the wrapper
  wrapperEl.appendChild(currentHandles);
  wrapperEl.classList.add('image-inline-selected');

  // Add drag handlers to corner handles
  currentHandles.querySelectorAll('.image-inline-corner-handle').forEach((handle) => {
    const handleEl = handle as HTMLElement;
    const corner = handleEl.getAttribute('data-corner') as Corner;

    handleEl.addEventListener('mousedown', (e: MouseEvent) => {
      // Re-find nodePos in case document has changed
      const currentNodePos = findInlineImagePos(view, wrapperEl);
      if (currentNodePos == null) return;
      
      startResize(e, view, wrapperEl, imgEl, currentNodePos, corner);
    });
  });
}

/**
 * Hide handles
 */
function hideHandles() {
  if (currentHandles) {
    currentHandles.remove();
    currentHandles = null;
  }
  if (currentSelectedWrapper) {
    currentSelectedWrapper.classList.remove('image-inline-selected');
    currentSelectedWrapper.classList.remove('small-image');
    currentSelectedWrapper = null;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const imageInlineResizePlugin = $prose(() => {
  return new Plugin({
    key: imageInlineResizePluginKey,
    view(editorView) {
      // Handle clicks outside to deselect
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;

        // Don't deselect if clicking on handles
        if (target.closest('.image-inline-corner-handle')) {
          return;
        }

        // Don't deselect if clicking on toolbar
        if (target.closest('.image-inline-toolbar')) {
          return;
        }

        // Don't deselect if clicking on the selected image
        if (currentSelectedWrapper && currentSelectedWrapper.contains(target)) {
          return;
        }

        // Hide handles
        hideHandles();
      };

      document.addEventListener('mousedown', handleClickOutside);

      return {
        update(view) {
          // Check if an inline image is selected (NodeSelection)
          const selection = view.state.selection;
          
          if (selection instanceof NodeSelection) {
            const node = selection.node;
            if (node && node.type.name === 'image') {
              // Find the DOM element
              try {
                let wrapperEl: HTMLElement | null = null;
                
                // Method 1: Use view.nodeDOM to get the actual node's DOM element
                const nodeDOM = view.nodeDOM(selection.from);
                
                if (nodeDOM) {
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
                  
                  if (parentEl.childNodes && offset < parentEl.childNodes.length) {
                    const childAtOffset = parentEl.childNodes[offset] as HTMLElement;
                    if (childAtOffset?.classList?.contains('milkdown-image-inline')) {
                      wrapperEl = childAtOffset;
                    } else if (childAtOffset) {
                      wrapperEl = childAtOffset.closest?.('.milkdown-image-inline') as HTMLElement;
                    }
                  }
                }
                
                if (wrapperEl && wrapperEl !== currentSelectedWrapper) {
                  showHandles(view, wrapperEl, selection.from);
                  return;
                } else if (wrapperEl) {
                  // Same wrapper, keep handles
                  return;
                }
              } catch (e) {
                console.warn('[ImageInlineResize] Error finding DOM element:', e);
              }
            }
          }

          // No inline image selected, hide handles
          hideHandles();
        },
        destroy() {
          document.removeEventListener('mousedown', handleClickOutside);
          hideHandles();
        },
      };
    },
  });
});

/**
 * Image Block Click Plugin
 *
 * 处理 image-block 区域的点击事件：
 * - 点击 <img> 元素本身：不处理（保持默认行为，如选中图片）
 * - 点击 <img> 左侧空白区域：光标移动到上一个最近的可编辑位置
 * - 点击 <img> 右侧空白区域：光标移动到下一个最近的可编辑位置
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

const imageBlockClickPluginKey = new PluginKey('IMAGE_BLOCK_CLICK');

/**
 * Find the position of an image-block node from its DOM element
 */
function findImageBlockNodePos(view: EditorView, blockEl: HTMLElement): number | null {
  const pos = view.posAtDOM(blockEl, 0);
  if (pos == null) return null;

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

/**
 * Find the nearest selectable position before the given position
 */
function findNearestSelectableBefore(view: EditorView, pos: number): number | null {
  const { doc } = view.state;
  
  // Search backwards for a valid text position
  for (let i = pos - 1; i >= 0; i--) {
    try {
      const $pos = doc.resolve(i);
      // Check if this position is valid for text selection
      if ($pos.parent.isTextblock) {
        // Find the end of this textblock (where cursor should go)
        const endOfBlock = $pos.end();
        return endOfBlock;
      }
    } catch {
      // Invalid position, continue searching
    }
  }
  
  return null;
}

/**
 * Find the nearest selectable position after the given position
 */
function findNearestSelectableAfter(view: EditorView, pos: number, nodeSize: number): number | null {
  const { doc } = view.state;
  const endPos = pos + nodeSize;
  
  // Search forwards for a valid text position
  for (let i = endPos; i <= doc.content.size; i++) {
    try {
      const $pos = doc.resolve(i);
      // Check if this position is valid for text selection
      if ($pos.parent.isTextblock) {
        // Find the start of this textblock (where cursor should go)
        const startOfBlock = $pos.start();
        return startOfBlock;
      }
    } catch {
      // Invalid position, continue searching
    }
  }
  
  return null;
}

/**
 * Handle click on image-block area
 */
function handleImageBlockClick(view: EditorView, event: MouseEvent): boolean {
  const target = event.target as HTMLElement;
  
  // Find the image-block container
  const imageBlock = target.closest('.milkdown-image-block') as HTMLElement | null;
  if (!imageBlock) return false;
  
  // Check if click is on the <img> element itself - if so, don't handle
  if (target.tagName === 'IMG') return false;
  
  // Also check if click is on toolbar, resize handles, caption, etc. - don't handle
  if (
    target.closest('.image-block-toolbar') ||
    target.closest('.image-resize-handle') ||
    target.closest('.image-caption') ||
    target.closest('.image-edit') || // Upload bar
    target.closest('button')
  ) {
    return false;
  }
  
  // Find the <img> element within the image-block
  const imgElement = imageBlock.querySelector('img') as HTMLImageElement | null;
  if (!imgElement) return false; // No image rendered yet (empty state)
  
  // Get the bounding rect of the <img> element
  const imgRect = imgElement.getBoundingClientRect();
  const clickX = event.clientX;
  
  // Determine if click is on the left or right side of the image
  const isClickOnLeft = clickX < imgRect.left;
  const isClickOnRight = clickX > imgRect.right;
  
  // If click is within the image bounds (horizontally), don't handle
  // This allows clicking on the image area (even if not directly on <img>) to still select it
  if (!isClickOnLeft && !isClickOnRight) {
    return false;
  }
  
  // Find the node position
  const nodePos = findImageBlockNodePos(view, imageBlock);
  if (nodePos == null) return false;
  
  const node = view.state.doc.nodeAt(nodePos);
  if (!node) return false;
  
  let targetPos: number | null = null;
  
  if (isClickOnLeft) {
    // Click on left side - move cursor to previous editable position
    targetPos = findNearestSelectableBefore(view, nodePos);
  } else {
    // Click on right side - move cursor to next editable position
    targetPos = findNearestSelectableAfter(view, nodePos, node.nodeSize);
  }
  
  if (targetPos == null) {
    // No editable position found - don't handle
    return false;
  }
  
  // Set the selection to the target position
  try {
    const { tr } = view.state;
    const selection = TextSelection.create(view.state.doc, targetPos);
    tr.setSelection(selection);
    view.dispatch(tr);
    view.focus();
    return true;
  } catch (e) {
    console.warn('Failed to set cursor position:', e);
    return false;
  }
}

export const imageBlockClickPlugin = $prose(() => {
  return new Plugin({
    key: imageBlockClickPluginKey,
    props: {
      handleClick(view, pos, event) {
        return handleImageBlockClick(view, event);
      },
    },
  });
});

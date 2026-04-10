/**
 * Image Inline Click Handler Plugin
 *
 * 处理行内图片的点击行为：
 * - 阻止点击时选中图片内文字（Live Text/OCR）
 * - 点击图片时选中该节点
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { NodeSelection } from '@milkdown/kit/prose/state';

const imageInlineClickPluginKey = new PluginKey('IMAGE_INLINE_CLICK');

/**
 * Find the position of an inline image node from its DOM element
 */
function findInlineImagePos(view: EditorView, wrapperEl: HTMLElement): number | null {
  try {
    const pos = view.posAtDOM(wrapperEl, 0);
    if (pos == null) return null;

    const $pos = view.state.doc.resolve(pos);

    // Check if the current position is at an image node
    const nodeAfter = $pos.nodeAfter;
    if (nodeAfter && nodeAfter.type.name === 'image') {
      return pos;
    }

    // Try to find image node in ancestors
    for (let d = $pos.depth; d >= 0; d--) {
      const node = $pos.node(d);
      if (node.type.name === 'image') {
        return $pos.before(d);
      }
    }
  } catch (e) {
    console.warn('[ImageInlineClick] Failed to find image pos:', e);
  }

  return null;
}

/**
 * Select an inline image node
 */
function selectInlineImage(view: EditorView, wrapperEl: HTMLElement): boolean {
  const imagePos = findInlineImagePos(view, wrapperEl);
  if (imagePos == null) {
    console.warn('[ImageInlineClick] Could not find image position');
    return false;
  }

  try {
    const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePos));
    view.dispatch(tr);
    console.log('[ImageInlineClick] Selected inline image at pos:', imagePos);
    return true;
  } catch (e) {
    console.warn('[ImageInlineClick] Failed to select inline image:', e);
    return false;
  }
}

export const imageInlineClickPlugin = $prose(() => {
  return new Plugin({
    key: imageInlineClickPluginKey,
    props: {
      handleDOMEvents: {
        // Handle click event directly on DOM
        click(view, event) {
          const target = event.target as HTMLElement;
          
          // Check if clicking on an inline image or its wrapper
          const inlineImageWrapper = target.closest('.milkdown-image-inline');
          if (!inlineImageWrapper) return false;

          console.log('[ImageInlineClick] Click detected on inline image');

          // Prevent default browser behavior
          event.preventDefault();
          event.stopPropagation();

          // Select the image node
          selectInlineImage(view, inlineImageWrapper as HTMLElement);
          
          return true;
        },
        // Prevent text selection on mousedown (Live Text/OCR)
        mousedown(view, event) {
          const target = event.target as HTMLElement;
          const inlineImageWrapper = target.closest('.milkdown-image-inline');
          
          if (inlineImageWrapper) {
            // Check if clicking on img element or wrapper
            const imgEl = inlineImageWrapper.querySelector('img.image-inline');
            if (imgEl && (target === imgEl || target.closest('.milkdown-image-inline'))) {
              // Prevent default to avoid text selection (Live Text)
              event.preventDefault();
              console.log('[ImageInlineClick] Mousedown prevented on inline image');
              return true;
            }
          }
          
          return false;
        },
      },
    },
  });
});

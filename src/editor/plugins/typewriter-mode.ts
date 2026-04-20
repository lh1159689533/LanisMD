/**
 * 打字机模式插件
 *
 * WYSIWYG 模式：ProseMirror 插件，监听选区变化后将光标滚动到视口中央
 * 源码模式：导出工具函数供 SourceEditor 调用
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { useEditorStore } from '@/stores/editor-store';

export const typewriterPluginKey = new PluginKey('typewriterMode');

/**
 * 向上查找真正的滚动容器（overflow: auto/scroll）
 *
 * 注意：CSS 规范中，当 overflow-x/overflow-y 其中一个设为非 visible 值时，
 * 另一个会自动从 visible 变为 auto。因此仅检查 computed overflow 不够，
 * 还需验证元素确实拥有可滚动的内容区域（scrollHeight > clientHeight）。
 */
function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  while (el) {
    const { overflow, overflowY } = getComputedStyle(el);
    const hasOverflowStyle =
      overflow === 'auto' ||
      overflow === 'scroll' ||
      overflowY === 'auto' ||
      overflowY === 'scroll';

    // 除了 overflow 属性匹配外，还要确认元素确实有可滚动区域
    if (hasOverflowStyle && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * 将光标滚动到滚动容器的垂直中央
 */
export function scrollCursorToCenter(
  scrollContainer: HTMLElement,
  cursorTop: number,
): void {
  const containerRect = scrollContainer.getBoundingClientRect();
  const containerCenter = containerRect.top + containerRect.height / 2;
  const offset = cursorTop - containerCenter;

  // 仅当偏移超过一定阈值时才滚动，避免微小抖动
  if (Math.abs(offset) > 5) {
    scrollContainer.scrollBy({
      top: offset,
      behavior: 'smooth',
    });
  }
}

/**
 * ProseMirror 打字机模式插件（WYSIWYG）
 */
export const typewriterPlugin = $prose(() => {
  return new Plugin({
    key: typewriterPluginKey,
    view() {
      return {
        update(view, prevState) {
          const { typewriterMode } = useEditorStore.getState();
          if (!typewriterMode) return;

          // 仅在选区变化时触发
          if (view.state.selection.eq(prevState.selection)) return;

          const scrollContainer = findScrollContainer(view.dom.parentElement);
          if (!scrollContainer) return;

          // 获取光标坐标
          requestAnimationFrame(() => {
            try {
              const coords = view.coordsAtPos(view.state.selection.from);
              if (coords) {
                scrollCursorToCenter(scrollContainer, coords.top);
              }
            } catch {
              // 编辑器可能已销毁
            }
          });
        },
      };
    },
  });
});

/**
 * 源码模式打字机滚动（供 SourceEditor 的 updateListener 调用）
 */
export function typewriterScrollForSource(
  view: import('@codemirror/view').EditorView,
): void {
  const { typewriterMode } = useEditorStore.getState();
  if (!typewriterMode) return;

  const scrollContainer = findScrollContainer(view.dom.parentElement);
  if (!scrollContainer) return;

  requestAnimationFrame(() => {
    try {
      const pos = view.state.selection.main.head;
      const coords = view.coordsAtPos(pos);
      if (coords) {
        scrollCursorToCenter(scrollContainer, coords.top);
      }
    } catch {
      // 编辑器可能已销毁
    }
  });
}

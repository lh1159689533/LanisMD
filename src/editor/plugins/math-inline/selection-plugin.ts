/**
 * Math Inline - Selection 监听插件
 *
 * 监听 ProseMirror selection 变化，当光标离开 math_inline 节点时，
 * 确保节点退出编辑态（作为 deselectNode 的兜底机制）。
 *
 * 原理：
 * - 在 view.update 中遍历文档中所有 math_inline 节点
 * - 检查当前 selection 是否在该节点范围内
 * - 如果不在，通过 DOM 上挂载的 NodeView 实例调用 exitEdit()
 */

import { Plugin, PluginKey } from '@milkdown/kit/prose/state';

export const mathInlineSelectionPluginKey = new PluginKey('mathInlineSelection');

export function createMathInlineSelectionPlugin() {
  return new Plugin({
    key: mathInlineSelectionPluginKey,
    view() {
      return {
        update(view) {
          const { selection } = view.state;
          const { from, to } = selection;

          // 遍历所有 math_inline NodeView，检查是否需要退出编辑
          view.state.doc.descendants((node, pos) => {
            if (node.type.name !== 'math_inline') return;
            const nodeEnd = pos + node.nodeSize;

            // 如果 selection 不在此节点范围内，通知退出编辑
            if (from < pos || from > nodeEnd || to < pos || to > nodeEnd) {
              // 通过 DOM 查找对应的 NodeView 实例并调用 exitEdit
              const domNode = view.nodeDOM(pos);
              if (domNode instanceof HTMLElement) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const nodeView = (domNode as any)._mathInlineView;
                if (nodeView?.editing) {
                  // 保护：如果 input 当前持有焦点，说明用户正在输入，
                  // 不应退出编辑态（dispatch setNodeMarkup 后 selection 可能短暂离开）
                  const inputEl = domNode.querySelector('input');
                  if (inputEl && inputEl === document.activeElement) {
                    return;
                  }
                  nodeView.exitEdit();
                }
              }
            }
          });
        },
      };
    },
  });
}

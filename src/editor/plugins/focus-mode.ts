/**
 * 专注模式 ProseMirror 插件（WYSIWYG 模式）
 *
 * 当 focusMode 开启时，为除光标所在顶层块之外的所有节点
 * 添加 `lanismd-focus-blur` CSS 类，配合 CSS 实现淡化效果。
 *
 * 触发装饰重新计算的场景：
 * 1. 光标选区变化（selectionSet）
 * 2. 文档内容变化（docChanged）
 * 3. 外部通过 meta 触发（focusModePluginKey: { trigger: true }）
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { useEditorStore } from '@/stores/editor-store';

export const focusModePluginKey = new PluginKey('focusMode');

/**
 * 计算专注模式装饰：遍历顶层节点，为非活跃块添加 blur 类
 */
function buildFocusDecorations(
  doc: import('@milkdown/kit/prose/model').Node,
  cursorPos: number,
): DecorationSet {
  const decorations: Decoration[] = [];
  let activeNodeStart = -1;
  let activeNodeEnd = -1;

  // 找到光标所在的顶层节点范围
  doc.forEach((node, offset) => {
    const start = offset;
    const end = offset + node.nodeSize;
    if (cursorPos >= start && cursorPos <= end) {
      activeNodeStart = start;
      activeNodeEnd = end;
    }
  });

  // 为所有非活跃的顶层节点添加 blur 装饰
  doc.forEach((node, offset) => {
    const start = offset;
    const end = offset + node.nodeSize;
    if (start !== activeNodeStart || end !== activeNodeEnd) {
      decorations.push(
        Decoration.node(start, end, {
          class: 'lanismd-focus-blur',
        }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const focusModePlugin = $prose(() => {
  return new Plugin({
    key: focusModePluginKey,
    state: {
      init(_, state) {
        const { focusMode } = useEditorStore.getState();
        if (!focusMode) return DecorationSet.empty;
        const pos = state.selection.from;
        return buildFocusDecorations(state.doc, pos);
      },
      apply(tr, _oldDecos, _oldState, newState) {
        const { focusMode } = useEditorStore.getState();

        // focusMode 关闭时清除所有装饰
        if (!focusMode) return DecorationSet.empty;

        // 选区、文档变化或外部手动触发时重新计算
        const meta = tr.getMeta(focusModePluginKey);
        const toggleMeta = tr.getMeta('focusModeToggle');
        if (tr.selectionSet || tr.docChanged || meta?.trigger || toggleMeta) {
          const pos = newState.selection.from;
          return buildFocusDecorations(newState.doc, pos);
        }

        return _oldDecos;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
});

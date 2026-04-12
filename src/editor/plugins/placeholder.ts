/**
 * Placeholder Plugin
 *
 * 当光标位于空段落时，显示灰色占位提示文字 "输入 / 启动命令"。
 * 通过 ProseMirror Decoration 动态添加 CSS 类，配合 ::before 伪元素实现。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';

const PLACEHOLDER_TEXT = '输入 / 启动命令';

const placeholderPluginKey = new PluginKey('PLACEHOLDER');

/**
 * 创建 placeholder 装饰集：在光标所在的空段落节点上添加装饰。
 */
function createPlaceholderDecorations(state: import('@milkdown/kit/prose/state').EditorState): DecorationSet {
  const { doc, selection } = state;

  // 仅在光标选区（非范围选区）时显示
  if (selection.from !== selection.to) {
    return DecorationSet.empty;
  }

  const { $from } = selection;
  const parent = $from.parent;

  // 仅对空的 paragraph 节点显示 placeholder
  if (parent.type.name !== 'paragraph' || parent.content.size !== 0) {
    return DecorationSet.empty;
  }

  // 获取该段落在文档中的起始位置
  const pos = $from.before();

  const decoration = Decoration.node(pos, pos + parent.nodeSize, {
    class: 'lanismd-placeholder',
    'data-placeholder': PLACEHOLDER_TEXT,
  });

  return DecorationSet.create(doc, [decoration]);
}

export const placeholderPlugin = $prose(() => {
  return new Plugin({
    key: placeholderPluginKey,
    state: {
      init(_, state) {
        return createPlaceholderDecorations(state);
      },
      apply(tr, _oldDecoSet, _oldState, newState) {
        if (tr.docChanged || tr.selectionSet) {
          return createPlaceholderDecorations(newState);
        }
        return createPlaceholderDecorations(newState);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
});

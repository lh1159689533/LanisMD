/**
 * TOC Block Plugin
 *
 * 为 Milkdown 编辑器添加 [TOC] 目录生成支持：
 * - 自定义 remark 插件识别 [TOC] 段落
 * - 自定义 ProseMirror Node schema（atom block 节点）
 * - NodeView 渲染只读目录列表，随标题实时更新
 * - 点击目录项跳转到对应标题
 * - Markdown 序列化输出 [TOC]
 *
 * 实现原理：
 * - 使用 $remark 注册自定义 remark 插件，将 [TOC] 段落转换为 toc_block 节点
 * - 使用 $nodeSchema 创建 toc_block 节点类型（atom block）
 * - 使用 $view 注册 NodeView
 * - 使用 $prose 注册更新插件，文档变化时通知所有 TOC NodeView 刷新
 */

import { $nodeSchema, $remark, $view, $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { Root, Paragraph, Text } from 'mdast';
import { TocNodeView, refreshAllTocViews } from './node-view';

// ---------------------------------------------------------------------------
// Remark 插件：识别 [TOC] 段落并转换为 toc_block 节点
// ---------------------------------------------------------------------------

/**
 * Remark 插件：
 * 1. 树转换：将内容为 [TOC] 的段落节点重写为 toc_block 节点
 * 2. 注册 toMarkdown handler 序列化 toc_block 节点为 [TOC]
 */
export const remarkTocPlugin = $remark('remarkToc', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any) {
    const data = this.data();

    // 注册 toMarkdown handler
    const toMarkdownExtensions = (data.toMarkdownExtensions ??
      (data.toMarkdownExtensions = [])) as Array<unknown>;
    toMarkdownExtensions.push({
      handlers: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toc_block(_node: any, _parent: any, state: any) {
          const result = '[TOC]';
          if (state && typeof state.join === 'function') {
            return result;
          }
          return result;
        },
      },
    });

    // 树转换：将 [TOC] 段落转换为 toc_block 节点
    return (tree: Root) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children = (tree as any).children;
      if (!children || !Array.isArray(children)) return;

      for (let i = 0; i < children.length; i++) {
        const node = children[i];
        if (node.type !== 'paragraph') continue;

        // 检查段落是否只包含一个文本子节点，且内容为 [TOC]
        const para = node as Paragraph;
        if (
          para.children.length === 1 &&
          para.children[0].type === 'text' &&
          (para.children[0] as Text).value.trim() === '[TOC]'
        ) {
          children[i] = { type: 'toc_block' };
        }
      }
    };
  };
});

// ---------------------------------------------------------------------------
// Node Schema
// ---------------------------------------------------------------------------

/**
 * TOC Block Node Schema
 *
 * - block 节点，atom: true（不可编辑内容）
 * - 不包含任何子内容
 * - 渲染由 NodeView 完全管理
 */
export const tocBlockSchema = $nodeSchema('toc_block', () => ({
  group: 'block',
  atom: true,
  marks: '',
  defining: true,
  isolating: true,
  selectable: true,
  draggable: false,
  parseDOM: [
    {
      tag: 'div[data-type="toc-block"]',
    },
  ],
  toDOM() {
    return ['div', { 'data-type': 'toc-block', class: 'lanismd-toc' }];
  },
  parseMarkdown: {
    match: (node) => node.type === 'toc_block',
    runner: (state, _node, nodeType) => {
      state.addNode(nodeType);
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'toc_block',
    runner: (state) => {
      state.addNode('toc_block');
    },
  },
}));

// ---------------------------------------------------------------------------
// NodeView
// ---------------------------------------------------------------------------

/**
 * 注册 toc_block 的 NodeView
 */
export const tocBlockView = $view(tocBlockSchema.node, () => {
  return (node, view, getPos) => {
    return new TocNodeView(node, view, getPos);
  };
});

// ---------------------------------------------------------------------------
// 文档变更同步插件：文档变化时刷新所有 TOC NodeView
// ---------------------------------------------------------------------------

const tocUpdateKey = new PluginKey('toc-update');

/**
 * TOC 更新插件
 *
 * 监听文档变化，当 heading 节点发生增删改时，
 * 直接通知所有 TOC NodeView 实例刷新渲染。
 *
 * 不通过 dispatch 触发更新，避免无限循环。
 */
export const tocUpdatePlugin = $prose(() => {
  return new Plugin({
    key: tocUpdateKey,

    view() {
      return {
        update(view, prevState) {
          // 只在文档发生变化时才更新
          if (view.state.doc.eq(prevState.doc)) return;

          // 直接通知所有 TOC NodeView 实例刷新
          refreshAllTocViews();
        },
      };
    },
  });
});

// ---------------------------------------------------------------------------
// Input Rule：输入 [TOC] 后回车自动转换
// ---------------------------------------------------------------------------

const TOC_INPUT_KEY = new PluginKey('toc-input-rule');

/**
 * TOC 输入规则插件
 *
 * 当用户在空行输入 [TOC] 并按下回车时，将该段落替换为 toc_block 节点
 */
export const tocInputRulePlugin = $prose(() => {
  return new Plugin({
    key: TOC_INPUT_KEY,

    props: {
      handleTextInput(view, from, to, text) {
        // 检测用户输入完成 [TOC] 后的最后一个字符
        if (text !== ']') return false;

        const { state } = view;
        const { $from } = state.selection;
        const parent = $from.parent;

        // 必须在段落内
        if (parent.type.name !== 'paragraph') return false;

        // 获取段落当前文本 + 即将输入的字符
        const currentText = parent.textBetween(0, $from.parentOffset, undefined, '\ufffc') + text;

        // 检查是否为 [TOC]（不区分大小写，忽略前后空格）
        if (currentText.trim().toUpperCase() !== '[TOC]') return false;

        // 替换整个段落为 toc_block
        const tocType = state.schema.nodes.toc_block;
        if (!tocType) return false;

        const parentPos = $from.before();
        const parentEnd = $from.after();

        const tr = state.tr.replaceWith(parentPos, parentEnd, tocType.create());
        // 在 toc_block 后插入一个空段落供继续编辑
        const paragraphType = state.schema.nodes.paragraph;
        if (paragraphType) {
          const insertPos = tr.mapping.map(parentEnd);
          // 检查后面是否已有内容，如果没有则插入空段落
          const $pos = tr.doc.resolve(insertPos);
          if ($pos.parent.type.name === 'doc' && $pos.nodeAfter == null) {
            tr.insert(insertPos, paragraphType.create());
          }
        }
        view.dispatch(tr.scrollIntoView());

        return true;
      },
    },
  });
});

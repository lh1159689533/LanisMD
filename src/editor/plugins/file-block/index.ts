/**
 * file-block 插件入口
 *
 * 注册 file_block 节点 schema、remark 解析/序列化插件、NodeView。
 * 实现 [file:文件名](路径) 的 Markdown 序列化。
 */

import { $nodeSchema, $remark, $view } from '@milkdown/kit/utils';
import type { Root } from 'mdast';
import { FileBlockNodeView } from './node-view';

// ---------------------------------------------------------------------------
// Remark 插件：识别 [file:xxx](path) 链接并转换为 file_block 节点
// ---------------------------------------------------------------------------

/**
 * Remark 插件：
 * 1. 树转换：将内容以 "file:" 开头的 link 节点重写为 file_block mdast 节点
 * 2. 注册 toMarkdown handler 序列化 file_block 为 [file:name](src)
 */
export const fileBlockRemarkPlugin = $remark('remarkFileBlock', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any) {
    const data = this.data();

    // 注册 toMarkdown handler —— 将 file_block mdast 节点序列化为 [file:name](src)
    const toMarkdownExtensions = (data.toMarkdownExtensions ??
      (data.toMarkdownExtensions = [])) as Array<unknown>;
    toMarkdownExtensions.push({
      handlers: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        file_block(node: any) {
          const name = node.name || '';
          const src = node.url || '';
          return `[file:${name}](${src})`;
        },
      },
    });

    // 树转换：将 [file:xxx](path) 链接转换为 file_block 节点
    return (tree: Root) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children = (tree as any).children;
      if (!children || !Array.isArray(children)) return;

      for (let i = 0; i < children.length; i++) {
        const node = children[i];

        // 检查段落中是否有独立的 file 链接
        if (node.type === 'paragraph' && node.children?.length === 1) {
          const child = node.children[0];
          if (
            child.type === 'link' &&
            child.children?.length === 1 &&
            child.children[0].type === 'text' &&
            child.children[0].value.startsWith('file:')
          ) {
            const name = child.children[0].value.slice(5); // 去掉 "file:" 前缀
            children[i] = {
              type: 'file_block',
              url: child.url,
              name,
            };
          }
        }
      }
    };
  };
});

// ---------------------------------------------------------------------------
// Node Schema
// ---------------------------------------------------------------------------

/**
 * file_block 节点 Schema
 *
 * - block 节点，atom: true（不可内部编辑）
 * - 属性：src（文件路径）、name（文件名）、size（格式化大小）
 * - Markdown 序列化为 [file:name](src)
 */
export const fileBlockSchema = $nodeSchema('file_block', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    src: { default: '' },
    name: { default: '' },
    size: { default: '' },
  },
  parseDOM: [
    {
      tag: 'div[data-type="file-block"]',
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          src: el.getAttribute('data-src') || '',
          name: el.getAttribute('data-name') || '',
          size: el.getAttribute('data-size') || '',
        };
      },
    },
  ],
  toDOM: (node) => [
    'div',
    {
      'data-type': 'file-block',
      'data-src': node.attrs.src,
      'data-name': node.attrs.name,
      'data-size': node.attrs.size,
    },
  ],
  parseMarkdown: {
    match: (node) => node.type === 'file_block',
    runner: (state, node, nodeType) => {
      state.addNode(nodeType, {
        src: node.url as string || '',
        name: node.name as string || '',
        size: '',
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'file_block',
    runner: (state, node) => {
      state.addNode('file_block', undefined, undefined, {
        url: node.attrs.src,
        name: node.attrs.name,
      });
    },
  },
}));

// ---------------------------------------------------------------------------
// NodeView
// ---------------------------------------------------------------------------

/**
 * 注册 file_block 的 NodeView
 */
export const fileBlockView = $view(fileBlockSchema.node, () => {
  return (node, view, getPos) => {
    return new FileBlockNodeView(node, view, getPos as () => number | undefined);
  };
});

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export { insertFileBlock } from './insert-command';

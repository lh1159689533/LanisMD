/**
 * Underline Mark Plugin
 *
 * Milkdown/ProseMirror 默认不提供下划线 mark。
 * 本扩展通过 $markSchema 工厂创建 underline mark，
 * 渲染为 <u> 标签，支持从 HTML 粘贴中解析。
 *
 * 在 Markdown 中使用 HTML 标签 <u>text</u> 来表示下划线。
 *
 * 序列化方案：
 * - 使用自定义 remark 插件注册 underline 节点类型
 * - toMarkdown 输出 <u>text</u> HTML 标签（与 Typora 兼容）
 * - parseMarkdown 从 HTML 节点中匹配 <u>/<\/u> 标签
 */

import { $markSchema, $remark } from '@milkdown/kit/utils';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

// ---------------------------------------------------------------------------
// 辅助函数：递归序列化 MDAST 子节点
// ---------------------------------------------------------------------------

/**
 * 递归序列化节点的子内容，支持嵌套的 mark 节点（如 highlight 嵌套在 underline 中）。
 * 优先使用 remark-stringify 的 state.handle() 来序列化已知节点类型，
 * 对纯文本节点直接取 value。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeChildren(node: any, state: any): string {
  if (!node.children || node.children.length === 0) return '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return node.children.map((child: any) => {
    if (child.type === 'text') return child.value ?? '';
    // 对于其他节点类型（如 highlight、underline），委托 state 处理
    if (state && typeof state.handle === 'function') {
      try {
        return state.handle(child, node);
      } catch {
        // 回退：递归提取纯文本
        return serializeChildren(child, state);
      }
    }
    return serializeChildren(child, state);
  }).join('');
}

// ---------------------------------------------------------------------------
// Remark 插件：处理 <u>text</u> 语法
// ---------------------------------------------------------------------------

/**
 * Remark 插件：
 * 1. fromMarkdown：遍历 html 节点，将 <u>...</u> 模式转换为 underline 包裹节点
 * 2. toMarkdown：注册 underline 节点的 stringify handler，输出 <u>text</u>
 */
export const remarkUnderlinePlugin = $remark('remarkUnderline', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any) {
    // 注册 toMarkdown 扩展，让 remark-stringify 知道如何序列化 underline 节点
    const data = this.data();
    const toMarkdownExtensions = (data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])) as Array<unknown>;
    toMarkdownExtensions.push({
      handlers: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        underline(node: any, _parent: any, state: any) {
          // 递归序列化子节点，支持嵌套的 mark 节点（如 highlight 等）
          const text = serializeChildren(node, state);
          return `<u>${text}</u>`;
        },
      },
    });

    // 返回 fromMarkdown 的树转换器
    // 将相邻的 <u> html 节点 + 文本 + </u> html 节点合并为 underline 节点
    return (tree: Root) => {
      visit(tree, 'html', (node, index, parent) => {
        if (typeof index !== 'number' || !parent) return;
        const value = (node as unknown as { value: string }).value;
        if (!/^<u>/i.test(value)) return;

        // 查找匹配的 </u> 闭合标签
        const children = parent.children;
        let closeIndex = -1;
        for (let i = index + 1; i < children.length; i++) {
          const child = children[i] as { type: string; value?: string };
          if (child.type === 'html' && child.value && /^<\/u>/i.test(child.value)) {
            closeIndex = i;
            break;
          }
        }

        if (closeIndex === -1) return;

        // 收集 <u> 和 </u> 之间的文本节点
        const innerNodes = children.slice(index + 1, closeIndex);
        const textContent = innerNodes
          .map((n) => (n as { value?: string }).value ?? '')
          .join('');

        // 用 underline 节点替换 <u>...文本...</u> 序列
        const underlineNode = {
          type: 'underline',
          children: [{ type: 'text', value: textContent }],
        };

        parent.children.splice(index, closeIndex - index + 1, underlineNode as typeof parent.children[0]);
      });
    };
  };
});

// ---------------------------------------------------------------------------
// Mark Schema
// ---------------------------------------------------------------------------

export const underlineMarkSchema = $markSchema('underline', () => ({
  attrs: {},
  parseDOM: [
    { tag: 'u' },
    {
      style: 'text-decoration',
      getAttrs: (value: string) => (value === 'underline' ? {} : false),
    },
  ],
  toDOM() {
    return ['u', 0];
  },
  parseMarkdown: {
    match: (node) => node.type === 'underline',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'underline',
    runner: (state, mark) => {
      // 使用 'underline' 节点类型，由 remark 插件中注册的 toMarkdownExtension handler 输出 <u>text</u>
      state.withMark(mark, 'underline');
    },
  },
}));

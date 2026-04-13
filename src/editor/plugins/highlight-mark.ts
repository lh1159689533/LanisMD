/**
 * Highlight Mark Plugin
 *
 * 支持 ==highlighted text== 高亮标记语法：
 * - 自定义 remark 插件解析 ==text== 语法
 * - ProseMirror mark schema 渲染为 <mark> 标签
 * - InputRule 实现输入 ==text== 时自动应用高亮
 * - Markdown 序列化输出 ==text== 语法
 *
 * 与 underline-mark 不同，高亮使用原生 ==text== 语法而非 HTML 标签。
 */

import { $markSchema, $remark, $prose } from '@milkdown/kit/utils';
import { InputRule, inputRules } from '@milkdown/kit/prose/inputrules';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

// ---------------------------------------------------------------------------
// 辅助函数：递归序列化 MDAST 子节点
// ---------------------------------------------------------------------------

/**
 * 递归序列化节点的子内容，支持嵌套的 mark 节点（如 underline 嵌套在 highlight 中）。
 * 优先使用 remark-stringify 的 state.handle() 来序列化已知节点类型，
 * 对纯文本节点直接取 value。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeChildren(node: any, state: any): string {
  if (!node.children || node.children.length === 0) return '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return node.children.map((child: any) => {
    if (child.type === 'text') return child.value ?? '';
    // 对于其他节点类型（如 underline、highlight），委托 state 处理
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
// Remark 插件：解析 ==text== 语法
// ---------------------------------------------------------------------------

/**
 * 自定义 MDAST 节点类型，表示高亮标记
 */
interface HighlightNode {
  type: 'highlight';
  children: Array<{ type: 'text'; value: string }>;
}

/**
 * Remark 插件：将 ==text== 语法解析为 highlight 节点
 *
 * 同时负责：
 * 1. fromMarkdown：遍历文本节点，查找 ==...== 模式并转换为 highlight 包裹节点
 * 2. toMarkdown：注册 highlight 节点的 stringify handler，输出 ==text== 语法
 *
 * 处理同一文本中多个高亮标记的情况。
 */
export const remarkHighlightPlugin = $remark('remarkHighlight', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any) {
    // 注册 toMarkdown 扩展，让 remark-stringify 知道如何序列化 highlight 节点
    const data = this.data();
    const toMarkdownExtensions = (data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])) as Array<unknown>;
    toMarkdownExtensions.push({
      handlers: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        highlight(node: any, _parent: any, state: any) {
          // 递归序列化子节点，支持嵌套的 mark 节点（如 underline 等）
          const text = serializeChildren(node, state);
          return `==${text}==`;
        },
      },
    });

    // 返回 fromMarkdown 的树转换器
    return (tree: Root) => {
      visit(tree, 'text', (node, index, parent) => {
        if (typeof index !== 'number' || !parent) return;
        const value = node.value as string;
        if (!value.includes('==')) return;

        // 匹配 ==text== 模式（非贪婪，不允许空内容）
        const regex = /==((?:[^=]|=[^=])+?)==/g;
        let match: RegExpExecArray | null;
        const newNodes: Array<{ type: string; value?: string; children?: Array<{ type: string; value: string }> }> = [];
        let lastIndex = 0;

        while ((match = regex.exec(value)) !== null) {
          // 匹配前的普通文本
          if (match.index > lastIndex) {
            newNodes.push({
              type: 'text',
              value: value.slice(lastIndex, match.index),
            });
          }

          // 高亮节点
          newNodes.push({
            type: 'highlight',
            children: [{ type: 'text', value: match[1] }],
          } as HighlightNode);

          lastIndex = match.index + match[0].length;
        }

        // 没有匹配到任何高亮语法
        if (newNodes.length === 0) return;

        // 匹配后的剩余文本
        if (lastIndex < value.length) {
          newNodes.push({
            type: 'text',
            value: value.slice(lastIndex),
          });
        }

        // 用新节点替换原始文本节点
        (parent.children as typeof newNodes).splice(index, 1, ...newNodes);
      });
    };
  };
});

// ---------------------------------------------------------------------------
// Mark Schema
// ---------------------------------------------------------------------------

/**
 * 高亮 mark schema
 *
 * - 渲染为 <mark> 标签
 * - 从 Markdown 解析 highlight 节点
 * - 序列化为 ==text== 语法
 * - 支持从 HTML 粘贴中解析 <mark> 标签
 */
export const highlightMarkSchema = $markSchema('highlight', () => ({
  attrs: {},
  parseDOM: [
    { tag: 'mark' },
    {
      style: 'background-color',
      getAttrs: (value: string) => {
        // 接受任何带背景色的高亮样式
        if (value && value !== 'transparent' && value !== 'inherit') return {};
        return false;
      },
    },
  ],
  toDOM() {
    return ['mark', 0];
  },
  parseMarkdown: {
    match: (node) => node.type === 'highlight',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'highlight',
    runner: (state, mark) => {
      // 使用 'highlight' 节点类型，由 remark 插件中注册的 toMarkdownExtension handler 输出 ==text==
      state.withMark(mark, 'highlight');
    },
  },
}));

// ---------------------------------------------------------------------------
// InputRule：输入 ==text== 自动应用高亮
// ---------------------------------------------------------------------------

/**
 * 匹配 ==text== 输入模式
 * 当用户输入 ==sometext== 后（以最后一个 = 触发），自动将内容转换为高亮 mark
 */
export const highlightInputRulePlugin = $prose(() => {
  // 匹配：非起始的 ==，中间至少一个非等号字符，然后 ==
  const rule = new InputRule(
    /(?:^|[^=])==((?:[^=]|=[^=])+)==$/,
    (state, match, start, end) => {
      const schema = state.schema;
      const highlightType = schema.marks.highlight;
      if (!highlightType) return null;

      // match[1] 是高亮文本内容
      const text = match[1];
      if (!text) return null;

      // 计算实际的高亮文本起始位置
      // match[0] 可能以一个非 = 字符开头（如空格）
      const fullMatch = match[0];
      const prefixLen = fullMatch.length - text.length - 4; // 4 = 前后各两个 =
      const markStart = start + prefixLen;

      const tr = state.tr;
      // 删除 == 标记并应用 mark
      tr.delete(end - 2, end); // 删除尾部 ==
      tr.delete(markStart, markStart + 2); // 删除头部 ==
      // 应用高亮 mark（位置需要考虑删除后的偏移）
      const markEnd = end - 4; // 减去 4 个 = 字符
      tr.addMark(markStart, markEnd, highlightType.create());

      return tr;
    },
  );

  return inputRules({ rules: [rule] });
});

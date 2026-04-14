/**
 * Math Inline Plugin
 *
 * 为 Milkdown 编辑器添加内联数学公式支持：
 * - 自定义 remark 插件解析 $...$ 语法
 * - 自定义 ProseMirror Node schema（atom: true，公式内容存在 attrs.value 中）
 * - InputRule 实现输入 $ 自动创建空节点进入编辑态
 * - InputRule 保留 $text$ 完整匹配兼容快速输入
 * - NodeView 实现 Typora 风格的编辑/预览切换
 * - Markdown 序列化输出 $formula$ 语法
 *
 * 架构说明：
 * - atom: true 确保 selectNode/deselectNode 被正确调用
 * - 无 contentDOM，NodeView 用 <input> 元素自己管理编辑区
 * - 通过 setNodeMarkup 更新 attrs.value 同步到 ProseMirror 文档
 */

import { $nodeSchema, $remark, $prose, $view } from '@milkdown/kit/utils';
import { InputRule, inputRules } from '@milkdown/kit/prose/inputrules';
import { NodeSelection } from '@milkdown/kit/prose/state';
import { keymap } from '@milkdown/kit/prose/keymap';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { MathInlineNodeView } from './node-view';
import { createMathInlineSelectionPlugin } from './selection-plugin';
import { mathInlineBackspaceCmd } from './backspace-cmd';

// ---------------------------------------------------------------------------
// Remark 插件：解析 $...$ 语法
// ---------------------------------------------------------------------------

/**
 * Remark 插件：将 $formula$ 语法解析为 math_inline 节点
 *
 * 1. fromMarkdown：遍历文本节点，查找 $...$ 模式并转换
 * 2. toMarkdown：注册 math_inline 节点的 stringify handler
 */
export const remarkMathInlinePlugin = $remark('remarkMathInline', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any) {
    // 注册 toMarkdown 扩展
    const data = this.data();
    const toMarkdownExtensions = (data.toMarkdownExtensions ??
      (data.toMarkdownExtensions = [])) as Array<unknown>;
    toMarkdownExtensions.push({
      handlers: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        math_inline(node: any) {
          // 提取子节点的文本内容
          const value =
            node.children
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ?.map((c: any) => c.value ?? '')
              .join('') ??
            node.value ??
            '';
          return `$${value}$`;
        },
      },
    });

    // fromMarkdown：解析 $...$ 为 math_inline 节点
    return (tree: Root) => {
      visit(tree, 'text', (node, index, parent) => {
        if (typeof index !== 'number' || !parent) return;
        const value = node.value as string;
        if (!value.includes('$')) return;

        // 匹配 $...$ 模式（非贪婪，不匹配 $$...$$）
        const regex = /(?<![\\$])\$(?!\$)(.+?)(?<![\\$\s])\$(?!\$)/g;
        let match: RegExpExecArray | null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newNodes: Array<any> = [];
        let lastIndex = 0;

        while ((match = regex.exec(value)) !== null) {
          const formulaText = match[1];
          if (!formulaText || !formulaText.trim()) continue;

          // 匹配前的普通文本
          if (match.index > lastIndex) {
            newNodes.push({
              type: 'text',
              value: value.slice(lastIndex, match.index),
            });
          }

          // math_inline 节点
          newNodes.push({
            type: 'math_inline',
            children: [{ type: 'text', value: formulaText }],
          });

          lastIndex = match.index + match[0].length;
        }

        // 没有匹配到
        if (newNodes.length === 0) return;

        // 匹配后的剩余文本
        if (lastIndex < value.length) {
          newNodes.push({
            type: 'text',
            value: value.slice(lastIndex),
          });
        }

        // 替换节点
        parent.children.splice(index, 1, ...newNodes);
      });
    };
  };
});

// ---------------------------------------------------------------------------
// Node Schema
// ---------------------------------------------------------------------------

/**
 * 内联数学公式 Node Schema
 *
 * - inline 节点，atom: true（触发 selectNode/deselectNode）
 * - 公式内容存在 attrs.value 中，无 content/contentDOM
 * - 渲染为 <span class="math-inline">
 * - 解析和序列化 $formula$ 语法
 */
export const mathInlineSchema = $nodeSchema('math_inline', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    value: { default: '' },
  },
  parseDOM: [
    {
      tag: 'span.math-inline',
      getAttrs(dom) {
        if (dom instanceof HTMLElement) {
          return { value: dom.getAttribute('data-value') || dom.textContent || '' };
        }
        return {};
      },
    },
  ],
  toDOM(node) {
    return ['span', { class: 'math-inline', 'data-value': node.attrs.value }, 0];
  },
  parseMarkdown: {
    match: (node) => node.type === 'math_inline',
    runner: (state, node, nodeType) => {
      // atom: true 架构：直接创建带 attrs 的节点
      const value =
        node.children
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ?.map((c: any) => c.value ?? '')
          .join('') ?? '';
      state.addNode(nodeType, { value });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => {
      // atom: true 架构：从 attrs.value 取值
      state.addNode('math_inline', undefined, undefined, {
        children: [{ type: 'text', value: node.attrs.value }],
      });
    },
  },
}));

// ---------------------------------------------------------------------------
// NodeView
// ---------------------------------------------------------------------------

/**
 * 注册 math_inline 的 NodeView
 */
export const mathInlineView = $view(mathInlineSchema.node, () => {
  return (node, view, getPos) => {
    return new MathInlineNodeView(node, view, getPos);
  };
});

// ---------------------------------------------------------------------------
// InputRule
// ---------------------------------------------------------------------------

/**
 * 输入规则：
 * 1. 输入 $ 自动创建空 math_inline 节点并进入编辑态
 * 2. 保留 $text$ 完整匹配兼容粘贴和快速输入
 */
export const mathInlineInputRulePlugin = $prose(() => {
  // 规则 1: 输入 $text$ 完整匹配（优先级高于单 $ 规则）
  const fullRule = new InputRule(
    /(?:^|[^$\\])\$([^$\s][^$]*[^$\s])\$$/,
    (state, match, start, end) => {
      const schema = state.schema;
      const mathInlineType = schema.nodes.math_inline;
      if (!mathInlineType) return null;

      const formulaText = match[1];
      if (!formulaText || !formulaText.trim()) return null;

      // 计算实际匹配位置
      const fullMatch = match[0];
      const prefixLen = fullMatch.length - formulaText.length - 2;
      const nodeStart = start + prefixLen;

      // 创建带值的 math_inline 节点
      const mathNode = mathInlineType.create({ value: formulaText });
      return state.tr.replaceWith(nodeStart, end, mathNode);
    },
  );

  // 规则 2: 输入 $ 自动创建空 math_inline 节点
  const dollarRule = new InputRule(/\$$/, (state, _match, start, end) => {
    const schema = state.schema;
    const mathInlineType = schema.nodes.math_inline;
    if (!mathInlineType) return null;

    // 排除 $$（块级公式）的触发：检查前一个字符是否也是 $
    const before = state.doc.textBetween(Math.max(0, start - 1), start, '\0');
    if (before === '$') return null;

    // 创建空的 math_inline 节点
    const mathNode = mathInlineType.create({ value: '' });
    const tr = state.tr.replaceWith(start, end, mathNode);

    // 将光标定位到新节点上（触发 selectNode -> 进入编辑态）
    tr.setSelection(NodeSelection.create(tr.doc, start));

    return tr;
  });

  // fullRule 在前（$text$ 优先匹配），dollarRule 在后（单 $ 触发）
  return inputRules({ rules: [fullRule, dollarRule] });
});

// ---------------------------------------------------------------------------
// Selection 监听 Plugin
// ---------------------------------------------------------------------------

/**
 * Selection 监听插件：
 * 作为 deselectNode 的兜底机制，确保光标离开 math_inline 时退出编辑
 */
export const mathInlineSelectionPlugin = $prose(() => {
  return createMathInlineSelectionPlugin();
});

// ---------------------------------------------------------------------------
// Backspace Keymap Plugin
// ---------------------------------------------------------------------------

/**
 * Backspace keymap 插件：
 * 光标在 math_inline 右边界时按 Backspace 进入编辑而不是删除节点
 * 需要在默认 Backspace 之前注册（优先级更高）
 */
export const mathInlineKeymapPlugin = $prose(() => {
  return keymap({
    Backspace: mathInlineBackspaceCmd,
  });
});

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export { remarkMathInlinePlugin as remarkMathInline };
export { mathInlineBackspaceCmd } from './backspace-cmd';

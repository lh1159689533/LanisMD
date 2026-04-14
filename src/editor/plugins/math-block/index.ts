/**
 * Math Block Plugin
 *
 * 为 Milkdown 编辑器添加块级数学公式支持：
 * - 自定义 remark 插件解析 $$...$$ 语法
 * - 自定义 ProseMirror Node schema（block 级别，content: "text*"）
 * - NodeView 实现编辑/预览切换（参考 Mermaid Block 交互）
 * - InputRule 实现输入 $$ 后按回车创建数学块
 * - Markdown 序列化输出 $$...$$ 语法
 *
 * 实现原理：
 * - 使用 $nodeSchema 创建 math_block 节点类型（block，content: "text*"）
 * - 使用 $remark 注册自定义 remark 插件处理 $$...$$ 语法
 * - 使用 $view 注册 NodeView
 * - 使用 $prose 注册 InputRule
 */

import { $nodeSchema, $remark, $prose, $view } from '@milkdown/kit/utils';
import { InputRule, inputRules } from '@milkdown/kit/prose/inputrules';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { MathBlockNodeView } from './node-view';

// ---------------------------------------------------------------------------
// Remark 插件：解析 $$...$$ 语法
// ---------------------------------------------------------------------------

/**
 * Remark 插件：将 $$...$$ 语法解析为 math_block 节点
 */
export const remarkMathBlockPlugin = $remark('remarkMathBlock', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any) {
    // 注册 toMarkdown 扩展
    const data = this.data();
    const toMarkdownExtensions = (data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])) as Array<unknown>;
    toMarkdownExtensions.push({
      handlers: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        math_block(node: any) {
          const value = node.children
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ?.map((c: any) => c.value ?? '')
            .join('') ?? node.value ?? '';
          return `$$\n${value}\n$$`;
        },
      },
    });

    // fromMarkdown：解析 $$...$$ 块
    // 块级公式在 markdown 中表现为独立的段落，包含 $$ 起始和 $$ 结束
    return (tree: Root) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children = (tree as any).children;
      if (!children || !Array.isArray(children)) return;

      // 策略：遍历顶层节点，查找 paragraph 中包含 $$...$$ 的模式
      for (let i = children.length - 1; i >= 0; i--) {
        const node = children[i];

        // 情况 1：code 节点（有些 markdown parser 会将 $$...$$ 作为代码块处理）
        if (node.type === 'code' && node.lang === 'math') {
          children[i] = {
            type: 'math_block',
            children: [{ type: 'text', value: node.value ?? '' }],
          };
          continue;
        }

        // 情况 2：paragraph 中包含 $$...$$ 文本
        if (node.type === 'paragraph') {
          const textContent = extractTextContent(node);
          // 匹配完整的 $$...$$ 块
          const blockMatch = textContent.match(/^\$\$([\s\S]*?)\$\$$/);
          if (blockMatch) {
            const formula = blockMatch[1].trim();
            children[i] = {
              type: 'math_block',
              children: [{ type: 'text', value: formula }],
            };
            continue;
          }
        }

        // 情况 3：HTML 节点或自定义块
        if (node.type === 'html') {
          const value = node.value as string;
          const blockMatch = value.match(/^\$\$([\s\S]*?)\$\$$/);
          if (blockMatch) {
            const formula = blockMatch[1].trim();
            children[i] = {
              type: 'math_block',
              children: [{ type: 'text', value: formula }],
            };
          }
        }
      }

      // 同时处理跨节点的情况：$$ 在一个段落，内容在下一个，$$ 在第三个
      // 这种情况更复杂，先搜索连续的 $$ 标记
      handleMultiNodeMathBlock(children);
    };
  };
});

/**
 * 提取节点的纯文本内容
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextContent(node: any): string {
  if (node.type === 'text') return node.value ?? '';
  if (node.children && Array.isArray(node.children)) {
    return node.children.map(extractTextContent).join('');
  }
  return node.value ?? '';
}

/**
 * 处理跨多个节点的 $$...$$ 块
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleMultiNodeMathBlock(children: any[]): void {
  for (let i = 0; i < children.length - 2; i++) {
    const first = children[i];
    if (first.type !== 'paragraph') continue;

    const firstText = extractTextContent(first).trim();
    if (firstText !== '$$') continue;

    // 查找闭合的 $$
    for (let j = i + 1; j < children.length; j++) {
      const last = children[j];
      if (last.type !== 'paragraph') continue;

      const lastText = extractTextContent(last).trim();
      if (lastText !== '$$') continue;

      // 收集中间内容
      const middleNodes = children.slice(i + 1, j);
      const formula = middleNodes.map(extractTextContent).join('\n').trim();

      // 替换为 math_block
      const mathBlockNode = {
        type: 'math_block',
        children: [{ type: 'text', value: formula }],
      };

      children.splice(i, j - i + 1, mathBlockNode);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Node Schema
// ---------------------------------------------------------------------------

/**
 * 块级数学公式 Node Schema
 */
export const mathBlockSchema = $nodeSchema('math_block', () => ({
  group: 'block',
  content: 'text*',
  marks: '',
  defining: true,
  atom: false,
  code: true,
  isolating: true,
  parseDOM: [
    {
      tag: 'div.math-block',
      preserveWhitespace: 'full' as const,
    },
  ],
  toDOM() {
    return ['div', { class: 'math-block' }, ['pre', 0]];
  },
  parseMarkdown: {
    match: (node) => node.type === 'math_block',
    runner: (state, node, nodeType) => {
      const textContent = node.children
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?.map((c: any) => c.value ?? '')
        .join('') ?? '';
      state.openNode(nodeType);
      if (textContent) {
        state.addText(textContent);
      }
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math_block', undefined, undefined, {
        children: [{ type: 'text', value: node.textContent }],
      });
    },
  },
}));

// ---------------------------------------------------------------------------
// NodeView
// ---------------------------------------------------------------------------

/**
 * 注册 math_block 的 NodeView
 */
export const mathBlockView = $view(mathBlockSchema.node, () => {
  return (node, view, getPos) => {
    return new MathBlockNodeView(node, view, getPos);
  };
});

// ---------------------------------------------------------------------------
// InputRule
// ---------------------------------------------------------------------------

/**
 * 输入 $$ 后按空格或换行创建数学块
 * 在行首输入 $$ 自动创建
 */
export const mathBlockInputRulePlugin = $prose(() => {
  const rule = new InputRule(
    /^\$\$\s$/,
    (state, _match, start, end) => {
      const schema = state.schema;
      const mathBlockType = schema.nodes.math_block;
      if (!mathBlockType) return null;

      // 创建空的 math_block 节点
      const mathNode = mathBlockType.create();
      const tr = state.tr.replaceWith(start, end, mathNode);

      // 将光标移到新建节点内部
      const resolvedPos = tr.doc.resolve(start + 1);
      tr.setSelection(TextSelection.near(resolvedPos));

      return tr;
    },
  );

  return inputRules({ rules: [rule] });
});

// ---------------------------------------------------------------------------
// 别名导出
// ---------------------------------------------------------------------------

export { remarkMathBlockPlugin as remarkMathBlock };

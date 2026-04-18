/**
 * Superscript Mark Plugin
 *
 * 支持 ^text^ 上标语法（Pandoc 风格）：
 * - 自定义 remark 插件解析 ^text^ 语法
 * - ProseMirror mark schema 渲染为 <sup> 标签
 * - InputRule 实现输入 ^text^ 时自动应用上标
 * - Markdown 序列化输出 ^text^ 语法
 */

import { $markSchema, $remark, $prose } from '@milkdown/kit/utils';
import { InputRule, inputRules } from '@milkdown/kit/prose/inputrules';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

// ---------------------------------------------------------------------------
// 辅助函数：递归序列化 MDAST 子节点
// ---------------------------------------------------------------------------

/**
 * 递归序列化节点的子内容，支持嵌套的 mark 节点。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeChildren(node: any, state: any): string {
  if (!node.children || node.children.length === 0) return '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return node.children.map((child: any) => {
    if (child.type === 'text') return child.value ?? '';
    if (state && typeof state.handle === 'function') {
      try {
        return state.handle(child, node);
      } catch {
        return serializeChildren(child, state);
      }
    }
    return serializeChildren(child, state);
  }).join('');
}

// ---------------------------------------------------------------------------
// Remark 插件：解析 ^text^ 语法
// ---------------------------------------------------------------------------

/**
 * 自定义 MDAST 节点类型，表示上标
 */
interface SuperscriptNode {
  type: 'superscript';
  children: Array<{ type: 'text'; value: string }>;
}

/**
 * Remark 插件：将 ^text^ 语法解析为 superscript 节点
 *
 * 同时负责：
 * 1. fromMarkdown：遍历文本节点，查找 ^...^ 模式并转换为 superscript 包裹节点
 * 2. toMarkdown：注册 superscript 节点的 stringify handler，输出 ^text^ 语法
 *
 * 注意：需要排除 ^^ 连续两个插入符的情况，避免误匹配空内容。
 */
export const remarkSuperscriptPlugin = $remark('remarkSuperscript', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any) {
    // 注册 toMarkdown 扩展
    const data = this.data();
    const toMarkdownExtensions = (data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])) as Array<unknown>;
    toMarkdownExtensions.push({
      handlers: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        superscript(node: any, _parent: any, state: any) {
          const text = serializeChildren(node, state);
          return `^${text}^`;
        },
      },
    });

    // fromMarkdown 树转换器
    return (tree: Root) => {
      visit(tree, 'text', (node, index, parent) => {
        if (typeof index !== 'number' || !parent) return;
        const value = node.value as string;
        if (!value.includes('^')) return;

        // 匹配 ^text^ 模式
        // 不允许空内容，不允许内含 ^ 字符，不允许以空格开头或结尾
        const regex = /\^([^\s^][^^]*?[^\s^]|[^\s^])\^/g;
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

          // 上标节点
          newNodes.push({
            type: 'superscript',
            children: [{ type: 'text', value: match[1] }],
          } as SuperscriptNode);

          lastIndex = match.index + match[0].length;
        }

        // 没有匹配到任何上标语法
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
 * 上标 mark schema
 *
 * - 渲染为 <sup> 标签
 * - 从 Markdown 解析 superscript 节点
 * - 序列化为 ^text^ 语法
 * - 支持从 HTML 粘贴中解析 <sup> 标签
 */
export const superscriptMarkSchema = $markSchema('superscript', () => ({
  attrs: {},
  parseDOM: [
    { tag: 'sup' },
    {
      style: 'vertical-align',
      getAttrs: (value: string) => (value === 'super' ? {} : false),
    },
  ],
  toDOM() {
    return ['sup', 0];
  },
  parseMarkdown: {
    match: (node) => node.type === 'superscript',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'superscript',
    runner: (state, mark) => {
      state.withMark(mark, 'superscript');
    },
  },
}));

// ---------------------------------------------------------------------------
// InputRule：输入 ^text^ 自动应用上标
// ---------------------------------------------------------------------------

/**
 * 匹配 ^text^ 输入模式
 * 当用户输入 ^sometext^ 后（以最后一个 ^ 触发），自动将内容转换为上标 mark
 */
export const superscriptInputRulePlugin = $prose(() => {
  const rule = new InputRule(
    /(?:^|[^^])\^([^\s^][^^]*?[^\s^]|[^\s^])\^$/,
    (state, match, start, end) => {
      const schema = state.schema;
      const superscriptType = schema.marks.superscript;
      if (!superscriptType) return null;

      const text = match[1];
      if (!text) return null;

      // 计算实际的上标文本起始位置
      // InputRule 中 end 指向触发字符（尾部 ^）即将插入的位置，
      // 该字符尚未存在于文档中，返回 tr 后 InputRule 会阻止其插入。
      // 因此只需删除文档中已有的头部 ^，对中间文本应用 mark。
      const fullMatch = match[0];
      const prefixLen = fullMatch.length - text.length - 2; // 前缀字符数（非 ^ 的前置匹配）
      const openCaretPos = start + prefixLen; // 头部 ^ 在文档中的位置
      // end - 1 是文档中上标文本最后一个字符之后的位置（也是头部 ^ 后文本的结束）

      const tr = state.tr;
      // 仅删除头部 ^（尾部 ^ 不在文档中，无需删除）
      tr.delete(openCaretPos, openCaretPos + 1);
      // 删除头部 ^ 后，文本向前移动了 1 位
      // 上标文本范围：从 openCaretPos 到 openCaretPos + text.length
      const markFrom = openCaretPos;
      const markTo = openCaretPos + text.length;
      tr.addMark(markFrom, markTo, superscriptType.create());

      return tr;
    },
  );

  return inputRules({ rules: [rule] });
});

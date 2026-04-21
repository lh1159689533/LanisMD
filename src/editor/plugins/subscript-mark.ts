/**
 * Subscript Mark Plugin
 *
 * 支持 ~text~ 下标语法（Pandoc 风格）：
 * - 自定义 remark 插件解析 ~text~ 语法
 * - ProseMirror mark schema 渲染为 <sub> 标签
 * - InputRule 实现输入 ~text~ 时自动应用下标
 * - Markdown 序列化输出 ~text~ 语法
 *
 * 注意：需要正确区分单 ~ 下标和双 ~~ 删除线：
 * - ~text~ -> 下标
 * - ~~text~~ -> 删除线（由 GFM 预设处理）
 * 解析时优先匹配双 ~~，再匹配单 ~。
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
// Remark 插件：解析 ~text~ 语法（需要区分 ~~删除线~~）
// ---------------------------------------------------------------------------

/**
 * 自定义 MDAST 节点类型，表示下标
 */
interface SubscriptNode {
  type: 'subscript';
  children: Array<{ type: 'text'; value: string }>;
}

/**
 * Remark 插件：将 ~text~ 语法解析为 subscript 节点
 *
 * 关键：GFM 的 ~~text~~ 删除线由 micromark-extension-gfm-strikethrough 在
 * tokenize 阶段就已经处理为 delete 节点了，所以到我们的 remark 插件这里，
 * 删除线内容已经不在 text 节点中了。我们只需要在 text 节点中匹配单 ~。
 *
 * 但为了安全起见，正则仍然要排除 ~~ 的情况：
 * - 使用负向前瞻/后顾确保不匹配 ~~ 开头或结尾的模式
 */
export const remarkSubscriptPlugin = $remark('remarkSubscript', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any) {
    // 注册 toMarkdown 扩展
    const data = this.data();
    const toMarkdownExtensions = (data.toMarkdownExtensions ?? (data.toMarkdownExtensions = [])) as Array<unknown>;
    toMarkdownExtensions.push({
      handlers: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subscript(node: any, _parent: any, state: any) {
          const text = serializeChildren(node, state);
          return `~${text}~`;
        },
      },
    });

    // fromMarkdown 树转换器
    return (tree: Root) => {
      visit(tree, 'text', (node, index, parent) => {
        if (typeof index !== 'number' || !parent) return;
        const value = node.value as string;
        if (!value.includes('~')) return;

        // 匹配 ~text~ 模式，但排除 ~~ 的情况
        // 使用分步策略：先匹配所有 ~...~ 模式，然后过滤掉前后有 ~ 的情况
        const regex = /(?:^|[^~])~([^\s~][^~]*?[^\s~]|[^\s~])~(?=[^~]|$)/g;
        let match: RegExpExecArray | null;
        const newNodes: Array<{ type: string; value?: string; children?: Array<{ type: string; value: string }> }> = [];
        let lastIndex = 0;

        while ((match = regex.exec(value)) !== null) {
          // 计算实际匹配位置（match[0] 可能包含前导非 ~ 字符）
          const fullMatch = match[0];
          const innerText = match[1];
          // 前导字符的长度（如果 match[0] 比 ~text~ 长，说明有前导字符）
          const prefixLen = fullMatch.length - innerText.length - 2;
          const actualStart = match.index + prefixLen;

          // 匹配前的普通文本
          if (actualStart > lastIndex) {
            newNodes.push({
              type: 'text',
              value: value.slice(lastIndex, actualStart),
            });
          }

          // 下标节点
          newNodes.push({
            type: 'subscript',
            children: [{ type: 'text', value: innerText }],
          } as SubscriptNode);

          lastIndex = actualStart + innerText.length + 2; // +2 for surrounding ~
        }

        // 没有匹配到任何下标语法
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
 * 下标 mark schema
 *
 * - 渲染为 <sub> 标签
 * - 从 Markdown 解析 subscript 节点
 * - 序列化为 ~text~ 语法
 * - 支持从 HTML 粘贴中解析 <sub> 标签
 */
export const subscriptMarkSchema = $markSchema('subscript', () => ({
  attrs: {},
  // 关键：inclusive: false 使得光标位于 mark 末尾时，新输入的字符不会继承该 mark，
  // 从而允许用户在下标结束后直接输入正文（如 H~2~ 后继续输入 O 不会被套上 <sub>）。
  // 参考 ProseMirror 内置 link mark 的相同处理方式。
  inclusive: false,
  parseDOM: [
    { tag: 'sub' },
    {
      style: 'vertical-align',
      getAttrs: (value: string) => (value === 'sub' ? {} : false),
    },
  ],
  toDOM() {
    return ['sub', 0];
  },
  parseMarkdown: {
    match: (node) => node.type === 'subscript',
    runner: (state, node, markType) => {
      state.openMark(markType);
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'subscript',
    runner: (state, mark) => {
      state.withMark(mark, 'subscript');
    },
  },
}));

// ---------------------------------------------------------------------------
// InputRule：输入 ~text~ 自动应用下标（排除 ~~ 删除线）
// ---------------------------------------------------------------------------

/**
 * 匹配 ~text~ 输入模式
 * 当用户输入 ~sometext~ 后（以最后一个 ~ 触发），自动将内容转换为下标 mark
 *
 * 关键：正则需要排除 ~~text~~ 删除线的模式
 * - 前面不能是 ~（排除 ~~text~ 的情况）
 * - 匹配内容中不能包含 ~（排除 ~text~~ 的情况）
 */
export const subscriptInputRulePlugin = $prose(() => {
  const rule = new InputRule(
    /(?:^|[^~])~([^\s~][^~]*?[^\s~]|[^\s~])~$/,
    (state, match, start, end) => {
      const schema = state.schema;
      const subscriptType = schema.marks.subscript;
      if (!subscriptType) return null;

      const text = match[1];
      if (!text) return null;

      // 计算实际的下标文本起始位置
      // InputRule 中 end 指向触发字符（尾部 ~）即将插入的位置，
      // 该字符尚未存在于文档中，返回 tr 后 InputRule 会阻止其插入。
      // 因此只需删除文档中已有的头部 ~，对中间文本应用 mark。
      const fullMatch = match[0];
      const prefixLen = fullMatch.length - text.length - 2; // 前缀字符数（非 ~ 的前置匹配）
      const openTildePos = start + prefixLen; // 头部 ~ 在文档中的位置

      const tr = state.tr;
      // 仅删除头部 ~（尾部 ~ 不在文档中，无需删除）
      tr.delete(openTildePos, openTildePos + 1);
      // 删除头部 ~ 后，文本向前移动了 1 位
      // 下标文本范围：从 openTildePos 到 openTildePos + text.length
      const markFrom = openTildePos;
      const markTo = openTildePos + text.length;
      tr.addMark(markFrom, markTo, subscriptType.create());

      return tr;
    },
  );

  return inputRules({ rules: [rule] });
});

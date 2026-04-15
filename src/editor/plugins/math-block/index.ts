/**
 * Math Block Plugin
 *
 * 为 Milkdown 编辑器添加块级数学公式支持：
 * - 自定义 remark 插件解析 $$...$$ 语法
 * - 自定义 ProseMirror Node schema（block 级别，content: "text*"）
 * - NodeView 实现编辑/预览切换（参考 Mermaid Block 交互）
 * - 块级公式通过 $$ + Enter 创建（由 math-inline/dollar-trigger 的 Enter keymap 触发）
 * - Markdown 序列化输出 $$...$$ 语法
 *
 * 实现原理：
 * - 使用 $nodeSchema 创建 math_block 节点类型（block，content: "text*"）
 * - 使用 $remark 注册自定义 remark 插件处理 $$...$$ 语法
 * - 使用 $view 注册 NodeView
 */

import { $nodeSchema, $remark, $view, $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { Root } from 'mdast';
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
          // 空公式序列化为 $$\n$$（不加多余空行），避免 remark 将其拆为两个独立段落
          if (!value) return `$$\n$$`;
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
  for (let i = 0; i < children.length - 1; i++) {
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
  attrs: {
    autoEdit: { default: false },
  },
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
// 保护插件：阻止 joinTextblocksAround 合并内容到 math_block
// ---------------------------------------------------------------------------

/**
 * 当删除与 math_block 相邻的节点（如 code_block/mermaid）时，ProseMirror
 * 的 ReplaceStep 会调用 joinTextblocksAround 尝试合并相邻 textblock。
 * 由于 math_block (content: "text*") 与 code_block (content: "text*")
 * 的内容模型兼容，joinTextblocksAround 会将被删除节点的文本合并到 math_block 中。
 *
 * 此插件通过 appendTransaction 检测并回滚这种非法合并：
 * 如果 math_block 的内容在用户未主动编辑的情况下突然从空变为非空，
 * 则清空 math_block 恢复原状。
 */
const mathBlockGuardKey = new PluginKey('math-block-guard');

export const mathBlockGuardPlugin = $prose(() => {
  return new Plugin({
    key: mathBlockGuardKey,

    appendTransaction(transactions, oldState, newState) {
      // 只处理有文档变更的事务
      const docChanged = transactions.some((tr) => tr.docChanged);
      if (!docChanged) return null;

      // 检查旧文档中的 math_block 节点，收集它们的位置和内容
      const oldMathBlocks = new Map<number, string>();
      oldState.doc.descendants((node, pos) => {
        if (node.type.name === 'math_block') {
          oldMathBlocks.set(pos, node.textContent);
        }
      });

      // 如果旧文档中没有 math_block，无需处理
      if (oldMathBlocks.size === 0) return null;

      // 检查旧 selection 是否在某个 math_block 内部（表示用户正在编辑它）
      const oldSelFrom = oldState.selection.from;
      let userEditingMathBlockPos: number | null = null;
      oldState.doc.descendants((node, pos) => {
        if (node.type.name === 'math_block') {
          const nodeEnd = pos + node.nodeSize;
          if (oldSelFrom > pos && oldSelFrom < nodeEnd) {
            userEditingMathBlockPos = pos;
          }
        }
      });

      // 遍历新文档中的 math_block，检查是否有非法内容注入
      let tr = newState.tr;
      let needsFix = false;

      newState.doc.descendants((node, pos) => {
        if (node.type.name !== 'math_block') return;
        if (node.textContent === '') return; // 内容为空，无需处理

        // 尝试通过 mapping 找到对应的旧 math_block
        // 遍历旧的 math_block 位置，查找映射后匹配当前 pos 的
        for (const [oldPos, oldText] of oldMathBlocks) {
          let mappedPos: number;
          try {
            mappedPos = transactions.reduce(
              (p, t) => t.mapping.map(p),
              oldPos,
            );
          } catch {
            continue;
          }

          if (mappedPos === pos && oldText === '' && node.textContent !== '') {
            // 旧的 math_block 是空的，现在却有了内容
            // 且用户不是在这个 math_block 内部编辑
            if (userEditingMathBlockPos !== oldPos) {
              // 非法合并！清空 math_block 的内容
              const contentStart = pos + 1; // math_block 内容起始位置
              const contentEnd = pos + node.nodeSize - 1; // math_block 内容结束位置
              if (contentStart < contentEnd) {
                tr = tr.delete(contentStart, contentEnd);
                needsFix = true;
              }
            }
          }
        }
      });

      return needsFix ? tr : null;
    },
  });
});

// ---------------------------------------------------------------------------
// 别名导出
// ---------------------------------------------------------------------------

export { remarkMathBlockPlugin as remarkMathBlock };

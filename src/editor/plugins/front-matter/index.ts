/**
 * Front Matter Plugin
 *
 * 为 Milkdown 编辑器添加 YAML Front Matter 支持：
 * - 自定义 remark 插件解析文档头部的 --- YAML --- 块
 * - 自定义 ProseMirror Node schema（block 级别，content: "text*"）
 * - NodeView 实现可折叠/展开的 YAML 代码块展示
 * - Markdown 序列化输出 ---\nYAML\n--- 语法
 *
 * 实现原理：
 * - 使用 $nodeSchema 创建 front_matter 节点类型（block，content: "text*"）
 * - 使用 $remark 注册自定义 remark 插件处理 YAML Front Matter
 * - 使用 $view 注册 NodeView
 * - 使用 $prose 注册保护插件，确保 front_matter 始终在文档第一个位置
 */

import { $nodeSchema, $remark, $view, $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { Root } from 'mdast';
import { frontmatter as micromarkFrontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { FrontMatterNodeView } from './node-view';

// ---------------------------------------------------------------------------
// Remark 插件：解析 YAML Front Matter 并转换为 front_matter 节点
// ---------------------------------------------------------------------------

/**
 * 合一的 Remark 插件，完成以下工作：
 * 1. 注册 micromark 扩展，使 parser 识别 --- yaml ---
 * 2. 注册 fromMarkdown 扩展，将 token 转为 yaml AST 节点
 * 3. 树转换：将 yaml 节点重写为 front_matter 节点
 * 4. 注册 toMarkdown handler 序列化 front_matter 节点
 *
 * 不使用 remark-frontmatter 的 toMarkdown 部分，避免 handler 冲突
 */
export const remarkFrontMatterPlugin = $remark('remarkFrontMatter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any) {
    const data = this.data();

    // 注册 micromark 扩展（解析层面）
    const micromarkExtensions = (data.micromarkExtensions ??
      (data.micromarkExtensions = [])) as Array<unknown>;
    micromarkExtensions.push(micromarkFrontmatter('yaml'));

    // 注册 fromMarkdown 扩展（AST 构建层面）
    const fromMarkdownExtensions = (data.fromMarkdownExtensions ??
      (data.fromMarkdownExtensions = [])) as Array<unknown>;
    fromMarkdownExtensions.push(frontmatterFromMarkdown('yaml'));

    // 注册 toMarkdown handler（序列化层面）
    // 只注册 front_matter 类型，不注册 yaml 类型，避免冲突
    const toMarkdownExtensions = (data.toMarkdownExtensions ??
      (data.toMarkdownExtensions = [])) as Array<unknown>;
    toMarkdownExtensions.push({
      handlers: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        front_matter(node: any, _parent: any, state: any) {
          const value =
            node.children
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ?.map((c: any) => c.value ?? '')
              .join('') ??
            node.value ??
            '';
          // 空的 front matter 不输出
          if (!value.trim()) return '';
          const result = `---\n${value}\n---`;
          // mdast-util-to-markdown 需要我们通过 state 来处理
          if (state && typeof state.join === 'function') {
            return result;
          }
          return result;
        },
      },
    });

    // 树转换：将 remark-frontmatter 生成的 yaml 节点重写为 front_matter 节点
    return (tree: Root) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children = (tree as any).children;
      if (!children || !Array.isArray(children) || children.length === 0) return;

      const firstNode = children[0];
      if (firstNode.type === 'yaml') {
        children[0] = {
          type: 'front_matter',
          children: [{ type: 'text', value: firstNode.value ?? '' }],
        };
      }
    };
  };
});

// ---------------------------------------------------------------------------
// Node Schema
// ---------------------------------------------------------------------------

/**
 * YAML Front Matter Node Schema
 *
 * - block 节点，content: "text*"
 * - 只允许出现在文档最开头
 * - code: true 保留空白
 * - isolating: true 防止内容合并
 */
export const frontMatterSchema = $nodeSchema('front_matter', () => ({
  group: 'block',
  content: 'text*',
  marks: '',
  defining: true,
  atom: false,
  code: true,
  isolating: true,
  attrs: {
    /** 当前折叠状态 */
    collapsed: { default: true },
  },
  parseDOM: [
    {
      tag: 'div.front-matter',
      preserveWhitespace: 'full' as const,
    },
  ],
  toDOM() {
    return ['div', { class: 'front-matter' }, ['pre', 0]];
  },
  parseMarkdown: {
    match: (node) => node.type === 'front_matter',
    runner: (state, node, nodeType) => {
      const textContent =
        node.children
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
    match: (node) => node.type.name === 'front_matter',
    runner: (state, node) => {
      state.addNode('front_matter', undefined, undefined, {
        children: [{ type: 'text', value: node.textContent }],
      });
    },
  },
}));

// ---------------------------------------------------------------------------
// NodeView
// ---------------------------------------------------------------------------

/**
 * 注册 front_matter 的 NodeView
 */
export const frontMatterView = $view(frontMatterSchema.node, () => {
  return (node, view, getPos) => {
    return new FrontMatterNodeView(node, view, getPos);
  };
});

// ---------------------------------------------------------------------------
// 保护插件：确保 front_matter 只在文档开头，且最多一个
// ---------------------------------------------------------------------------

const frontMatterGuardKey = new PluginKey('front-matter-guard');

/**
 * 保护插件：
 * 1. 确保 front_matter 节点始终在文档第一个位置
 * 2. 如果出现多个 front_matter，只保留第一个
 * 3. 防止 joinTextblocksAround 导致的非法内容合并
 */
export const frontMatterGuardPlugin = $prose(() => {
  return new Plugin({
    key: frontMatterGuardKey,

    appendTransaction(transactions, oldState, newState) {
      const docChanged = transactions.some((tr) => tr.docChanged);
      if (!docChanged) return null;

      let tr = newState.tr;
      let needsFix = false;

      // 收集所有 front_matter 节点的位置
      const frontMatterPositions: number[] = [];
      newState.doc.descendants((node, pos) => {
        if (node.type.name === 'front_matter') {
          frontMatterPositions.push(pos);
        }
      });

      // 如果没有 front_matter 节点，无需处理
      if (frontMatterPositions.length === 0) return null;

      // 删除不在文档开头的 front_matter 节点（从后向前删除）
      for (let i = frontMatterPositions.length - 1; i >= 0; i--) {
        const pos = frontMatterPositions[i];
        if (pos !== 0) {
          // 不在文档开头，删除
          const node = newState.doc.nodeAt(pos);
          if (node) {
            tr = tr.delete(pos, pos + node.nodeSize);
            needsFix = true;
          }
        }
      }

      // 如果有多个在位置 0 的 front_matter，只保留第一个
      // （理论上不会出现，但做防御性检查）
      const zeroPosFMs = frontMatterPositions.filter((p) => p === 0);
      if (zeroPosFMs.length > 1) {
        // 这种情况不应该出现，但如果出现了，删除重复的
        needsFix = true;
      }

      // 检查旧文档中空的 front_matter 是否被注入了外来文本
      // （类似 math-block 的 guard 逻辑）
      const oldFrontMatter = new Map<number, string>();
      oldState.doc.descendants((node, pos) => {
        if (node.type.name === 'front_matter') {
          oldFrontMatter.set(pos, node.textContent);
        }
      });

      if (oldFrontMatter.size > 0) {
        const oldSelFrom = oldState.selection.from;
        let userEditingPos: number | null = null;
        oldState.doc.descendants((node, pos) => {
          if (node.type.name === 'front_matter') {
            const nodeEnd = pos + node.nodeSize;
            if (oldSelFrom > pos && oldSelFrom < nodeEnd) {
              userEditingPos = pos;
            }
          }
        });

        newState.doc.descendants((node, pos) => {
          if (node.type.name !== 'front_matter') return;
          if (node.textContent === '') return;

          for (const [oldPos, oldText] of oldFrontMatter) {
            let mappedPos: number;
            try {
              mappedPos = transactions.reduce((p, t) => t.mapping.map(p), oldPos);
            } catch {
              continue;
            }

            if (mappedPos === pos && oldText === '' && node.textContent !== '') {
              if (userEditingPos !== oldPos) {
                const contentStart = pos + 1;
                const contentEnd = pos + node.nodeSize - 1;
                if (contentStart < contentEnd) {
                  tr = tr.delete(contentStart, contentEnd);
                  needsFix = true;
                }
              }
            }
          }
        });
      }

      return needsFix ? tr : null;
    },
  });
});

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export { remarkFrontMatterPlugin as remarkFrontMatter };

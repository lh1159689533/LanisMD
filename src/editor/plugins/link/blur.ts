/**
 * Link Blur Plugin
 *
 * 光标离开段落时检测并转换链接语法的插件。
 *
 * 当光标从一个段落移动到另一个段落时，扫描离开的段落，
 * 如果发现未转换的 [text](url) 语法，自动转换为带 link mark 的文本。
 *
 * 实现方式：使用 Plugin.view 的 update 回调检测段落切换。
 * 相比 appendTransaction 方案，view.update 在所有事务完全应用后才被调用，
 * 能正确拿到最终的 state（包括回车 splitBlock 后的新选区位置），
 * 彻底避免了事务批处理导致的中间状态问题。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorState } from '@milkdown/kit/prose/state';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { LINK_SCAN_REGEX, normalizeUrl } from './utils';

/**
 * 获取选区所在的最内层 block 节点（段落）的起始位置
 * 返回 null 表示无法确定（如选区不在段落中）
 */
function getParagraphStart(state: EditorState): number | null {
  const $from = state.selection.$from;
  // 从当前 depth 向上查找 paragraph 节点
  for (let d = $from.depth; d >= 1; d--) {
    const node = $from.node(d);
    if (node.type.name === 'paragraph') {
      return $from.start(d);
    }
  }
  return null;
}

/**
 * 检测段落中是否包含未转换的链接语法
 * 如果段落中已经有 link mark，则对应位置的文本不需要再转换
 */
function findUnconvertedLinks(
  node: ProseMirrorNode,
  schema: typeof node.type.schema,
): Array<{ from: number; to: number; text: string; href: string }> {
  const results: Array<{ from: number; to: number; text: string; href: string }> = [];

  // 获取段落的纯文本
  const text = node.textContent;
  if (!text) return results;

  // 重置正则的 lastIndex
  LINK_SCAN_REGEX.lastIndex = 0;

  let match;
  while ((match = LINK_SCAN_REGEX.exec(text)) !== null) {
    const fullMatch = match[0];
    const linkText = match[1];
    const rawUrl = match[2];
    const matchStart = match.index;
    const matchEnd = matchStart + fullMatch.length;

    // 检查这个位置是否已经有 link mark
    // 需要遍历段落的内容来检查
    let hasLinkMark = false;

    node.forEach((child, offset) => {
      if (hasLinkMark) return;

      const childStart = offset;
      const childEnd = offset + child.nodeSize;

      // 检查这个子节点是否覆盖了匹配区域
      if (child.isText && childStart <= matchStart && childEnd >= matchEnd) {
        // 检查这个文本节点是否有 link mark
        const linkMark = child.marks.find((m) => m.type === schema.marks.link);
        if (linkMark) {
          hasLinkMark = true;
        }
      }
    });

    // 如果没有 link mark，添加到结果中
    if (!hasLinkMark && linkText.trim() && rawUrl.trim()) {
      results.push({
        from: matchStart,
        to: matchEnd,
        text: linkText,
        href: normalizeUrl(rawUrl),
      });
    }
  }

  return results;
}

/**
 * 在指定的段落中扫描并转换未处理的链接语法
 *
 * @param view 编辑器视图
 * @param paragraphStart 段落在文档中的起始位置（段落内容的 start）
 * @param paragraph 段落节点
 */
function convertLinksInParagraph(
  view: EditorView,
  paragraphStart: number,
  paragraph: ProseMirrorNode,
): void {
  const { state } = view;
  const links = findUnconvertedLinks(paragraph, state.schema);
  if (links.length === 0) return;

  const linkType = state.schema.marks.link;
  if (!linkType) return;

  const tr = state.tr;

  // 从后往前替换，避免位置偏移
  for (let i = links.length - 1; i >= 0; i--) {
    const link = links[i];
    const from = paragraphStart + link.from;
    const to = paragraphStart + link.to;

    const linkMark = linkType.create({ href: link.href });
    const textNode = state.schema.text(link.text, [linkMark]);

    tr.replaceWith(from, to, textNode);
  }

  if (tr.steps.length > 0) {
    view.dispatch(tr);
  }
}

const linkBlurPluginKey = new PluginKey('linkBlurPlugin');

export const linkBlurPlugin = $prose((_ctx) => {
  return new Plugin({
    key: linkBlurPluginKey,

    view() {
      // 记录上一次选区所在的段落起始位置
      let lastParagraphStart: number | null = null;

      return {
        update(view: EditorView, _prevState: EditorState) {
          const { state } = view;

          // 获取当前选区所在段落的起始位置
          const currentParagraphStart = getParagraphStart(state);

          // 获取上一次选区所在段落的起始位置
          // 使用缓存的值（而非从 prevState 计算），因为 prevState 可能是中间状态
          const prevStart = lastParagraphStart;

          // 更新缓存
          lastParagraphStart = currentParagraphStart;

          // 如果没有上一次的段落位置，跳过（首次初始化）
          if (prevStart === null) return;

          // 如果段落位置没变，不处理
          if (prevStart === currentParagraphStart) return;

          // 段落切换了，检查之前的段落
          // 需要在当前文档（state.doc）中找到之前段落的对应位置
          // 如果文档结构变了（如回车分裂），prevStart 可能需要调整

          // 尝试解析 prevStart 在当前文档中的位置
          try {
            // 确保位置在有效范围内
            if (prevStart < 0 || prevStart > state.doc.content.size) return;

            const $resolved = state.doc.resolve(prevStart);
            // 从 resolved 位置向上查找段落
            for (let d = $resolved.depth; d >= 1; d--) {
              const node = $resolved.node(d);
              if (node.type.name === 'paragraph') {
                const paragraphContentStart = $resolved.start(d);
                convertLinksInParagraph(view, paragraphContentStart, node);
                return;
              }
            }
            // 如果 resolved 深度为 0（doc 层级），检查该位置处的子节点
            if ($resolved.depth === 0) {
              const nodeAfter = $resolved.nodeAfter;
              if (nodeAfter && nodeAfter.type.name === 'paragraph') {
                // prevStart 指向段落的 content start，
                // 而 nodeAfter 是从 prevStart 位置开始的节点
                // 需要获取该段落的 content start = prevStart + 1（进入段落内部）
                convertLinksInParagraph(view, prevStart, nodeAfter);
                return;
              }
            }
          } catch {
            // 位置无效（文档结构变化较大），安全忽略
          }
        },

        destroy() {
          lastParagraphStart = null;
        },
      };
    },
  });
});

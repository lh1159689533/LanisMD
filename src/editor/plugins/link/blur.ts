/**
 * Link Blur Plugin
 *
 * 光标离开段落时检测并转换链接语法的插件。
 *
 * 当光标从一个段落移动到另一个段落时，扫描离开的段落，
 * 如果发现未转换的 [text](url) 语法，自动转换为带 link mark 的文本。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import { LINK_SCAN_REGEX, normalizeUrl } from './utils';

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

const linkBlurPluginKey = new PluginKey('linkBlurPlugin');

export const linkBlurPlugin = $prose((_ctx) => {
  return new Plugin({
    key: linkBlurPluginKey,

    state: {
      init() {
        return { lastParagraphPos: null as number | null };
      },
      apply(tr, value, _oldState, newState) {
        // 如果选区没有变化，保持原状态
        if (!tr.selectionSet) return value;

        // 获取新选区所在的段落位置
        const $pos = newState.selection.$from;
        const paragraphPos = $pos.start($pos.depth);

        return { lastParagraphPos: paragraphPos };
      },
    },

    appendTransaction(transactions, oldState, newState) {
      // 检查是否有选区变化的事务
      const selectionChanged = transactions.some((tr) => tr.selectionSet);
      if (!selectionChanged) return null;

      // 获取旧选区和新选区所在的段落
      const oldPos = oldState.selection.$from;
      const newPos = newState.selection.$from;

      // 获取段落的起始位置来判断是否是同一个段落
      const oldParagraphStart = oldPos.start(oldPos.depth);
      const newParagraphStart = newPos.start(newPos.depth);

      // 如果在同一个段落内移动，不处理
      if (oldParagraphStart === newParagraphStart) return null;

      // 获取离开的段落节点
      const oldParagraph = oldPos.node(oldPos.depth);
      if (!oldParagraph || oldParagraph.type.name !== 'paragraph') return null;

      // 扫描离开的段落，查找未转换的链接语法
      const links = findUnconvertedLinks(oldParagraph, newState.schema);
      if (links.length === 0) return null;

      // 创建事务来转换链接
      const tr = newState.tr;
      const linkType = newState.schema.marks.link;

      if (!linkType) return null;

      // 需要从后往前处理，避免位置偏移问题
      // 计算段落在文档中的绝对位置
      const paragraphStart = oldParagraphStart;

      // 从后往前替换，避免位置偏移
      for (let i = links.length - 1; i >= 0; i--) {
        const link = links[i];
        const from = paragraphStart + link.from;
        const to = paragraphStart + link.to;

        const linkMark = linkType.create({ href: link.href });
        const textNode = newState.schema.text(link.text, [linkMark]);

        tr.replaceWith(from, to, textNode);
      }

      return tr;
    },
  });
});

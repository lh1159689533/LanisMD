/**
 * Link Paste Plugin
 *
 * 处理粘贴事件中的 Markdown 链接语法。
 * 当用户粘贴包含 `[text](url)` 的纯文本时，将其解析为带有 link mark 的文本。
 *
 * 这个插件补充了 linkInputRulePlugin（只处理实时输入）的不足，
 * 确保粘贴场景也能正确处理链接语法。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Fragment, Slice } from '@milkdown/kit/prose/model';
import type { Node, Schema } from '@milkdown/kit/prose/model';
import { LINK_SCAN_REGEX, normalizeUrl } from './utils';

const linkPastePluginKey = new PluginKey('LINK_PASTE');

/**
 * 解析文本中的 Markdown 链接语法，返回 ProseMirror 节点数组
 */
function parseLinksInText(text: string, schema: Schema): Node[] {
  const linkType = schema.marks.link;
  if (!linkType) {
    // 如果没有 link mark 类型，直接返回纯文本节点
    return [schema.text(text)];
  }

  const nodes: Node[] = [];
  let lastIndex = 0;

  // 重置正则的 lastIndex
  LINK_SCAN_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = LINK_SCAN_REGEX.exec(text)) !== null) {
    const fullMatch = match[0];
    const linkText = match[1] || '';
    const rawUrl = match[2] || '';
    const matchStart = match.index;

    // 检查前一个字符是否是 !（图片语法）
    if (matchStart > 0 && text[matchStart - 1] === '!') {
      // 这是图片语法，跳过
      continue;
    }

    // 添加匹配前的纯文本
    if (matchStart > lastIndex) {
      const beforeText = text.slice(lastIndex, matchStart);
      nodes.push(schema.text(beforeText));
    }

    // 创建带 link mark 的文本节点
    if (linkText.trim() && rawUrl.trim()) {
      const href = normalizeUrl(rawUrl);
      const linkMark = linkType.create({ href });
      nodes.push(schema.text(linkText, [linkMark]));
    } else {
      // 空链接文本或 URL，保持原样
      nodes.push(schema.text(fullMatch));
    }

    lastIndex = matchStart + fullMatch.length;
  }

  // 添加剩余的纯文本
  if (lastIndex < text.length) {
    nodes.push(schema.text(text.slice(lastIndex)));
  }

  // 如果没有找到任何链接，返回原始文本
  if (nodes.length === 0) {
    return [schema.text(text)];
  }

  return nodes;
}

export const linkPastePlugin = $prose(() => {
  return new Plugin({
    key: linkPastePluginKey,
    props: {
      /**
       * 处理粘贴的文本，将 Markdown 链接语法转换为带 link mark 的节点
       */
      transformPastedText(text: string, _plain: boolean, _view) {
        // 如果是以 plain text 方式粘贴，且包含链接语法
        if (!LINK_SCAN_REGEX.test(text)) {
          // 没有链接语法，不处理
          return text;
        }

        // 重置正则
        LINK_SCAN_REGEX.lastIndex = 0;

        // 注意：transformPastedText 返回的是文本字符串
        // 我们需要在 handlePaste 中处理更复杂的转换
        return text;
      },

      /**
       * 直接处理粘贴事件，将包含链接语法的文本转换为正确的节点
       */
      handlePaste(view, event, _slice) {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        const text = clipboardData.getData('text/plain');
        const html = clipboardData.getData('text/html');

        // 如果有 HTML 内容，让其他插件处理（可能是从网页复制的带格式内容）
        if (html.length > 0) {
          return false;
        }

        // 检查是否包含 Markdown 链接语法
        LINK_SCAN_REGEX.lastIndex = 0;
        if (!LINK_SCAN_REGEX.test(text)) {
          return false;
        }

        const { state, dispatch } = view;
        const schema = state.schema;

        // 按行分割处理，保持段落结构
        const lines = text.split(/\r?\n/);
        const contentNodes: Node[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // 解析当前行的链接
          LINK_SCAN_REGEX.lastIndex = 0;
          const lineNodes = parseLinksInText(line, schema);

          if (lineNodes.length > 0) {
            // 创建段落节点
            const paragraph = schema.nodes.paragraph;
            if (paragraph) {
              contentNodes.push(paragraph.create(null, Fragment.from(lineNodes)));
            }
          } else if (line === '') {
            // 空行，创建空段落
            const paragraph = schema.nodes.paragraph;
            if (paragraph) {
              contentNodes.push(paragraph.create());
            }
          }
        }

        if (contentNodes.length === 0) {
          return false;
        }

        // 替换当前选区
        const tr = state.tr.replaceSelection(new Slice(Fragment.from(contentNodes), 0, 0));

        dispatch(tr.scrollIntoView());

        return true;
      },
    },
  });
});

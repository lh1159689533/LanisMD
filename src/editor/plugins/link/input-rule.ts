/**
 * Link Input Rule Plugin
 *
 * 当用户手动输入 Markdown 链接语法 `[text](url)` 并键入最后的 `)` 时，
 * 自动将文本转换为带有 link mark 的文本节点。
 *
 * URL 按原样保存，不进行自动补全协议。
 *
 * 注意：需要排除图片语法 `![alt](url)`，该语法由 imageInputRulePlugin 处理。
 */

import { $prose } from '@milkdown/kit/utils';
import { InputRule, inputRules } from '@milkdown/kit/prose/inputrules';
import { LINK_SYNTAX_REGEX, normalizeUrl } from './utils';

export const linkInputRulePlugin = $prose(() => {
  const rule = new InputRule(LINK_SYNTAX_REGEX, (state, match, start, end) => {
    // 检查前一个字符是否是 !（图片语法）
    // 如果是，则不处理，让 imageInputRulePlugin 处理
    if (start > 0) {
      const charBefore = state.doc.textBetween(start - 1, start);
      if (charBefore === '!') {
        return null;
      }
    }

    const schema = state.schema;
    const linkType = schema.marks.link;

    if (!linkType) {
      return null;
    }

    // match[0] = 完整匹配 [text](url)
    // match[1] = 链接文本
    // match[2] = URL
    const text = match[1] || '';
    const rawUrl = match[2] || '';

    // 空文本或空 URL 不转换
    if (!text.trim() || !rawUrl.trim()) return null;

    const href = normalizeUrl(rawUrl);

    // 创建带有 link mark 的文本节点
    const linkMark = linkType.create({ href });
    const textNode = schema.text(text, [linkMark]);

    // 直接替换匹配范围
    return state.tr.replaceWith(start, end, textNode);
  });

  return inputRules({ rules: [rule] });
});

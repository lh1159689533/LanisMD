/**
 * Image Input Rule Plugin
 *
 * 当用户手动输入 Markdown 图片语法 `![alt](url)` 并键入最后的 `)` 时，
 * 自动将文本转换为 image-block 节点：
 * - url 为空（`![]()` 或 `![alt]()`）：插入空的 image-block（显示上传条）
 * - url 不为空（`![alt](https://...)`）：插入带 src 的 image-block（直接渲染图片）
 *
 * 实现方式：使用 ProseMirror InputRule，匹配以 `)` 结尾的图片语法。
 */

import { $prose } from '@milkdown/kit/utils';
import { InputRule, inputRules } from '@milkdown/kit/prose/inputrules';

/**
 * Regex to match Markdown image syntax: ![alt](url)
 *
 * Breakdown:
 * - `!\[`          — literal `![`
 * - `([^\]]*)`     — capture group 1: alt text (anything except `]`)
 * - `\]\(`         — literal `](`
 * - `([^)]*)`      — capture group 2: url (anything except `)`)
 * - `\)`           — literal `)`
 *
 * ProseMirror InputRule matches against text from the start of the textblock to the cursor.
 */
const IMAGE_SYNTAX_REGEX = /!\[([^\]]*)\]\(([^)]*)\)$/;

export const imageInputRulePlugin = $prose(() => {
  const rule = new InputRule(IMAGE_SYNTAX_REGEX, (state, match, start, end) => {
    const schema = state.schema;
    const imageBlockType = schema.nodes['image-block'] || schema.nodes.image_block;

    if (!imageBlockType) return null;

    const src = match[2] || '';

    // Create the image-block node
    const imageBlock = imageBlockType.create({
      src,
      caption: '',
    });

    // Check if the matched text spans the entire parent node content.
    // If the paragraph only contains the image syntax, replace the whole paragraph.
    const $from = state.doc.resolve(start);
    const parent = $from.parent;
    const isWholeParagraph =
      parent.type === schema.nodes.paragraph &&
      start === $from.start() &&
      end === $from.end();

    if (isWholeParagraph) {
      // Replace the entire paragraph with the image-block
      const paragraphStart = $from.before();
      const paragraphEnd = $from.after();
      return state.tr.replaceWith(paragraphStart, paragraphEnd, imageBlock);
    } else {
      // Replace just the matched text range with the image-block
      return state.tr.replaceWith(start, end, imageBlock);
    }
  });

  return inputRules({ rules: [rule] });
});

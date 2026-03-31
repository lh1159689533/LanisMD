/**
 * Underline Mark Schema Extension
 *
 * Milkdown/ProseMirror 默认不提供下划线 mark。
 * 本扩展通过 $markSchema 工厂创建 underline mark，
 * 渲染为 <u> 标签，支持从 HTML 粘贴中解析。
 *
 * 在 Markdown 中使用 HTML 标签 <u>text</u> 来表示下划线。
 */

import { $markSchema } from '@milkdown/kit/utils';

export const underlineMarkSchema = $markSchema('underline', () => ({
  attrs: {},
  parseDOM: [
    { tag: 'u' },
    {
      style: 'text-decoration',
      getAttrs: (value: string) => (value === 'underline' ? {} : false),
    },
  ],
  toDOM() {
    return ['u', 0];
  },
  parseMarkdown: {
    match: (node) => node.type === 'html',
    runner: (state, node, markType) => {
      const value = node.value as string;
      if (/^<u>/i.test(value)) {
        state.openMark(markType);
      } else if (/^<\/u>/i.test(value)) {
        state.closeMark(markType);
      }
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'underline',
    runner: (state, mark, node) => {
      // Write the text wrapped in HTML <u> tags
      state.withMark(mark, 'emphasis', undefined, {
        before: '<u>',
        after: '</u>',
      });
    },
  },
}));

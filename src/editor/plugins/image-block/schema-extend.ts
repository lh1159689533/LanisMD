/**
 * Image Block Schema Extension
 *
 * 扩展 milkdown 的 image-block schema，添加：
 * - align 属性（left / center / right）
 *
 * Markdown 序列化：
 * - 居中对齐：使用标准 Markdown 语法 ![ratio](url "caption")
 * - 非居中对齐：使用 MarkText 风格的 HTML img 标签
 *   <img src="./assets/image.png" alt="" data-align="left" data-ratio="0.50">
 *
 * 图片大小通过 ratio（宽高比）控制，保存在 data-ratio 属性中。
 *
 * @changelog
 * | 版本   | 变更说明                                              | 关联                                     |
 * | v1.0.0 | 初始实现：image-block 对齐扩展与 HTML img 序列化        | -                                        |
 * | v1.0.1 | 修复 tight list 中 paragraph 混合内容被整体丢弃的问题； | BUGFIX: 源码模式 tight list 切预览渲染丢失  |
 * |        | 转换逻辑抽取至 html-image-transform.ts                 |                                          |
 * | v1.0.2 | 修复无 title 图片解析时 caption 为 null 触发属性校验    | BUGFIX: 源码模式切预览图片未渲染          |
 * |        | 失败，导致图片及后续内容丢失                           |                                          |
 * /@changelog
 *
 * @author hhhuilli
 */

import { imageBlockSchema } from '@milkdown/kit/component/image-block';
import { $remark } from '@milkdown/kit/utils';
import type { Root } from 'mdast';
import { escapeHtml, transformHtmlImageNodes } from './html-image-transform';

// ---------------------------------------------------------------------------
// Extend image-block schema to add align attr
// ---------------------------------------------------------------------------

export const extendedImageBlockSchema = imageBlockSchema.extendSchema((prev) => {
  return (ctx) => {
    const baseSchema = prev(ctx);
    return {
      ...baseSchema,
      attrs: {
        ...baseSchema.attrs,
        // 添加对齐属性
        align: {
          default: 'center',
        },
      },
      // 扩展 parseDOM 以读取 data-align
      parseDOM: [
        // 原有的解析规则
        ...(baseSchema.parseDOM || []),
        // 添加对 MarkText 风格 HTML img 标签的支持
        {
          tag: 'img[data-align]',
          getAttrs: (dom: HTMLElement) => {
            const ratioStr = dom.getAttribute('data-ratio');
            let ratio = ratioStr ? Number(ratioStr) : 1;
            if (Number.isNaN(ratio) || ratio === 0) ratio = 1;
            return {
              src: dom.getAttribute('src') || '',
              caption: dom.getAttribute('title') || dom.getAttribute('alt') || '',
              ratio,
              align: dom.getAttribute('data-align') || 'center',
            };
          },
        },
      ],
      // 扩展 toDOM 以输出 data-align
      toDOM: (node) => {
        return [
          'img',
          {
            'data-type': 'image-block',
            src: node.attrs.src,
            caption: node.attrs.caption,
            ratio: node.attrs.ratio,
            'data-align': node.attrs.align || 'center',
          },
        ];
      },
      // 扩展 parseMarkdown 以支持从 remark 插件转换的 image-block 节点
      // 注意：HTML <img> 标签已被 remarkHtmlImagePlugin 转换为 image-block 节点
      parseMarkdown: {
        ...baseSchema.parseMarkdown,
        match: ({ type }) => type === 'image-block',
        runner: (state, node, type) => {
          // 处理 image-block 节点（包括从 HTML <img> 转换来的）
          // 注意：markdown 省略 title 时 mdast 给出的是 null，而 schema 中
          // src / caption 声明了 validate: 'string'，传入 null 会在 createAndFill
          // 时抛错，导致该节点及后续内容在切回预览时整体丢失，必须兜底为空串
          const src = (node.url as string | null) ?? '';
          const caption = (node.title as string | null) ?? '';
          let ratio = Number((node.alt as string) || 1);
          if (Number.isNaN(ratio) || ratio === 0) ratio = 1;

          // 尝试从节点数据中读取 align
          const data = (node.data || {}) as Record<string, unknown>;
          const align = (data.align as string) || 'center';

          // image-block 是块级节点，需要使用 openNode/closeNode 而不是 addNode
          // 这样可以确保它被正确地插入到文档的块级上下文中
          state.openNode(type, {
            src,
            caption,
            ratio,
            align,
          });
          state.closeNode();
        },
      },
      // 扩展 toMarkdown 以输出 MarkText 风格的 HTML img 标签
      toMarkdown: {
        match: (node) => node.type.name === 'image-block',
        runner: (state, node) => {
          const { src, caption, align, ratio } = node.attrs;
          const ratioValue = Number.parseFloat(ratio || 1).toFixed(2);

          // 如果对齐方式是默认的居中，使用标准 Markdown 语法
          if (align === 'center') {
            state.openNode('paragraph');
            state.addNode('image', undefined, undefined, {
              title: caption || '',
              url: src,
              alt: ratioValue,
            });
            state.closeNode();
            return;
          }

          // 否则使用 HTML img 标签（MarkText 风格）
          let imgTag = '<img';
          if (caption) {
            imgTag += ` title="${escapeHtml(caption)}"`;
          }
          imgTag += ` src="${escapeHtml(src)}"`;
          imgTag += ` alt="${caption ? escapeHtml(caption) : ''}"`;
          imgTag += ` data-align="${align || 'center'}"`;
          // 保存 ratio 以便恢复图片大小
          imgTag += ` data-ratio="${ratioValue}"`;
          imgTag += '>';

          // 添加 HTML 节点 - addNode(type, children?, value?, props?)
          // HTML 节点的 value 是原始 HTML 字符串
          state.addNode('html', undefined, imgTag);
        },
      },
    };
  };
});

// ---------------------------------------------------------------------------
// Remark plugin to parse HTML img tags as image-block nodes
// ---------------------------------------------------------------------------

/**
 * Remark 插件：将 HTML <img> 标签解析为 image-block 节点
 *
 * 注意：milkdown 的 image-block 是 block 级别节点，不能嵌套在 paragraph 内。
 * 覆盖三种上下文（详见 html-image-transform.ts）：
 * 1. <img> 标签独占一行（块级 html 节点）
 * 2. <img> 标签是 paragraph 的唯一子节点
 * 3. <img> 标签是 paragraph 的混合内容子节点（拆分 paragraph）
 */
export const remarkHtmlImagePlugin = $remark('remarkHtmlImage', () => {
  return () => (tree: Root) => {
    transformHtmlImageNodes(tree);
  };
});

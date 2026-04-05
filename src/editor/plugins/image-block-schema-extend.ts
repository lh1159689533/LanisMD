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
 */

import { imageBlockSchema } from '@milkdown/kit/component/image-block';
import { $remark } from '@milkdown/kit/utils';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

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
          const src = node.url as string;
          const caption = node.title as string;
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
 * 需要处理两种情况：
 * 1. <img> 标签独占一行（顶层 html 节点）
 * 2. <img> 标签是 paragraph 的唯一子节点
 */
export const remarkHtmlImagePlugin = $remark('remarkHtmlImage', () => {
  return () => (tree: Root) => {
    // 辅助函数：从 html 值创建 image-block 节点
    const createImageBlockFromHtml = (
      htmlValue: string,
    ): {
      type: string;
      url: string;
      title: string;
      alt: string;
      data: { align: string };
    } | null => {
      // 支持更宽松的匹配：允许 img 标签前后有空白字符
      const trimmedValue = htmlValue.trim();
      const imgMatch = trimmedValue.match(/^<img\s+([^>]*)\/?>$/i);
      if (!imgMatch) return null;

      const attrStr = imgMatch[1];
      const src = extractAttr(attrStr, 'src');
      if (!src) return null;

      const dataAlign = extractAttr(attrStr, 'data-align');
      // 只有当有 data-align 属性时才转换为 image-block
      if (!dataAlign) return null;

      const title = extractAttr(attrStr, 'title') || '';
      const alt = extractAttr(attrStr, 'alt') || '';
      const ratioStr = extractAttr(attrStr, 'data-ratio');
      let ratio = ratioStr ? Number(ratioStr) : 1;
      if (Number.isNaN(ratio) || ratio === 0) ratio = 1;

      return {
        type: 'image-block',
        url: src,
        title: title || alt,
        alt: String(ratio),
        data: { align: dataAlign },
      };
    };

    // 收集需要替换的节点（避免在遍历时修改导致问题）
    const replacements: { parent: unknown; index: number; newNode: unknown }[] = [];

    // 情况 1：处理顶层 html 节点（<img> 标签独占一行）
    visit(tree, 'html', (node, index, parent) => {
      if (typeof node.value !== 'string') return;
      const imageBlock = createImageBlockFromHtml(node.value);
      if (!imageBlock) return;

      // 记录替换（稍后执行）
      if (parent && typeof index === 'number') {
        replacements.push({ parent, index, newNode: imageBlock });
      }
    });

    // 情况 2：处理 paragraph 内只有一个 html img 标签的情况
    // 注意：需要将整个 paragraph 替换为 image-block，而不是替换 paragraph 内的 html 子节点
    visit(tree, 'paragraph', (node, index, parent) => {
      const children = (node as { children?: unknown[] }).children;
      if (!children || children.length !== 1) return;

      const firstChild = children[0] as { type?: string; value?: string };
      if (!firstChild || firstChild.type !== 'html') return;

      const htmlValue = firstChild.value;
      if (typeof htmlValue !== 'string') return;

      const imageBlock = createImageBlockFromHtml(htmlValue);
      if (!imageBlock) return;

      // 记录替换：用 image-block 替换整个 paragraph
      if (parent && typeof index === 'number') {
        replacements.push({ parent, index, newNode: imageBlock });
      }
    });

    // 执行所有替换（从后往前，避免索引错位）
    replacements.sort((a, b) => b.index - a.index);
    for (const { parent, index, newNode } of replacements) {
      (parent as { children: unknown[] }).children[index] = newNode;
    }
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 从 HTML 属性字符串中提取指定属性的值
 */
function extractAttr(attrStr: string, attrName: string): string | null {
  // 匹配 attr="value" 或 attr='value'（允许空字符串）
  const quotedRegex = new RegExp(`${attrName}=["']([^"']*)["']`, 'i');
  const quotedMatch = attrStr.match(quotedRegex);
  if (quotedMatch) {
    return quotedMatch[1]; // 返回空字符串也是有效的
  }

  // 匹配 attr=value（无引号，不含空格和 >）
  const unquotedRegex = new RegExp(`${attrName}=([^\\s>]+)`, 'i');
  const unquotedMatch = attrStr.match(unquotedRegex);
  return unquotedMatch ? unquotedMatch[1] : null;
}

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

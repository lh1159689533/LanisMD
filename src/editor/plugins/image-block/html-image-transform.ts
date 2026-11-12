/**
 * Image Block - HTML <img> 标签的 remark 树转换（纯函数模块）
 *
 * 将 markdown 中 MarkText 风格的 HTML <img> 标签（带 data-align 属性）
 * 转换为 milkdown 可解析的 image-block mdast 节点。
 *
 * 必须覆盖三种上下文（CommonMark 中 <img> 不属于块级 HTML 标签清单，
 * 当它紧跟段落文本且无空行时会被 remark 解析为 paragraph 的 inline
 * html 子节点，而非块级 html 节点）：
 * 1. 块级 html 节点（<img> 独占一行，parent 非 paragraph）→ 原地替换
 * 2. paragraph 的唯一子节点 → 整个 paragraph 替换为 image-block
 * 3. paragraph 的混合内容子节点 → 拆分 paragraph：
 *    [paragraph(前缀), image-block, paragraph(后缀)]
 *
 * 情况 3 是修复 tight list 渲染丢失的关键：若直接把块级 image-block
 * 塞进 paragraph.children，milkdown 解析时 paragraph（content: "inline*"）
 * 的 createAndFill 会失败且异常被 transformer 吞掉，导致整个段落被丢弃。
 *
 * 本模块为纯函数实现，不依赖 milkdown / Tauri / store，可在 Node 中独立验证。
 *
 * @changelog
 * | 版本   | 变更说明                                            | 关联                                    |
 * | v1.0.0 | 初始实现：从 schema-extend.ts 抽取纯转换逻辑，       | BUGFIX: 源码模式 tight list 切预览渲染丢失 |
 * |        | 新增 paragraph 混合内容拆分，修复列表项内容丢失       |                                         |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { Paragraph, Parent, PhrasingContent, Root } from 'mdast';
import { visit } from 'unist-util-visit';

// ---------------------------------------------------------------------------
// HTML 工具函数（纯函数，供转换与序列化共用）
// ---------------------------------------------------------------------------

/**
 * 转义 HTML 特殊字符
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 从 HTML 属性字符串中提取指定属性的值
 */
export function extractAttr(attrStr: string, attrName: string): string | null {
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

// ---------------------------------------------------------------------------
// image-block mdast 节点构造
// ---------------------------------------------------------------------------

/** 由 HTML 转换出的 image-block mdast 节点结构 */
interface ImageBlockMdastNode {
  type: 'image-block';
  url: string;
  title: string;
  alt: string;
  data: { align: string };
}

/**
 * 从 html 节点的 value 中构造 image-block mdast 节点。
 * 仅当内容是带 data-align 属性的 <img> 标签时返回节点，否则返回 null
 * （无 data-align 的 html 保持原样，不参与转换）。
 */
function createImageBlockFromHtml(htmlValue: string): ImageBlockMdastNode | null {
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
}

// ---------------------------------------------------------------------------
// remark 树转换
// ---------------------------------------------------------------------------

/** 单次替换记录：用若干新节点替换 parent.children[index] 处的节点 */
interface Replacement {
  parent: Parent;
  index: number;
  // image-block 并非标准 mdast 节点类型，替换内容保持宽松类型
  newNodes: unknown[];
}

/**
 * 遍历 remark 树，将带 data-align 的 HTML <img> 标签转换为 image-block 节点。
 * 直接修改传入的树（原地变更），与 remark 插件的转换时序兼容。
 */
export function transformHtmlImageNodes(tree: Root): void {
  const replacements: Replacement[] = [];

  // 情况 1：块级 html 节点（<img> 独占一行）
  // 仅处理 parent 非 paragraph 的块级上下文；paragraph 内的 inline html
  // 交给下方 paragraph 处理，避免块级节点被塞进 inline 上下文
  visit(tree, 'html', (node, index, parent) => {
    if (typeof node.value !== 'string') return;
    if ((parent as { type?: string } | null)?.type === 'paragraph') return;

    const imageBlock = createImageBlockFromHtml(node.value);
    if (!imageBlock) return;

    if (parent && typeof index === 'number') {
      replacements.push({ parent, index, newNodes: [imageBlock] });
    }
  });

  // 情况 2 & 3：paragraph 内包含匹配的 html img 子节点
  // - paragraph 唯一子节点是 img → 替换为单个 image-block
  // - paragraph 混合内容（文本 + img）→ 拆分为 [paragraph, image-block, paragraph]
  visit(tree, 'paragraph', (node, index, parent) => {
    if (!parent || typeof index !== 'number') return;

    const children = (node as Paragraph).children;
    if (!children?.length) return;

    const newNodes: unknown[] = [];
    let pending: PhrasingContent[] = [];
    let hasImageBlock = false;

    for (const child of children) {
      const imageBlock =
        child.type === 'html' && typeof child.value === 'string'
          ? createImageBlockFromHtml(child.value)
          : null;

      if (imageBlock) {
        hasImageBlock = true;
        // img 之前累积的非 html 内容保留为独立 paragraph
        if (pending.length) {
          newNodes.push({ type: 'paragraph', children: pending });
        }
        pending = [];
        newNodes.push(imageBlock);
      } else {
        pending.push(child);
      }
    }
    // img 之后剩余内容保留为独立 paragraph
    if (pending.length) {
      newNodes.push({ type: 'paragraph', children: pending });
    }

    // 未发现可转换的 img 时保持原 paragraph 不变
    if (hasImageBlock) {
      replacements.push({ parent, index, newNodes });
    }
  });

  // 执行替换（从后往前，避免索引错位）
  replacements.sort((a, b) => b.index - a.index);
  for (const { parent, index, newNodes } of replacements) {
    (parent as { children: unknown[] }).children.splice(index, 1, ...newNodes);
  }
}

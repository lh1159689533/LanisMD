/**
 * Remark Plugin for GFM Alert
 *
 * 解析 GitHub Flavored Markdown Alert 语法，将其转换为带 data 属性的 blockquote 节点。
 *
 * 输入语法：
 * > [!NOTE]
 * > This is a note alert.
 *
 * 转换后的 AST 节点会携带 data.alertType 属性。
 */

import { $remark } from '@milkdown/kit/utils';
import type { Root, Blockquote, Paragraph, Text } from 'mdast';
import { visit } from 'unist-util-visit';
import { getAlertTypeFromSyntax, type GfmAlertType } from './types';

/** Alert 语法正则：匹配 [!TYPE] 格式 */
const ALERT_SYNTAX_REGEX = /^\[!([A-Z]+)\]\s*/i;

/**
 * 检查 blockquote 的第一行是否是 Alert 语法
 * @returns Alert 类型，如果不是 Alert 则返回 null
 */
function detectAlertType(blockquote: Blockquote): GfmAlertType | null {
  const children = blockquote.children;
  if (!children || children.length === 0) return null;

  // 第一个子节点应该是 paragraph
  const firstChild = children[0];
  if (firstChild.type !== 'paragraph') return null;

  const paragraph = firstChild as Paragraph;
  if (!paragraph.children || paragraph.children.length === 0) return null;

  // paragraph 的第一个子节点应该是 text
  const firstTextNode = paragraph.children[0];
  if (firstTextNode.type !== 'text') return null;

  const text = (firstTextNode as Text).value;
  const match = text.match(ALERT_SYNTAX_REGEX);
  if (!match) return null;

  return getAlertTypeFromSyntax(match[1]);
}

/**
 * 从 blockquote 中移除 Alert 语法标记 [!TYPE]
 * 修改原始节点
 */
function removeAlertSyntax(blockquote: Blockquote): void {
  const children = blockquote.children;
  if (!children || children.length === 0) return;

  const firstChild = children[0];
  if (firstChild.type !== 'paragraph') return;

  const paragraph = firstChild as Paragraph;
  if (!paragraph.children || paragraph.children.length === 0) return;

  const firstTextNode = paragraph.children[0];
  if (firstTextNode.type !== 'text') return;

  const textNode = firstTextNode as Text;
  const match = textNode.value.match(ALERT_SYNTAX_REGEX);
  if (!match) return;

  // 移除 [!TYPE] 部分
  const newValue = textNode.value.slice(match[0].length);

  if (newValue.length === 0) {
    // 如果文本节点变为空，移除它
    paragraph.children.shift();

    // 如果段落变为空，移除它
    if (paragraph.children.length === 0) {
      blockquote.children.shift();
    }
  } else {
    // 更新文本内容
    textNode.value = newValue;
  }
}

/**
 * Remark 插件：解析 GFM Alert 语法
 *
 * 将 `> [!NOTE]` 等语法转换为带 `data.alertType` 属性的 blockquote 节点。
 */
export const remarkGfmAlertPlugin = $remark('remarkGfmAlert', () => {
  return () => (tree: Root) => {
    visit(tree, 'blockquote', (node: Blockquote) => {
      const alertType = detectAlertType(node);
      if (!alertType) return;

      // 设置 alert 类型到节点的 data 属性
      node.data = node.data || {};
      (node.data as Record<string, unknown>).alertType = alertType;

      // 移除 [!TYPE] 语法标记
      removeAlertSyntax(node);
    });
  };
});

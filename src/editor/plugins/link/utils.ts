/**
 * Link 插件共享工具函数
 */

/**
 * 匹配 Markdown 链接语法：[text](url)
 *
 * 正则分解：
 * - `\[`           — 字面量 `[`
 * - `([^\]]+)`     — 捕获组1：链接文本（至少一个非 `]` 字符）
 * - `\]\(`         — 字面量 `](`
 * - `([^)]+)`      — 捕获组2：URL（至少一个非 `)` 字符）
 * - `\)`           — 字面量 `)`
 * - `$`            — 匹配文本块末尾到光标位置
 *
 * 注意：图片语法 ![alt](url) 的排除在 handler 中处理
 */
export const LINK_SYNTAX_REGEX = /\[([^\]]+)\]\(([^)]+)\)$/;

/**
 * 用于扫描段落文本的链接语法正则（全局匹配）
 * 使用负向后瞻排除图片语法
 */
export const LINK_SCAN_REGEX = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * 规范化 URL，仅做 trim 处理
 *
 * @param url 原始 URL
 * @returns 规范化后的 URL
 */
export function normalizeUrl(url: string): string {
  return url.trim();
}

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

// ---------------------------------------------------------------------------
// 链接分类
// ---------------------------------------------------------------------------

/** 链接类型 */
export type LinkType =
  | 'internal-anchor'   // #heading 形式的文档内锚点
  | 'local-file'        // 本地文件链接（可能带锚点）
  | 'external-url';     // 外部 URL（http/https/mailto 等）

/** 解析后的链接信息 */
export interface ParsedLink {
  type: LinkType;
  /** 原始 href */
  href: string;
  /** 文件路径部分（不含锚点），internal-anchor 类型为空字符串 */
  filePath: string;
  /** 锚点部分（不含 # 前缀），无锚点时为空字符串 */
  anchor: string;
}

/** 外部 URL 协议前缀 */
const EXTERNAL_PROTOCOLS = ['http://', 'https://', 'mailto:', 'tel:', 'ftp://'];

/**
 * 解析链接 href，分类为内部锚点、本地文件或外部 URL
 */
export function parseLink(href: string): ParsedLink {
  const trimmed = href.trim();

  // 空链接
  if (!trimmed) {
    return { type: 'external-url', href: trimmed, filePath: '', anchor: '' };
  }

  // 外部 URL（含 http/https/mailto 等协议）
  const lowerHref = trimmed.toLowerCase();
  for (const proto of EXTERNAL_PROTOCOLS) {
    if (lowerHref.startsWith(proto)) {
      return { type: 'external-url', href: trimmed, filePath: '', anchor: '' };
    }
  }

  // 纯内部锚点：以 # 开头
  if (trimmed.startsWith('#')) {
    return {
      type: 'internal-anchor',
      href: trimmed,
      filePath: '',
      anchor: trimmed.slice(1),
    };
  }

  // file:// 协议或本地路径（可能带锚点）
  // 需要分离路径和锚点。锚点格式：path#anchor
  // 注意不要错误分割 Windows 路径如 C:/path 或 file:///path
  const hashIndex = findAnchorHashIndex(trimmed);
  if (hashIndex >= 0) {
    return {
      type: 'local-file',
      href: trimmed,
      filePath: trimmed.slice(0, hashIndex),
      anchor: trimmed.slice(hashIndex + 1),
    };
  }

  return {
    type: 'local-file',
    href: trimmed,
    filePath: trimmed,
    anchor: '',
  };
}

/**
 * 在链接字符串中查找锚点 # 的位置
 * 需要排除 file:// 协议中 Windows 盘符后面的情况
 *
 * 规则：从右向左查找 #，确保 # 不在 file:// 前缀部分
 */
function findAnchorHashIndex(href: string): number {
  // 从右向左找第一个 #
  const idx = href.lastIndexOf('#');
  if (idx <= 0) return -1;

  // # 后面不能为空
  if (idx >= href.length - 1) return -1;

  return idx;
}

// ---------------------------------------------------------------------------
// 标题锚点生成与匹配
// ---------------------------------------------------------------------------

/**
 * 将标题文本转换为 URL 锚点格式（与 Typora 一致）
 *
 * 规则：
 * - 转为小写
 * - 非字母数字和中文字符替换为空
 * - 空格替换为连字符
 * - 首尾连字符去除
 */
export function headingToAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 从标题列表中根据锚点找到对应的标题索引（heading 在文档中的序号）
 *
 * 支持 Typora 的重复标题编号规则：
 * - 第一个 "Hello" 对应 #hello-1
 * - 第二个 "Hello" 对应 #hello-2
 *
 * @param headings 文档中所有标题的 { text, index } 列表
 * @param targetAnchor 目标锚点（不含 #）
 * @returns 标题的 index，未找到返回 -1
 */
export function findHeadingByAnchor(
  headings: Array<{ text: string; index: number }>,
  targetAnchor: string,
): number {
  const target = targetAnchor.toLowerCase().trim();
  if (!target) return -1;

  // 统计每个锚点文本出现的次数，构建 anchor-N 映射
  const anchorCountMap = new Map<string, number>();

  for (const h of headings) {
    const baseAnchor = headingToAnchor(h.text);
    const count = (anchorCountMap.get(baseAnchor) || 0) + 1;
    anchorCountMap.set(baseAnchor, count);

    // 带编号的锚点：anchor-1, anchor-2, ...
    const numberedAnchor = `${baseAnchor}-${count}`;

    if (target === numberedAnchor) {
      return h.index;
    }

    // 无编号形式：仅当该锚点只出现一次且匹配时
    if (target === baseAnchor && count === 1) {
      // 先检查后续是否还有同名标题
      // 如果只有一个，无编号形式匹配第一个
      return h.index;
    }
  }

  return -1;
}

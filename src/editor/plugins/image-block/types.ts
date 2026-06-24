/**
 * Image Block - Shared Types and Utilities
 *
 * 图片模块的共享类型定义和工具函数
 */

import { useFileStore } from '@/stores/file-store';
import { convertFileSrc } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageDialogResult {
  src: string;
  alt: string;
}

// ---------------------------------------------------------------------------
// Path Utilities
// ---------------------------------------------------------------------------

/**
 * Check if a src is a relative path that needs resolving.
 * Uses an exclusion approach: anything that is NOT a full URL or data URL
 * is treated as a relative path.
 */
export function isRelativePath(src: string): boolean {
  if (!src) return false;
  // data: URLs (base64 inline images)
  if (src.startsWith('data:')) return false;
  // blob: URLs (temporary in-memory images)
  if (src.startsWith('blob:')) return false;
  // Full URLs with protocol (http://, https://, ftp://, etc.)
  if (src.includes('://')) return false;
  return true;
}

/**
 * 将路径中的 `.` 和 `..` 段规范化为干净的绝对路径。
 * 纯字符串处理，不依赖 Node.js path 模块。
 * 兼容 Windows 反斜杠路径：先统一转为正斜杠再处理。
 *
 * 示例：
 *   "/a/b/c/../d"        -> "/a/b/d"
 *   "/a/b/./c"           -> "/a/b/c"
 *   "/a/b/c/../../d"     -> "/a/d"
 *   "C:\\a\\b\\c\\..\\d" -> "C:/a/b/d"
 */
function normalizePath(p: string): string {
  // Windows 兼容：统一将反斜杠转为正斜杠
  const normalized = p.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const resolved: string[] = [];
  for (const seg of parts) {
    if (seg === '.' || seg === '') {
      // 跳过当前目录标记和连续斜杠产生的空段（保留首个空段以保留前导 /）
      if (resolved.length === 0 && seg === '') {
        resolved.push('');
      }
      continue;
    }
    if (seg === '..') {
      // 向上跳一级，但不超过根目录（保留盘符如 "C:" 或首个空段）
      if (resolved.length > 1) {
        resolved.pop();
      }
      continue;
    }
    resolved.push(seg);
  }
  return resolved.join('/') || '/';
}

/**
 * Build the absolute file path for a relative image src
 * based on the current document's directory.
 *
 * 支持 `./`、`../`、多级 `../../` 等相对路径形式，
 * 最终返回规范化的绝对路径（不含 `.` / `..`）。
 * 兼容 Windows 反斜杠路径格式。
 */
export function buildAbsolutePath(src: string): string | null {
  const currentFile = useFileStore.getState().currentFile;
  if (!currentFile?.filePath) return null;

  // Windows 兼容：统一转为正斜杠后再查找最后的分隔符
  const filePath = currentFile.filePath.replace(/\\/g, '/');
  const lastSlash = filePath.lastIndexOf('/');
  const docDir = lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
  // 拼接后通过 normalizePath 解析 .. 和 . 段
  return normalizePath(`${docDir}/${src}`);
}

/**
 * Convert a relative path to Tauri asset protocol URL for display.
 */
export function resolveImageSrc(src: string): string {
  if (!isRelativePath(src)) {
    return src;
  }

  const absolutePath = buildAbsolutePath(src);
  if (!absolutePath) {
    return src;
  }

  return convertFileSrc(absolutePath);
}

/**
 * Get the current file path from the store.
 */
export function getCurrentFilePath(): string | null {
  return useFileStore.getState().currentFile?.filePath || null;
}

// ---------------------------------------------------------------------------
// HTML Utilities
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

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
 * Build the absolute file path for a relative image src
 * based on the current document's directory.
 */
export function buildAbsolutePath(src: string): string | null {
  const currentFile = useFileStore.getState().currentFile;
  if (!currentFile?.filePath) return null;

  const lastSlash = currentFile.filePath.lastIndexOf('/');
  const docDir = lastSlash >= 0 ? currentFile.filePath.substring(0, lastSlash) : '';
  const relativePart = src.startsWith('./') ? src.substring(2) : src;
  return `${docDir}/${relativePart}`;
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

/**
 * Mermaid Block - 类型定义
 *
 * Mermaid 图表插件的共享类型和常量
 */

// ---------------------------------------------------------------------------
// 状态类型
// ---------------------------------------------------------------------------

/** Mermaid 块的显示状态 */
export type MermaidBlockState = 'preview' | 'editing';

/** Mermaid 渲染结果 */
export interface MermaidRenderResult {
  /** 渲染是否成功 */
  success: boolean;
  /** 成功时的 SVG 字符串 */
  svg?: string;
  /** 失败时的错误信息 */
  error?: string;
}

// ---------------------------------------------------------------------------
// 工具栏类型
// ---------------------------------------------------------------------------

/** 工具栏按钮定义 */
export interface ToolbarButton {
  /** 按钮唯一标识 */
  id: string;
  /** SVG 图标 */
  icon: string;
  /** 提示文字 */
  tooltip: string;
  /** 点击回调 */
  onClick: () => void;
}

// ---------------------------------------------------------------------------
// 导出类型
// ---------------------------------------------------------------------------

/** 导出格式 */
export type ExportFormat = 'png' | 'svg';

/** 导出选项 */
export interface ExportOptions {
  /** 导出格式 */
  format: ExportFormat;
  /** PNG 缩放倍数（默认 2x 高清） */
  scale?: number;
  /** 文件名（不含后缀） */
  filename?: string;
}

// ---------------------------------------------------------------------------
// 主题回调
// ---------------------------------------------------------------------------

/** 主题变化回调函数 */
export type ThemeChangeCallback = (isDark: boolean) => void;

// ---------------------------------------------------------------------------
// SVG 图标
// ---------------------------------------------------------------------------

export const ICONS = {
  /** 编辑图标 */
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  /** 预览图标 */
  preview: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  /** PNG 导出图标 */
  png: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  /** SVG 导出图标 */
  svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l3-3 3 3"/></svg>',
  /** 错误图标 */
  error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
} as const;

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 渲染防抖延迟（毫秒） */
export const RENDER_DEBOUNCE_MS = 500;

/** 渲染缓存上限 */
export const CACHE_MAX_SIZE = 100;

/** CSS 类名前缀 */
export const CSS_PREFIX = 'lanismd-mermaid';

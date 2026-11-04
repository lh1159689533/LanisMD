/**
 * Board Canvas Toolbar - 常量
 *
 * 画布级工具栏的 CSS 前缀、缩放参数与主题清单。
 *
 * 缩放参数直接复用 Plait 公开导出的 `ZOOM_STEP` / `MIN_ZOOM` / `MAX_ZOOM`
 * （见 @plait/core/constants/zoom）。`BoardTransforms.updateZoom` 内部已调
 * `clampZoomLevel` 做钳制，此处引入同一组常量仅用于按钮禁用态判定，
 * 避免出现「按钮可点但缩放不动」的割裂感。
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                                                     |
 * | v1.0.0 | 初始实现：画布工具栏常量与主题清单   | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §二 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, ThemeColorMode } from '@plait/core';

// ---------------------------------------------------------------------------
// 基础常量
// ---------------------------------------------------------------------------

/** 画布工具栏 CSS 类名前缀 */
export const CANVAS_TOOLBAR_PREFIX = 'lanismd-board-canvas-toolbar';

/** 缩放步长（与 Plait 内置滚轮缩放步长一致） */
export { ZOOM_STEP, MIN_ZOOM, MAX_ZOOM };

/**
 * 缩放百分比的浮点容差。
 *
 * zoom 为浮点数，连续点击 `−`/`+` 会累积误差（如 0.30000000000000004），
 * 判定是否已到边界时需留容差，否则按钮禁用态会在边界处抖动。
 */
export const ZOOM_EPSILON = 1e-6;

// ---------------------------------------------------------------------------
// 主题清单
// ---------------------------------------------------------------------------

/** 单个主题在面板中的展示信息 */
export interface ThemeOption {
  /** Plait 主题标识 */
  mode: ThemeColorMode;
  /** 中文显示名 */
  label: string;
}

/**
 * 可选主题清单。
 *
 * 顺序与 `ThemeColorMode` 枚举声明顺序一致（见 @plait/core/interfaces/theme），
 * 面板中的色彩预览从 `MindThemeColors` 按 `mode` 查表获得，不在此硬编码颜色。
 */
export const THEME_OPTIONS: readonly ThemeOption[] = [
  { mode: ThemeColorMode.default, label: '默认' },
  { mode: ThemeColorMode.colorful, label: '多彩' },
  { mode: ThemeColorMode.soft, label: '柔和' },
  { mode: ThemeColorMode.retro, label: '复古' },
  { mode: ThemeColorMode.dark, label: '暗色' },
  { mode: ThemeColorMode.starry, label: '星空' },
] as const;

/** 默认主题（新建画板与解码兜底时使用） */
export const DEFAULT_THEME_MODE = ThemeColorMode.default;

/**
 * Board Block - 图形缩略图共享渲染
 *
 * 把「按 pointer 用 `@plait/draw` 的 `drawGeometry` 实时渲染真实图形缩略图」的
 * 逻辑从创建工具条抽到画板插件共享层，供两处复用：
 * - `draw-toolbar/shape-panel.ts`：创建工具条的图形网格面板
 * - `style-toolbar/segments/shape-switch.ts`：样式工具栏的图形切换面板
 *
 * 缩略图策略（PRD Q15）：不手写 SVG 图标，`drawGeometry` 按固定矩形把真实图形
 * 渲染成 `SVGGElement`，再塞进自建 `<svg viewBox>`。好处是与包升级永不脱节、
 * 批次 3 / 4 的流程图 / UML 符号零额外成本；代价是预览为 rough.js 手绘风格。
 *
 * @changelog
 * | 版本   | 变更说明                                     | 关联                                      |
 * | v1.0.0 | 初始实现：抽公共缩略图渲染，供创建/切换面板复用 | REQ: 20261027-board-whiteboard-draw §3.5 / §3.8 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';
import { drawGeometry, type GeometryShapes } from '@plait/draw';

/** SVG 命名空间 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 图形缩略图的渲染尺寸（viewBox 逻辑尺寸，px） */
export const THUMBNAIL_SIZE = { width: 40, height: 32 } as const;

/** 缩略图四周留白，避免描边被 viewBox 裁切 */
export const THUMBNAIL_PADDING = 4;

/**
 * 缩略图的 rough.js 绘制参数。
 *
 * - `stroke: 'currentColor'`：rough 会把该值原样写进 `stroke` 属性，SVG 规范下
 *   它解析为元素的 CSS `color`，从而自动适配亮/暗主题，无需两套图标。
 * - `seed` 固定：rough.js 默认随机抖动，不固定种子会导致每次重绘形状都不一样。
 * - `roughness` 调低：小尺寸下默认手绘感过强，轮廓会糊。
 */
const THUMBNAIL_ROUGH_OPTIONS = {
  stroke: 'currentColor',
  strokeWidth: 1,
  roughness: 0.4,
  seed: 1,
  fillStyle: 'solid',
} as const;

/**
 * 渲染单个图形的缩略图。
 *
 * `drawGeometry` 返回的 `SVGGElement` 坐标系与传入矩形一致，故外层包一个
 * 同尺寸 viewBox 的 `<svg>` 即可按 CSS 尺寸自适应缩放。
 *
 * 兜底：部分图形（如 `text`）本身没有可见轮廓，engine 返回空的 g；
 * 或 engine 抛异常。两种情况都回落为「中文名首字」的文本占位，避免空白格子。
 *
 * @param board   Plait board 实例（`drawGeometry` 依赖其 roughSVG）
 * @param pointer 图形 pointer（`GeometryShapes`）
 * @param label   图形中文名（用于占位回落与可访问性）
 */
export function createShapeThumbnail(
  board: PlaitBoard,
  pointer: string,
  label: string,
): SVGSVGElement {
  const { width, height } = THUMBNAIL_SIZE;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const rectangle = {
    x: THUMBNAIL_PADDING,
    y: THUMBNAIL_PADDING,
    width: width - THUMBNAIL_PADDING * 2,
    height: height - THUMBNAIL_PADDING * 2,
  };

  let shapeG: SVGGElement | null = null;
  try {
    shapeG = drawGeometry(board, rectangle, pointer as GeometryShapes, {
      ...THUMBNAIL_ROUGH_OPTIONS,
    });
  } catch (e) {
    shapeG = null;
  }

  if (shapeG && shapeG.childNodes.length > 0) {
    svg.appendChild(shapeG);
  } else {
    svg.appendChild(createFallbackGlyph(label, width, height));
  }
  return svg;
}

/** 无可见轮廓时的文本占位（取中文名首字） */
function createFallbackGlyph(label: string, width: number, height: number): SVGTextElement {
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', String(width / 2));
  text.setAttribute('y', String(height / 2));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('font-size', '14');
  text.setAttribute('fill', 'currentColor');
  text.textContent = label.charAt(0);
  return text;
}

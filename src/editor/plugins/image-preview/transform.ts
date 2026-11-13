/**
 * Image Preview - 变换计算
 *
 * 纯函数集合，不触碰 DOM，负责缩放 / 平移 / 旋转的数学计算。
 *
 * 坐标约定：
 * - 图片以舞台中心为原点居中摆放，(x, y) 是图片中心相对舞台中心的偏移
 * - CSS 变换顺序为 translate -> rotate -> scale，旋转与缩放都以图片中心为原点
 * - 由于缩放是等比的，「以锚点为中心缩放」的推导与旋转角度无关
 *
 * @changelog
 * | 版本   | 变更说明                         | 关联                                   |
 * | v1.0.0 | 初始实现：适应窗口、锚点缩放、旋转 | REQ: 20261113-image-preview TECH: 图片预览方案 §三 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { ImageSize, Point, ViewTransform } from './types';

/** 最小缩放比例 */
export const MIN_SCALE = 0.1;

/** 最大缩放比例 */
export const MAX_SCALE = 10;

/** 按钮 / 快捷键单步缩放倍率 */
export const ZOOM_STEP = 1.25;

/** 判定两个缩放比例「相等」的容差，用于识别当前是否处于适应窗口状态 */
const SCALE_EPSILON = 0.005;

/**
 * 将缩放比例限制在合法区间内
 */
export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * 判断两个缩放比例是否可视为相等
 */
export function isSameScale(a: number, b: number): boolean {
  return Math.abs(a - b) < SCALE_EPSILON;
}

/**
 * 旋转角度是否使宽高互换（90 / 270 度）
 */
function isQuarterTurn(rotation: number): boolean {
  return Math.abs(rotation % 180) === 90;
}

/**
 * 计算「适应窗口」的缩放比例
 *
 * 小图不放大（上限为 1），避免低分辨率图片被拉糊；
 * 旋转 90/270 度时按交换后的宽高计算。
 */
export function computeFitScale(natural: ImageSize, rotation: number, viewport: ImageSize): number {
  const width = isQuarterTurn(rotation) ? natural.height : natural.width;
  const height = isQuarterTurn(rotation) ? natural.width : natural.height;
  if (width <= 0 || height <= 0 || viewport.width <= 0 || viewport.height <= 0) return 1;
  return Math.min(1, viewport.width / width, viewport.height / height);
}

/**
 * 生成「适应窗口」的完整变换（居中、保留旋转角度）
 */
export function createFitTransform(
  natural: ImageSize,
  rotation: number,
  viewport: ImageSize,
): ViewTransform {
  return {
    scale: computeFitScale(natural, rotation, viewport),
    x: 0,
    y: 0,
    rotation,
  };
}

/**
 * 以锚点为中心缩放：保证锚点下方的图片像素在缩放前后位置不变
 *
 * @param current 当前变换
 * @param nextScale 目标缩放比例（会被 clamp）
 * @param anchor 锚点，相对舞台中心的坐标；不传则以图片中心缩放
 */
export function zoomAt(current: ViewTransform, nextScale: number, anchor?: Point): ViewTransform {
  const scale = clampScale(nextScale);
  if (!anchor) return { ...current, scale };

  // 锚点到图片中心的向量按缩放比例伸缩，反推新的图片中心
  const ratio = scale / current.scale;
  return {
    ...current,
    scale,
    x: anchor.x - (anchor.x - current.x) * ratio,
    y: anchor.y - (anchor.y - current.y) * ratio,
  };
}

/**
 * 将变换序列化为 CSS transform 字符串
 *
 * 前置的 translate(-50%, -50%) 用于把图片中心对齐到舞台中心（图片 left/top 为 50%）。
 */
export function toCssTransform(t: ViewTransform): string {
  return `translate(-50%, -50%) translate(${t.x}px, ${t.y}px) rotate(${t.rotation}deg) scale(${t.scale})`;
}

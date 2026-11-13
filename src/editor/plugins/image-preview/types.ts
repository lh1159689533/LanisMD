/**
 * Image Preview - 类型定义
 *
 * @changelog
 * | 版本   | 变更说明     | 关联                                   |
 * | v1.0.0 | 初始实现     | REQ: 20261113-image-preview TECH: 图片预览方案 §三 |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 二维坐标点 */
export interface Point {
  x: number;
  y: number;
}

/** 尺寸 */
export interface ImageSize {
  width: number;
  height: number;
}

/** 预览图的视图变换状态 */
export interface ViewTransform {
  /** 缩放比例，1 表示原始像素尺寸 */
  scale: number;
  /** 图片中心相对舞台中心的水平偏移（px） */
  x: number;
  /** 图片中心相对舞台中心的垂直偏移（px） */
  y: number;
  /** 旋转角度（deg），始终为 90 的整数倍，可超出 360 以保证动画方向一致 */
  rotation: number;
}

/** 图集中的一项 */
export interface PreviewItem {
  /** 编辑器中的原始 img 元素，用于展开 / 收起动画定位 */
  source: HTMLImageElement;
  /** 可直接加载的地址（已经过 asset 协议转换） */
  src: string;
  /** 展示用文件名 */
  name: string;
  /** 原始像素尺寸 */
  natural: ImageSize;
}

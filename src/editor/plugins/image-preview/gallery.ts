/**
 * Image Preview - 图集收集
 *
 * 负责识别「可预览的正文图片」并按文档顺序收集为图集，
 * 显式排除画板、Mermaid、附件图标、上传占位符等非正文图片。
 *
 * @changelog
 * | 版本   | 变更说明                   | 关联                                   |
 * | v1.0.0 | 初始实现：可预览判定与图集收集 | REQ: 20261113-image-preview TECH: 图片预览方案 §四.2 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { ImageSize, PreviewItem } from './types';

/**
 * 正文图片选择器：仅图片块与行内图片两类
 * 其余位置的 img（画板、Mermaid、附件图标等）都不在这两个容器内，天然被排除
 */
const PREVIEWABLE_IMAGE_SELECTOR = [
  '.milkdown-image-block .image-wrapper > img',
  '.milkdown-image-inline img.image-inline',
].join(', ');

/** 上传中的加载占位符容器 */
const LOADING_PLACEHOLDER_SELECTOR = '.image-loading-placeholder';

/** SVG 没有固有尺寸时的兜底宽度 */
const FALLBACK_WIDTH = 800;

/**
 * 判断地址是否为 SVG（SVG 可能没有固有尺寸，需要特殊处理）
 */
function isSvgSource(src: string): boolean {
  return /\.svg(?:$|[?#])/i.test(src) || src.startsWith('data:image/svg');
}

/**
 * 读取图片的原始像素尺寸
 *
 * SVG 未声明 width/height 时 naturalWidth 可能为 0，
 * 此时按渲染尺寸的宽高比兜底，保证预览层仍能正确布局。
 */
export function readNaturalSize(img: HTMLImageElement): ImageSize {
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    return { width: img.naturalWidth, height: img.naturalHeight };
  }
  const rect = img.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    const width = Math.max(rect.width, FALLBACK_WIDTH);
    return { width, height: (width * rect.height) / rect.width };
  }
  return { width: FALLBACK_WIDTH, height: FALLBACK_WIDTH * 0.75 };
}

/**
 * 判断 img 元素是否可以打开预览
 *
 * 需要同时满足：属于正文图片、不在上传占位符内、有地址、已成功加载
 * （SVG 的 naturalWidth 可能为 0，只要求 complete 即可）。
 */
export function isPreviewableImage(img: HTMLImageElement): boolean {
  if (!img.isConnected || !img.matches(PREVIEWABLE_IMAGE_SELECTOR)) return false;
  if (img.closest(LOADING_PLACEHOLDER_SELECTOR)) return false;

  const src = img.currentSrc || img.src;
  if (!src) return false;
  if (!img.complete) return false;
  return img.naturalWidth > 0 || isSvgSource(src);
}

/**
 * 从事件目标中解析出可预览的 img；目标不是可预览图片时返回 null
 */
export function resolvePreviewableImage(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof HTMLImageElement)) return null;
  return isPreviewableImage(target) ? target : null;
}

/**
 * 从图片地址中提取展示用文件名
 *
 * asset 协议地址会把整条本地路径编码进最后一段，因此先解码再取末段。
 */
export function extractImageName(src: string): string {
  if (src.startsWith('data:')) return '内嵌图片';
  if (src.startsWith('blob:')) return '临时图片';

  const withoutQuery = src.split(/[?#]/)[0];
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    // 非法编码时直接使用原串
  }
  const segments = decoded.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || '图片';
}

/**
 * 将 img 元素转为图集项
 */
function toPreviewItem(img: HTMLImageElement): PreviewItem {
  const src = img.currentSrc || img.src;
  return {
    source: img,
    src,
    name: extractImageName(src),
    natural: readNaturalSize(img),
  };
}

/**
 * 按文档顺序收集编辑器内所有可预览图片，并返回当前图片在图集中的下标
 *
 * querySelectorAll 返回的顺序即 DOM 树先序遍历顺序，与文档阅读顺序一致。
 */
export function collectGallery(
  root: HTMLElement,
  current: HTMLImageElement,
): { items: PreviewItem[]; index: number } {
  const images = Array.from(
    root.querySelectorAll<HTMLImageElement>(PREVIEWABLE_IMAGE_SELECTOR),
  ).filter(isPreviewableImage);

  // 兜底：当前图片理论上一定在列表中，若不在（例如 DOM 结构变化）则单独预览
  let index = images.indexOf(current);
  if (index < 0) {
    images.splice(0, images.length, current);
    index = 0;
  }

  return { items: images.map(toPreviewItem), index };
}

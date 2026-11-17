/**
 * 图表导出 - SVG 光栅化为 PNG
 *
 * 将独立 SVG 序列化为 data URL，经 `<img>` 解码后绘制到 canvas 再编码为 PNG。
 *
 * 调用方必须先用 flattenForeignObjects 去掉 foreignObject，否则 WebKit 会污染
 * canvas，导致编码阶段抛出 SecurityError。
 *
 * @changelog
 * | 版本   | 变更说明                 | 关联                       |
 * | v1.0.0 | 初始实现：SVG → PNG 字节 | FEAT: 文本绘图/导图/画板导出 |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 光栅化参数 */
export interface RasterizeOptions {
  /** SVG 逻辑宽度（px） */
  width: number;
  /** SVG 逻辑高度（px） */
  height: number;
  /** 输出倍率，默认 2（高清） */
  scale?: number;
  /** 背景色，默认透明 */
  background?: string;
}

/**
 * canvas 单边像素上限。WebKit 对超大 canvas 会静默返回空白图，
 * 超出时自动降低倍率而不是失败。
 */
const MAX_CANVAS_SIDE = 8192;

/**
 * 将 SVG 元素光栅化为 PNG 字节。
 *
 * @throws 图像解码失败、canvas 被污染或编码失败时抛出 Error
 */
export async function svgToPngBytes(
  svg: SVGSVGElement,
  options: RasterizeOptions,
): Promise<Uint8Array> {
  const { width, height, background } = options;
  if (width <= 0 || height <= 0) throw new Error('图表尺寸无效');

  const scale = Math.min(options.scale ?? 2, MAX_CANVAS_SIDE / Math.max(width, height));
  const canvasWidth = Math.max(1, Math.round(width * scale));
  const canvasHeight = Math.max(1, Math.round(height * scale));

  // 明确 img 的固有尺寸，避免 width="100%" 一类相对尺寸被解码成 300x150 默认值
  const prepared = svg.cloneNode(true) as SVGSVGElement;
  prepared.setAttribute('width', String(width));
  prepared.setAttribute('height', String(height));
  prepared.style.removeProperty('max-width');

  const markup = new XMLSerializer().serializeToString(prepared);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建画布上下文');

  if (background) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
  }
  context.drawImage(image, 0, 0, canvasWidth, canvasHeight);

  const blob = await new Promise<Blob | null>((resolve, reject) => {
    try {
      canvas.toBlob(resolve, 'image/png');
    } catch (err) {
      // canvas 被污染时 toBlob 同步抛出 SecurityError
      reject(err);
    }
  });
  if (!blob) throw new Error('PNG 编码失败');
  return new Uint8Array(await blob.arrayBuffer());
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('SVG 图像解码失败'));
    image.src = src;
  });
}

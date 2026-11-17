/**
 * Mermaid Block - 导出功能
 *
 * 支持导出为 PNG 和 SVG：
 * - PNG：把渲染结果临时挂到屏外完成排版，将 htmlLabels 产生的 foreignObject
 *   扁平化为原生 SVG 文本后再光栅化（2x）。直接光栅化含 foreignObject 的 SVG
 *   在 WebKit 中会污染 canvas，导致编码抛错、导出静默失败。
 * - SVG：保留 Mermaid 原始输出（自带 <style>，浏览器中保真度最高），仅把
 *   width="100%" 换成实际尺寸，便于独立打开。
 *
 * @changelog
 * | 版本   | 变更说明                                         | 关联                       |
 * | v1.0.0 | 初始实现：PNG / SVG 导出                          | -                          |
 * | v1.1.0 | 改用统一导出流程；修复 WebKit 下 PNG 导出静默失败、 | FEAT: 文本绘图/导图/画板导出 |
 * |        | 暗色主题导出白底；默认保存到文档目录并提示结果       |                            |
 * /@changelog
 *
 * @author hhhuilli
 */

import {
  DiagramExportError,
  exportDiagram,
  flattenForeignObjects,
  serializeSvg,
  svgToPngBytes,
  type DiagramExportFormat,
} from '@/utils/diagram-export';

/** 导出默认文件名中的图表类型名 */
const EXPORT_LABEL = '文本绘图';

/**
 * 导出 Mermaid 图表。
 *
 * @param svgString 最近一次成功渲染的 SVG
 * @param format 导出格式
 * @param background PNG 背景色（取编辑器中的实际底色）
 */
export async function exportMermaid(
  svgString: string | null,
  format: DiagramExportFormat,
  background: string,
): Promise<void> {
  await exportDiagram({
    label: EXPORT_LABEL,
    format,
    render: async () => {
      if (!svgString) throw new DiagramExportError('图表尚未成功渲染，没有可导出的内容');
      return format === 'png'
        ? renderPng(svgString, background)
        : serializeSvg(parseSized(svgString).svg);
    },
  });
}

/** 屏外挂载 → 扁平化 → 光栅化 */
async function renderPng(svgString: string, background: string): Promise<Uint8Array> {
  const { svg, width, height } = parseSized(svgString);

  // 屏外但保持可见：visibility:hidden 会让所有元素被判定为不可见而被剔除
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    flattenForeignObjects(svg, clone);
    return await svgToPngBytes(clone, { width, height, scale: 2, background });
  } finally {
    host.remove();
  }
}

/**
 * 解析 SVG 并按 viewBox 设定实际宽高。
 * Mermaid 输出为 width="100%" + max-width 样式，脱离容器后尺寸不确定。
 */
function parseSized(svgString: string): { svg: SVGSVGElement; width: number; height: number } {
  const parsed = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const source = parsed.querySelector('svg');
  if (!source) throw new DiagramExportError('无法解析图表 SVG');
  const svg = document.importNode(source, true) as SVGSVGElement;

  const viewBox = svg
    .getAttribute('viewBox')
    ?.split(/[\s,]+/)
    .map(Number);
  let width = viewBox?.[2] ?? Number.parseFloat(svg.getAttribute('width') ?? '');
  let height = viewBox?.[3] ?? Number.parseFloat(svg.getAttribute('height') ?? '');
  if (!Number.isFinite(width) || width <= 0) width = 800;
  if (!Number.isFinite(height) || height <= 0) height = 600;

  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.removeProperty('max-width');
  return { svg, width, height };
}

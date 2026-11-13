/**
 * 图表导出 - 统一入口
 *
 * 文本绘图（Mermaid）、思维导图、画板共用的导出能力：
 * - flattenForeignObjects：把 foreignObject 转为原生 SVG 图元（PNG 可编码、SVG 可移植）
 * - svgToPngBytes：SVG 光栅化为 PNG
 * - exportDiagram：生成 → 选路径 → 写文件 → 提示
 *
 * @author hhhuilli
 */

export { flattenForeignObjects } from './foreign-object';
export { svgToPngBytes, type RasterizeOptions } from './rasterize';
export {
  exportDiagram,
  serializeSvg,
  resolveBackgroundColor,
  DiagramExportError,
  type DiagramExportFormat,
  type DiagramExportOptions,
} from './save';

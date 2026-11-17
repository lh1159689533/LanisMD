/**
 * Board Block - 导出（思维导图 / 画板）
 *
 * 把当前画板的全部元素导出为 PNG 或 SVG，范围为所有元素的外接矩形 + 留白，
 * 与视口缩放 / 平移无关；底色取画板主题背景，与画布中所见一致。
 *
 * 不直接使用 @plait/core 的 toImage：它把含 foreignObject（Slate 文本、图片）的
 * SVG 直接光栅化，在 WebKit 中会污染 canvas 而失败，且只能产出 PNG。这里沿用其
 * 「按元素 G 克隆」的思路，克隆后经 flattenForeignObjects 转为原生 SVG 图元，
 * 同一份快照既可写成 SVG 也可光栅化为 PNG。
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                       |
 * | v1.0.0 | 初始实现：导图 / 画板 PNG、SVG 导出 | FEAT: 文本绘图/导图/画板导出 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { PlaitBoard, PlaitElement, findElements, getRectangleByElements } from '@plait/core';

import {
  DiagramExportError,
  exportDiagram,
  flattenForeignObjects,
  resolveBackgroundColor,
  serializeSvg,
  svgToPngBytes,
  type DiagramExportFormat,
} from '@/utils/diagram-export';

import type { BoardMode } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 导出图片四周留白（画布坐标） */
const EXPORT_PADDING = 24;

/** 画板快照 */
interface BoardSnapshot {
  svg: SVGSVGElement;
  width: number;
  height: number;
  background: string;
}

/**
 * 导出画板 / 思维导图。
 *
 * @param board Plait board 实例
 * @param mode 画板形态，决定默认文件名
 * @param format 导出格式
 */
export async function exportBoard(
  board: PlaitBoard,
  mode: BoardMode,
  format: DiagramExportFormat,
): Promise<void> {
  await exportDiagram({
    label: mode === 'board' ? '画板' : '思维导图',
    format,
    render: async () => {
      const snapshot = createBoardSnapshot(board);
      if (format === 'svg') return serializeSvg(snapshot.svg);
      const { svg, width, height, background } = snapshot;
      return svgToPngBytes(svg, { width, height, scale: 2, background });
    },
  });
}

/** 克隆全部元素的 G 生成独立 SVG（含背景） */
function createBoardSnapshot(board: PlaitBoard): BoardSnapshot {
  // recursion 由 board.isRecursion 兜底：导图折叠节点的子孙不会被收集
  const elements = findElements(board, {
    match: () => true,
    recursion: () => true,
    isReverse: false,
  });
  const groups = collectElementGroups(elements);
  if (groups.length === 0) throw new DiagramExportError('画板为空，没有可导出的内容');

  const rect = getRectangleByElements(board, elements, false);
  const x = rect.x - EXPORT_PADDING;
  const y = rect.y - EXPORT_PADDING;
  const width = Math.ceil(rect.width + EXPORT_PADDING * 2);
  const height = Math.ceil(rect.height + EXPORT_PADDING * 2);
  const background = resolveBackgroundColor(PlaitBoard.getHost(board));

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));

  // 背景写进 SVG 本身：否则暗色主题的浅色文字在透明底的查看器里不可读
  const backgroundRect = document.createElementNS(SVG_NS, 'rect');
  backgroundRect.setAttribute('x', String(x));
  backgroundRect.setAttribute('y', String(y));
  backgroundRect.setAttribute('width', String(width));
  backgroundRect.setAttribute('height', String(height));
  backgroundRect.setAttribute('fill', background);
  svg.appendChild(backgroundRect);

  const host = document.createElementNS(SVG_NS, 'g');
  for (const group of groups) {
    const clone = group.cloneNode(true) as SVGGElement;
    flattenForeignObjects(group, clone);
    host.appendChild(clone);
  }
  svg.appendChild(host);

  return { svg, width, height, background };
}

/**
 * 取各元素的渲染 G，并剔除被其它 G 包含的项（避免嵌套渲染时重复输出）。
 * 尚未挂载的元素（getElementG 抛错）直接跳过。
 */
function collectElementGroups(elements: PlaitElement[]): SVGGElement[] {
  const groups: SVGGElement[] = [];
  for (const element of elements) {
    try {
      groups.push(PlaitElement.getElementG(element));
    } catch {
      // 元素未渲染（如被折叠或尚未挂载），忽略
    }
  }
  return groups.filter(
    (group) => !groups.some((other) => other !== group && other.contains(group)),
  );
}

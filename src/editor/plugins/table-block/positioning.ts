/**
 * Table Block Plugin - Positioning
 *
 * 手柄、添加线、拖拽指示线的定位计算（纯函数）
 */

import type { EditorView } from '@milkdown/kit/prose/view';

// ---------------------------------------------------------------------------
// Position Container
// ---------------------------------------------------------------------------

/** 缓存的定位容器 */
let cachedPositionContainer: HTMLElement | null = null;

/**
 * 获取定位容器（.milkdown-editor-root）
 * @param view EditorView 实例（可选）
 * @returns 定位容器元素或 null
 */
export function getPositionContainer(view?: EditorView): HTMLElement | null {
  // 如果已缓存且仍在 DOM 中，直接返回
  if (cachedPositionContainer && document.contains(cachedPositionContainer)) {
    return cachedPositionContainer;
  }

  // 清除无效的缓存
  cachedPositionContainer = null;

  // 从 view 获取容器（更可靠的方式）
  if (view) {
    const editorDom = view.dom;
    // 向上查找 .milkdown-editor-root 容器
    const root = editorDom.closest('.milkdown-editor-root') as HTMLElement | null;
    if (root) {
      cachedPositionContainer = root;
      return cachedPositionContainer;
    }
  }

  // 回退到全局查询（不推荐，但作为兜底）
  cachedPositionContainer = document.querySelector('.milkdown-editor-root') as HTMLElement | null;
  return cachedPositionContainer;
}

/**
 * 清除定位容器缓存
 */
export function clearPositionContainerCache(): void {
  cachedPositionContainer = null;
}

// ---------------------------------------------------------------------------
// Handle Positioning
// ---------------------------------------------------------------------------

export interface HandlePositions {
  colHandle: { left: number; top: number; transform: string };
  rowHandle: { left: number; top: number; transform: string };
  colAddLine: { left: number; top: number; height: number };
  rowAddLine: { left: number; top: number; width: number };
}

/**
 * 计算手柄和添加线的位置
 * @param cell 当前单元格
 * @param table 表格元素
 * @param container 定位容器
 * @returns 各元素的位置信息
 */
export function calculateHandlePositions(
  cell: HTMLTableCellElement,
  table: HTMLTableElement,
  container: HTMLElement,
): HandlePositions {
  const containerRect = container.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  // 计算相对于容器的位置（考虑滚动）
  const scrollLeft = container.scrollLeft || 0;
  const scrollTop = container.scrollTop || 0;

  // 计算相对于容器的坐标
  const relativeTableTop = tableRect.top - containerRect.top + scrollTop;
  const relativeTableLeft = tableRect.left - containerRect.left + scrollLeft;
  const relativeCellTop = cellRect.top - containerRect.top + scrollTop;
  const relativeCellLeft = cellRect.left - containerRect.left + scrollLeft;

  return {
    // 列手柄（紧贴表格顶部边缘，当前列正上方）
    colHandle: {
      left: relativeCellLeft + cellRect.width / 2,
      top: relativeTableTop,
      transform: 'translate(-50%, -45%)',
    },
    // 行手柄（紧贴表格左边缘，当前行左侧）
    rowHandle: {
      left: relativeTableLeft,
      top: relativeCellTop + cellRect.height / 2,
      transform: 'translate(-35%, -50%)',
    },
    // 添加列线（表格右侧）
    colAddLine: {
      left: relativeTableLeft + tableRect.width + 8,
      top: relativeTableTop,
      height: tableRect.height,
    },
    // 添加行线（表格底部）
    rowAddLine: {
      left: relativeTableLeft,
      top: relativeTableTop + tableRect.height + 8,
      width: tableRect.width,
    },
  };
}

/**
 * 应用手柄位置到 DOM 元素
 */
export function applyHandlePositions(
  positions: HandlePositions,
  elements: {
    colHandle: HTMLElement | null;
    rowHandle: HTMLElement | null;
    colAddLine: HTMLElement | null;
    rowAddLine: HTMLElement | null;
  },
  cell: HTMLTableCellElement,
  table: HTMLTableElement,
): { colIndex: number; rowIndex: number } {
  // 计算行列索引
  const row = cell.parentElement as HTMLTableRowElement;
  const rowIndex = Array.from(table.querySelectorAll('tr')).indexOf(row);
  const colIndex = Array.from(row.cells).indexOf(cell);

  // 定位列手柄
  if (elements.colHandle) {
    elements.colHandle.style.position = 'absolute';
    elements.colHandle.style.left = `${positions.colHandle.left}px`;
    elements.colHandle.style.top = `${positions.colHandle.top}px`;
    elements.colHandle.style.transform = positions.colHandle.transform;
    elements.colHandle.dataset.colIndex = String(colIndex);
  }

  // 定位行手柄
  if (elements.rowHandle) {
    elements.rowHandle.style.position = 'absolute';
    elements.rowHandle.style.left = `${positions.rowHandle.left}px`;
    elements.rowHandle.style.top = `${positions.rowHandle.top}px`;
    elements.rowHandle.style.transform = positions.rowHandle.transform;
    elements.rowHandle.dataset.rowIndex = String(rowIndex);
  }

  // 定位添加列线
  if (elements.colAddLine) {
    elements.colAddLine.style.position = 'absolute';
    elements.colAddLine.style.left = `${positions.colAddLine.left}px`;
    elements.colAddLine.style.top = `${positions.colAddLine.top}px`;
    elements.colAddLine.style.height = `${positions.colAddLine.height}px`;
  }

  // 定位添加行线
  if (elements.rowAddLine) {
    elements.rowAddLine.style.position = 'absolute';
    elements.rowAddLine.style.left = `${positions.rowAddLine.left}px`;
    elements.rowAddLine.style.top = `${positions.rowAddLine.top}px`;
    elements.rowAddLine.style.width = `${positions.rowAddLine.width}px`;
  }

  return { colIndex, rowIndex };
}

// ---------------------------------------------------------------------------
// Drag Indicator Positioning
// ---------------------------------------------------------------------------

export interface ColumnPosition {
  left: number;
  width: number;
}

export interface RowPosition {
  top: number;
  height: number;
}

/**
 * 获取表格所有列的位置信息
 */
export function getColumnPositions(tableElement: HTMLTableElement): ColumnPosition[] {
  const firstRow = tableElement.querySelector('tr');
  if (!firstRow) return [];

  const cells = firstRow.querySelectorAll('th, td');
  return Array.from(cells).map((cell) => {
    const rect = cell.getBoundingClientRect();
    return { left: rect.left, width: rect.width };
  });
}

/**
 * 获取表格所有行的位置信息
 */
export function getRowPositions(tableElement: HTMLTableElement): RowPosition[] {
  const rows = tableElement.querySelectorAll('tr');
  return Array.from(rows).map((row) => {
    const rect = row.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  });
}

export interface DragIndicatorPosition {
  targetIndex: number;
  insertPosition: 'before' | 'after';
  indicatorStyle: {
    left: number;
    top: number;
    width: number | string;
    height: number | string;
  };
}

/**
 * 计算列拖拽指示线的位置
 * @param mouseX 鼠标 X 坐标
 * @param tableElement 表格元素
 * @param containerRect 容器 rect
 * @param sourceIndex 源列索引
 * @returns 指示线位置信息，或 null（如果是无效位置）
 */
export function calculateColumnDragIndicator(
  mouseX: number,
  tableElement: HTMLTableElement,
  containerRect: DOMRect,
  sourceIndex: number,
): DragIndicatorPosition | null {
  const cols = getColumnPositions(tableElement);
  const tableRect = tableElement.getBoundingClientRect();

  let targetIndex = 0;
  let insertPosition: 'before' | 'after' = 'before';
  let indicatorX = cols[0]?.left ?? tableRect.left;

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const colCenter = col.left + col.width / 2;

    if (mouseX < colCenter) {
      targetIndex = i;
      insertPosition = 'before';
      indicatorX = col.left;
      break;
    } else {
      targetIndex = i;
      insertPosition = 'after';
      indicatorX = col.left + col.width;
    }
  }

  // 不允许拖到自己的位置
  const isSamePosition =
    (insertPosition === 'before' && targetIndex === sourceIndex) ||
    (insertPosition === 'after' && targetIndex === sourceIndex) ||
    (insertPosition === 'before' && targetIndex === sourceIndex + 1) ||
    (insertPosition === 'after' && targetIndex === sourceIndex - 1);

  if (isSamePosition) {
    return null;
  }

  return {
    targetIndex,
    insertPosition,
    indicatorStyle: {
      left: indicatorX - containerRect.left,
      top: tableRect.top - containerRect.top,
      width: 3,
      height: tableRect.height,
    },
  };
}

/**
 * 计算行拖拽指示线的位置
 * @param mouseY 鼠标 Y 坐标
 * @param tableElement 表格元素
 * @param containerRect 容器 rect
 * @param sourceIndex 源行索引
 * @returns 指示线位置信息，或 null（如果是无效位置）
 */
export function calculateRowDragIndicator(
  mouseY: number,
  tableElement: HTMLTableElement,
  containerRect: DOMRect,
  sourceIndex: number,
): DragIndicatorPosition | null {
  const rows = getRowPositions(tableElement);
  const tableRect = tableElement.getBoundingClientRect();

  let targetIndex = 0;
  let insertPosition: 'before' | 'after' = 'before';
  let indicatorY = rows[0]?.top ?? tableRect.top;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowCenter = row.top + row.height / 2;

    if (mouseY < rowCenter) {
      targetIndex = i;
      insertPosition = 'before';
      indicatorY = row.top;
      break;
    } else {
      targetIndex = i;
      insertPosition = 'after';
      indicatorY = row.top + row.height;
    }
  }

  // 不允许拖到自己的位置
  const isSamePosition =
    (insertPosition === 'before' && targetIndex === sourceIndex) ||
    (insertPosition === 'after' && targetIndex === sourceIndex) ||
    (insertPosition === 'before' && targetIndex === sourceIndex + 1) ||
    (insertPosition === 'after' && targetIndex === sourceIndex - 1);

  if (isSamePosition) {
    return null;
  }

  return {
    targetIndex,
    insertPosition,
    indicatorStyle: {
      left: tableRect.left - containerRect.left,
      top: indicatorY - containerRect.top,
      width: tableRect.width,
      height: 3,
    },
  };
}

/**
 * 应用拖拽指示线位置到 DOM
 */
export function applyDragIndicatorPosition(
  indicator: HTMLElement,
  position: DragIndicatorPosition,
  type: 'col' | 'row',
): void {
  indicator.dataset.type = type;
  indicator.dataset.show = 'true';
  indicator.style.left = `${position.indicatorStyle.left}px`;
  indicator.style.top = `${position.indicatorStyle.top}px`;
  indicator.style.width =
    typeof position.indicatorStyle.width === 'number'
      ? `${position.indicatorStyle.width}px`
      : position.indicatorStyle.width;
  indicator.style.height =
    typeof position.indicatorStyle.height === 'number'
      ? `${position.indicatorStyle.height}px`
      : position.indicatorStyle.height;
}

/**
 * 隐藏拖拽指示线
 */
export function hideDragIndicator(indicator: HTMLElement | null): void {
  if (indicator) {
    indicator.dataset.show = 'false';
  }
}

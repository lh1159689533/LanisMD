/**
 * Table Column Resize Plugin
 *
 * 为表格添加列宽拖拽调整功能：
 * - 在列边界处显示可拖拽的分隔线
 * - 拖动调整列宽度
 * - 仅在编辑时生效，不持久化到 Markdown
 *
 * 基于 ProseMirror Plugin 实现
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

const TABLE_COLUMN_RESIZE_KEY = new PluginKey('TABLE_COLUMN_RESIZE');

// Minimum column width in pixels
const MIN_COLUMN_WIDTH = 50;

interface ResizeState {
  // The table element being resized
  table: HTMLTableElement | null;
  // The column index being resized
  colIndex: number;
  // Starting X position of the drag
  startX: number;
  // Starting width of the column
  startWidth: number;
  // The resize handle element
  handle: HTMLElement | null;
  // Resize indicator line
  indicator: HTMLElement | null;
}

let resizeState: ResizeState = {
  table: null,
  colIndex: -1,
  startX: 0,
  startWidth: 0,
  handle: null,
  indicator: null,
};

/**
 * Find the cell element from a mouse event
 */
function findCellFromEvent(event: MouseEvent): HTMLTableCellElement | null {
  const target = event.target as HTMLElement;
  return target.closest('th, td') as HTMLTableCellElement | null;
}

/**
 * Find the table element from a cell
 */
function findTableFromCell(cell: HTMLTableCellElement): HTMLTableElement | null {
  return cell.closest('table') as HTMLTableElement | null;
}

/**
 * Check if the mouse is near the right edge of a cell (within 8px)
 */
function isNearRightEdge(cell: HTMLTableCellElement, clientX: number): boolean {
  const rect = cell.getBoundingClientRect();
  return clientX >= rect.right - 8 && clientX <= rect.right + 4;
}

/**
 * Get the column index of a cell
 */
function getColumnIndex(cell: HTMLTableCellElement): number {
  let index = 0;
  let sibling = cell.previousElementSibling as HTMLTableCellElement | null;
  while (sibling) {
    index += sibling.colSpan || 1;
    sibling = sibling.previousElementSibling as HTMLTableCellElement | null;
  }
  return index;
}

/**
 * Set column width for all cells in a column
 * 同时设置 colgroup/col 和所有单元格的宽度
 */
function setColumnWidth(table: HTMLTableElement, colIndex: number, width: number) {
  // 1. 确保表格使用固定布局
  table.style.tableLayout = 'fixed';

  // 2. 计算表格的新总宽度
  const rows = table.querySelectorAll('tr');
  const firstRow = rows[0];
  if (!firstRow) return;

  const cells = firstRow.querySelectorAll('th, td');
  let totalWidth = 0;
  let currentIndex = 0;

  cells.forEach((cell) => {
    const cellElement = cell as HTMLTableCellElement;
    const colspan = cellElement.colSpan || 1;
    if (currentIndex === colIndex) {
      totalWidth += width;
    } else {
      // 使用当前单元格宽度，如果没设置则获取实际宽度
      const currentWidth = cellElement.style.width
        ? parseInt(cellElement.style.width, 10)
        : cellElement.getBoundingClientRect().width;
      totalWidth += currentWidth;
    }
    currentIndex += colspan;
  });

  // 3. 设置表格总宽度（确保表格能容纳所有列）
  // table.style.width = `${totalWidth}px`;
  // table.style.minWidth = `${totalWidth}px`;

  // 4. 更新或创建 colgroup
  let colgroup = table.querySelector('colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    const colCount = cells.length;
    for (let i = 0; i < colCount; i++) {
      colgroup.appendChild(document.createElement('col'));
    }
    table.insertBefore(colgroup, table.firstChild);
  }

  // 5. 设置 col 宽度
  const cols = colgroup.querySelectorAll('col');
  if (cols[colIndex]) {
    (cols[colIndex] as HTMLElement).style.width = `${width}px`;
  }

  // 6. 设置所有单元格宽度
  rows.forEach((row) => {
    const rowCells = row.querySelectorAll('th, td');
    let cellIndex = 0;
    rowCells.forEach((cell) => {
      const cellElement = cell as HTMLTableCellElement;
      const colspan = cellElement.colSpan || 1;
      if (cellIndex === colIndex) {
        cellElement.style.width = `${width}px`;
        cellElement.style.minWidth = `${width}px`;
        cellElement.style.maxWidth = `${width}px`;
      }
      cellIndex += colspan;
    });
  });
}

/**
 * Get the current width of a column
 */
function getColumnWidth(table: HTMLTableElement, colIndex: number): number {
  const firstRow = table.querySelector('tr');
  if (!firstRow) return MIN_COLUMN_WIDTH;

  const cells = firstRow.querySelectorAll('th, td');
  let currentIndex = 0;
  for (const cell of cells) {
    const cellElement = cell as HTMLTableCellElement;
    const colspan = cellElement.colSpan || 1;
    if (currentIndex === colIndex) {
      return cellElement.getBoundingClientRect().width;
    }
    currentIndex += colspan;
  }
  return MIN_COLUMN_WIDTH;
}

/**
 * Create a resize indicator line
 */
function createResizeIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'resize-cursor-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent, #2563eb);
    pointer-events: none;
    z-index: 1000;
    display: none;
  `;
  document.body.appendChild(indicator);
  return indicator;
}

/**
 * Handle mouse move during resize
 */
function handleMouseMove(event: MouseEvent) {
  if (!resizeState.table || resizeState.colIndex < 0) return;

  const deltaX = event.clientX - resizeState.startX;
  const newWidth = Math.max(MIN_COLUMN_WIDTH, resizeState.startWidth + deltaX);

  setColumnWidth(resizeState.table, resizeState.colIndex, newWidth);

  // Update indicator position
  if (resizeState.indicator) {
    resizeState.indicator.style.left = `${event.clientX}px`;
  }
}

/**
 * Handle mouse up to end resize
 */
function handleMouseUp() {
  if (resizeState.indicator) {
    resizeState.indicator.style.display = 'none';
  }

  // Reset cursor
  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  // Remove event listeners
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);

  // Reset state
  resizeState = {
    table: null,
    colIndex: -1,
    startX: 0,
    startWidth: 0,
    handle: null,
    indicator: resizeState.indicator, // Keep the indicator element
  };
}

/**
 * Start column resize
 */
function startResize(
  table: HTMLTableElement,
  colIndex: number,
  startX: number,
  startWidth: number,
) {
  // Create indicator if not exists
  if (!resizeState.indicator) {
    resizeState.indicator = createResizeIndicator();
  }

  resizeState = {
    ...resizeState,
    table,
    colIndex,
    startX,
    startWidth,
  };

  // Show indicator
  if (resizeState.indicator) {
    resizeState.indicator.style.display = 'block';
    resizeState.indicator.style.left = `${startX}px`;
  }

  // Set cursor for entire document during drag
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  // Add event listeners
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

/**
 * Create the table column resize plugin
 */
export const tableColumnResizePlugin = $prose(() => {
  return new Plugin({
    key: TABLE_COLUMN_RESIZE_KEY,
    props: {
      handleDOMEvents: {
        mousemove(view: EditorView, event: MouseEvent) {
          // Don't interfere if we're in the middle of a resize
          if (resizeState.table) return false;

          const cell = findCellFromEvent(event);
          if (!cell) {
            // Reset cursor when not over a cell
            view.dom.style.cursor = '';
            return false;
          }

          // Check if near right edge of cell
          if (isNearRightEdge(cell, event.clientX)) {
            view.dom.style.cursor = 'col-resize';
          } else {
            view.dom.style.cursor = '';
          }

          return false;
        },

        mousedown(view: EditorView, event: MouseEvent) {
          const cell = findCellFromEvent(event);
          if (!cell) return false;

          // Only start resize if near right edge
          if (!isNearRightEdge(cell, event.clientX)) return false;

          const table = findTableFromCell(cell);
          if (!table) return false;

          // Prevent default to avoid text selection
          event.preventDefault();

          const colIndex = getColumnIndex(cell);
          const startWidth = getColumnWidth(table, colIndex);

          startResize(table, colIndex, event.clientX, startWidth);

          return true;
        },
      },
    },
  });
});

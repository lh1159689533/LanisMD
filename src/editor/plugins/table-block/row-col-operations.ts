/**
 * Table Block Plugin - Row/Column Operations
 *
 * 行列操作业务逻辑（类，有状态，依赖 EditorView）
 */

import type { EditorView } from '@milkdown/kit/prose/view';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  CellSelection,
  TableMap,
} from '@milkdown/kit/prose/tables';
import type { HandleType, TableInfo } from './types';

// ---------------------------------------------------------------------------
// Table Operations Class
// ---------------------------------------------------------------------------

export class TableOperations {
  constructor(private getView: () => EditorView | null) {}

  // ---------------------------------------------------------------------------
  // Command Execution
  // ---------------------------------------------------------------------------

  /**
   * 执行 ProseMirror 命令
   */
  private executeCommand(command: (state: any, dispatch?: any) => boolean): boolean {
    const view = this.getView();
    if (!view) return false;
    const result = command(view.state, view.dispatch);
    view.focus();
    return result;
  }

  // ---------------------------------------------------------------------------
  // Table Info
  // ---------------------------------------------------------------------------

  /**
   * 获取表格信息
   */
  getTableInfo(tableElement: HTMLTableElement | null): TableInfo | null {
    const view = this.getView();
    if (!view || !tableElement) return null;

    const { state } = view;
    let tablePos = -1;

    state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const dom = view.nodeDOM(pos) as HTMLElement;
        if (dom && (dom === tableElement || dom.contains(tableElement))) {
          tablePos = pos;
          return false;
        }
      }
      return true;
    });

    if (tablePos === -1) return null;

    const tableNode = state.doc.nodeAt(tablePos);
    if (!tableNode) return null;

    try {
      const map = TableMap.get(tableNode);
      return { tablePos, tableNode, map };
    } catch {
      return null;
    }
  }

  /**
   * 获取表格中普通行（table_row）的数量
   */
  getTableRowCount(tableElement: HTMLTableElement | null): number {
    const tableInfo = this.getTableInfo(tableElement);
    if (!tableInfo) return 0;

    let rowCount = 0;
    tableInfo.tableNode.forEach((row: any) => {
      if (row.type.name === 'table_row') {
        rowCount++;
      }
    });
    return rowCount;
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  /**
   * 选中行或列
   * @returns 是否成功选中
   */
  selectRowOrColumn(
    type: HandleType,
    colIndex: string | undefined,
    rowIndex: string | undefined,
    tableElement: HTMLTableElement | null,
  ): boolean {
    const view = this.getView();
    if (!view) return false;

    const { state, dispatch } = view;

    // 首先尝试从 tableElement
    let tableDOM = tableElement;

    // 如果 tableDOM 无效或不在 DOM 中，标记为 null
    if (tableDOM && !document.contains(tableDOM)) {
      tableDOM = null;
    }

    // 查找表格在文档中的位置
    let tablePos = -1;
    let foundTableNode: any = null;

    state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const dom = view.nodeDOM(pos) as HTMLElement;
        if (!dom) return true;

        // 如果有 tableDOM，精确匹配
        if (tableDOM) {
          if (dom === tableDOM || dom.contains(tableDOM) || tableDOM.contains(dom)) {
            tablePos = pos;
            foundTableNode = node;
            return false;
          }
        } else {
          // 没有 tableDOM 时，检查这个表格是否包含有效的行/列索引
          const rows = dom.querySelectorAll('tr');
          if (type === 'row' && rowIndex !== undefined) {
            const targetRowIndex = parseInt(rowIndex);
            if (targetRowIndex < rows.length) {
              tablePos = pos;
              foundTableNode = node;
              return false;
            }
          } else if (type === 'col' && colIndex !== undefined) {
            if (rows.length > 0) {
              tablePos = pos;
              foundTableNode = node;
              return false;
            }
          }
        }
      }
      return true;
    });

    if (tablePos === -1) return false;

    const tableNode = foundTableNode || state.doc.nodeAt(tablePos);
    if (!tableNode || tableNode.type.name !== 'table') return false;

    try {
      const map = TableMap.get(tableNode);

      if (type === 'col' && colIndex !== undefined) {
        const col = parseInt(colIndex);
        // 选中整列
        const anchorCell = map.positionAt(0, col, tableNode);
        const headCell = map.positionAt(map.height - 1, col, tableNode);
        const $anchor = state.doc.resolve(tablePos + anchorCell + 1);
        const $head = state.doc.resolve(tablePos + headCell + 1);
        const selection = new CellSelection($anchor, $head);
        dispatch(state.tr.setSelection(selection));
        return true;
      } else if (type === 'row' && rowIndex !== undefined) {
        const row = parseInt(rowIndex);
        // 选中整行
        const anchorCell = map.positionAt(row, 0, tableNode);
        const headCell = map.positionAt(row, map.width - 1, tableNode);
        const $anchor = state.doc.resolve(tablePos + anchorCell + 1);
        const $head = state.doc.resolve(tablePos + headCell + 1);
        const selection = new CellSelection($anchor, $head);
        dispatch(state.tr.setSelection(selection));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 选中最后一个单元格（用于添加行/列）
   */
  selectLastCellForAdd(type: 'col' | 'row', tableElement: HTMLTableElement | null): void {
    const view = this.getView();
    if (!view || !tableElement) return;

    const { state, dispatch } = view;

    // 查找表格在文档中的位置
    let tablePos = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const dom = view.nodeDOM(pos) as HTMLElement;
        if (dom && (dom === tableElement || dom.contains(tableElement))) {
          tablePos = pos;
          return false;
        }
      }
      return true;
    });

    if (tablePos === -1) return;

    const tableNode = state.doc.nodeAt(tablePos);
    if (!tableNode) return;

    try {
      const map = TableMap.get(tableNode);

      let targetCellPos: number;
      if (type === 'col') {
        // 选中最后一列的第一个单元格
        targetCellPos = map.positionAt(0, map.width - 1, tableNode);
      } else {
        // 选中最后一行的第一个单元格
        targetCellPos = map.positionAt(map.height - 1, 0, tableNode);
      }

      const $cell = state.doc.resolve(tablePos + targetCellPos + 1);
      const selection = new CellSelection($cell, $cell);
      dispatch(state.tr.setSelection(selection));
    } catch {
      // 如果选中失败，忽略错误
    }
  }

  // ---------------------------------------------------------------------------
  // Insert Operations
  // ---------------------------------------------------------------------------

  /**
   * 插入列
   * @returns 新列的索引
   */
  insertColumn(direction: 'before' | 'after', currentColIndex: number): number {
    if (direction === 'before') {
      this.executeCommand(addColumnBefore);
      // 在左侧插入，新列在当前位置
      return currentColIndex;
    } else {
      this.executeCommand(addColumnAfter);
      // 在右侧插入，新列在 currentColIndex + 1
      return currentColIndex + 1;
    }
  }

  /**
   * 插入行
   * @returns 新行的索引
   */
  insertRow(direction: 'before' | 'after', currentRowIndex: number): number {
    if (direction === 'before') {
      this.executeCommand(addRowBefore);
      // 在上方插入，新行在当前位置
      return currentRowIndex;
    } else {
      this.executeCommand(addRowAfter);
      // 在下方插入，新行在 currentRowIndex + 1
      return currentRowIndex + 1;
    }
  }

  /**
   * 添加列到末尾
   */
  addColumnAtEnd(): void {
    this.executeCommand(addColumnAfter);
  }

  /**
   * 添加行到末尾
   */
  addRowAtEnd(): void {
    this.executeCommand(addRowAfter);
  }

  // ---------------------------------------------------------------------------
  // Delete Operations
  // ---------------------------------------------------------------------------

  /**
   * 删除列
   * @returns 删除后应该定位到的列索引，或 -1 表示表格已删除
   */
  deleteColumn(currentColIndex: number, tableElement: HTMLTableElement | null): number {
    const view = this.getView();
    if (!view || !tableElement) return -1;

    const tableInfo = this.getTableInfo(tableElement);
    if (!tableInfo) return -1;

    const totalCols = tableInfo.map.width;

    // 如果只有一列，删除整个表格
    if (totalCols <= 1) {
      const { state, dispatch } = view;
      const tr = state.tr.delete(
        tableInfo.tablePos,
        tableInfo.tablePos + tableInfo.tableNode.nodeSize,
      );
      dispatch(tr);
      view.focus();
      return -1; // 表格已删除
    }

    // 执行删除命令
    this.executeCommand(deleteColumn);

    // 计算新的目标列索引
    if (currentColIndex >= totalCols - 1) {
      // 删除的是最后一列，定位到新的最后一列
      return totalCols - 2;
    } else {
      // 定位到"下一列"（原来右边的列，删除后索引不变）
      return currentColIndex;
    }
  }

  /**
   * 删除行
   * @returns 删除后应该定位到的行索引，或 -1 表示表格已删除
   */
  deleteRow(currentRowIndex: number, tableElement: HTMLTableElement | null): number {
    const view = this.getView();
    if (!view || !tableElement) return -1;

    const tableInfo = this.getTableInfo(tableElement);
    if (!tableInfo) return -1;

    const totalRows = tableInfo.map.height;

    // 如果只有一行，删除整个表格
    if (totalRows <= 1) {
      const { state, dispatch } = view;
      const tr = state.tr.delete(
        tableInfo.tablePos,
        tableInfo.tablePos + tableInfo.tableNode.nodeSize,
      );
      dispatch(tr);
      view.focus();
      return -1; // 表格已删除
    }

    // 执行删除命令
    const deleteResult = deleteRow(view.state, view.dispatch);
    if (!deleteResult) return currentRowIndex;

    view.focus();

    // 计算新的目标行索引
    if (currentRowIndex >= totalRows - 1) {
      // 删除的是最后一行，定位到新的最后一行
      return totalRows - 2;
    } else {
      // 定位到"下一行"（原来下方的行，删除后索引不变）
      return currentRowIndex;
    }
  }

  // ---------------------------------------------------------------------------
  // Alignment
  // ---------------------------------------------------------------------------

  /**
   * 设置列对齐方式
   */
  setColumnAlign(
    colIndex: number,
    align: 'left' | 'center' | 'right',
    tableElement: HTMLTableElement | null,
  ): void {
    const view = this.getView();
    if (!view || !tableElement) return;

    const { state, dispatch } = view;

    // 查找表格位置
    let tablePos = -1;
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const dom = view.nodeDOM(pos) as HTMLElement;
        if (dom && (dom === tableElement || dom.contains(tableElement))) {
          tablePos = pos;
          return false;
        }
      }
      return true;
    });

    if (tablePos === -1) return;

    const tableNode = state.doc.nodeAt(tablePos);
    if (!tableNode) return;

    let tr = state.tr;

    // 遍历表格所有行，设置对应列的对齐方式
    let rowOffset = 1; // 跳过 table 开始标记
    tableNode.forEach((row) => {
      if (row.type.name === 'table_row' || row.type.name === 'table_header_row') {
        let cellIndex = 0;
        let cellOffset = 1; // 跳过 table_row/table_header_row 开始标记
        row.forEach((cell) => {
          if (cellIndex === colIndex) {
            const cellPos = tablePos + rowOffset + cellOffset;
            tr = tr.setNodeMarkup(cellPos, undefined, {
              ...cell.attrs,
              alignment: align,
            });
          }
          cellIndex += cell.attrs.colspan || 1;
          cellOffset += cell.nodeSize;
        });
      }
      rowOffset += row.nodeSize;
    });

    dispatch(tr);
    view.focus();
  }

  // ---------------------------------------------------------------------------
  // Move Operations (for Drag & Drop)
  // ---------------------------------------------------------------------------

  /**
   * 移动列
   */
  moveColumn(fromIndex: number, toIndex: number, tableElement: HTMLTableElement | null): void {
    const view = this.getView();
    if (!view) return;

    const tableInfo = this.getTableInfo(tableElement);
    if (!tableInfo) return;

    const { state, dispatch } = view;
    const { tableNode, tablePos, map } = tableInfo;

    const colCount = map.width;

    // 收集所有行并重新排列列
    const newRows: any[] = [];

    tableNode.forEach((rowNode: any) => {
      const cells: any[] = [];
      rowNode.forEach((cell: any) => {
        cells.push(cell);
      });

      // 重新排列单元格
      const newCells: any[] = [];
      for (let col = 0; col < colCount; col++) {
        let sourceCol: number;
        if (col === toIndex) {
          sourceCol = fromIndex;
        } else if (fromIndex < toIndex) {
          // 向右移动：fromIndex 到 toIndex-1 的列需要左移一位
          if (col >= fromIndex && col < toIndex) {
            sourceCol = col + 1;
          } else {
            sourceCol = col;
          }
        } else {
          // 向左移动：toIndex+1 到 fromIndex 的列需要右移一位
          if (col > toIndex && col <= fromIndex) {
            sourceCol = col - 1;
          } else {
            sourceCol = col;
          }
        }
        newCells.push(cells[sourceCol]);
      }

      const newRowNode = rowNode.type.create(rowNode.attrs, newCells);
      newRows.push(newRowNode);
    });

    const newTableNode = tableNode.type.create(tableNode.attrs, newRows);
    const tr = state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTableNode);

    dispatch(tr);
    view.focus();
  }

  /**
   * 移动行
   */
  moveRow(fromIndex: number, toIndex: number, tableElement: HTMLTableElement | null): void {
    const view = this.getView();
    if (!view) return;

    const tableInfo = this.getTableInfo(tableElement);
    if (!tableInfo) return;

    const { state, dispatch } = view;
    const { tableNode, tablePos, map } = tableInfo;

    const rowCount = map.height;

    // 收集所有行
    const rows: any[] = [];
    tableNode.forEach((rowNode: any) => {
      rows.push(rowNode);
    });

    // 重新排列行
    const newRows: any[] = [];
    for (let row = 0; row < rowCount; row++) {
      let sourceRow: number;
      if (row === toIndex) {
        sourceRow = fromIndex;
      } else if (fromIndex < toIndex) {
        // 向下移动：fromIndex 到 toIndex-1 的行需要上移一位
        if (row >= fromIndex && row < toIndex) {
          sourceRow = row + 1;
        } else {
          sourceRow = row;
        }
      } else {
        // 向上移动：toIndex+1 到 fromIndex 的行需要下移一位
        if (row > toIndex && row <= fromIndex) {
          sourceRow = row - 1;
        } else {
          sourceRow = row;
        }
      }
      newRows.push(rows[sourceRow]);
    }

    const newTableNode = tableNode.type.create(tableNode.attrs, newRows);
    const tr = state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTableNode);

    dispatch(tr);
    view.focus();
  }
}

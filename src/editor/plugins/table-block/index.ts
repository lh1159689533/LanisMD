/**
 * Table Handle Plugin
 *
 * 自定义表格增强插件，实现 Notion 风格的表格操作：
 * - 六状态机手柄交互
 * - 行/列操作（添加、删除、对齐）
 * - 行/列选中高亮
 * - 行/列拖拽排序
 *
 * 模块结构：
 * - types.ts: 类型定义、常量、图标
 * - state-machine.ts: 状态机逻辑
 * - dom-factory.ts: DOM 创建工厂
 * - positioning.ts: 定位计算
 * - row-col-operations.ts: 行列操作
 * - drag-drop.ts: 拖拽排序
 * - index.ts: 插件入口（本文件）
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, type Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { TableMap } from '@milkdown/kit/prose/tables';

// 导入各模块
import {
  PLUGIN_KEY,
  HIGHLIGHT_META_KEY,
  HIDE_DELAY,
  createInitialStateContext,
  createInitialElements,
  createInitialHighlightState,
  type StateContext,
  type HandleElements,
  type HandleState,
  type HandleType,
  type SelectionHighlightState,
} from './types';

import { transitionState, isSelected } from './state-machine';

import {
  createHandleElement,
  createAddLine,
  createDragIndicator,
  updateInsertRowAboveButtonVisibility,
  updateDeleteRowButtonState,
  updateMenuVisibility,
  type HandleCallbacks,
  type MenuCallbacks,
  type AddLineCallbacks,
} from './dom-factory';

import {
  getPositionContainer,
  clearPositionContainerCache,
  calculateHandlePositions,
  applyHandlePositions,
} from './positioning';

import { TableOperations } from './row-col-operations';
import { DragDropManager } from './drag-drop';

// Re-export schema extension
export { extendedTableSchema } from './schema-extend';

// ---------------------------------------------------------------------------
// Plugin Context Class
// ---------------------------------------------------------------------------

/**
 * 插件上下文类 - 整合所有模块
 */
class TableHandlePluginContext {
  // 状态
  private stateContext: StateContext = createInitialStateContext();
  private elements: HandleElements = createInitialElements();
  private currentView: EditorView | null = null;
  private currentFocusedCell: HTMLTableCellElement | null = null;
  private isInteractingWithHandle = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  // 模块实例
  private tableOperations: TableOperations;
  private dragDropManager: DragDropManager;

  constructor() {
    // 创建 TableOperations 实例
    this.tableOperations = new TableOperations(() => this.currentView);

    // 创建 DragDropManager 实例
    this.dragDropManager = new DragDropManager(
      () => this.tableOperations,
      () => this.elements,
      () => this.stateContext.tableElement,
      (type, newIndex) => this.repositionHandleToIndex(type, newIndex),
    );
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  getView(): EditorView | null {
    return this.currentView;
  }

  isDragging(): boolean {
    return this.dragDropManager.isDragging();
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  private setState(newState: HandleState): void {
    this.stateContext.state = newState;
    this.updateHandleVisuals();
  }

  private updateHandleVisuals(): void {
    const { state, type } = this.stateContext;

    // 更新列手柄
    if (this.elements.colHandle) {
      const newState = type === 'col' ? state : state === 'hidden' ? 'hidden' : 'bar';
      this.elements.colHandle.dataset.state = newState;
      updateMenuVisibility(this.elements.colHandle, type === 'col' && state === 'selected');
    }

    // 更新行手柄
    if (this.elements.rowHandle) {
      this.elements.rowHandle.dataset.state =
        type === 'row' ? state : state === 'hidden' ? 'hidden' : 'bar';
      updateMenuVisibility(this.elements.rowHandle, type === 'row' && state === 'selected');
      // 根据当前行是否为表头行更新按钮显示/状态
      updateInsertRowAboveButtonVisibility(this.elements.rowHandle);
      updateDeleteRowButtonState(
        this.elements.rowHandle,
        this.tableOperations.getTableRowCount(this.stateContext.tableElement),
      );
    }

    // 更新添加线
    const showAddLines = state !== 'hidden';
    if (this.elements.colAddLine) {
      this.elements.colAddLine.dataset.show = showAddLines ? 'true' : 'false';
    }
    if (this.elements.rowAddLine) {
      this.elements.rowAddLine.dataset.show = showAddLines ? 'true' : 'false';
    }

    // 更新行列高亮
    this.updateSelectionHighlight();
  }

  private updateSelectionHighlight(): void {
    if (!this.currentView) return;

    const { state, type, tableElement } = this.stateContext;

    // 如果不是选中状态，清除高亮
    if (!isSelected(state)) {
      const tr = this.currentView.state.tr.setMeta(HIGHLIGHT_META_KEY, {
        type: null,
        index: null,
        tablePos: null,
      } as SelectionHighlightState);
      this.currentView.dispatch(tr);
      return;
    }

    if (!tableElement) return;

    // 从 dataset 中获取索引
    const colIndex = this.elements.colHandle?.dataset.colIndex;
    const rowIndex = this.elements.rowHandle?.dataset.rowIndex;
    const index =
      type === 'col'
        ? colIndex !== undefined
          ? parseInt(colIndex)
          : null
        : rowIndex !== undefined
          ? parseInt(rowIndex)
          : null;

    if (index === null) return;

    // 查找表格在文档中的位置
    let tablePos = -1;
    this.currentView.state.doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const dom = this.currentView!.nodeDOM(pos) as HTMLElement;
        if (dom && (dom === tableElement || dom.contains(tableElement))) {
          tablePos = pos;
          return false;
        }
      }
      return true;
    });

    if (tablePos === -1) return;

    // 发送高亮状态
    const tr = this.currentView.state.tr.setMeta(HIGHLIGHT_META_KEY, {
      type,
      index,
      tablePos,
    } as SelectionHighlightState);
    this.currentView.dispatch(tr);
  }

  // ---------------------------------------------------------------------------
  // Positioning
  // ---------------------------------------------------------------------------

  private positionHandles(
    cell: HTMLTableCellElement,
    table: HTMLTableElement,
    view?: EditorView,
  ): void {
    const container = getPositionContainer(view || this.currentView || undefined);
    if (!container) return;

    // 确保容器有相对定位
    const containerStyle = getComputedStyle(container);
    if (containerStyle.position === 'static') {
      container.style.position = 'relative';
    }

    const positions = calculateHandlePositions(cell, table, container);
    const { colIndex, rowIndex } = applyHandlePositions(positions, this.elements, cell, table);

    this.stateContext.tableElement = table;
    this.stateContext.index = this.stateContext.type === 'col' ? colIndex : rowIndex;
  }

  private repositionHandleToIndex(type: HandleType, index: number): void {
    if (!this.currentView) return;

    requestAnimationFrame(() => {
      if (!this.currentView) return;

      let tableNode: HTMLTableElement | null = null;

      // 优先使用已保存的表格元素（拖拽场景下这是正确的源表格）
      if (this.stateContext.tableElement && document.contains(this.stateContext.tableElement)) {
        tableNode = this.stateContext.tableElement;
      } else {
        // 否则从选区位置查找表格
        const { state } = this.currentView;
        const { selection } = state;
        const $from = selection.$from;

        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'table') {
            const pos = $from.before(d);
            const dom = this.currentView.nodeDOM(pos) as HTMLElement;
            if (dom && dom.tagName === 'TABLE') {
              tableNode = dom as HTMLTableElement;
            }
            break;
          }
        }
      }

      if (!tableNode) return;

      this.stateContext.tableElement = tableNode;

      const rows = tableNode.querySelectorAll('tr');
      if (rows.length === 0) return;

      let targetCell: HTMLTableCellElement | null = null;

      if (type === 'col') {
        const firstRow = rows[0];
        const cells = firstRow.querySelectorAll('th, td');
        if (index >= 0 && index < cells.length) {
          targetCell = cells[index] as HTMLTableCellElement;
        }
      } else {
        if (index >= 0 && index < rows.length) {
          const targetRow = rows[index];
          targetCell = targetRow.querySelector('th, td') as HTMLTableCellElement;
        }
      }

      if (targetCell) {
        this.currentFocusedCell = targetCell;
        this.positionHandles(targetCell, tableNode);

        if (type === 'col' && this.elements.colHandle) {
          this.elements.colHandle.dataset.colIndex = String(index);
        } else if (type === 'row' && this.elements.rowHandle) {
          this.elements.rowHandle.dataset.rowIndex = String(index);
        }

        this.stateContext.type = type;
        this.stateContext.index = index;
        this.stateContext.state = 'selected';

        this.isInteractingWithHandle = true;
        this.updateHandleVisuals();
        this.selectRowOrColumn();

        setTimeout(() => {
          this.isInteractingWithHandle = false;
        }, 50);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  private selectRowOrColumn(): boolean {
    const colIndex = this.elements.colHandle?.dataset.colIndex;
    const rowIndex = this.elements.rowHandle?.dataset.rowIndex;

    return this.tableOperations.selectRowOrColumn(
      this.stateContext.type!,
      colIndex,
      rowIndex,
      this.stateContext.tableElement,
    );
  }

  private handleInsertColumn(direction: 'before' | 'after'): void {
    const colIndex = this.elements.colHandle?.dataset.colIndex;
    if (colIndex === undefined) return;

    const currentColIndex = parseInt(colIndex);

    // 确保选中
    this.selectRowOrColumn();

    const newIndex = this.tableOperations.insertColumn(direction, currentColIndex);
    this.repositionHandleToIndex('col', newIndex);
  }

  private handleInsertRow(direction: 'before' | 'after'): void {
    const rowIndex = this.elements.rowHandle?.dataset.rowIndex;
    if (rowIndex === undefined) return;

    const currentRowIndex = parseInt(rowIndex);

    // 确保选中
    this.selectRowOrColumn();

    const newIndex = this.tableOperations.insertRow(direction, currentRowIndex);
    this.repositionHandleToIndex('row', newIndex);
  }

  private handleDeleteColumn(): void {
    const colIndex = this.elements.colHandle?.dataset.colIndex;
    if (colIndex === undefined) return;

    const currentColIndex = parseInt(colIndex);

    // 确保选中
    this.selectRowOrColumn();

    // 删除前记录表格位置，用于删除后重新定位
    const tableInfo = this.tableOperations.getTableInfo(this.stateContext.tableElement);
    const tablePos = tableInfo?.tablePos ?? -1;

    const newIndex = this.tableOperations.deleteColumn(
      currentColIndex,
      this.stateContext.tableElement,
    );

    if (newIndex === -1) {
      // 表格已删除
      this.stateContext.state = 'hidden';
      this.stateContext.tableElement = null;
      this.currentFocusedCell = null;
      this.updateHandleVisuals();
    } else {
      // 删除后 DOM 会重建，需要根据位置重新获取表格元素
      this.refreshTableElementByPos(tablePos);
      this.repositionHandleToIndex('col', newIndex);
    }
  }

  private handleDeleteRow(): void {
    const rowIndex = this.elements.rowHandle?.dataset.rowIndex;
    if (rowIndex === undefined) return;

    const currentRowIndex = parseInt(rowIndex);

    // 确保 type 正确
    this.stateContext.type = 'row';

    // 确保选中
    const selectionCreated = this.selectRowOrColumn();
    if (!selectionCreated) return;

    // 删除前记录表格位置，用于删除后重新定位
    const tableInfo = this.tableOperations.getTableInfo(this.stateContext.tableElement);
    const tablePos = tableInfo?.tablePos ?? -1;

    const newIndex = this.tableOperations.deleteRow(
      currentRowIndex,
      this.stateContext.tableElement,
    );

    if (newIndex === -1) {
      // 表格已删除
      this.stateContext.state = 'hidden';
      this.stateContext.tableElement = null;
      this.currentFocusedCell = null;
      this.updateHandleVisuals();
    } else {
      // 删除后 DOM 会重建，需要根据位置重新获取表格元素
      this.refreshTableElementByPos(tablePos);
      this.repositionHandleToIndex('row', newIndex);
    }
  }

  /**
   * 根据表格位置刷新 stateContext.tableElement
   * 用于 DOM 重建后（如删除行/列）重新获取正确的表格引用
   */
  private refreshTableElementByPos(tablePos: number): void {
    if (!this.currentView || tablePos < 0) return;

    const dom = this.currentView.nodeDOM(tablePos) as HTMLElement;
    if (dom && dom.tagName === 'TABLE') {
      this.stateContext.tableElement = dom as HTMLTableElement;
    }
  }

  private handleSetColumnAlign(align: 'left' | 'center' | 'right'): void {
    const colIndex = this.elements.colHandle?.dataset.colIndex;
    if (colIndex === undefined) return;

    this.tableOperations.setColumnAlign(
      parseInt(colIndex),
      align,
      this.stateContext.tableElement,
    );

    // 保持 SELECTED 状态
    this.stateContext.state = 'selected';
    this.updateHandleVisuals();
  }

  private handleAddColumn(): void {
    if (this.stateContext.tableElement && this.currentView) {
      this.tableOperations.selectLastCellForAdd('col', this.stateContext.tableElement);
      setTimeout(() => {
        this.tableOperations.addColumnAtEnd();
      }, 0);
    }
  }

  private handleAddRow(): void {
    if (this.stateContext.tableElement && this.currentView) {
      this.tableOperations.selectLastCellForAdd('row', this.stateContext.tableElement);
      setTimeout(() => {
        this.tableOperations.addRowAtEnd();
      }, 0);
    }
  }

  // ---------------------------------------------------------------------------
  // Timer Management
  // ---------------------------------------------------------------------------

  private startHideTimer(): void {
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => {
      if (!isSelected(this.stateContext.state)) {
        this.setState(transitionState(this.stateContext.state, 'blurTable'));
        this.currentFocusedCell = null;
      }
    }, HIDE_DELAY);
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  handleCellClick(_view: EditorView, event: MouseEvent): boolean {
    const target = event.target as HTMLElement;

    // 检查是否在表格手柄或菜单上
    if (
      target.closest('.table-handle') ||
      target.closest('.button-group') ||
      target.closest('.add-line')
    ) {
      this.isInteractingWithHandle = true;
      return true;
    }

    // 检查是否在表格单元格内
    const cell = target.closest('th, td') as HTMLTableCellElement | null;
    const table = target.closest('table') as HTMLTableElement | null;

    if (cell && table) {
      this.clearHideTimer();
      this.currentFocusedCell = cell;
      this.positionHandles(cell, table);

      if (isSelected(this.stateContext.state)) {
        this.setState(transitionState(this.stateContext.state, 'focusCell'));
      } else if (this.stateContext.state === 'hidden') {
        this.setState(transitionState(this.stateContext.state, 'focusCell'));
      }

      return false;
    }

    // 点击外部区域
    if (isSelected(this.stateContext.state)) {
      this.setState(transitionState(this.stateContext.state, 'clickOutside'));
      this.currentFocusedCell = null;
      return false;
    }

    // 点击表格外部，隐藏手柄
    if (this.stateContext.state !== 'hidden') {
      this.setState(transitionState(this.stateContext.state, 'blurTable'));
      this.currentFocusedCell = null;
    }

    return false;
  }

  handleSelectionChange(view: EditorView): void {
    if (this.isInteractingWithHandle) return;

    const { selection } = view.state;
    const $from = selection.$from;

    let inTable = false;
    let tableNode: HTMLTableElement | null = null;
    let cellNode: HTMLTableCellElement | null = null;

    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'table_cell' || node.type.name === 'table_header') {
        const pos = $from.before(d);
        const dom = view.nodeDOM(pos) as HTMLElement;
        if (dom && (dom.tagName === 'TD' || dom.tagName === 'TH')) {
          cellNode = dom as HTMLTableCellElement;
        }
      }
      if (node.type.name === 'table') {
        const pos = $from.before(d);
        const dom = view.nodeDOM(pos) as HTMLElement;
        if (dom && dom.tagName === 'TABLE') {
          tableNode = dom as HTMLTableElement;
          inTable = true;
        }
        break;
      }
    }

    if (inTable && tableNode && cellNode) {
      this.clearHideTimer();
      this.currentFocusedCell = cellNode;
      this.positionHandles(cellNode, tableNode, view);

      if (this.stateContext.state === 'hidden') {
        this.setState(transitionState(this.stateContext.state, 'focusCell'));
      } else if (isSelected(this.stateContext.state)) {
        this.setState(transitionState(this.stateContext.state, 'focusCell'));
      }
    } else {
      if (this.stateContext.state !== 'hidden') {
        this.startHideTimer();
      }
      this.currentFocusedCell = null;
    }
  }

  handlePointerLeave(_view: EditorView, event: PointerEvent): boolean {
    const relatedTarget = event.relatedTarget as HTMLElement;

    if (relatedTarget?.closest('.table-handle') || relatedTarget?.closest('.add-line')) {
      return false;
    }

    if (this.currentFocusedCell) {
      return false;
    }

    this.startHideTimer();
    return false;
  }

  // ---------------------------------------------------------------------------
  // Plugin View Lifecycle
  // ---------------------------------------------------------------------------

  createView(view: EditorView): {
    update: (view: EditorView) => void;
    destroy: () => void;
  } {
    const instanceView = view;
    this.currentView = view;

    // 重置状态
    this.stateContext = createInitialStateContext();
    this.currentFocusedCell = null;
    this.isInteractingWithHandle = false;
    clearPositionContainerCache();

    // 清理 DOM 中所有现有的手柄元素
    document.querySelectorAll('.table-handle, .add-line, .table-drag-indicator').forEach((el) => {
      el.remove();
    });

    // 创建回调
    const handleCallbacks: HandleCallbacks = {
      onPointerEnter: (type) => {
        this.isInteractingWithHandle = true;
        if (
          this.stateContext.state === 'bar' ||
          this.stateContext.state === 'selected_no_menu'
        ) {
          this.stateContext.type = type;
          this.setState(transitionState(this.stateContext.state, 'pointerEnterHandle'));
        }
      },
      onPointerLeave: (type, relatedTarget) => {
        if (relatedTarget?.closest('.button-group')) return;

        setTimeout(() => {
          this.isInteractingWithHandle = false;
        }, 100);

        if (this.stateContext.state === 'hover') {
          this.setState(transitionState(this.stateContext.state, 'pointerLeaveHandle'));
        }
      },
      onClick: (type, _event) => {
        this.isInteractingWithHandle = true;
        this.stateContext.type = type;

        if (
          this.stateContext.state === 'bar' ||
          this.stateContext.state === 'hover' ||
          this.stateContext.state === 'selected_no_menu'
        ) {
          if (this.stateContext.state === 'bar') {
            this.stateContext.state = 'hover';
          }
          this.setState(transitionState(this.stateContext.state, 'click'));
          this.selectRowOrColumn();
        }
      },
      onDragStart: (type, event) => {
        this.stateContext.type = type;
        this.setState(transitionState(this.stateContext.state, 'dragStart'));

        const colIndex = this.elements.colHandle?.dataset.colIndex;
        const rowIndex = this.elements.rowHandle?.dataset.rowIndex;
        this.dragDropManager.startDrag(event, type, colIndex, rowIndex);
      },
      onDragEnd: (_type) => {
        this.dragDropManager.cleanup();
        this.setState(transitionState(this.stateContext.state, 'dragEnd'));
      },
    };

    const menuCallbacks: MenuCallbacks = {
      onInsertColumn: (direction) => this.handleInsertColumn(direction),
      onInsertRow: (direction) => this.handleInsertRow(direction),
      onDeleteColumn: () => this.handleDeleteColumn(),
      onDeleteRow: () => this.handleDeleteRow(),
      onSetColumnAlign: (align) => this.handleSetColumnAlign(align),
    };

    const addLineCallbacks: AddLineCallbacks = {
      onAddColumn: () => this.handleAddColumn(),
      onAddRow: () => this.handleAddRow(),
    };

    // 创建 DOM 元素
    const colHandle = createHandleElement('col', handleCallbacks, menuCallbacks);
    const rowHandle = createHandleElement('row', handleCallbacks, menuCallbacks);
    const colAddLine = createAddLine('col', addLineCallbacks);
    const rowAddLine = createAddLine('row', addLineCallbacks);
    const dragIndicator = createDragIndicator();

    // 更新 elements 引用
    this.elements = {
      colHandle,
      rowHandle,
      colAddLine,
      rowAddLine,
      dragIndicator,
    };

    // 添加手柄到容器
    const appendHandlesToContainer = (): boolean => {
      const container = getPositionContainer(view);
      if (container) {
        if (!container.contains(colHandle)) container.appendChild(colHandle);
        if (!container.contains(rowHandle)) container.appendChild(rowHandle);
        if (!container.contains(colAddLine)) container.appendChild(colAddLine);
        if (!container.contains(rowAddLine)) container.appendChild(rowAddLine);
        if (!container.contains(dragIndicator)) container.appendChild(dragIndicator);
        return true;
      }
      return false;
    };

    const tryAppendWithRetry = (attempts = 0): void => {
      if (attempts > 10) {
        console.warn('Table handle: Failed to append handles to container after 10 attempts');
        return;
      }
      if (!appendHandlesToContainer()) {
        setTimeout(() => tryAppendWithRetry(attempts + 1), 50 * (attempts + 1));
      }
    };

    tryAppendWithRetry();

    return {
      update: (view: EditorView) => {
        // 确保手柄元素已添加到容器
        if (colHandle && !colHandle.parentElement) {
          appendHandlesToContainer();
        }
        // 监听选区变化
        this.handleSelectionChange(view);
      },
      destroy: () => {
        colHandle?.remove();
        rowHandle?.remove();
        colAddLine?.remove();
        rowAddLine?.remove();
        dragIndicator?.remove();

        this.clearHideTimer();

        if (this.currentView === instanceView) {
          this.currentView = null;
          this.currentFocusedCell = null;
          clearPositionContainerCache();
          this.stateContext = createInitialStateContext();
          this.isInteractingWithHandle = false;
          this.elements = createInitialElements();
        }
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Decoration Helper
// ---------------------------------------------------------------------------

function createSelectionDecorations(
  doc: any,
  highlightState: SelectionHighlightState,
): DecorationSet {
  const { type, index, tablePos } = highlightState;

  if (type === null || index === null || tablePos === null) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = [];
  const tableNode = doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== 'table') {
    return DecorationSet.empty;
  }

  try {
    const map = TableMap.get(tableNode);

    if (type === 'col') {
      const rowCount = map.height;
      for (let row = 0; row < rowCount; row++) {
        const cellPos = map.positionAt(row, index, tableNode);
        const absolutePos = tablePos + cellPos + 1;

        let posAttr = '';
        if (row === 0) {
          posAttr = 'first';
        } else if (row === rowCount - 1) {
          posAttr = 'last';
        }

        const attrs: Record<string, string> = {
          class: 'selected-col',
        };
        if (posAttr) {
          attrs['data-col-select-pos'] = posAttr;
        }

        decorations.push(
          Decoration.node(absolutePos, absolutePos + doc.nodeAt(absolutePos)!.nodeSize, attrs),
        );
      }
    } else if (type === 'row') {
      const colCount = map.width;
      for (let col = 0; col < colCount; col++) {
        const cellPos = map.positionAt(index, col, tableNode);
        const absolutePos = tablePos + cellPos + 1;

        let posAttr = '';
        if (col === 0) {
          posAttr = 'first';
        } else if (col === colCount - 1) {
          posAttr = 'last';
        }

        const attrs: Record<string, string> = {
          class: 'selected-row-cell',
        };
        if (posAttr) {
          attrs['data-row-select-pos'] = posAttr;
        }

        decorations.push(
          Decoration.node(absolutePos, absolutePos + doc.nodeAt(absolutePos)!.nodeSize, attrs),
        );
      }
    }
  } catch {
    return DecorationSet.empty;
  }

  return DecorationSet.create(doc, decorations);
}

// ---------------------------------------------------------------------------
// Plugin Export
// ---------------------------------------------------------------------------

export const tableHandlePlugin = $prose(() => {
  const context = new TableHandlePluginContext();

  return new Plugin({
    key: PLUGIN_KEY,

    state: {
      init(): SelectionHighlightState {
        return createInitialHighlightState();
      },
      apply(tr: Transaction, value: SelectionHighlightState): SelectionHighlightState {
        const meta = tr.getMeta(HIGHLIGHT_META_KEY) as SelectionHighlightState | undefined;
        if (meta !== undefined) {
          return meta;
        }
        if (tr.docChanged && value.tablePos !== null) {
          return createInitialHighlightState();
        }
        return value;
      },
    },

    props: {
      decorations(state) {
        const pluginState = PLUGIN_KEY.getState(state) as SelectionHighlightState | undefined;
        if (!pluginState) {
          return DecorationSet.empty;
        }
        return createSelectionDecorations(state.doc, pluginState);
      },
      handleDrop(_view, event) {
        if (event.dataTransfer?.types.includes('application/x-table-drag')) {
          return true;
        }
        if (context.isDragging()) {
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        click: (view, event) => context.handleCellClick(view, event),
        pointerleave: (view, event) => context.handlePointerLeave(view, event),
      },
    },

    view(view) {
      return context.createView(view);
    },
  });
});

/**
 * Table Block Plugin - Drag & Drop
 *
 * 拖拽排序功能（类，有状态）
 */

import type { HandleType, DragState, HandleElements } from './types';
import { createInitialDragState } from './types';
import {
  getPositionContainer,
  calculateColumnDragIndicator,
  calculateRowDragIndicator,
  applyDragIndicatorPosition,
  hideDragIndicator,
} from './positioning';
import type { TableOperations } from './row-col-operations';

// ---------------------------------------------------------------------------
// Drag Preview Creation
// ---------------------------------------------------------------------------

/**
 * 创建自定义拖拽预览元素
 */
function createCustomDragPreview(
  type: HandleType,
  tableElement: HTMLTableElement,
  colIndex: string | undefined,
  rowIndex: string | undefined,
): { preview: HTMLElement; width: number; height: number } | null {
  const preview = document.createElement('div');
  preview.className = 'drag-preview drag-preview-custom';
  preview.style.position = 'fixed';
  preview.style.zIndex = '10000';
  preview.style.pointerEvents = 'none';
  preview.style.opacity = '0.85';
  preview.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  preview.style.borderRadius = '4px';
  preview.style.overflow = 'hidden';

  let totalWidth = 0;
  let totalHeight = 0;

  if (type === 'col' && colIndex !== undefined) {
    const idx = parseInt(colIndex);
    // 复制整列，保留原始宽高
    const rows = tableElement.querySelectorAll('tr');
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.background = 'white';

    rows.forEach((row, rowIdx) => {
      const newRow = document.createElement('tr');
      const cells = row.querySelectorAll('th, td');
      if (cells[idx]) {
        const originalCell = cells[idx] as HTMLTableCellElement;
        const clonedCell = originalCell.cloneNode(true) as HTMLTableCellElement;

        // 获取原始单元格的实际尺寸
        const cellRect = originalCell.getBoundingClientRect();
        const computedStyle = getComputedStyle(originalCell);

        // 记录尺寸（只需记录一次宽度）
        if (rowIdx === 0) {
          totalWidth = cellRect.width;
        }
        totalHeight += cellRect.height;

        // 设置克隆单元格的精确宽高
        clonedCell.style.width = `${cellRect.width}px`;
        clonedCell.style.minWidth = `${cellRect.width}px`;
        clonedCell.style.maxWidth = `${cellRect.width}px`;
        clonedCell.style.height = `${cellRect.height}px`;
        clonedCell.style.minHeight = `${cellRect.height}px`;
        clonedCell.style.boxSizing = 'border-box';
        clonedCell.style.padding = computedStyle.padding;
        clonedCell.style.backgroundColor = computedStyle.backgroundColor || 'white';
        clonedCell.style.border = computedStyle.border;

        newRow.appendChild(clonedCell);
      }
      table.appendChild(newRow);
    });
    preview.appendChild(table);
  } else if (type === 'row' && rowIndex !== undefined) {
    const idx = parseInt(rowIndex);
    // 复制整行，保留原始宽高
    const rows = tableElement.querySelectorAll('tr');
    if (rows[idx]) {
      const originalRow = rows[idx] as HTMLTableRowElement;
      const table = document.createElement('table');
      table.style.borderCollapse = 'collapse';
      table.style.background = 'white';

      const clonedRow = document.createElement('tr');
      const cells = originalRow.querySelectorAll('th, td');

      cells.forEach((cell, cellIdx) => {
        const originalCell = cell as HTMLTableCellElement;
        const clonedCell = originalCell.cloneNode(true) as HTMLTableCellElement;

        // 获取原始单元格的实际尺寸
        const cellRect = originalCell.getBoundingClientRect();
        const computedStyle = getComputedStyle(originalCell);

        // 记录尺寸
        totalWidth += cellRect.width;
        if (cellIdx === 0) {
          totalHeight = cellRect.height;
        }

        // 设置克隆单元格的精确宽高
        clonedCell.style.width = `${cellRect.width}px`;
        clonedCell.style.minWidth = `${cellRect.width}px`;
        clonedCell.style.maxWidth = `${cellRect.width}px`;
        clonedCell.style.height = `${cellRect.height}px`;
        clonedCell.style.minHeight = `${cellRect.height}px`;
        clonedCell.style.boxSizing = 'border-box';
        clonedCell.style.padding = computedStyle.padding;
        clonedCell.style.backgroundColor = computedStyle.backgroundColor || 'white';
        clonedCell.style.border = computedStyle.border;

        clonedRow.appendChild(clonedCell);
      });

      table.appendChild(clonedRow);
      preview.appendChild(table);
    }
  }

  document.body.appendChild(preview);
  return { preview, width: totalWidth, height: totalHeight };
}

/**
 * 更新自定义拖拽预览元素的位置
 */
function updateCustomPreviewPosition(
  preview: HTMLElement,
  clientX: number,
  clientY: number,
  tableElement: HTMLTableElement,
  sourceType: HandleType,
  previewWidth: number,
  previewHeight: number,
): void {
  const tableRect = tableElement.getBoundingClientRect();

  // 计算允许超出的距离（列宽度或行高度的 1/3）
  const allowedOverflowX = sourceType === 'col' ? previewWidth / 3 : 0;
  const allowedOverflowY = sourceType === 'row' ? previewHeight / 3 : 0;

  // 预览元素的中心应该跟随鼠标
  let previewX = clientX - previewWidth / 2;
  let previewY = clientY - previewHeight / 2;

  if (sourceType === 'col') {
    // 列拖拽：横向允许超出 1/3 宽度，纵向完全不能超出
    const minX = tableRect.left - allowedOverflowX;
    const maxX = tableRect.right - previewWidth + allowedOverflowX;
    const minY = tableRect.top;
    const maxY = tableRect.bottom - previewHeight;

    previewX = Math.max(minX, Math.min(maxX, previewX));
    previewY = Math.max(minY, Math.min(maxY, previewY));
  } else if (sourceType === 'row') {
    // 行拖拽：纵向允许超出 1/3 高度，横向完全不能超出
    const minX = tableRect.left;
    const maxX = tableRect.right - previewWidth;
    const minY = tableRect.top - allowedOverflowY;
    const maxY = tableRect.bottom - previewHeight + allowedOverflowY;

    previewX = Math.max(minX, Math.min(maxX, previewX));
    previewY = Math.max(minY, Math.min(maxY, previewY));
  }

  preview.style.left = `${previewX}px`;
  preview.style.top = `${previewY}px`;
}

// ---------------------------------------------------------------------------
// Drag Drop Manager Class
// ---------------------------------------------------------------------------

export class DragDropManager {
  private dragState: DragState = createInitialDragState();
  private cleanupFn: (() => void) | null = null;

  constructor(
    private getTableOperations: () => TableOperations,
    private getElements: () => HandleElements,
    private getTableElement: () => HTMLTableElement | null,
    private onDragComplete: (type: HandleType, newIndex: number) => void,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * 获取当前拖拽状态
   */
  getDragState(): DragState {
    return this.dragState;
  }

  /**
   * 是否正在拖拽
   */
  isDragging(): boolean {
    return this.dragState.isDragging;
  }

  /**
   * 开始拖拽
   */
  startDrag(
    event: DragEvent,
    type: HandleType,
    colIndex: string | undefined,
    rowIndex: string | undefined,
  ): void {
    if (!event.dataTransfer) return;

    const tableElement = this.getTableElement();
    if (!tableElement) return;

    const index = type === 'col' ? colIndex : rowIndex;

    // 初始化拖拽状态
    this.dragState = {
      isDragging: true,
      sourceType: type,
      sourceIndex: index !== undefined ? parseInt(index) : null,
      targetIndex: null,
      insertPosition: null,
      customPreview: null,
      previewWidth: 0,
      previewHeight: 0,
    };

    event.dataTransfer.effectAllowed = 'move';
    // 使用自定义 MIME 类型，避免编辑器将拖拽数据当作普通文本插入
    event.dataTransfer.setData('application/x-table-drag', JSON.stringify({ type, index }));
    // 设置空的 text/plain 以防止浏览器默认行为
    event.dataTransfer.setData('text/plain', '');

    // 创建自定义拖拽预览
    const previewResult = createCustomDragPreview(type, tableElement, colIndex, rowIndex);
    if (previewResult) {
      this.dragState.customPreview = previewResult.preview;
      this.dragState.previewWidth = previewResult.width;
      this.dragState.previewHeight = previewResult.height;

      // 使用透明 1x1 像素图像作为原生拖拽预览（隐藏原生预览）
      const emptyImg = new Image();
      emptyImg.src =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      event.dataTransfer.setDragImage(emptyImg, 0, 0);

      // 初始定位预览元素到鼠标位置
      updateCustomPreviewPosition(
        previewResult.preview,
        event.clientX,
        event.clientY,
        tableElement,
        type,
        previewResult.width,
        previewResult.height,
      );
    }

    // 设置表格为可 drop 目标
    this.setupTableDropZone(tableElement);
  }

  /**
   * 清理拖拽状态
   */
  cleanup(): void {
    // 隐藏指示线
    const elements = this.getElements();
    hideDragIndicator(elements.dragIndicator);

    // 移除自定义预览元素
    if (this.dragState.customPreview) {
      this.dragState.customPreview.remove();
    }

    // 执行清理函数
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = null;
    }

    // 重置拖拽状态
    this.dragState = createInitialDragState();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * 判断鼠标是否在有效的拖拽范围内
   */
  private isInValidDropRange(clientX: number, clientY: number): boolean {
    const tableElement = this.getTableElement();
    if (!tableElement) return false;

    const tableRect = tableElement.getBoundingClientRect();
    const { sourceType, previewWidth, previewHeight } = this.dragState;

    if (sourceType === 'col') {
      // 列拖拽：检查 X 坐标是否在有效范围内
      const allowedOverflowX = previewWidth / 3;
      const minX = tableRect.left - allowedOverflowX;
      const maxX = tableRect.right + allowedOverflowX;
      return clientX >= minX && clientX <= maxX;
    } else if (sourceType === 'row') {
      // 行拖拽：检查 Y 坐标是否在有效范围内
      const allowedOverflowY = previewHeight / 3;
      const minY = tableRect.top - allowedOverflowY;
      const maxY = tableRect.bottom + allowedOverflowY;
      return clientY >= minY && clientY <= maxY;
    }

    return false;
  }

  /**
   * 更新拖拽指示线位置
   */
  private updateDragIndicator(event: DragEvent): void {
    if (!this.dragState.isDragging || !this.dragState.sourceType) return;

    const tableElement = this.getTableElement();
    if (!tableElement) return;

    // 更新自定义预览元素位置
    if (this.dragState.customPreview) {
      updateCustomPreviewPosition(
        this.dragState.customPreview,
        event.clientX,
        event.clientY,
        tableElement,
        this.dragState.sourceType,
        this.dragState.previewWidth,
        this.dragState.previewHeight,
      );
    }

    const elements = this.getElements();
    const indicator = elements.dragIndicator;
    if (!indicator) return;

    const container = getPositionContainer();
    if (!container) return;

    const containerRect = container.getBoundingClientRect();

    if (this.dragState.sourceType === 'col') {
      const result = calculateColumnDragIndicator(
        event.clientX,
        tableElement,
        containerRect,
        this.dragState.sourceIndex!,
      );

      if (!result) {
        indicator.dataset.show = 'false';
        this.dragState.targetIndex = null;
        this.dragState.insertPosition = null;
        return;
      }

      this.dragState.targetIndex = result.targetIndex;
      this.dragState.insertPosition = result.insertPosition;
      applyDragIndicatorPosition(indicator, result, 'col');
    } else {
      const result = calculateRowDragIndicator(
        event.clientY,
        tableElement,
        containerRect,
        this.dragState.sourceIndex!,
      );

      if (!result) {
        indicator.dataset.show = 'false';
        this.dragState.targetIndex = null;
        this.dragState.insertPosition = null;
        return;
      }

      this.dragState.targetIndex = result.targetIndex;
      this.dragState.insertPosition = result.insertPosition;
      applyDragIndicatorPosition(indicator, result, 'row');
    }
  }

  /**
   * 执行拖拽移动操作
   */
  private executeDragMove(): void {
    const tableElement = this.getTableElement();
    if (!tableElement) return;

    const { sourceType, sourceIndex, targetIndex, insertPosition } = this.dragState;
    if (
      sourceType === null ||
      sourceIndex === null ||
      targetIndex === null ||
      insertPosition === null
    ) {
      return;
    }

    // 计算实际的目标索引
    let actualTargetIndex = targetIndex;
    if (insertPosition === 'after') {
      actualTargetIndex = targetIndex + 1;
    }

    // 如果移动到原位置之后，需要调整索引
    if (actualTargetIndex > sourceIndex) {
      actualTargetIndex -= 1;
    }

    // 如果源和目标相同，不执行移动
    if (actualTargetIndex === sourceIndex) return;

    const operations = this.getTableOperations();
    if (sourceType === 'col') {
      operations.moveColumn(sourceIndex, actualTargetIndex, tableElement);
    } else {
      operations.moveRow(sourceIndex, actualTargetIndex, tableElement);
    }

    // 通知外部拖拽完成
    this.onDragComplete(sourceType, actualTargetIndex);
  }

  /**
   * 设置表格为拖拽放置区域
   */
  private setupTableDropZone(tableElement: HTMLTableElement): void {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      this.updateDragIndicator(e);
    };

    const handleDragLeave = (e: DragEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (!relatedTarget || !tableElement.contains(relatedTarget)) {
        const elements = this.getElements();
        hideDragIndicator(elements.dragIndicator);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const elements = this.getElements();
      hideDragIndicator(elements.dragIndicator);

      if (
        this.dragState.sourceIndex !== null &&
        this.dragState.targetIndex !== null &&
        this.dragState.insertPosition !== null
      ) {
        this.executeDragMove();
      }

      this.cleanupDropZone?.();
    };

    const handleDocumentDragEnter = (e: DragEvent) => {
      if (!this.dragState.isDragging) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
    };

    const handleDocumentDragOver = (e: DragEvent) => {
      if (!this.dragState.isDragging) return;

      e.stopPropagation();
      e.stopImmediatePropagation();

      const target = e.target as HTMLElement;
      const isInsideTable = tableElement.contains(target) || target === tableElement;
      const isValidRange = this.isInValidDropRange(e.clientX, e.clientY);

      if (isInsideTable || isValidRange) {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }
        this.updateDragIndicator(e);
      } else {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'none';
        }
        // 完全超出有效范围：只更新预览位置
        if (this.dragState.customPreview) {
          const table = this.getTableElement();
          if (table) {
            updateCustomPreviewPosition(
              this.dragState.customPreview,
              e.clientX,
              e.clientY,
              table,
              this.dragState.sourceType!,
              this.dragState.previewWidth,
              this.dragState.previewHeight,
            );
          }
        }
      }
    };

    const handleDocumentDrop = (e: DragEvent) => {
      if (!this.dragState.isDragging) return;

      e.stopPropagation();
      e.stopImmediatePropagation();

      const target = e.target as HTMLElement;
      const isInsideTable = tableElement.contains(target) || target === tableElement;
      const isValidRange = this.isInValidDropRange(e.clientX, e.clientY);

      if (isInsideTable || isValidRange) {
        e.preventDefault();

        const elements = this.getElements();
        hideDragIndicator(elements.dragIndicator);

        if (
          this.dragState.sourceIndex !== null &&
          this.dragState.targetIndex !== null &&
          this.dragState.insertPosition !== null
        ) {
          this.executeDragMove();
        }

        this.cleanupDropZone?.();
      }
    };

    const cleanupDropZone = () => {
      tableElement.removeEventListener('dragenter', handleDragEnter, true);
      tableElement.removeEventListener('dragover', handleDragOver, true);
      tableElement.removeEventListener('dragleave', handleDragLeave, true);
      tableElement.removeEventListener('drop', handleDrop, true);
      document.removeEventListener('dragenter', handleDocumentDragEnter, true);
      document.removeEventListener('dragover', handleDocumentDragOver, true);
      document.removeEventListener('drop', handleDocumentDrop, true);
    };

    this.cleanupDropZone = cleanupDropZone;
    this.cleanupFn = cleanupDropZone;

    // 使用 capture 模式确保事件能被捕获（WebKit 兼容）
    tableElement.addEventListener('dragenter', handleDragEnter, true);
    tableElement.addEventListener('dragover', handleDragOver, true);
    tableElement.addEventListener('dragleave', handleDragLeave, true);
    tableElement.addEventListener('drop', handleDrop, true);

    // 同时在 document 级别监听（WebKit 备用方案 + 阻止 Milkdown 块插入）
    document.addEventListener('dragenter', handleDocumentDragEnter, true);
    document.addEventListener('dragover', handleDocumentDragOver, true);
    document.addEventListener('drop', handleDocumentDrop, true);
  }

  private cleanupDropZone: (() => void) | null = null;
}

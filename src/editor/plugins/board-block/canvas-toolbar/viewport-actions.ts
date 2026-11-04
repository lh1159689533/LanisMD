/**
 * Board Canvas Toolbar - 视口与指针操作
 *
 * 对 Plait `BoardTransforms` 的薄封装，集中处理缩放 / 适应画布 / 指针模式切换，
 * 并统一做前置守卫，避免在容器尺寸为 0（画板隐藏、未完成布局）时产出 NaN 视口。
 *
 * 说明：`BoardTransforms.updateZoom` 内部已调用 `clampZoomLevel` 钳制到
 * [MIN_ZOOM, MAX_ZOOM]，因此本模块不重复钳制；`canZoomIn` / `canZoomOut`
 * 仅用于驱动按钮禁用态，使「按钮可点」与「缩放真的会变」保持一致。
 *
 * @changelog
 * | 版本   | 变更说明                             | 关联                                                     |
 * | v1.0.0 | 初始实现：缩放/适应画布/指针模式封装   | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §二 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { BoardTransforms, PlaitBoard, PlaitPointerType } from '@plait/core';
import type { PlaitBoard as PlaitBoardType } from '@plait/core';

import { MAX_ZOOM, MIN_ZOOM, ZOOM_EPSILON, ZOOM_STEP } from './constants';
import type { CanvasPointerMode } from './types';

// ---------------------------------------------------------------------------
// 读取
// ---------------------------------------------------------------------------

/** 读取当前缩放比例；board 未就绪时回落 1 */
export function getZoom(board: PlaitBoardType | null): number {
  const zoom = board?.viewport?.zoom;
  return typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : 1;
}

/** 当前缩放是否还能放大 */
export function canZoomIn(board: PlaitBoardType | null): boolean {
  return getZoom(board) < MAX_ZOOM - ZOOM_EPSILON;
}

/** 当前缩放是否还能缩小 */
export function canZoomOut(board: PlaitBoardType | null): boolean {
  return getZoom(board) > MIN_ZOOM + ZOOM_EPSILON;
}

/** 读取当前指针模式 */
export function getPointerMode(board: PlaitBoardType | null): CanvasPointerMode {
  if (!board) return 'selection';
  return PlaitBoard.isPointer(board, PlaitPointerType.hand) ? 'hand' : 'selection';
}

// ---------------------------------------------------------------------------
// 写入
// ---------------------------------------------------------------------------

/**
 * 画板容器是否已具备有效尺寸。
 *
 * `updateZoom` / `fitViewport` 都要读取容器 `getBoundingClientRect()` 并参与
 * 除法运算，容器尺寸为 0 时会算出 Infinity/NaN 并污染 viewport（进而被回写
 * 到文档）。因此所有视口写操作前统一过这道守卫。
 */
function hasValidContainer(board: PlaitBoardType): boolean {
  try {
    const container = PlaitBoard.getBoardContainer(board);
    if (!container) return false;
    const rect = container.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  } catch {
    // board 已销毁或容器未挂载
    return false;
  }
}

/** 放大一档 */
export function zoomIn(board: PlaitBoardType | null): void {
  if (!board || !hasValidContainer(board)) return;
  BoardTransforms.updateZoom(board, getZoom(board) + ZOOM_STEP);
}

/** 缩小一档 */
export function zoomOut(board: PlaitBoardType | null): void {
  if (!board || !hasValidContainer(board)) return;
  BoardTransforms.updateZoom(board, getZoom(board) - ZOOM_STEP);
}

/** 重置为 100% */
export function resetZoom(board: PlaitBoardType | null): void {
  if (!board || !hasValidContainer(board)) return;
  BoardTransforms.updateZoom(board, 1);
}

/** 适应画布：缩放并居中到内容整体可见 */
export function fitViewport(board: PlaitBoardType | null): void {
  if (!board || !hasValidContainer(board)) return;
  BoardTransforms.fitViewport(board);
}

/**
 * 切换指针模式。
 *
 * `updatePointerType` 在模式未变化时内部直接 return，可安全重复调用。
 */
export function setPointerMode(
  board: PlaitBoardType | null,
  mode: CanvasPointerMode,
): void {
  if (!board) return;
  BoardTransforms.updatePointerType(
    board,
    mode === 'hand' ? PlaitPointerType.hand : PlaitPointerType.selection,
  );
}

/**
 * Table Block Plugin - Types & Constants
 *
 * 类型定义、常量和图标资源
 */

import { PluginKey } from '@milkdown/kit/prose/state';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HandleState = 'hidden' | 'bar' | 'hover' | 'selected' | 'selected_no_menu' | 'dragging';
export type HandleType = 'col' | 'row';

export interface StateContext {
  state: HandleState;
  type: HandleType | null;
  index: number | null;
  tableElement: HTMLTableElement | null;
}

export interface HandleElements {
  colHandle: HTMLElement | null;
  rowHandle: HTMLElement | null;
  colAddLine: HTMLElement | null;
  rowAddLine: HTMLElement | null;
  dragIndicator: HTMLElement | null;
}

/** Drag state for tracking drop target */
export interface DragState {
  isDragging: boolean;
  sourceType: HandleType | null;
  sourceIndex: number | null;
  targetIndex: number | null;
  insertPosition: 'before' | 'after' | null;
  /** 自定义拖拽预览元素 */
  customPreview: HTMLElement | null;
  /** 被拖拽元素的原始尺寸 */
  previewWidth: number;
  previewHeight: number;
}

/** 用于 Decoration 的选中高亮状态 */
export interface SelectionHighlightState {
  type: HandleType | null;
  index: number | null;
  tablePos: number | null;
}

/** Table information for operations */
export interface TableInfo {
  tablePos: number;
  tableNode: any;
  map: any;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PLUGIN_KEY = new PluginKey('TABLE_HANDLE');
export const HIGHLIGHT_META_KEY = 'tableSelectionHighlight';
export const HIDE_DELAY = 200;

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

export const icons = {
  /** 行手柄图标 - 竖向六点（2列×3行） */
  rowDragHandle: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="8" cy="6" r="2"/>
    <circle cx="16" cy="6" r="2"/>
    <circle cx="8" cy="12" r="2"/>
    <circle cx="16" cy="12" r="2"/>
    <circle cx="8" cy="18" r="2"/>
    <circle cx="16" cy="18" r="2"/>
  </svg>`,
  /** 列手柄图标 - 横向六点（3列×2行） */
  colDragHandle: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="9" r="2"/>
    <circle cx="12" cy="9" r="2"/>
    <circle cx="19" cy="9" r="2"/>
    <circle cx="5" cy="15" r="2"/>
    <circle cx="12" cy="15" r="2"/>
    <circle cx="19" cy="15" r="2"/>
  </svg>`,
  add: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>`,
  delete: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
  </svg>`,
  alignLeft: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="15" y2="12"/>
    <line x1="3" y1="18" x2="18" y2="18"/>
  </svg>`,
  alignCenter: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="6" y1="12" x2="18" y2="12"/>
    <line x1="4" y1="18" x2="20" y2="18"/>
  </svg>`,
  alignRight: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="9" y1="12" x2="21" y2="12"/>
    <line x1="6" y1="18" x2="21" y2="18"/>
  </svg>`,
  clearContent: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
    <line x1="18" y1="9" x2="12" y2="15"/>
    <line x1="12" y1="9" x2="18" y2="15"/>
  </svg>`,
  insertRowAbove: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7"/>
  </svg>`,
  insertRowBelow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5v14M5 12l7 7 7-7"/>
  </svg>`,
  insertColLeft: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 12H5M12 5l-7 7 7 7"/>
  </svg>`,
  insertColRight: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>`,
};

// ---------------------------------------------------------------------------
// Initial State Factories
// ---------------------------------------------------------------------------

export function createInitialStateContext(): StateContext {
  return {
    state: 'hidden',
    type: null,
    index: null,
    tableElement: null,
  };
}

export function createInitialElements(): HandleElements {
  return {
    colHandle: null,
    rowHandle: null,
    colAddLine: null,
    rowAddLine: null,
    dragIndicator: null,
  };
}

export function createInitialDragState(): DragState {
  return {
    isDragging: false,
    sourceType: null,
    sourceIndex: null,
    targetIndex: null,
    insertPosition: null,
    customPreview: null,
    previewWidth: 0,
    previewHeight: 0,
  };
}

export function createInitialHighlightState(): SelectionHighlightState {
  return {
    type: null,
    index: null,
    tablePos: null,
  };
}

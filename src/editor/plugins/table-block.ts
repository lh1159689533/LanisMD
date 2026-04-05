/**
 * Table Handle Plugin
 *
 * 自定义表格增强插件，实现 Notion 风格的表格操作：
 * - 六状态机手柄交互
 * - 行/列操作（添加、删除、对齐）
 * - 行/列选中高亮
 * - 行/列拖拽排序
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey, type Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type HandleState = 'hidden' | 'bar' | 'hover' | 'selected' | 'selected_no_menu' | 'dragging';
type HandleType = 'col' | 'row';

interface StateContext {
  state: HandleState;
  type: HandleType | null;
  index: number | null;
  tableElement: HTMLTableElement | null;
}

interface HandleElements {
  colHandle: HTMLElement | null;
  rowHandle: HTMLElement | null;
  colAddLine: HTMLElement | null;
  rowAddLine: HTMLElement | null;
  dragIndicator: HTMLElement | null;
}

// Drag state for tracking drop target
interface DragState {
  isDragging: boolean;
  sourceType: HandleType | null;
  sourceIndex: number | null;
  targetIndex: number | null;
  insertPosition: 'before' | 'after' | null;
  // 自定义拖拽预览元素
  customPreview: HTMLElement | null;
  // 被拖拽元素的原始尺寸
  previewWidth: number;
  previewHeight: number;
}

// Selection highlight state for Decoration
interface SelectionHighlightState {
  type: HandleType | null;
  index: number | null;
  tablePos: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_KEY = new PluginKey('TABLE_HANDLE');
const HIGHLIGHT_META_KEY = 'tableSelectionHighlight';
const HIDE_DELAY = 200;

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const icons = {
  dragHandle: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="8" cy="6" r="2"/>
    <circle cx="16" cy="6" r="2"/>
    <circle cx="8" cy="12" r="2"/>
    <circle cx="16" cy="12" r="2"/>
    <circle cx="8" cy="18" r="2"/>
    <circle cx="16" cy="18" r="2"/>
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
// State Management
// ---------------------------------------------------------------------------

let stateContext: StateContext = {
  state: 'hidden',
  type: null,
  index: null,
  tableElement: null,
};

let elements: HandleElements = {
  colHandle: null,
  rowHandle: null,
  colAddLine: null,
  rowAddLine: null,
  dragIndicator: null,
};

// Drag state
let dragState: DragState = {
  isDragging: false,
  sourceType: null,
  sourceIndex: null,
  targetIndex: null,
  insertPosition: null,
  customPreview: null,
  previewWidth: 0,
  previewHeight: 0,
};

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let currentView: EditorView | null = null;
let currentFocusedCell: HTMLTableCellElement | null = null;
let isInteractingWithHandle = false; // 标记是否正在与手柄交互
let positionContainer: HTMLElement | null = null; // 定位参照容器（.milkdown-editor-root）

// ---------------------------------------------------------------------------
// State Machine
// ---------------------------------------------------------------------------

function transitionState(
  event:
    | 'focusCell'
    | 'pointerEnterHandle'
    | 'pointerLeaveHandle'
    | 'blurTable'
    | 'click'
    | 'clickOutside'
    | 'dragStart'
    | 'dragEnd',
): HandleState {
  const { state } = stateContext;

  switch (state) {
    case 'hidden':
      // 点击单元格后显示 bar 状态
      if (event === 'focusCell') return 'bar';
      return 'hidden';

    case 'bar':
      if (event === 'pointerEnterHandle') return 'hover';
      if (event === 'blurTable') return 'hidden';
      // 点击其他单元格时保持 bar 状态（会重新定位）
      if (event === 'focusCell') return 'bar';
      return 'bar';

    case 'hover':
      if (event === 'click') return 'selected';
      if (event === 'pointerLeaveHandle') return 'bar';
      if (event === 'dragStart') return 'dragging';
      if (event === 'blurTable') return 'hidden';
      return 'hover';

    case 'selected':
      if (event === 'clickOutside') return 'selected_no_menu';
      if (event === 'click') return 'selected';
      if (event === 'dragStart') return 'dragging';
      if (event === 'focusCell') return 'bar'; // 点击其他单元格，回到 bar 状态
      if (event === 'blurTable') return 'hidden';
      return 'selected';

    case 'selected_no_menu':
      if (event === 'clickOutside') return 'hidden';
      if (event === 'click') return 'selected';
      if (event === 'pointerEnterHandle') return 'selected';
      if (event === 'focusCell') return 'bar'; // 点击其他单元格，回到 bar 状态
      if (event === 'blurTable') return 'hidden';
      return 'selected_no_menu';

    case 'dragging':
      if (event === 'dragEnd') return 'selected_no_menu';
      return 'dragging';

    default:
      return 'hidden';
  }
}

function setState(newState: HandleState) {
  stateContext.state = newState;
  updateHandleVisuals();
}

// ---------------------------------------------------------------------------
// DOM Creation
// ---------------------------------------------------------------------------

function createHandleElement(type: HandleType): HTMLElement {
  const handle = document.createElement('div');
  handle.className = 'table-handle';
  handle.dataset.type = type;
  handle.dataset.state = 'hidden';
  handle.contentEditable = 'false';

  // 六点图标
  const icon = document.createElement('span');
  icon.className = 'handle-icon';
  icon.innerHTML = icons.dragHandle;
  handle.appendChild(icon);

  // 操作菜单
  const menu = createButtonGroup(type);
  handle.appendChild(menu);

  // 事件监听
  handle.addEventListener('pointerenter', () => {
    isInteractingWithHandle = true; // 标记正在与手柄交互
    if (stateContext.state === 'bar' || stateContext.state === 'selected_no_menu') {
      stateContext.type = type;
      setState(transitionState('pointerEnterHandle'));
    }
  });

  handle.addEventListener('pointerleave', (e) => {
    // 如果移动到菜单上，不触发离开
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget?.closest('.button-group')) return;

    // 延迟重置交互标记，给 click 事件处理留时间
    setTimeout(() => {
      isInteractingWithHandle = false;
    }, 100);

    if (stateContext.state === 'hover') {
      setState(transitionState('pointerLeaveHandle'));
    }
  });

  handle.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    // 点击菜单按钮不触发状态变化
    if ((e.target as HTMLElement).closest('.button-group button')) return;

    isInteractingWithHandle = true; // 确保标记为正在交互
    stateContext.type = type;

    // 从 bar 状态直接点击也应该进入 selected
    if (
      stateContext.state === 'bar' ||
      stateContext.state === 'hover' ||
      stateContext.state === 'selected_no_menu'
    ) {
      // 如果是从 bar 状态点击，先进入 hover 再进入 selected
      if (stateContext.state === 'bar') {
        stateContext.state = 'hover'; // 临时设置为 hover
      }
      setState(transitionState('click'));
      selectRowOrColumn();
    }
  });

  // 拖拽支持
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => {
    stateContext.type = type;
    setState(transitionState('dragStart'));
    setupDragData(e);
  });

  handle.addEventListener('dragend', () => {
    cleanupDragState();
    setState(transitionState('dragEnd'));
  });

  return handle;
}

function createButtonGroup(type: HandleType): HTMLElement {
  const group = document.createElement('div');
  group.className = 'button-group';
  group.dataset.show = 'false';

  if (type === 'col') {
    // 列操作：左插入、右插入 | 左对齐、居中、右对齐 | 删除
    group.appendChild(
      createMenuButton('insertColLeft', icons.insertColLeft, '在左侧插入列', () =>
        handleInsertColumn('before'),
      ),
    );
    group.appendChild(
      createMenuButton('insertColRight', icons.insertColRight, '在右侧插入列', () =>
        handleInsertColumn('after'),
      ),
    );
    group.appendChild(createSeparator());
    group.appendChild(
      createMenuButton('alignLeft', icons.alignLeft, '左对齐', () => handleSetColumnAlign('left')),
    );
    group.appendChild(
      createMenuButton('alignCenter', icons.alignCenter, '居中对齐', () =>
        handleSetColumnAlign('center'),
      ),
    );
    group.appendChild(
      createMenuButton('alignRight', icons.alignRight, '右对齐', () =>
        handleSetColumnAlign('right'),
      ),
    );
    group.appendChild(createSeparator());
    group.appendChild(
      createMenuButton('deleteCol', icons.delete, '删除列', () => handleDeleteColumn()),
    );
  } else {
    // 行操作：上插入、下插入 | 删除
    group.appendChild(
      createMenuButton('insertRowAbove', icons.insertRowAbove, '在上方插入行', () =>
        handleInsertRow('before'),
      ),
    );
    group.appendChild(
      createMenuButton('insertRowBelow', icons.insertRowBelow, '在下方插入行', () =>
        handleInsertRow('after'),
      ),
    );
    group.appendChild(createSeparator());
    // 删除行按钮（普通行显示）
    const deleteBtn = createMenuButton('deleteRow', icons.delete, '删除行', () =>
      handleDeleteRow(),
    );
    deleteBtn.dataset.forHeaderRow = 'false';
    group.appendChild(deleteBtn);
    // 清除内容按钮（表头行显示）
    // const clearBtn = createMenuButton('clearRowContent', icons.clearContent, '清除内容', () =>
    //   handleDeleteRow(),
    // );
    // clearBtn.dataset.forHeaderRow = 'true';
    // clearBtn.style.display = 'none'; // 默认隐藏
    // group.appendChild(clearBtn);
  }

  // 阻止菜单上的 pointerleave 事件冒泡
  group.addEventListener('pointerleave', (e) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget?.closest('.table-handle')) {
      if (stateContext.state === 'hover') {
        setState(transitionState('pointerLeaveHandle'));
      }
    }
  });

  return group;
}

function createMenuButton(
  type: string,
  icon: string,
  title: string,
  onClick: () => void,
): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menu-button';
  btn.dataset.type = type;
  btn.title = title;
  btn.innerHTML = icon;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    // 如果按钮被禁用，不执行操作
    if (btn.classList.contains('disabled')) return;
    onClick();
  });
  return btn;
}

function createSeparator(): HTMLElement {
  const sep = document.createElement('div');
  sep.className = 'separator';
  return sep;
}

function createAddLine(type: 'col' | 'row'): HTMLElement {
  const line = document.createElement('div');
  line.className = 'add-line';
  line.dataset.type = type;
  line.dataset.show = 'false';
  line.contentEditable = 'false';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-button';
  btn.innerHTML = icons.add;
  btn.title = type === 'col' ? '添加列' : '添加行';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    // 需要先选中最后一个单元格，才能执行添加命令
    if (stateContext.tableElement && currentView) {
      selectLastCellForAdd(type);
      setTimeout(() => {
        if (type === 'col') {
          executeCommand(addColumnAfter);
        } else {
          executeCommand(addRowAfter);
        }
      }, 0);
    }
  });

  line.appendChild(btn);
  return line;
}

/**
 * 创建拖拽指示线元素
 */
function createDragIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'table-drag-indicator';
  indicator.dataset.show = 'false';
  indicator.dataset.type = '';
  indicator.contentEditable = 'false';
  return indicator;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

function selectLastCellForAdd(type: 'col' | 'row') {
  if (!currentView || !stateContext.tableElement) return;

  const { state, dispatch } = currentView;

  // 查找表格在文档中的位置
  let tablePos = -1;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const dom = currentView!.nodeDOM(pos) as HTMLElement;
      if (dom && (dom === stateContext.tableElement || dom.contains(stateContext.tableElement))) {
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
// Handle Positioning
// ---------------------------------------------------------------------------

function getPositionContainer(view?: EditorView): HTMLElement | null {
  // 如果已缓存且仍在 DOM 中，直接返回
  if (positionContainer && document.contains(positionContainer)) {
    return positionContainer;
  }

  // 清除无效的缓存
  positionContainer = null;

  // 优先使用传入的 view，其次使用 currentView
  const editorView = view || currentView;

  // 从 view 获取容器（更可靠的方式）
  if (editorView) {
    const editorDom = editorView.dom;
    // 向上查找 .milkdown-editor-root 容器
    const root = editorDom.closest('.milkdown-editor-root') as HTMLElement | null;
    if (root) {
      positionContainer = root;
      return positionContainer;
    }
  }

  // 回退到全局查询（不推荐，但作为兜底）
  positionContainer = document.querySelector('.milkdown-editor-root') as HTMLElement | null;
  return positionContainer;
}

function positionHandles(cell: HTMLTableCellElement, table: HTMLTableElement, view?: EditorView) {
  const container = getPositionContainer(view);
  if (!container) {
    return;
  }

  // 确保容器有相对定位，以便 absolute 子元素能正确定位
  const containerStyle = getComputedStyle(container);
  if (containerStyle.position === 'static') {
    container.style.position = 'relative';
  }

  const containerRect = container.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  // 计算相对于容器的位置（考虑滚动）
  const scrollLeft = container.scrollLeft || 0;
  const scrollTop = container.scrollTop || 0;

  // 计算行列索引
  const row = cell.parentElement as HTMLTableRowElement;
  const rowIndex = Array.from(table.querySelectorAll('tr')).indexOf(row);
  const colIndex = Array.from(row.cells).indexOf(cell);

  stateContext.tableElement = table;
  stateContext.index = stateContext.type === 'col' ? colIndex : rowIndex;

  // 计算相对于容器的坐标
  const relativeTableTop = tableRect.top - containerRect.top + scrollTop;
  const relativeTableLeft = tableRect.left - containerRect.left + scrollLeft;
  const relativeCellTop = cellRect.top - containerRect.top + scrollTop;
  const relativeCellLeft = cellRect.left - containerRect.left + scrollLeft;

  // 定位列手柄（紧贴表格顶部边缘，当前列正上方）
  if (elements.colHandle) {
    elements.colHandle.style.position = 'absolute';
    elements.colHandle.style.left = `${relativeCellLeft + cellRect.width / 2}px`;
    elements.colHandle.style.top = `${relativeTableTop}px`;
    elements.colHandle.style.transform = 'translate(-50%, -45%)';
    elements.colHandle.dataset.colIndex = String(colIndex);
  }

  // 定位行手柄（紧贴表格左边缘，当前行左侧）
  if (elements.rowHandle) {
    elements.rowHandle.style.position = 'absolute';
    elements.rowHandle.style.left = `${relativeTableLeft}px`;
    elements.rowHandle.style.top = `${relativeCellTop + cellRect.height / 2}px`;
    elements.rowHandle.style.transform = 'translate(-35%, -50%)';
    elements.rowHandle.dataset.rowIndex = String(rowIndex);
  }

  // 定位添加列线（表格右侧）
  if (elements.colAddLine) {
    elements.colAddLine.style.position = 'absolute';
    elements.colAddLine.style.left = `${relativeTableLeft + tableRect.width + 8}px`;
    elements.colAddLine.style.top = `${relativeTableTop}px`;
    elements.colAddLine.style.height = `${tableRect.height}px`;
  }

  // 定位添加行线（表格底部）
  if (elements.rowAddLine) {
    elements.rowAddLine.style.position = 'absolute';
    elements.rowAddLine.style.left = `${relativeTableLeft}px`;
    elements.rowAddLine.style.top = `${relativeTableTop + tableRect.height + 8}px`;
    elements.rowAddLine.style.width = `${tableRect.width}px`;
  }
}

// ---------------------------------------------------------------------------
// Visual Updates
// ---------------------------------------------------------------------------

/**
 * 更新行菜单中"在上方插入行"按钮的显示状态
 * 当选中表头行时，完全隐藏该按钮（Markdown 表格规范不允许在表头行上方插入行）
 */
function updateInsertRowAboveButtonVisibility() {
  const rowHandle = elements.rowHandle;
  if (!rowHandle) return;

  const buttonGroup = rowHandle.querySelector('.button-group');
  if (!buttonGroup) return;

  const insertAboveBtn = buttonGroup.querySelector('[data-type="insertRowAbove"]') as HTMLElement;
  if (!insertAboveBtn) return;

  const rowIndex = rowHandle.dataset.rowIndex;
  const isHeaderRow = rowIndex === '0';

  // 如果是表头行，隐藏"在上方插入行"按钮
  insertAboveBtn.style.display = isHeaderRow ? 'none' : '';
}

function updateHandleVisuals() {
  const { state, type } = stateContext;

  // 更新列手柄
  if (elements.colHandle) {
    const newState = type === 'col' ? state : state === 'hidden' ? 'hidden' : 'bar';
    elements.colHandle.dataset.state = newState;
    const colMenu = elements.colHandle.querySelector('.button-group') as HTMLElement;
    if (colMenu) {
      colMenu.dataset.show = type === 'col' && state === 'selected' ? 'true' : 'false';
    }
  }

  // 更新行手柄
  if (elements.rowHandle) {
    elements.rowHandle.dataset.state =
      type === 'row' ? state : state === 'hidden' ? 'hidden' : 'bar';
    const rowMenu = elements.rowHandle.querySelector('.button-group') as HTMLElement;
    if (rowMenu) {
      rowMenu.dataset.show = type === 'row' && state === 'selected' ? 'true' : 'false';
    }
    // 根据当前行是否为表头行更新按钮显示/状态
    updateInsertRowAboveButtonVisibility();
    // 根据当前行是否为表头行更新删除按钮状态
    updateDeleteRowButtonState();
  }

  // 更新添加线
  const showAddLines = state !== 'hidden';
  if (elements.colAddLine) {
    elements.colAddLine.dataset.show = showAddLines ? 'true' : 'false';
  }
  if (elements.rowAddLine) {
    elements.rowAddLine.dataset.show = showAddLines ? 'true' : 'false';
  }

  // 更新行列高亮
  updateSelectionHighlight();
}

function updateSelectionHighlight() {
  if (!currentView) return;

  const { state, type, tableElement } = stateContext;

  // 如果不是选中状态，清除高亮
  if (state !== 'selected' && state !== 'selected_no_menu') {
    // 发送空的高亮状态
    const tr = currentView.state.tr.setMeta(HIGHLIGHT_META_KEY, {
      type: null,
      index: null,
      tablePos: null,
    } as SelectionHighlightState);
    currentView.dispatch(tr);
    return;
  }

  if (!tableElement) return;

  // 从 dataset 中获取索引
  const colIndex = elements.colHandle?.dataset.colIndex;
  const rowIndex = elements.rowHandle?.dataset.rowIndex;
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
  currentView.state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const dom = currentView!.nodeDOM(pos) as HTMLElement;
      if (dom && (dom === tableElement || dom.contains(tableElement))) {
        tablePos = pos;
        return false;
      }
    }
    return true;
  });

  if (tablePos === -1) return;

  // 发送高亮状态
  const tr = currentView.state.tr.setMeta(HIGHLIGHT_META_KEY, {
    type,
    index,
    tablePos,
  } as SelectionHighlightState);
  currentView.dispatch(tr);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function executeCommand(command: (state: any, dispatch?: any) => boolean): boolean {
  if (!currentView) return false;
  const result = command(currentView.state, currentView.dispatch);
  currentView.focus();
  return result;
}

/**
 * 获取表格信息
 */
function getTableInfo(): { tablePos: number; tableNode: any; map: any } | null {
  if (!currentView || !stateContext.tableElement) return null;

  const { state } = currentView;
  let tablePos = -1;

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const dom = currentView!.nodeDOM(pos) as HTMLElement;
      if (dom && (dom === stateContext.tableElement || dom.contains(stateContext.tableElement))) {
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
 * 根据索引定位手柄到指定的列/行
 */
function repositionHandleToIndex(type: HandleType, index: number) {
  if (!currentView) {
    return;
  }

  // 使用 requestAnimationFrame 确保 DOM 已更新
  requestAnimationFrame(() => {
    if (!currentView) {
      return;
    }

    // 重新查找当前聚焦的表格（因为表格结构可能已变化）
    const { state } = currentView;
    const { selection } = state;
    const $from = selection.$from;

    let tableNode: HTMLTableElement | null = null;

    // 从选区位置查找表格
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node.type.name === 'table') {
        const pos = $from.before(d);
        const dom = currentView.nodeDOM(pos) as HTMLElement;
        if (dom && dom.tagName === 'TABLE') {
          tableNode = dom as HTMLTableElement;
        }
        break;
      }
    }

    // 如果从选区找不到，尝试使用之前保存的表格元素
    if (!tableNode && stateContext.tableElement) {
      // 检查表格是否仍在 DOM 中
      if (document.contains(stateContext.tableElement)) {
        tableNode = stateContext.tableElement;
      }
    }

    if (!tableNode) {
      return;
    }

    // 更新表格引用
    stateContext.tableElement = tableNode;

    const rows = tableNode.querySelectorAll('tr');

    if (rows.length === 0) {
      return;
    }

    let targetCell: HTMLTableCellElement | null = null;

    if (type === 'col') {
      // 找到第一行的目标列单元格
      const firstRow = rows[0];
      const cells = firstRow.querySelectorAll('th, td');
      if (index >= 0 && index < cells.length) {
        targetCell = cells[index] as HTMLTableCellElement;
      }
    } else {
      // 找到目标行的第一个单元格
      if (index >= 0 && index < rows.length) {
        const targetRow = rows[index];
        targetCell = targetRow.querySelector('th, td') as HTMLTableCellElement;
      }
    }

    if (targetCell) {
      // 更新当前聚焦的单元格
      currentFocusedCell = targetCell;

      // 重新定位手柄
      positionHandles(targetCell, tableNode);

      // 更新手柄的索引
      if (type === 'col' && elements.colHandle) {
        elements.colHandle.dataset.colIndex = String(index);
      } else if (type === 'row' && elements.rowHandle) {
        elements.rowHandle.dataset.rowIndex = String(index);
      }

      // 保持 SELECTED 状态并确保类型正确
      stateContext.type = type;
      stateContext.index = index;
      stateContext.state = 'selected';

      // 标记正在与手柄交互，防止后续的 dispatch 触发 handleSelectionChange 导致状态被重置
      // 必须在 updateHandleVisuals 之前设置，因为 updateHandleVisuals -> updateSelectionHighlight -> dispatch
      isInteractingWithHandle = true;

      updateHandleVisuals();

      // 重新选中行/列
      selectRowOrColumn();

      // 延迟重置交互标记
      setTimeout(() => {
        isInteractingWithHandle = false;
      }, 50);
    }
  });
}

/**
 * 处理插入列操作
 */
function handleInsertColumn(direction: 'before' | 'after') {
  if (!currentView) return;

  const colIndex = elements.colHandle?.dataset.colIndex;
  if (colIndex === undefined) return;

  const currentColIndex = parseInt(colIndex);

  // 执行插入命令
  if (direction === 'before') {
    executeCommand(addColumnBefore);
    // 在左侧插入，新列在当前位置，所以手柄应该在 currentColIndex（新列）
    repositionHandleToIndex('col', currentColIndex);
  } else {
    executeCommand(addColumnAfter);
    // 在右侧插入，新列在 currentColIndex + 1
    repositionHandleToIndex('col', currentColIndex + 1);
  }
}

/**
 * 处理插入行操作
 */
function handleInsertRow(direction: 'before' | 'after') {
  if (!currentView) return;

  const rowIndex = elements.rowHandle?.dataset.rowIndex;
  if (rowIndex === undefined) return;

  const currentRowIndex = parseInt(rowIndex);

  // 执行插入命令
  if (direction === 'before') {
    executeCommand(addRowBefore);
    // 在上方插入，新行在当前位置，所以手柄应该在 currentRowIndex（新行）
    repositionHandleToIndex('row', currentRowIndex);
  } else {
    executeCommand(addRowAfter);
    // 在下方插入，新行在 currentRowIndex + 1
    repositionHandleToIndex('row', currentRowIndex + 1);
  }
}

/**
 * 处理删除列操作
 */
function handleDeleteColumn() {
  if (!currentView || !stateContext.tableElement) return;

  const tableInfo = getTableInfo();
  if (!tableInfo) return;

  const colIndex = elements.colHandle?.dataset.colIndex;
  if (colIndex === undefined) return;

  const currentColIndex = parseInt(colIndex);
  const totalCols = tableInfo.map.width;

  // 如果只有一列，删除整个表格
  if (totalCols <= 1) {
    // 删除整个表格
    const { state, dispatch } = currentView;
    const tr = state.tr.delete(
      tableInfo.tablePos,
      tableInfo.tablePos + tableInfo.tableNode.nodeSize,
    );
    dispatch(tr);
    currentView.focus();

    // 清理状态
    stateContext.state = 'hidden';
    stateContext.tableElement = null;
    currentFocusedCell = null;
    updateHandleVisuals();
    return;
  }

  // 确保在执行删除命令前有有效的 CellSelection
  // 这是必要的，因为 deleteColumn 命令依赖 CellSelection 来确定删除哪一列
  selectRowOrColumn();

  // 执行删除命令
  executeCommand(deleteColumn);

  // 计算新的目标列索引
  let newColIndex: number;
  if (currentColIndex >= totalCols - 1) {
    // 删除的是最后一列，定位到新的最后一列
    newColIndex = totalCols - 2;
  } else {
    // 定位到"下一列"（原来右边的列，删除后索引不变）
    newColIndex = currentColIndex;
  }

  // 重新定位手柄
  repositionHandleToIndex('col', newColIndex);
}

/**
 * 处理删除行操作
 */
function handleDeleteRow() {
  if (!currentView || !stateContext.tableElement) {
    return;
  }

  const tableInfo = getTableInfo();
  if (!tableInfo) {
    return;
  }

  const rowIndex = elements.rowHandle?.dataset.rowIndex;
  if (rowIndex === undefined) {
    return;
  }

  const currentRowIndex = parseInt(rowIndex);
  const totalRows = tableInfo.map.height;

  // 如果只有一行，删除整个表格
  if (totalRows <= 1) {
    // 删除整个表格
    const { state, dispatch } = currentView;
    const tr = state.tr.delete(
      tableInfo.tablePos,
      tableInfo.tablePos + tableInfo.tableNode.nodeSize,
    );
    dispatch(tr);
    currentView.focus();

    // 清理状态
    stateContext.state = 'hidden';
    stateContext.tableElement = null;
    currentFocusedCell = null;
    updateHandleVisuals();
    return;
  }

  // 确保 stateContext.type 是 'row'，因为 selectRowOrColumn 依赖它
  stateContext.type = 'row';

  // 确保在执行删除命令前有有效的 CellSelection
  // 这是必要的，因为 deleteRow 命令依赖 CellSelection 来确定删除哪一行
  const selectionCreated = selectRowOrColumn();
  if (!selectionCreated) {
    return;
  }

  // 执行删除命令
  const deleteResult = deleteRow(currentView.state, currentView.dispatch);
  if (!deleteResult) {
    return;
  }

  currentView.focus();

  // 计算新的目标行索引
  let newRowIndex: number;
  if (currentRowIndex >= totalRows - 1) {
    // 删除的是最后一行，定位到新的最后一行
    newRowIndex = totalRows - 2;
  } else {
    // 定位到"下一行"（原来下方的行，删除后索引不变）
    newRowIndex = currentRowIndex;
  }

  // 重新定位手柄
  repositionHandleToIndex('row', newRowIndex);
}

/**
 * 处理设置列对齐（保持 SELECTED 状态）
 */
function handleSetColumnAlign(align: 'left' | 'center' | 'right') {
  setColumnAlign(align);
  // 对齐操作后保持 SELECTED 状态，不需要重新定位
  // 确保状态仍然是 selected
  stateContext.state = 'selected';
  updateHandleVisuals();
}

function setColumnAlign(align: 'left' | 'center' | 'right') {
  if (!currentView || !stateContext.tableElement) return;

  const colIndex = elements.colHandle?.dataset.colIndex;
  if (colIndex === undefined) return;

  const colIdx = parseInt(colIndex);
  const { state, dispatch } = currentView;

  // 查找表格位置
  let tablePos = -1;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const dom = currentView!.nodeDOM(pos) as HTMLElement;
      if (dom && (dom === stateContext.tableElement || dom.contains(stateContext.tableElement))) {
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
  // 注意：Milkdown 中表头行是 table_header_row，普通行是 table_row
  let rowOffset = 1; // 跳过 table 开始标记
  tableNode.forEach((row) => {
    if (row.type.name === 'table_row' || row.type.name === 'table_header_row') {
      let cellIndex = 0;
      let cellOffset = 1; // 跳过 table_row/table_header_row 开始标记
      row.forEach((cell) => {
        if (cellIndex === colIdx) {
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
  currentView.focus();
}

/**
 * 获取表格中普通行（table_row）的数量
 */
function getTableRowCount(): number {
  const tableInfo = getTableInfo();
  if (!tableInfo) return 0;

  let rowCount = 0;
  tableInfo.tableNode.forEach((row: any) => {
    if (row.type.name === 'table_row') {
      rowCount++;
    }
  });
  return rowCount;
}

/**
 * 更新行菜单中删除按钮的状态
 * 当选中表头行且存在普通行时，禁用删除按钮
 */
function updateDeleteRowButtonState() {
  const rowHandle = elements.rowHandle;
  if (!rowHandle) return;

  const buttonGroup = rowHandle.querySelector('.button-group');
  if (!buttonGroup) return;

  const deleteBtn = buttonGroup.querySelector('[data-type="deleteRow"]') as HTMLElement;
  if (!deleteBtn) return;

  const rowIndex = rowHandle.dataset.rowIndex;
  const isHeaderRow = rowIndex === '0';
  const tableRowCount = getTableRowCount();

  // 如果是表头行且存在普通行，则禁用删除按钮
  if (isHeaderRow && tableRowCount > 0) {
    deleteBtn.classList.add('disabled');
    deleteBtn.title = '请先删除所有数据行';
  } else {
    deleteBtn.classList.remove('disabled');
    deleteBtn.title = '删除行';
  }
}

function selectRowOrColumn(): boolean {
  if (!currentView) {
    return false;
  }

  const { state, dispatch } = currentView;
  const { type } = stateContext;

  const colIndex = elements.colHandle?.dataset.colIndex;
  const rowIndex = elements.rowHandle?.dataset.rowIndex;

  // 从行/列手柄找到关联的表格 DOM
  const handle = type === 'col' ? elements.colHandle : elements.rowHandle;
  if (!handle) {
    return false;
  }

  // 首先尝试从 stateContext.tableElement
  let tableDOM = stateContext.tableElement;

  // 如果 tableDOM 无效或不在 DOM 中，标记为 null
  if (tableDOM && !document.contains(tableDOM)) {
    tableDOM = null;
    stateContext.tableElement = null;
  }

  // 查找表格在文档中的位置
  let tablePos = -1;
  let foundTableNode: any = null;

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const dom = currentView!.nodeDOM(pos) as HTMLElement;
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
            // 同时更新 stateContext.tableElement
            stateContext.tableElement = dom as HTMLTableElement;
            return false;
          }
        } else if (type === 'col' && colIndex !== undefined) {
          if (rows.length > 0) {
            tablePos = pos;
            foundTableNode = node;
            stateContext.tableElement = dom as HTMLTableElement;
            return false;
          }
        }
      }
    }
    return true;
  });

  if (tablePos === -1) {
    return false;
  }

  const tableNode = foundTableNode || state.doc.nodeAt(tablePos);
  if (!tableNode) {
    return false;
  }

  // 验证节点确实是表格
  if (tableNode.type.name !== 'table') {
    return false;
  }

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
  } catch (error) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Drag & Drop
// ---------------------------------------------------------------------------

function setupDragData(event: DragEvent) {
  if (!event.dataTransfer) return;

  const { type } = stateContext;
  const colIndex = elements.colHandle?.dataset.colIndex;
  const rowIndex = elements.rowHandle?.dataset.rowIndex;
  const index = type === 'col' ? colIndex : rowIndex;

  // 初始化拖拽状态
  dragState = {
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

  // 创建自定义拖拽预览（固定定位，手动控制位置）
  const preview = createCustomDragPreview();
  if (preview) {
    dragState.customPreview = preview;
    
    // 使用透明 1x1 像素图像作为原生拖拽预览（隐藏原生预览）
    const emptyImg = new Image();
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    event.dataTransfer.setDragImage(emptyImg, 0, 0);
    
    // 初始定位预览元素到鼠标位置
    updateCustomPreviewPosition(event.clientX, event.clientY);
  }

  // 设置表格为可 drop 目标
  if (stateContext.tableElement) {
    setupTableDropZone(stateContext.tableElement);
  }
}

/**
 * 创建自定义拖拽预览元素
 * 使用固定定位，位置由 updateCustomPreviewPosition 手动控制
 */
function createCustomDragPreview(): HTMLElement | null {
  const { type, tableElement } = stateContext;
  const colIndex = elements.colHandle?.dataset.colIndex;
  const rowIndex = elements.rowHandle?.dataset.rowIndex;

  if (!tableElement) return null;

  const preview = document.createElement('div');
  preview.className = 'drag-preview drag-preview-custom';
  preview.style.position = 'fixed';
  preview.style.zIndex = '10000';
  preview.style.pointerEvents = 'none';
  preview.style.opacity = '0.85';
  preview.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  preview.style.borderRadius = '4px';
  preview.style.overflow = 'hidden';

  if (type === 'col' && colIndex !== undefined) {
    const idx = parseInt(colIndex);
    // 复制整列，保留原始宽高
    const rows = tableElement.querySelectorAll('tr');
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.background = 'white';
    
    let totalWidth = 0;
    let totalHeight = 0;
    
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
    
    // 记录预览元素尺寸
    dragState.previewWidth = totalWidth;
    dragState.previewHeight = totalHeight;
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
      
      let totalWidth = 0;
      let totalHeight = 0;
      
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
      
      // 记录预览元素尺寸
      dragState.previewWidth = totalWidth;
      dragState.previewHeight = totalHeight;
    }
  }

  document.body.appendChild(preview);
  return preview;
}

/**
 * 更新自定义拖拽预览元素的位置
 * 根据拖拽类型和表格边界限制预览位置
 */
function updateCustomPreviewPosition(clientX: number, clientY: number) {
  const preview = dragState.customPreview;
  const tableElement = stateContext.tableElement;
  
  if (!preview || !tableElement) return;
  
  const tableRect = tableElement.getBoundingClientRect();
  const { sourceType, previewWidth, previewHeight } = dragState;
  
  // 计算允许超出的距离（列宽度或行高度的 1/3）
  const allowedOverflowX = sourceType === 'col' ? previewWidth / 3 : 0;
  const allowedOverflowY = sourceType === 'row' ? previewHeight / 3 : 0;
  
  // 预览元素的中心应该跟随鼠标
  let previewX = clientX - previewWidth / 2;
  let previewY = clientY - previewHeight / 2;
  
  if (sourceType === 'col') {
    // 列拖拽：横向允许超出 1/3 宽度，纵向完全不能超出
    // 计算边界（预览中心相对于表格）
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

/**
 * 设置表格为拖拽放置区域
 * 
 * 注意：macOS Tauri (WebKit) 对拖拽事件有特殊处理要求：
 * 1. 必须在 dragenter 中调用 preventDefault() 才能使 dragover 正常工作
 * 2. 事件监听器需要使用 capture 模式确保能够捕获到事件
 * 3. 同时在 document 级别监听以处理 WebKit 的事件冒泡问题
 */
function setupTableDropZone(tableElement: HTMLTableElement) {
  // 添加 dragenter 事件监听器 - WebKit 需要这个来启用 drop
  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  };

  // 添加 dragover 事件监听器
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    updateDragIndicator(e, tableElement);
  };

  // 添加 dragleave 事件监听器
  const handleDragLeave = (e: DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    // 只有当真正离开表格时才隐藏指示线
    if (!relatedTarget || !tableElement.contains(relatedTarget)) {
      hideDragIndicator();
    }
  };

  // 添加 drop 事件监听器
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    hideDragIndicator();
    
    // 执行移动操作
    if (dragState.sourceIndex !== null && dragState.targetIndex !== null && dragState.insertPosition !== null) {
      executeDragMove();
    }
    
    // 清理事件监听器
    cleanupDropZone();
  };

  /**
   * 判断鼠标是否在有效的拖拽范围内
   * 拖动列时：只要 X 坐标在表格左右范围内（允许超出 1/3 列宽）即为有效
   * 拖动行时：只要 Y 坐标在表格上下范围内（允许超出 1/3 行高）即为有效
   */
  const isInValidDropRange = (clientX: number, clientY: number): boolean => {
    const tableRect = tableElement.getBoundingClientRect();
    const { sourceType, previewWidth, previewHeight } = dragState;
    
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
  };

  // Document 级别的事件处理器（用于 WebKit 兼容 + 表格外部预览位置更新）
  const handleDocumentDragOver = (e: DragEvent) => {
    // 只有当拖拽状态激活时才处理
    if (!dragState.isDragging) return;
    
    // 阻止事件冒泡，防止 Milkdown 的块插入指示条被触发
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    const target = e.target as HTMLElement;
    const isInsideTable = tableElement.contains(target) || target === tableElement;
    const isValidRange = isInValidDropRange(e.clientX, e.clientY);
    
    if (isInsideTable) {
      // 在表格内部：正常处理拖拽指示线和预览位置
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      updateDragIndicator(e, tableElement);
    } else if (isValidRange) {
      // 在表格外部但在有效拖拽范围内：正常处理指示线和预览位置
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      updateDragIndicator(e, tableElement);
    } else {
      // 完全超出有效范围：只更新预览位置
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'none';
      }
      updateCustomPreviewPosition(e.clientX, e.clientY);
    }
  };

  // Document 级别的 dragenter 处理器（防止 Milkdown 块插入触发）
  const handleDocumentDragEnter = (e: DragEvent) => {
    if (!dragState.isDragging) return;
    
    // 阻止事件冒泡，防止 Milkdown 的块插入指示条被触发
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
  };

  const handleDocumentDrop = (e: DragEvent) => {
    if (!dragState.isDragging) return;
    
    // 阻止事件冒泡
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    const target = e.target as HTMLElement;
    const isInsideTable = tableElement.contains(target) || target === tableElement;
    const isValidRange = isInValidDropRange(e.clientX, e.clientY);
    
    // 在表格内部或有效拖拽范围内都可以执行 drop
    if (isInsideTable || isValidRange) {
      e.preventDefault();
      
      hideDragIndicator();
      
      if (dragState.sourceIndex !== null && dragState.targetIndex !== null && dragState.insertPosition !== null) {
        executeDragMove();
      }
      
      cleanupDropZone();
    }
  };

  // 清理函数
  const cleanupDropZone = () => {
    tableElement.removeEventListener('dragenter', handleDragEnter, true);
    tableElement.removeEventListener('dragover', handleDragOver, true);
    tableElement.removeEventListener('dragleave', handleDragLeave, true);
    tableElement.removeEventListener('drop', handleDrop, true);
    document.removeEventListener('dragenter', handleDocumentDragEnter, true);
    document.removeEventListener('dragover', handleDocumentDragOver, true);
    document.removeEventListener('drop', handleDocumentDrop, true);
    // 移除暂存的清理函数引用
    (tableElement as any)._dragCleanup = null;
  };

  // 暂存清理函数引用
  (tableElement as any)._dragCleanup = cleanupDropZone;

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

/**
 * 更新拖拽指示线位置
 */
function updateDragIndicator(e: DragEvent, tableElement: HTMLTableElement) {
  if (!dragState.isDragging || !dragState.sourceType) return;

  // 更新自定义预览元素位置
  updateCustomPreviewPosition(e.clientX, e.clientY);

  const indicator = elements.dragIndicator;
  if (!indicator) return;

  const container = getPositionContainer();
  if (!container) return;

  const containerRect = container.getBoundingClientRect();
  const tableRect = tableElement.getBoundingClientRect();

  if (dragState.sourceType === 'col') {
    // 列拖拽：根据鼠标 X 位置确定插入位置
    const cols = getColumnPositions(tableElement);
    const mouseX = e.clientX;

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
    const sourceIndex = dragState.sourceIndex!;
    const isSamePosition = 
      (insertPosition === 'before' && targetIndex === sourceIndex) ||
      (insertPosition === 'after' && targetIndex === sourceIndex) ||
      (insertPosition === 'before' && targetIndex === sourceIndex + 1) ||
      (insertPosition === 'after' && targetIndex === sourceIndex - 1);

    if (isSamePosition) {
      indicator.dataset.show = 'false';
      dragState.targetIndex = null;
      dragState.insertPosition = null;
      return;
    }

    // 更新状态
    dragState.targetIndex = targetIndex;
    dragState.insertPosition = insertPosition;

    // 定位指示线
    indicator.dataset.type = 'col';
    indicator.dataset.show = 'true';
    indicator.style.left = `${indicatorX - containerRect.left}px`;
    indicator.style.top = `${tableRect.top - containerRect.top}px`;
    indicator.style.width = '3px';
    indicator.style.height = `${tableRect.height}px`;
  } else {
    // 行拖拽：根据鼠标 Y 位置确定插入位置
    const rows = getRowPositions(tableElement);
    const mouseY = e.clientY;

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
    const sourceIndex = dragState.sourceIndex!;
    const isSamePosition = 
      (insertPosition === 'before' && targetIndex === sourceIndex) ||
      (insertPosition === 'after' && targetIndex === sourceIndex) ||
      (insertPosition === 'before' && targetIndex === sourceIndex + 1) ||
      (insertPosition === 'after' && targetIndex === sourceIndex - 1);

    if (isSamePosition) {
      indicator.dataset.show = 'false';
      dragState.targetIndex = null;
      dragState.insertPosition = null;
      return;
    }

    // 更新状态
    dragState.targetIndex = targetIndex;
    dragState.insertPosition = insertPosition;

    // 定位指示线
    indicator.dataset.type = 'row';
    indicator.dataset.show = 'true';
    indicator.style.left = `${tableRect.left - containerRect.left}px`;
    indicator.style.top = `${indicatorY - containerRect.top}px`;
    indicator.style.width = `${tableRect.width}px`;
    indicator.style.height = '3px';
  }
}

/**
 * 获取表格所有列的位置信息
 */
function getColumnPositions(tableElement: HTMLTableElement): Array<{ left: number; width: number }> {
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
function getRowPositions(tableElement: HTMLTableElement): Array<{ top: number; height: number }> {
  const rows = tableElement.querySelectorAll('tr');
  return Array.from(rows).map((row) => {
    const rect = row.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  });
}

/**
 * 隐藏拖拽指示线
 */
function hideDragIndicator() {
  const indicator = elements.dragIndicator;
  if (indicator) {
    indicator.dataset.show = 'false';
  }
}

/**
 * 执行拖拽移动操作
 */
function executeDragMove() {
  if (!currentView || !stateContext.tableElement) return;

  const { sourceType, sourceIndex, targetIndex, insertPosition } = dragState;
  if (sourceType === null || sourceIndex === null || targetIndex === null || insertPosition === null) return;

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

  if (sourceType === 'col') {
    moveColumn(sourceIndex, actualTargetIndex);
  } else {
    moveRow(sourceIndex, actualTargetIndex);
  }
}

/**
 * 移动列
 */
function moveColumn(fromIndex: number, toIndex: number) {
  if (!currentView) return;

  const tableInfo = getTableInfo();
  if (!tableInfo) return;

  const { state, dispatch } = currentView;
  const { tableNode, tablePos, map } = tableInfo;

  // 创建新的事务
  let tr = state.tr;

  // 遍历每一行，移动对应列的单元格
  const rowCount = map.height;
  const colCount = map.width;

  // 收集需要移动的数据
  const cellsToMove: Array<{ row: number; cell: any; cellPos: number }> = [];

  for (let row = 0; row < rowCount; row++) {
    const cellPos = map.positionAt(row, fromIndex, tableNode);
    const absolutePos = tablePos + cellPos + 1;
    const cellNode = state.doc.nodeAt(absolutePos);
    if (cellNode) {
      cellsToMove.push({ row, cell: cellNode, cellPos: absolutePos });
    }
  }

  // 使用事务来移动单元格
  // 策略：先删除源列的单元格，再在目标位置插入
  // 但由于 ProseMirror 的位置会在删除后变化，需要从后往前处理或者重新计算位置

  // 更简单的方法：直接操作表格节点，重新排列列
  const newRows: any[] = [];
  
  tableNode.forEach((rowNode: any) => {
    const newCells: any[] = [];
    const cells: any[] = [];
    
    rowNode.forEach((cell: any) => {
      cells.push(cell);
    });

    // 重新排列单元格
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
  tr = tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTableNode);

  dispatch(tr);
  currentView.focus();

  // 更新手柄位置到新位置
  repositionHandleToIndex('col', toIndex);
}

/**
 * 移动行
 */
function moveRow(fromIndex: number, toIndex: number) {
  if (!currentView) return;

  const tableInfo = getTableInfo();
  if (!tableInfo) return;

  const { state, dispatch } = currentView;
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
  let tr = state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, newTableNode);

  dispatch(tr);
  currentView.focus();

  // 更新手柄位置到新位置
  repositionHandleToIndex('row', toIndex);
}

/**
 * 拖拽结束时清理状态
 */
function cleanupDragState() {
  // 隐藏指示线
  hideDragIndicator();

  // 移除自定义预览元素
  if (dragState.customPreview) {
    dragState.customPreview.remove();
  }

  // 清理表格上的事件监听器
  if (stateContext.tableElement) {
    const cleanup = (stateContext.tableElement as any)._dragCleanup;
    if (cleanup) {
      cleanup();
    }
  }

  // 重置拖拽状态
  dragState = {
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

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

function handleCellClick(_view: EditorView, event: MouseEvent): boolean {
  const target = event.target as HTMLElement;

  // 检查是否在表格手柄或菜单上
  if (
    target.closest('.table-handle') ||
    target.closest('.button-group') ||
    target.closest('.add-line')
  ) {
    // 标记正在与手柄交互，阻止选区变化处理
    isInteractingWithHandle = true;
    // 返回 true 阻止 ProseMirror 默认处理
    return true;
  }

  // 检查是否在表格单元格内
  const cell = target.closest('th, td') as HTMLTableCellElement | null;
  const table = target.closest('table') as HTMLTableElement | null;

  if (cell && table) {
    clearHideTimer();
    currentFocusedCell = cell;

    // 点击单元格后显示手柄
    positionHandles(cell, table);

    // 如果当前是选中状态，点击其他单元格则回到 bar 状态
    if (stateContext.state === 'selected' || stateContext.state === 'selected_no_menu') {
      setState(transitionState('focusCell'));
    } else if (stateContext.state === 'hidden') {
      setState(transitionState('focusCell'));
    }

    return false;
  }

  // 点击外部区域
  if (stateContext.state === 'selected' || stateContext.state === 'selected_no_menu') {
    setState(transitionState('clickOutside'));
    currentFocusedCell = null;
    return false;
  }

  // 点击表格外部，隐藏手柄
  if (stateContext.state !== 'hidden') {
    setState(transitionState('blurTable'));
    currentFocusedCell = null;
  }

  return false;
}

function handleSelectionChange(view: EditorView): void {
  // 如果正在与手柄交互，不处理选区变化
  if (isInteractingWithHandle) {
    return;
  }

  // 检查选区是否在表格内
  const { selection } = view.state;
  const $from = selection.$from;

  // 查找是否在表格单元格中
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
    clearHideTimer();
    currentFocusedCell = cellNode;
    positionHandles(cellNode, tableNode, view);

    if (stateContext.state === 'hidden') {
      setState(transitionState('focusCell'));
    } else if (stateContext.state === 'selected' || stateContext.state === 'selected_no_menu') {
      // 如果光标移动到了不同的单元格，回到 bar 状态
      setState(transitionState('focusCell'));
    }
  } else {
    // 光标离开表格，隐藏手柄
    if (stateContext.state !== 'hidden') {
      startHideTimer();
    }
    currentFocusedCell = null;
  }
}

function handlePointerLeave(_view: EditorView, event: PointerEvent): boolean {
  const relatedTarget = event.relatedTarget as HTMLElement;

  // 如果移动到手柄或菜单上，不触发隐藏
  if (relatedTarget?.closest('.table-handle') || relatedTarget?.closest('.add-line')) {
    return false;
  }

  // 如果有聚焦的单元格，不立即隐藏
  if (currentFocusedCell) {
    return false;
  }

  startHideTimer();
  return false;
}

function startHideTimer() {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    if (stateContext.state !== 'selected' && stateContext.state !== 'selected_no_menu') {
      setState(transitionState('blurTable'));
      currentFocusedCell = null;
    }
  }, HIDE_DELAY);
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
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
      // 高亮整列
      const rowCount = map.height;
      for (let row = 0; row < rowCount; row++) {
        const cellPos = map.positionAt(row, index, tableNode);
        const absolutePos = tablePos + cellPos + 1;

        // 确定位置标记
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
      // 高亮整行的所有单元格
      const colCount = map.width;
      for (let col = 0; col < colCount; col++) {
        const cellPos = map.positionAt(index, col, tableNode);
        const absolutePos = tablePos + cellPos + 1;

        // 确定位置标记
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
    // 如果出错，返回空的 decoration set
    return DecorationSet.empty;
  }

  return DecorationSet.create(doc, decorations);
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const tableHandlePlugin = $prose(() => {
  return new Plugin({
    key: PLUGIN_KEY,

    state: {
      init(): SelectionHighlightState {
        return { type: null, index: null, tablePos: null };
      },
      apply(tr: Transaction, value: SelectionHighlightState): SelectionHighlightState {
        // 检查是否有高亮 meta
        const meta = tr.getMeta(HIGHLIGHT_META_KEY) as SelectionHighlightState | undefined;
        if (meta !== undefined) {
          return meta;
        }
        // 如果文档有变化，需要清除高亮（因为位置可能变了）
        if (tr.docChanged && value.tablePos !== null) {
          return { type: null, index: null, tablePos: null };
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
      // 拦截表格行/列拖拽的 drop 事件，防止编辑器将拖拽数据插入为文本
      handleDrop(_view, event) {
        // 检查是否是我们的表格拖拽数据
        if (event.dataTransfer?.types.includes('application/x-table-drag')) {
          // 完全阻止 ProseMirror 的默认 drop 处理
          // 实际的移动操作由 setupTableDropZone 中的 handleDrop 处理
          return true;
        }
        // 如果当前正在进行表格拖拽，也阻止默认行为
        if (dragState.isDragging) {
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        click: handleCellClick,
        pointerleave: handlePointerLeave,
      },
    },

    view(view) {
      // 保存本实例的 view 引用，用于 destroy 时比较
      const instanceView = view;
      currentView = view;

      // 清理 DOM 中所有现有的手柄元素（确保只有一个实例的手柄）
      document.querySelectorAll('.table-handle, .add-line, .table-drag-indicator').forEach((el) => {
        el.remove();
      });

      // 创建新的手柄元素并赋值给全局 elements
      const colHandle = createHandleElement('col');
      const rowHandle = createHandleElement('row');
      const colAddLine = createAddLine('col');
      const rowAddLine = createAddLine('row');
      const dragIndicator = createDragIndicator();

      // 同步更新全局 elements
      elements.colHandle = colHandle;
      elements.rowHandle = rowHandle;
      elements.colAddLine = colAddLine;
      elements.rowAddLine = rowAddLine;
      elements.dragIndicator = dragIndicator;

      // 添加手柄到容器的函数
      const appendHandlesToContainer = () => {
        const container = getPositionContainer();
        if (container) {
          // 检查元素是否已经在容器中
          if (colHandle && !container.contains(colHandle)) {
            container.appendChild(colHandle);
          }
          if (rowHandle && !container.contains(rowHandle)) {
            container.appendChild(rowHandle);
          }
          if (colAddLine && !container.contains(colAddLine)) {
            container.appendChild(colAddLine);
          }
          if (rowAddLine && !container.contains(rowAddLine)) {
            container.appendChild(rowAddLine);
          }
          if (dragIndicator && !container.contains(dragIndicator)) {
            container.appendChild(dragIndicator);
          }
          return true;
        }
        return false;
      };

      // 使用多次重试来确保手柄被添加到容器
      const tryAppendWithRetry = (attempts: number = 0) => {
        if (attempts > 10) {
          console.warn('Table handle: Failed to append handles to container after 10 attempts');
          return;
        }
        if (!appendHandlesToContainer()) {
          // 使用递增延迟重试
          setTimeout(() => tryAppendWithRetry(attempts + 1), 50 * (attempts + 1));
        }
      };

      // 尝试立即添加，如果失败则启动重试
      tryAppendWithRetry();

      return {
        update(view) {
          // 确保手柄元素已添加到容器（处理延迟加载的情况）
          if (colHandle && !colHandle.parentElement) {
            appendHandlesToContainer();
          }
          // 同步确保全局 elements 是最新的（处理多实例问题）
          if (elements.colHandle !== colHandle) {
            elements.colHandle = colHandle;
            elements.rowHandle = rowHandle;
            elements.colAddLine = colAddLine;
            elements.rowAddLine = rowAddLine;
            elements.dragIndicator = dragIndicator;
          }
          // 监听选区变化
          handleSelectionChange(view);
        },
        destroy() {
          colHandle?.remove();
          rowHandle?.remove();
          colAddLine?.remove();
          rowAddLine?.remove();
          dragIndicator?.remove();
          // 只有当全局 elements 指向本实例的元素时才清空
          if (elements.colHandle === colHandle) {
            elements = {
              colHandle: null,
              rowHandle: null,
              colAddLine: null,
              rowAddLine: null,
              dragIndicator: null,
            };
          }
          clearHideTimer();
          // 只有当 currentView 指向本实例时才清空
          if (currentView === instanceView) {
            currentView = null;
            currentFocusedCell = null;
            positionContainer = null; // 清理定位容器引用
          }
        },
      };
    },
  });
});

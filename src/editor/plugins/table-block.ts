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

function getPositionContainer(): HTMLElement | null {
  if (positionContainer) return positionContainer;

  // 查找 .milkdown-editor-root 作为定位参照容器
  positionContainer = document.querySelector('.milkdown-editor-root') as HTMLElement | null;
  return positionContainer;
}

function positionHandles(cell: HTMLTableCellElement, table: HTMLTableElement) {
  const container = getPositionContainer();
  if (!container) return;

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
    elements.colHandle.dataset.state =
      type === 'col' ? state : state === 'hidden' ? 'hidden' : 'bar';
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

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', JSON.stringify({ type, index }));

  // 创建拖拽预览
  const preview = createDragPreview();
  if (preview) {
    event.dataTransfer.setDragImage(preview, 0, 0);
    setTimeout(() => preview.remove(), 0);
  }
}

function createDragPreview(): HTMLElement | null {
  const { type, tableElement } = stateContext;
  const colIndex = elements.colHandle?.dataset.colIndex;
  const rowIndex = elements.rowHandle?.dataset.rowIndex;

  if (!tableElement) return null;

  const preview = document.createElement('div');
  preview.className = 'drag-preview';
  preview.style.position = 'fixed';
  preview.style.top = '-9999px';
  preview.style.left = '-9999px';

  if (type === 'col' && colIndex !== undefined) {
    const idx = parseInt(colIndex);
    // 复制整列
    const rows = tableElement.querySelectorAll('tr');
    const table = document.createElement('table');
    rows.forEach((row) => {
      const newRow = document.createElement('tr');
      const cells = row.querySelectorAll('th, td');
      if (cells[idx]) {
        newRow.appendChild(cells[idx].cloneNode(true));
      }
      table.appendChild(newRow);
    });
    preview.appendChild(table);
  } else if (type === 'row' && rowIndex !== undefined) {
    const idx = parseInt(rowIndex);
    // 复制整行
    const rows = tableElement.querySelectorAll('tr');
    if (rows[idx]) {
      const table = document.createElement('table');
      table.appendChild(rows[idx].cloneNode(true));
      preview.appendChild(table);
    }
  }

  document.body.appendChild(preview);
  return preview;
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
    positionHandles(cellNode, tableNode);

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
      handleDOMEvents: {
        click: handleCellClick,
        pointerleave: handlePointerLeave,
      },
    },

    view(view) {
      currentView = view;

      // 创建手柄元素
      elements.colHandle = createHandleElement('col');
      elements.rowHandle = createHandleElement('row');
      elements.colAddLine = createAddLine('col');
      elements.rowAddLine = createAddLine('row');

      // 添加到 milkdown-editor-root 容器（用于 absolute 定位）
      const container = getPositionContainer();
      if (container) {
        container.appendChild(elements.colHandle);
        container.appendChild(elements.rowHandle);
        container.appendChild(elements.colAddLine);
        container.appendChild(elements.rowAddLine);
      }

      return {
        update(view) {
          // 监听选区变化
          handleSelectionChange(view);
        },
        destroy() {
          elements.colHandle?.remove();
          elements.rowHandle?.remove();
          elements.colAddLine?.remove();
          elements.rowAddLine?.remove();
          elements = {
            colHandle: null,
            rowHandle: null,
            colAddLine: null,
            rowAddLine: null,
          };
          clearHideTimer();
          currentView = null;
          currentFocusedCell = null;
          positionContainer = null; // 清理定位容器引用
        },
      };
    },
  });
});

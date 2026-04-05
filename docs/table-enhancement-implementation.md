# 表格增强插件实现文档

> 本文档供 AI 直接执行实现，无需额外对话确认

## 一、目标

**移除** `@milkdown/kit/component/table-block`，**自定义实现**完整的表格增强插件，复刻 Notion 表格交互体验。

## 二、需要实现的功能

### 功能清单

| 编号 | 功能 | 说明 |
|------|------|------|
| F1 | 添加行（上方/下方） | 点击行手柄菜单或表格底部 `+` 按钮 |
| F2 | 添加列（左侧/右侧） | 点击列手柄菜单或表格右侧 `+` 按钮 |
| F3 | 删除行 | 点击行手柄菜单中的删除按钮 |
| F4 | 删除列 | 点击列手柄菜单中的删除按钮 |
| F5 | 拖拽调整列宽 | 在列边缘拖拽改变列宽度 |
| F6 | 列对齐（左/中/右） | 点击列手柄菜单中的对齐按钮 |
| F7 | 点击行手柄选中整行 | 选中后高亮显示整行 |
| F8 | 点击列手柄选中整列 | 选中后高亮显示整列 |
| F9 | 拖拽行手柄移动行 | 拖拽行手柄调整行顺序 |
| F10 | 拖拽列手柄移动列 | 拖拽列手柄调整列顺序 |

### Notion 风格交互规范

**六状态机**：

```
HIDDEN → BAR → HOVER → SELECTED ⇄ SELECTED_NO_MENU → HIDDEN
                 ↓
              DRAGGING → SELECTED_NO_MENU
```

| 状态 | 触发条件 | 外观 | 下一状态 |
|------|----------|------|----------|
| HIDDEN | 鼠标离开表格 200ms | 不可见 | → pointerEnterCell → BAR |
| BAR | 鼠标在单元格内 | 细条（4px），无图标，灰色 | → pointerEnterHandle → HOVER |
| HOVER | 鼠标在手柄上 | 正常尺寸，白底，灰色六点图标 | → click → SELECTED |
| SELECTED | 点击手柄 | 蓝色背景，白色图标，**显示菜单** | → clickOutside → SELECTED_NO_MENU |
| SELECTED_NO_MENU | 点击外部 | 蓝色背景，白色图标，**菜单隐藏** | → clickOutside → HIDDEN / → click → SELECTED |
| DRAGGING | 开始拖拽 | 显示拖拽预览 | → dragEnd → SELECTED_NO_MENU |

**关键交互**：
- 操作菜单（button-group）只在 **SELECTED** 状态显示
- 点击外部区域：SELECTED → SELECTED_NO_MENU（菜单关闭，选中保持）
- 再次点击外部：SELECTED_NO_MENU → HIDDEN（完全隐藏）

## 三、文件修改清单

### 需要修改的文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/editor/plugins/table-block.ts` | **重写** | 移除对 `@milkdown/kit/component/table-block` 的依赖，实现自定义表格手柄插件 |
| `src/editor/plugins/table-column-resize.ts` | **修改** | 修复列宽拖拽不生效的问题 |
| `src/editor/editor-setup.ts` | **修改** | 更新插件注册，移除 `tableBlock` 和 `configureTableBlock` |
| `src/styles/editor.css` | **修改** | 更新表格相关样式，添加六状态机样式 |

### 需要新建的文件

无需新建文件，所有逻辑在 `table-block.ts` 中实现。

## 四、详细实现步骤

### 步骤 1：修改 `editor-setup.ts`

**位置**：`src/editor/editor-setup.ts`

**修改内容**：

1. 移除导入：
```typescript
// 删除这行
import { tableBlock, configureTableBlock } from './plugins/table-block';
```

2. 改为导入新插件：
```typescript
import { tableHandlePlugin } from './plugins/table-block';
```

3. 移除配置调用：
```typescript
// 删除这行
.config(configureTableBlock)
```

4. 替换插件使用：
```typescript
// 删除这行
.use(tableBlock)
// 改为
.use(tableHandlePlugin)
```

---

### 步骤 2：重写 `table-block.ts`

**位置**：`src/editor/plugins/table-block.ts`

**完整实现**：

```typescript
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
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  goToNextCell,
  setCellAttr,
  selectedRect,
  CellSelection,
} from '@milkdown/kit/prose/tables';
import type { Node as ProsemirrorNode } from '@milkdown/kit/prose/model';

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUGIN_KEY = new PluginKey('TABLE_HANDLE');
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

// ---------------------------------------------------------------------------
// State Machine
// ---------------------------------------------------------------------------

function transitionState(
  event: 'pointerEnterCell' | 'pointerEnterHandle' | 'pointerLeaveHandle' | 'pointerLeaveTable' | 'click' | 'clickOutside' | 'dragStart' | 'dragEnd'
): HandleState {
  const { state } = stateContext;

  switch (state) {
    case 'hidden':
      if (event === 'pointerEnterCell') return 'bar';
      return 'hidden';

    case 'bar':
      if (event === 'pointerEnterHandle') return 'hover';
      if (event === 'pointerLeaveTable') return 'hidden';
      return 'bar';

    case 'hover':
      if (event === 'click') return 'selected';
      if (event === 'pointerLeaveHandle') return 'bar';
      if (event === 'dragStart') return 'dragging';
      return 'hover';

    case 'selected':
      if (event === 'clickOutside') return 'selected_no_menu';
      if (event === 'click') return 'selected';
      if (event === 'dragStart') return 'dragging';
      return 'selected';

    case 'selected_no_menu':
      if (event === 'clickOutside') return 'hidden';
      if (event === 'click') return 'selected';
      if (event === 'pointerEnterHandle') return 'selected';
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
    if (stateContext.state === 'bar' || stateContext.state === 'selected_no_menu') {
      setState(transitionState('pointerEnterHandle'));
    }
  });

  handle.addEventListener('pointerleave', (e) => {
    // 如果移动到菜单上，不触发离开
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (relatedTarget?.closest('.button-group')) return;
    
    if (stateContext.state === 'hover') {
      setState(transitionState('pointerLeaveHandle'));
    }
  });

  handle.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    // 点击菜单按钮不触发状态变化
    if ((e.target as HTMLElement).closest('.button-group button')) return;
    
    if (stateContext.state === 'hover' || stateContext.state === 'selected_no_menu') {
      setState(transitionState('click'));
      selectRowOrColumn();
    }
  });

  // 拖拽支持
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => {
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
    group.appendChild(createMenuButton('insertColLeft', icons.insertColLeft, '在左侧插入列', () => executeCommand(addColumnBefore)));
    group.appendChild(createMenuButton('insertColRight', icons.insertColRight, '在右侧插入列', () => executeCommand(addColumnAfter)));
    group.appendChild(createSeparator());
    group.appendChild(createMenuButton('alignLeft', icons.alignLeft, '左对齐', () => setColumnAlign('left')));
    group.appendChild(createMenuButton('alignCenter', icons.alignCenter, '居中对齐', () => setColumnAlign('center')));
    group.appendChild(createMenuButton('alignRight', icons.alignRight, '右对齐', () => setColumnAlign('right')));
    group.appendChild(createSeparator());
    group.appendChild(createMenuButton('deleteCol', icons.delete, '删除列', () => executeCommand(deleteColumn)));
  } else {
    // 行操作：上插入、下插入 | 删除
    group.appendChild(createMenuButton('insertRowAbove', icons.insertRowAbove, '在上方插入行', () => executeCommand(addRowBefore)));
    group.appendChild(createMenuButton('insertRowBelow', icons.insertRowBelow, '在下方插入行', () => executeCommand(addRowAfter)));
    group.appendChild(createSeparator());
    group.appendChild(createMenuButton('deleteRow', icons.delete, '删除行', () => executeCommand(deleteRow)));
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
  onClick: () => void
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
    if (type === 'col') {
      executeCommand(addColumnAfter);
    } else {
      executeCommand(addRowAfter);
    }
  });

  line.appendChild(btn);
  return line;
}

// ---------------------------------------------------------------------------
// Handle Positioning
// ---------------------------------------------------------------------------

function positionHandles(cell: HTMLTableCellElement, table: HTMLTableElement) {
  const tableRect = table.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();

  // 计算行列索引
  const row = cell.parentElement as HTMLTableRowElement;
  const rowIndex = Array.from(table.querySelectorAll('tr')).indexOf(row);
  const colIndex = Array.from(row.cells).indexOf(cell);

  stateContext.index = stateContext.type === 'col' ? colIndex : rowIndex;
  stateContext.tableElement = table;

  // 定位列手柄（单元格上方）
  if (elements.colHandle) {
    elements.colHandle.style.position = 'fixed';
    elements.colHandle.style.left = `${cellRect.left + cellRect.width / 2}px`;
    elements.colHandle.style.top = `${cellRect.top - 28}px`;
    elements.colHandle.style.transform = 'translateX(-50%)';
    elements.colHandle.dataset.colIndex = String(colIndex);
  }

  // 定位行手柄（单元格左侧）
  if (elements.rowHandle) {
    elements.rowHandle.style.position = 'fixed';
    elements.rowHandle.style.left = `${cellRect.left - 28}px`;
    elements.rowHandle.style.top = `${cellRect.top + cellRect.height / 2}px`;
    elements.rowHandle.style.transform = 'translateY(-50%)';
    elements.rowHandle.dataset.rowIndex = String(rowIndex);
  }

  // 定位添加列线（表格右侧）
  if (elements.colAddLine) {
    elements.colAddLine.style.position = 'fixed';
    elements.colAddLine.style.left = `${tableRect.right + 8}px`;
    elements.colAddLine.style.top = `${tableRect.top}px`;
    elements.colAddLine.style.height = `${tableRect.height}px`;
  }

  // 定位添加行线（表格底部）
  if (elements.rowAddLine) {
    elements.rowAddLine.style.position = 'fixed';
    elements.rowAddLine.style.left = `${tableRect.left}px`;
    elements.rowAddLine.style.top = `${tableRect.bottom + 8}px`;
    elements.rowAddLine.style.width = `${tableRect.width}px`;
  }
}

// ---------------------------------------------------------------------------
// Visual Updates
// ---------------------------------------------------------------------------

function updateHandleVisuals() {
  const { state, type } = stateContext;

  // 更新列手柄
  if (elements.colHandle) {
    elements.colHandle.dataset.state = type === 'col' ? state : (state === 'hidden' ? 'hidden' : 'bar');
    const colMenu = elements.colHandle.querySelector('.button-group') as HTMLElement;
    if (colMenu) {
      colMenu.dataset.show = (type === 'col' && state === 'selected') ? 'true' : 'false';
    }
  }

  // 更新行手柄
  if (elements.rowHandle) {
    elements.rowHandle.dataset.state = type === 'row' ? state : (state === 'hidden' ? 'hidden' : 'bar');
    const rowMenu = elements.rowHandle.querySelector('.button-group') as HTMLElement;
    if (rowMenu) {
      rowMenu.dataset.show = (type === 'row' && state === 'selected') ? 'true' : 'false';
    }
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
  const { state, type, index, tableElement } = stateContext;

  // 清除之前的高亮
  document.querySelectorAll('.selected-col, .selected-row').forEach((el) => {
    el.classList.remove('selected-col');
  });
  document.querySelectorAll('tr.selected-row').forEach((el) => {
    el.classList.remove('selected-row');
  });

  if (!tableElement || index === null) return;
  if (state !== 'selected' && state !== 'selected_no_menu') return;

  if (type === 'col') {
    // 高亮整列
    const rows = tableElement.querySelectorAll('tr');
    rows.forEach((row) => {
      const cells = row.querySelectorAll('th, td');
      if (cells[index]) {
        cells[index].classList.add('selected-col');
      }
    });
  } else if (type === 'row') {
    // 高亮整行
    const rows = tableElement.querySelectorAll('tr');
    if (rows[index]) {
      rows[index].classList.add('selected-row');
    }
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function executeCommand(command: (state: any, dispatch?: any) => boolean) {
  if (!currentView) return;
  command(currentView.state, currentView.dispatch);
  currentView.focus();
}

function setColumnAlign(align: 'left' | 'center' | 'right') {
  if (!currentView || stateContext.index === null) return;
  
  const { state, dispatch } = currentView;
  const { selection } = state;
  
  // 获取表格选区
  if (!(selection instanceof CellSelection)) {
    // 如果不是 CellSelection，需要先选中整列
    selectRowOrColumn();
  }

  // 设置列对齐
  const colIndex = stateContext.index;
  const { tr } = state;
  
  // 遍历表格所有行，设置对应列的对齐方式
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      node.forEach((row, rowOffset) => {
        if (row.type.name === 'table_row') {
          let cellIndex = 0;
          row.forEach((cell, cellOffset) => {
            if (cellIndex === colIndex) {
              const cellPos = pos + 1 + rowOffset + 1 + cellOffset;
              tr.setNodeMarkup(cellPos, undefined, {
                ...cell.attrs,
                alignment: align,
              });
            }
            cellIndex += cell.attrs.colspan || 1;
          });
        }
      });
      return false;
    }
    return true;
  });

  dispatch(tr);
  currentView.focus();
}

function selectRowOrColumn() {
  if (!currentView || stateContext.index === null || !stateContext.tableElement) return;
  
  const { state, dispatch } = currentView;
  const { type, index } = stateContext;

  // 查找表格在文档中的位置
  let tablePos = -1;
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      const dom = currentView!.nodeDOM(pos) as HTMLElement;
      if (dom && dom.contains(stateContext.tableElement)) {
        tablePos = pos;
        return false;
      }
    }
    return true;
  });

  if (tablePos === -1) return;

  const tableNode = state.doc.nodeAt(tablePos);
  if (!tableNode) return;

  // 创建 CellSelection
  const map = tableNode.type.spec.tableRole === 'table' 
    ? selectedRect(state).map 
    : null;

  if (type === 'col' && map) {
    // 选中整列
    const anchorCell = map.positionAt(0, index, tableNode);
    const headCell = map.positionAt(map.height - 1, index, tableNode);
    const $anchor = state.doc.resolve(tablePos + anchorCell + 1);
    const $head = state.doc.resolve(tablePos + headCell + 1);
    const selection = new CellSelection($anchor, $head);
    dispatch(state.tr.setSelection(selection));
  } else if (type === 'row' && map) {
    // 选中整行
    const anchorCell = map.positionAt(index, 0, tableNode);
    const headCell = map.positionAt(index, map.width - 1, tableNode);
    const $anchor = state.doc.resolve(tablePos + anchorCell + 1);
    const $head = state.doc.resolve(tablePos + headCell + 1);
    const selection = new CellSelection($anchor, $head);
    dispatch(state.tr.setSelection(selection));
  }
}

// ---------------------------------------------------------------------------
// Drag & Drop
// ---------------------------------------------------------------------------

function setupDragData(event: DragEvent) {
  if (!event.dataTransfer) return;
  
  const { type, index } = stateContext;
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
  const { type, index, tableElement } = stateContext;
  if (!tableElement || index === null) return null;

  const preview = document.createElement('div');
  preview.className = 'drag-preview';
  preview.style.position = 'fixed';
  preview.style.top = '-9999px';
  preview.style.left = '-9999px';

  if (type === 'col') {
    // 复制整列
    const rows = tableElement.querySelectorAll('tr');
    const table = document.createElement('table');
    rows.forEach((row) => {
      const newRow = document.createElement('tr');
      const cells = row.querySelectorAll('th, td');
      if (cells[index]) {
        newRow.appendChild(cells[index].cloneNode(true));
      }
      table.appendChild(newRow);
    });
    preview.appendChild(table);
  } else if (type === 'row') {
    // 复制整行
    const rows = tableElement.querySelectorAll('tr');
    if (rows[index]) {
      const table = document.createElement('table');
      table.appendChild(rows[index].cloneNode(true));
      preview.appendChild(table);
    }
  }

  document.body.appendChild(preview);
  return preview;
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

function handlePointerMove(view: EditorView, event: PointerEvent): boolean {
  const target = event.target as HTMLElement;

  // 检查是否在表格手柄或菜单上
  if (target.closest('.table-handle') || target.closest('.button-group') || target.closest('.add-line')) {
    return false;
  }

  // 检查是否在表格单元格内
  const cell = target.closest('th, td') as HTMLTableCellElement | null;
  const table = target.closest('table') as HTMLTableElement | null;

  if (cell && table) {
    clearHideTimer();
    
    // 判断是靠近列手柄还是行手柄
    const cellRect = cell.getBoundingClientRect();
    const isNearTop = event.clientY < cellRect.top + cellRect.height * 0.3;
    const isNearLeft = event.clientX < cellRect.left + cellRect.width * 0.3;

    if (isNearTop) {
      stateContext.type = 'col';
    } else if (isNearLeft) {
      stateContext.type = 'row';
    }

    positionHandles(cell, table);

    if (stateContext.state === 'hidden') {
      setState(transitionState('pointerEnterCell'));
    }
  } else {
    // 离开表格
    startHideTimer();
  }

  return false;
}

function handlePointerLeave(view: EditorView, event: PointerEvent): boolean {
  const relatedTarget = event.relatedTarget as HTMLElement;

  // 如果移动到手柄或菜单上，不触发隐藏
  if (relatedTarget?.closest('.table-handle') || relatedTarget?.closest('.add-line')) {
    return false;
  }

  startHideTimer();
  return false;
}

function handleClick(view: EditorView, event: MouseEvent): boolean {
  const target = event.target as HTMLElement;

  // 点击手柄或菜单不处理
  if (target.closest('.table-handle') || target.closest('.add-line')) {
    return false;
  }

  // 点击外部区域
  if (stateContext.state === 'selected' || stateContext.state === 'selected_no_menu') {
    setState(transitionState('clickOutside'));
    return false;
  }

  return false;
}

function startHideTimer() {
  clearHideTimer();
  hideTimer = setTimeout(() => {
    setState(transitionState('pointerLeaveTable'));
  }, HIDE_DELAY);
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const tableHandlePlugin = $prose(() => {
  return new Plugin({
    key: PLUGIN_KEY,

    view(view) {
      currentView = view;

      // 创建手柄元素
      elements.colHandle = createHandleElement('col');
      elements.rowHandle = createHandleElement('row');
      elements.colAddLine = createAddLine('col');
      elements.rowAddLine = createAddLine('row');

      // 添加到编辑器
      const container = view.dom.parentElement;
      if (container) {
        container.appendChild(elements.colHandle);
        container.appendChild(elements.rowHandle);
        container.appendChild(elements.colAddLine);
        container.appendChild(elements.rowAddLine);
      }

      return {
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
        },
      };
    },

    props: {
      handleDOMEvents: {
        pointermove: handlePointerMove,
        pointerleave: handlePointerLeave,
        click: handleClick,
      },
    },
  });
});
```

---

### 步骤 3：修复 `table-column-resize.ts`

**位置**：`src/editor/plugins/table-column-resize.ts`

**修改内容**：

修改 `setColumnWidth` 函数，确保宽度生效：

```typescript
/**
 * Set column width for all cells in a column
 * 同时设置 colgroup/col 和所有单元格的宽度
 */
function setColumnWidth(table: HTMLTableElement, colIndex: number, width: number) {
  // 1. 确保表格使用固定布局
  table.style.tableLayout = 'fixed';
  
  // 2. 更新或创建 colgroup
  let colgroup = table.querySelector('colgroup');
  if (!colgroup) {
    colgroup = document.createElement('colgroup');
    const firstRow = table.querySelector('tr');
    const colCount = firstRow ? firstRow.querySelectorAll('th, td').length : 0;
    for (let i = 0; i < colCount; i++) {
      colgroup.appendChild(document.createElement('col'));
    }
    table.insertBefore(colgroup, table.firstChild);
  }

  // 3. 设置 col 宽度
  const cols = colgroup.querySelectorAll('col');
  if (cols[colIndex]) {
    (cols[colIndex] as HTMLElement).style.width = `${width}px`;
  }

  // 4. 设置所有单元格宽度
  const rows = table.querySelectorAll('tr');
  rows.forEach((row) => {
    const cells = row.querySelectorAll('th, td');
    let currentIndex = 0;
    cells.forEach((cell) => {
      const cellElement = cell as HTMLTableCellElement;
      const colspan = cellElement.colSpan || 1;
      if (currentIndex === colIndex) {
        cellElement.style.width = `${width}px`;
        cellElement.style.minWidth = `${width}px`;
        cellElement.style.maxWidth = `${width}px`;
      }
      currentIndex += colspan;
    });
  });
}
```

---

### 步骤 4：更新 `editor.css`

**位置**：`src/styles/editor.css`

**修改内容**：

1. **删除**旧的 `.milkdown-table-block .cell-handle` 和 `.milkdown-table-block .line-handle` 相关样式（约 2000-2357 行）

2. **添加**新的表格手柄样式：

```css
/* =====================================================
   Table Handle Plugin - Notion Style
   ===================================================== */

/* Container needs relative positioning */
.milkdown-editor-root .ProseMirror {
  position: relative;
}

/* ===== Handle Base Styles ===== */
.table-handle {
  position: fixed;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
  transition: all 0.15s ease;
  border-radius: 4px;
}

.table-handle:active {
  cursor: grabbing;
}

/* ===== State: HIDDEN ===== */
.table-handle[data-state='hidden'] {
  opacity: 0;
  pointer-events: none;
}

/* ===== State: BAR (细条状) ===== */
.table-handle[data-state='bar'] {
  opacity: 1;
  pointer-events: auto;
  background-color: var(--editor-border);
  border: none;
}

.table-handle[data-type='col'][data-state='bar'] {
  width: auto;
  min-width: 24px;
  height: 4px;
  padding: 0;
  border-radius: 2px;
}

.table-handle[data-type='row'][data-state='bar'] {
  width: 4px;
  height: auto;
  min-height: 24px;
  padding: 0;
  border-radius: 2px;
}

.table-handle[data-state='bar'] .handle-icon {
  display: none;
}

/* ===== State: HOVER ===== */
.table-handle[data-state='hover'] {
  opacity: 1;
  pointer-events: auto;
  background-color: #fff;
  border: 1px solid var(--editor-border);
  color: #6b7280;
}

.table-handle[data-type='col'][data-state='hover'] {
  width: auto;
  min-width: 24px;
  height: 20px;
  padding: 0 8px;
}

.table-handle[data-type='row'][data-state='hover'] {
  width: 20px;
  height: auto;
  min-height: 24px;
  padding: 8px 0;
  flex-direction: column;
}

.table-handle[data-state='hover'] .handle-icon {
  display: flex;
}

/* ===== State: SELECTED / SELECTED_NO_MENU ===== */
.table-handle[data-state='selected'],
.table-handle[data-state='selected_no_menu'] {
  opacity: 1;
  pointer-events: auto;
  background-color: var(--accent);
  border: 1px solid var(--accent);
  color: #fff;
}

.table-handle[data-type='col'][data-state='selected'],
.table-handle[data-type='col'][data-state='selected_no_menu'] {
  width: auto;
  min-width: 24px;
  height: 20px;
  padding: 0 8px;
}

.table-handle[data-type='row'][data-state='selected'],
.table-handle[data-type='row'][data-state='selected_no_menu'] {
  width: 20px;
  height: auto;
  min-height: 24px;
  padding: 8px 0;
  flex-direction: column;
}

.table-handle[data-state='selected']:hover,
.table-handle[data-state='selected_no_menu']:hover {
  background-color: var(--accent-hover);
  border-color: var(--accent-hover);
}

.table-handle[data-state='selected'] .handle-icon,
.table-handle[data-state='selected_no_menu'] .handle-icon {
  display: flex;
}

/* ===== State: DRAGGING ===== */
.table-handle[data-state='dragging'] {
  opacity: 0.6;
  cursor: grabbing;
}

/* ===== Handle Icon ===== */
.table-handle .handle-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.table-handle .handle-icon svg {
  width: 14px;
  height: 14px;
}

/* ===== Button Group (Menu) ===== */
.table-handle .button-group {
  position: absolute;
  display: none;
  align-items: center;
  gap: 2px;
  background: var(--editor-bg);
  border: 1px solid var(--editor-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  padding: 4px;
  z-index: 200;
  white-space: nowrap;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
}

.dark .table-handle .button-group {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

.table-handle .button-group[data-show='true'] {
  display: flex;
  animation: tableMenuIn 0.12s ease-out;
}

@keyframes tableMenuIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* Menu Buttons */
.table-handle .button-group .menu-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--editor-text);
  transition: all 0.15s ease;
}

.table-handle .button-group .menu-button:hover {
  background-color: rgba(37, 99, 235, 0.08);
  color: var(--accent);
}

.table-handle .button-group .menu-button[data-type='deleteCol']:hover,
.table-handle .button-group .menu-button[data-type='deleteRow']:hover {
  background-color: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.table-handle .button-group .menu-button svg {
  width: 14px;
  height: 14px;
}

/* Separator */
.table-handle .button-group .separator {
  width: 1px;
  height: 20px;
  background: var(--editor-border);
  margin: 0 2px;
  flex-shrink: 0;
}

/* ===== Add Line ===== */
.add-line {
  position: fixed;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s ease;
}

.add-line[data-show='false'] {
  opacity: 0;
  pointer-events: none;
}

.add-line[data-show='true'] {
  opacity: 1;
}

.add-line[data-type='col'] {
  width: 2px;
  background: var(--accent);
  opacity: 0.3;
}

.add-line[data-type='row'] {
  height: 2px;
  background: var(--accent);
  opacity: 0.3;
}

.add-line[data-show='true']:hover {
  opacity: 1;
}

/* Add Button */
.add-line .add-button {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: var(--editor-bg);
  border: 1px solid var(--accent);
  border-radius: 50%;
  color: var(--accent);
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-line .add-button:hover {
  background: var(--accent);
  color: #fff;
  transform: scale(1.1);
}

.add-line .add-button svg {
  width: 12px;
  height: 12px;
}

.add-line[data-type='col'] .add-button {
  top: 50%;
  transform: translateY(-50%);
}

.add-line[data-type='col'] .add-button:hover {
  transform: translateY(-50%) scale(1.1);
}

.add-line[data-type='row'] .add-button {
  left: 50%;
  transform: translateX(-50%);
}

.add-line[data-type='row'] .add-button:hover {
  transform: translateX(-50%) scale(1.1);
}

/* ===== Selection Highlight ===== */
.milkdown-editor-root .ProseMirror table th.selected-col,
.milkdown-editor-root .ProseMirror table td.selected-col {
  background-color: rgba(37, 99, 235, 0.08);
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.milkdown-editor-root .ProseMirror table tr.selected-row th,
.milkdown-editor-root .ProseMirror table tr.selected-row td {
  background-color: rgba(37, 99, 235, 0.08);
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.dark .milkdown-editor-root .ProseMirror table th.selected-col,
.dark .milkdown-editor-root .ProseMirror table td.selected-col,
.dark .milkdown-editor-root .ProseMirror table tr.selected-row th,
.dark .milkdown-editor-root .ProseMirror table tr.selected-row td {
  background-color: rgba(122, 162, 247, 0.12);
}

/* ===== Drag Preview ===== */
.drag-preview {
  background: var(--editor-bg);
  border: 2px solid var(--accent);
  border-radius: 4px;
  opacity: 0.8;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.drag-preview table {
  margin: 0;
  border-collapse: collapse;
}

.drag-preview th,
.drag-preview td {
  padding: 8px 12px;
  border: 1px solid var(--editor-border);
  background: var(--editor-bg);
}

/* ===== Dark Mode ===== */
.dark .table-handle[data-state='bar'] {
  background-color: var(--editor-border);
}

.dark .table-handle[data-state='hover'] {
  background-color: var(--sidebar-bg);
  border-color: var(--editor-border);
  color: var(--sidebar-text);
}
```

---

## 五、实现顺序

按以下顺序执行：

1. **步骤 1**：修改 `editor-setup.ts`，移除旧导入和配置
2. **步骤 2**：重写 `table-block.ts`，实现新插件
3. **步骤 3**：修复 `table-column-resize.ts`
4. **步骤 4**：更新 `editor.css`，删除旧样式并添加新样式

## 六、验证清单

实现完成后，验证以下功能：

- [ ] 鼠标进入单元格，显示细条状手柄（BAR 状态）
- [ ] 鼠标悬停手柄，变为正常尺寸白底灰点（HOVER 状态）
- [ ] 点击手柄，变为蓝底白点并显示菜单（SELECTED 状态）
- [ ] 点击外部区域，菜单关闭但手柄保持蓝色（SELECTED_NO_MENU 状态）
- [ ] 再次点击外部，手柄完全隐藏（HIDDEN 状态）
- [ ] 点击菜单中的"添加行/列"按钮，正确添加行/列
- [ ] 点击菜单中的"删除行/列"按钮，正确删除行/列
- [ ] 点击菜单中的对齐按钮，正确设置列对齐
- [ ] 表格右侧的添加列线可见且可点击
- [ ] 表格底部的添加行线可见且可点击
- [ ] 拖拽列边缘，列宽正确改变
- [ ] 点击手柄时，对应行/列高亮显示
- [ ] 拖拽手柄可以移动行/列位置

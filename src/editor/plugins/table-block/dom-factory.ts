/**
 * Table Block Plugin - DOM Factory
 *
 * DOM 元素创建工厂（纯函数 + 回调）
 */

import { icons } from './types';
import type { HandleType } from './types';

// ---------------------------------------------------------------------------
// Callback Types
// ---------------------------------------------------------------------------

export interface HandleCallbacks {
  onPointerEnter: (type: HandleType) => void;
  onPointerLeave: (type: HandleType, relatedTarget: HTMLElement | null) => void;
  onClick: (type: HandleType, event: MouseEvent) => void;
  onDragStart: (type: HandleType, event: DragEvent) => void;
  onDragEnd: (type: HandleType) => void;
}

export interface MenuCallbacks {
  onInsertColumn: (direction: 'before' | 'after') => void;
  onInsertRow: (direction: 'before' | 'after') => void;
  onDeleteColumn: () => void;
  onDeleteRow: () => void;
  onSetColumnAlign: (align: 'left' | 'center' | 'right') => void;
}

export interface AddLineCallbacks {
  onAddColumn: () => void;
  onAddRow: () => void;
}

// ---------------------------------------------------------------------------
// DOM Creation Functions
// ---------------------------------------------------------------------------

/**
 * 创建手柄元素
 */
export function createHandleElement(
  type: HandleType,
  handleCallbacks: HandleCallbacks,
  menuCallbacks: MenuCallbacks,
): HTMLElement {
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
  const menu = createButtonGroup(type, menuCallbacks);
  handle.appendChild(menu);

  // 事件监听
  handle.addEventListener('pointerenter', () => {
    handleCallbacks.onPointerEnter(type);
  });

  handle.addEventListener('pointerleave', (e) => {
    handleCallbacks.onPointerLeave(type, e.relatedTarget as HTMLElement | null);
  });

  handle.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();

    // 点击菜单按钮不触发状态变化
    if ((e.target as HTMLElement).closest('.button-group button')) return;

    handleCallbacks.onClick(type, e);
  });

  // 拖拽支持
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => {
    handleCallbacks.onDragStart(type, e);
  });

  handle.addEventListener('dragend', () => {
    handleCallbacks.onDragEnd(type);
  });

  return handle;
}

/**
 * 创建菜单按钮组
 */
function createButtonGroup(type: HandleType, callbacks: MenuCallbacks): HTMLElement {
  const group = document.createElement('div');
  group.className = 'button-group';
  group.dataset.show = 'false';

  if (type === 'col') {
    // 列操作：左插入、右插入 | 左对齐、居中、右对齐 | 删除
    group.appendChild(
      createMenuButton('insertColLeft', icons.insertColLeft, '在左侧插入列', () =>
        callbacks.onInsertColumn('before'),
      ),
    );
    group.appendChild(
      createMenuButton('insertColRight', icons.insertColRight, '在右侧插入列', () =>
        callbacks.onInsertColumn('after'),
      ),
    );
    group.appendChild(createSeparator());
    group.appendChild(
      createMenuButton('alignLeft', icons.alignLeft, '左对齐', () =>
        callbacks.onSetColumnAlign('left'),
      ),
    );
    group.appendChild(
      createMenuButton('alignCenter', icons.alignCenter, '居中对齐', () =>
        callbacks.onSetColumnAlign('center'),
      ),
    );
    group.appendChild(
      createMenuButton('alignRight', icons.alignRight, '右对齐', () =>
        callbacks.onSetColumnAlign('right'),
      ),
    );
    group.appendChild(createSeparator());
    group.appendChild(
      createMenuButton('deleteCol', icons.delete, '删除列', () => callbacks.onDeleteColumn()),
    );
  } else {
    // 行操作：上插入、下插入 | 删除
    group.appendChild(
      createMenuButton('insertRowAbove', icons.insertRowAbove, '在上方插入行', () =>
        callbacks.onInsertRow('before'),
      ),
    );
    group.appendChild(
      createMenuButton('insertRowBelow', icons.insertRowBelow, '在下方插入行', () =>
        callbacks.onInsertRow('after'),
      ),
    );
    group.appendChild(createSeparator());
    // 删除行按钮（普通行显示）
    const deleteBtn = createMenuButton('deleteRow', icons.delete, '删除行', () =>
      callbacks.onDeleteRow(),
    );
    deleteBtn.dataset.forHeaderRow = 'false';
    group.appendChild(deleteBtn);
  }

  return group;
}

/**
 * 创建菜单按钮
 */
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

/**
 * 创建分隔符
 */
function createSeparator(): HTMLElement {
  const sep = document.createElement('div');
  sep.className = 'separator';
  return sep;
}

/**
 * 创建添加行/列线
 */
export function createAddLine(
  type: HandleType,
  callbacks: AddLineCallbacks,
): HTMLElement {
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
      callbacks.onAddColumn();
    } else {
      callbacks.onAddRow();
    }
  });

  line.appendChild(btn);
  return line;
}

/**
 * 创建拖拽指示线元素
 */
export function createDragIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'table-drag-indicator';
  indicator.dataset.show = 'false';
  indicator.dataset.type = '';
  indicator.contentEditable = 'false';
  return indicator;
}

// ---------------------------------------------------------------------------
// DOM Update Functions
// ---------------------------------------------------------------------------

/**
 * 更新行菜单中"在上方插入行"按钮的显示状态
 * 当选中表头行时，完全隐藏该按钮（Markdown 表格规范不允许在表头行上方插入行）
 */
export function updateInsertRowAboveButtonVisibility(rowHandle: HTMLElement | null): void {
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

/**
 * 更新行菜单中删除按钮的状态
 * 当选中表头行且存在普通行时，禁用删除按钮
 */
export function updateDeleteRowButtonState(
  rowHandle: HTMLElement | null,
  tableRowCount: number,
): void {
  if (!rowHandle) return;

  const buttonGroup = rowHandle.querySelector('.button-group');
  if (!buttonGroup) return;

  const deleteBtn = buttonGroup.querySelector('[data-type="deleteRow"]') as HTMLElement;
  if (!deleteBtn) return;

  const rowIndex = rowHandle.dataset.rowIndex;
  const isHeaderRow = rowIndex === '0';

  // 如果是表头行且存在普通行，则禁用删除按钮
  if (isHeaderRow && tableRowCount > 0) {
    deleteBtn.classList.add('disabled');
    deleteBtn.title = '请先删除所有数据行';
  } else {
    deleteBtn.classList.remove('disabled');
    deleteBtn.title = '删除行';
  }
}

/**
 * 更新菜单显示状态
 */
export function updateMenuVisibility(handle: HTMLElement | null, show: boolean): void {
  if (!handle) return;

  const menu = handle.querySelector('.button-group') as HTMLElement;
  if (menu) {
    menu.dataset.show = show ? 'true' : 'false';
  }
}

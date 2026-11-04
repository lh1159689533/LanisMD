/**
 * Board Canvas Toolbar - 画布级工具栏
 *
 * 浮于画板块右上角的画布级操作栏，由若干张独立卡片组成：
 * - 卡片 0：编辑 / 完成（可选，仅当宿主传入 `onToggleEdit` 时渲染）
 * - 卡片 1：手型/选择切换（仅编辑态）、适应画布、缩放（− / 百分比 / +）
 * - 卡片 2：主题切换（点击展开主题面板）
 * - 卡片 3：折叠 / 展开整条工具栏
 *
 * 实现约定（与 style-toolbar 保持一致）：
 * - 原生 DOM，不走 React：宿主把本控制器的 dom 挂到块级根容器（`this.dom`）上，
 *   不能挂到 React root 容器内——React reconcile 会移除其内部一切非托管 DOM。
 * - 根 DOM 必须带 Plait 的 `plait-board-attached` 类，否则点击工具栏的瞬间
 *   Plait 的 globalPointerUp 会清空画板选中态。
 * - 所有按钮用 `mousedown` + preventDefault + stopPropagation，避免抢走编辑器
 *   焦点或触发 ProseMirror 的节点选择。
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                                                     |
 * | v1.0.0 | 初始实现：指针模式/适应画布/缩放/主题/折叠        | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §二 |
 * | v1.1.0 | 新增可选的编辑/完成操作卡，与画布按钮同排同样式     | REQ: 20261026-board-fullscreen-maximize |
 * /@changelog
 *
 * @author hhhuilli
 */

import { ATTACHED_ELEMENT_CLASS_NAME } from '@plait/core';
import type { PlaitBoard, ThemeColorMode } from '@plait/core';

import { CANVAS_TOOLBAR_PREFIX, DEFAULT_THEME_MODE } from './constants';
import { CANVAS_ICONS } from './icons';
import { createThemePanel, type ThemePanelController } from './theme-panel';
import {
  canZoomIn,
  canZoomOut,
  fitViewport,
  getPointerMode,
  getZoom,
  resetZoom,
  setPointerMode,
  zoomIn,
  zoomOut,
} from './viewport-actions';
import type {
  CanvasToolbarCallbacks,
  CanvasToolbarController,
} from './types';
import type { BoardBlockState } from '../types';

export { CANVAS_TOOLBAR_PREFIX } from './constants';
export type { CanvasToolbarController } from './types';

/**
 * 创建一个工具栏按钮。
 *
 * @param modifier BEM 修饰名，生成 `__btn--{modifier}` 类
 * @param icon SVG 字符串
 * @param title 原生 tooltip 文案
 * @param onTrigger mousedown 触发的回调
 */
function createButton(
  modifier: string,
  icon: string,
  title: string,
  onTrigger: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `${CANVAS_TOOLBAR_PREFIX}__btn ${CANVAS_TOOLBAR_PREFIX}__btn--${modifier}`;
  btn.type = 'button';
  btn.title = title;
  btn.innerHTML = icon;
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (btn.disabled) return;
    onTrigger();
  });
  return btn;
}

/** 创建一张悬浮卡片容器 */
function createCard(modifier: string): HTMLElement {
  const card = document.createElement('div');
  card.className = `${CANVAS_TOOLBAR_PREFIX}__card ${CANVAS_TOOLBAR_PREFIX}__card--${modifier}`;
  return card;
}

/**
 * 创建画布级工具栏控制器。
 */
export function createCanvasToolbar(
  callbacks: CanvasToolbarCallbacks,
): CanvasToolbarController {
  let board: PlaitBoard | null = null;
  let blockState: BoardBlockState = 'preview';
  let collapsed = false;
  /** 还原被包装的 board.onChange */
  let unsubscribe: (() => void) | null = null;

  // --- 根容器 ---------------------------------------------------------------
  const dom = document.createElement('div');
  dom.className = `${CANVAS_TOOLBAR_PREFIX} ${ATTACHED_ELEMENT_CLASS_NAME}`;
  dom.setAttribute('data-block-state', blockState);
  dom.setAttribute('data-collapsed', 'false');

  // --- 卡片 0：编辑 / 完成（可选） ------------------------------------------
  // 仅在宿主提供 onToggleEdit 时渲染。主窗口 NodeView 的编辑入口在节点外竖排
  // 块工具栏上，不走这里；全屏子窗口没有块工具栏，由本卡片承担。
  let editBtn: HTMLButtonElement | null = null;
  if (callbacks.onToggleEdit) {
    const actionCard = createCard('action');
    editBtn = createButton('edit', CANVAS_ICONS.edit, '编辑思维导图', () => {
      callbacks.onToggleEdit?.();
    });
    actionCard.appendChild(editBtn);
    dom.appendChild(actionCard);
  }

  // --- 卡片 1：视图操作 -----------------------------------------------------
  const viewCard = createCard('view');

  const pointerBtn = createButton(
    'pointer',
    CANVAS_ICONS.hand,
    '拖拽画布',
    () => handlePointerToggle(),
  );
  viewCard.appendChild(pointerBtn);

  const fitBtn = createButton('fit', CANVAS_ICONS.fit, '适应画布', () => {
    fitViewport(board);
    sync();
  });
  viewCard.appendChild(fitBtn);

  const divider = document.createElement('span');
  divider.className = `${CANVAS_TOOLBAR_PREFIX}__divider`;
  viewCard.appendChild(divider);

  const zoomOutBtn = createButton('zoom-out', CANVAS_ICONS.zoomOut, '缩小', () => {
    zoomOut(board);
    sync();
  });
  viewCard.appendChild(zoomOutBtn);

  // 缩放百分比：点击重置为 100%
  const zoomLabel = document.createElement('button');
  zoomLabel.className = `${CANVAS_TOOLBAR_PREFIX}__zoom-label`;
  zoomLabel.type = 'button';
  zoomLabel.title = '恢复到 100%';
  zoomLabel.textContent = '100%';
  zoomLabel.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetZoom(board);
    sync();
  });
  viewCard.appendChild(zoomLabel);

  const zoomInBtn = createButton('zoom-in', CANVAS_ICONS.zoomIn, '放大', () => {
    zoomIn(board);
    sync();
  });
  viewCard.appendChild(zoomInBtn);

  dom.appendChild(viewCard);

  // --- 卡片 2：主题 ---------------------------------------------------------
  const themeCard = createCard('theme');
  const themeBtn = createButton('theme', CANVAS_ICONS.theme, '更换主题', () => {
    themePanel.toggle();
    themeBtn.classList.toggle('is-active', themePanel.isOpen);
  });
  themeCard.appendChild(themeBtn);

  const themePanel: ThemePanelController = createThemePanel((mode) => {
    handleThemeSelect(mode);
  });
  themeCard.appendChild(themePanel.dom);
  dom.appendChild(themeCard);

  // --- 卡片 3：折叠 ---------------------------------------------------------
  const collapseCard = createCard('collapse');
  const collapseBtn = createButton(
    'collapse',
    CANVAS_ICONS.collapse,
    '收起工具栏',
    () => setCollapsed(!collapsed),
  );
  collapseCard.appendChild(collapseBtn);
  dom.appendChild(collapseCard);

  // -------------------------------------------------------------------------
  // 交互处理
  // -------------------------------------------------------------------------

  /** 手型/选择 互切 */
  function handlePointerToggle(): void {
    const next = getPointerMode(board) === 'hand' ? 'selection' : 'hand';
    setPointerMode(board, next);
    sync();
  }

  /**
   * 选中某个主题。
   *
   * 只负责调用宿主回调，由宿主完成「写入 board + 持久化」。工具栏不直接操作
   * board，以便全屏窗口等其它宿主复用同一套交互而各自决定落盘方式。
   */
  function handleThemeSelect(mode: ThemeColorMode): void {
    callbacks.onThemeChange(mode);
    themeBtn.classList.remove('is-active');
    themePanel.setActive(mode);
  }

  /** 折叠 / 展开整条工具栏 */
  function setCollapsed(next: boolean): void {
    collapsed = next;
    dom.setAttribute('data-collapsed', next ? 'true' : 'false');
    collapseBtn.innerHTML = next ? CANVAS_ICONS.expand : CANVAS_ICONS.collapse;
    collapseBtn.title = next ? '展开工具栏' : '收起工具栏';
    if (next) {
      themePanel.close();
      themeBtn.classList.remove('is-active');
    }
  }

  // -------------------------------------------------------------------------
  // 状态同步
  // -------------------------------------------------------------------------

  /** 按当前 board 状态刷新缩放百分比、按钮禁用态、指针高亮与主题勾选 */
  function sync(): void {
    const zoom = getZoom(board);
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`;

    zoomInBtn.disabled = !board || !canZoomIn(board);
    zoomOutBtn.disabled = !board || !canZoomOut(board);
    fitBtn.disabled = !board;
    zoomLabel.disabled = !board;
    themeBtn.disabled = !board;
    pointerBtn.disabled = !board;

    const mode = getPointerMode(board);
    pointerBtn.classList.toggle('is-active', mode === 'hand');
    pointerBtn.title = mode === 'hand' ? '拖拽画布（已启用）' : '拖拽画布';
    callbacks.onPointerModeChange?.(mode);

    // 编辑按钮随块状态切换图标与文案（初始化与 setBlockState 都经由此处）
    if (editBtn) {
      const editing = blockState === 'editing';
      editBtn.innerHTML = editing ? CANVAS_ICONS.done : CANVAS_ICONS.edit;
      editBtn.title = editing ? '完成编辑' : '编辑思维导图';
      editBtn.classList.toggle('is-active', editing);
      editBtn.disabled = !board;
    }

    themePanel.setActive(board?.theme?.themeColorMode ?? DEFAULT_THEME_MODE);
  }

  /** 切换块状态：预览态由 CSS 隐藏手型/选择开关 */
  function setBlockState(state: BoardBlockState): void {
    if (blockState === state) return;
    blockState = state;
    dom.setAttribute('data-block-state', state);
    // 回到预览态时收起主题面板，避免面板悬在只读画板上
    if (state === 'preview') {
      themePanel.close();
      themeBtn.classList.remove('is-active');
    }
    sync();
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  /**
   * 包装 `board.onChange` 以监听视口变化。
   *
   * 必须链式包装（保存并调用原函数）而非覆盖：style-toolbar 的 selection 联动
   * 也包装了同一个钩子，直接覆盖会使其失效。
   */
  function subscribe(target: PlaitBoard): () => void {
    const original = target.onChange;
    target.onChange = () => {
      original();
      sync();
    };
    return () => {
      target.onChange = original;
    };
  }

  function attach(next: PlaitBoard): void {
    if (board === next) {
      sync();
      return;
    }
    detach();
    board = next;
    unsubscribe = subscribe(next);
    sync();
  }

  function detach(): void {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    board = null;
    themePanel.close();
    themeBtn.classList.remove('is-active');
    // board 置空后立即刷新，使所有按钮进入禁用态、百分比回到 100%
    sync();
  }

  function destroy(): void {
    detach();
    themePanel.destroy();
    dom.remove();
  }

  // 初始同步：board 未就绪时全部按钮禁用，百分比显示 100%
  sync();

  return { dom, attach, detach, setBlockState, sync, destroy };
}

/**
 * Board Draw Toolbar - 图形网格选择面板
 *
 * 点击工具条「图形」按钮后弹出的网格面板，按「基础 / 流程图 / UML」三个 tab
 * 组织全部符号。批次 1 只开放「基础」分类（21 种），另两个 tab 的框架已就位，
 * 批次 3 / 4 只需把 `SHAPE_CATEGORIES` 中的 `enabled` 置 true 并补中文名。
 *
 * 缩略图策略（PRD Q15）：
 * 不手写 SVG 图标，而是调 `@plait/draw` 的 `drawGeometry` 按一个固定矩形把真实
 * 图形渲染成 `SVGGElement`，再塞进自建 `<svg viewBox>` 里。好处是与包升级永不
 * 脱节、批次 3 / 4 的 45 个符号零额外成本；代价是预览为 rough.js 手绘风格。
 *
 * 渲染时机：`drawGeometry` 依赖 `PlaitBoard.getRoughSVG(board)`，故缩略图不能在
 * 构造时渲染，必须延迟到 board 就绪且面板首次展开。已渲染的分类会被缓存，
 * 重复开关面板不重复绘制。
 *
 * 面板作为工具条根 DOM 的后代渲染（不 portal 到 body），从而继承根上的
 * `plait-board-attached` 类——否则点击面板的瞬间 Plait 的 globalPointerUp
 * 会清空画板选中态。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                      |
 * | v1.0.0 | 初始实现：三 tab 网格面板 + drawGeometry 缩略图 | REQ: 20261027-board-whiteboard-draw §3.5  |
 * | v1.1.0 | 缩略图渲染抽至共享 shape-thumbnail.ts，供图形切换面板复用 | REQ: 20261027-board-whiteboard-draw §3.8 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { PlaitBoard } from '@plait/core';

import { createShapeThumbnail } from '../shape-thumbnail';
import { DRAW_TOOLBAR_PREFIX as PREFIX, SHAPE_CATEGORIES, getShapeLabel } from './constants';
import type { DrawPanelController, ShapeCategory } from './types';

/**
 * 创建图形网格选择面板。
 *
 * @param onSelect 用户点选某个图形时回调（面板自身不写 board.pointer）
 */
export function createShapePanel(onSelect: (pointer: string) => void): DrawPanelController {
  let board: PlaitBoard | null = null;
  let open = false;
  let activeCategoryId: ShapeCategory['id'] = 'basic';

  /** 已完成缩略图渲染的分类，避免重复绘制 */
  const renderedCategories = new Set<string>();
  /** pointer → 网格项 DOM，用于 setActive 回填高亮 */
  const itemMap = new Map<string, HTMLElement>();
  /** 分类 id → 网格容器，用于切 tab 时显隐 */
  const gridMap = new Map<string, HTMLElement>();
  /** 分类 id → tab 按钮 */
  const tabMap = new Map<string, HTMLButtonElement>();

  // --- 根容器 -------------------------------------------------------------
  const dom = document.createElement('div');
  dom.className = `${PREFIX}__panel ${PREFIX}__shape-panel`;
  dom.setAttribute('data-open', 'false');

  // --- tab 栏 -------------------------------------------------------------
  const tabBar = document.createElement('div');
  tabBar.className = `${PREFIX}__panel-tabs`;
  dom.appendChild(tabBar);

  // --- 网格区 -------------------------------------------------------------
  const body = document.createElement('div');
  body.className = `${PREFIX}__panel-body`;
  dom.appendChild(body);

  for (const category of SHAPE_CATEGORIES) {
    tabBar.appendChild(createTab(category));
    body.appendChild(createGrid(category));
  }

  /** 创建一个分类 tab；未实现的分类渲染为禁用态并给出说明 */
  function createTab(category: ShapeCategory): HTMLButtonElement {
    const tab = document.createElement('button');
    tab.className = `${PREFIX}__panel-tab`;
    tab.type = 'button';
    tab.textContent = category.label;
    tab.disabled = !category.enabled;
    tab.title = category.enabled ? category.label : (category.disabledHint ?? '');
    tab.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (tab.disabled) return;
      setActiveCategory(category.id);
    });
    tabMap.set(category.id, tab);
    return tab;
  }

  /** 创建一个分类的网格容器（缩略图延迟渲染） */
  function createGrid(category: ShapeCategory): HTMLElement {
    const grid = document.createElement('div');
    grid.className = `${PREFIX}__panel-grid`;
    grid.setAttribute('data-category', category.id);
    grid.hidden = category.id !== activeCategoryId;

    if (category.enabled) {
      for (const pointer of category.pointers) {
        const item = createItem(pointer);
        itemMap.set(pointer, item);
        grid.appendChild(item);
      }
    } else {
      const hint = document.createElement('div');
      hint.className = `${PREFIX}__panel-empty`;
      hint.textContent = category.disabledHint ?? '';
      grid.appendChild(hint);
    }

    gridMap.set(category.id, grid);
    return grid;
  }

  /** 创建一个图形格子（缩略图占位 + 中文名） */
  function createItem(pointer: string): HTMLElement {
    const label = getShapeLabel(pointer);
    const item = document.createElement('button');
    item.className = `${PREFIX}__panel-item`;
    item.type = 'button';
    item.title = `${label}（在画布拖拽创建）`;
    item.setAttribute('data-pointer', pointer);

    const thumb = document.createElement('span');
    thumb.className = `${PREFIX}__panel-thumb`;
    item.appendChild(thumb);

    const text = document.createElement('span');
    text.className = `${PREFIX}__panel-label`;
    text.textContent = label;
    item.appendChild(text);

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(pointer);
      close();
    });

    return item;
  }

  // -------------------------------------------------------------------------
  // 缩略图渲染
  // -------------------------------------------------------------------------

  /**
   * 为指定分类渲染全部缩略图。
   *
   * 幂等：已渲染过的分类直接返回。board 未就绪时不渲染（留空占位），
   * 待 `setBoard` 后下一次展开再补。
   */
  function renderThumbnails(categoryId: string): void {
    if (!board || renderedCategories.has(categoryId)) return;
    const category = SHAPE_CATEGORIES.find((item) => item.id === categoryId);
    if (!category || !category.enabled) return;

    for (const pointer of category.pointers) {
      const item = itemMap.get(pointer);
      const thumb = item?.querySelector(`.${PREFIX}__panel-thumb`);
      if (!thumb) continue;
      thumb.innerHTML = '';
      thumb.appendChild(createShapeThumbnail(board, pointer, getShapeLabel(pointer)));
    }
    renderedCategories.add(categoryId);
  }

  // -------------------------------------------------------------------------
  // 状态
  // -------------------------------------------------------------------------

  /** 切换当前分类 tab */
  function setActiveCategory(categoryId: ShapeCategory['id']): void {
    activeCategoryId = categoryId;
    tabMap.forEach((tab, id) => {
      tab.classList.toggle('is-active', id === categoryId);
    });
    gridMap.forEach((grid, id) => {
      grid.hidden = id !== categoryId;
    });
    renderThumbnails(categoryId);
  }

  /** 回填选中高亮 */
  function setActive(pointer: string | null): void {
    itemMap.forEach((item, value) => {
      item.classList.toggle('is-active', value === pointer);
    });
  }

  /** 点击面板与触发按钮之外的区域时收起 */
  function handleOutsidePointerDown(event: MouseEvent): void {
    if (!open) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (dom.contains(target)) return;
    // 同一张工具条卡片内的「图形」按钮由其自身的 toggle 逻辑处理，不算外部
    if (target.closest(`.${PREFIX}__btn--shapes`)) return;
    close();
  }

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    dom.setAttribute('data-open', next ? 'true' : 'false');
    if (next) {
      renderThumbnails(activeCategoryId);
      // 捕获阶段监听：确保在 Plait 的指针处理之前就能判定并收起
      document.addEventListener('mousedown', handleOutsidePointerDown, true);
    } else {
      document.removeEventListener('mousedown', handleOutsidePointerDown, true);
    }
  }

  function openPanel(): void {
    setOpen(true);
  }

  function close(): void {
    setOpen(false);
  }

  function setBoard(next: PlaitBoard | null): void {
    if (board === next) return;
    board = next;
    // board 换实例后旧缩略图所用的 roughSVG 已失效，清空缓存等待重绘
    renderedCategories.clear();
    if (open) {
      renderThumbnails(activeCategoryId);
    }
  }

  function destroy(): void {
    document.removeEventListener('mousedown', handleOutsidePointerDown, true);
    itemMap.clear();
    gridMap.clear();
    tabMap.clear();
    renderedCategories.clear();
    dom.remove();
  }

  // 初始选中「基础」分类
  setActiveCategory(activeCategoryId);

  return {
    dom,
    get isOpen() {
      return open;
    },
    open: openPanel,
    close,
    setBoard,
    setActive,
    destroy,
  };
}

/**
 * Board Style Toolbar - 结构能力组
 *
 * 工具栏按钮 + 下拉面板：上/下/左/右 4 个节点结构布局方向。
 * 选中项以灰色背景高亮。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次3：结构（节点结构布局方向）下拉面板      | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次3 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import { PREFIX, LAYOUT_DIRECTION_OPTIONS, type LayoutDirectionOption } from '../constants';
import {
  ICON_STRUCTURE,
  ICON_LAYOUT_RIGHT,
  ICON_LAYOUT_LEFT,
  ICON_LAYOUT_UPWARD,
  ICON_LAYOUT_DOWNWARD,
} from '../icons';
import { applyLayout } from '../transforms';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface StructureSegment {
  /** 工具栏按钮 DOM */
  readonly button: HTMLElement;
  /** 更新当前布局方向回填（非逻辑方向布局传 null 表示不匹配） */
  setActiveStructure(layout: LayoutDirectionOption | null): void;
  /** 绑定 board */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// 布局方向 → 图标 SVG 映射
// ---------------------------------------------------------------------------

const LAYOUT_ICON_MAP: Record<LayoutDirectionOption, string> = {
  right: ICON_LAYOUT_RIGHT,
  left: ICON_LAYOUT_LEFT,
  upward: ICON_LAYOUT_UPWARD,
  downward: ICON_LAYOUT_DOWNWARD,
};

// ---------------------------------------------------------------------------
// 创建
// ---------------------------------------------------------------------------

export function createStructureSegment(): StructureSegment {
  let board: PlaitBoard | null = null;
  let isOpen = false;
  let activeLayout: LayoutDirectionOption | null = null;

  // --- 工具栏按钮 ---
  const button = document.createElement('button');
  button.className = `${PREFIX}__btn`;
  button.type = 'button';
  button.title = '结构';

  // 图标容器：与 dropdown 同为 button 子节点，更新图标时仅替换其内容，避免误删下拉面板
  const iconEl = document.createElement('span');
  iconEl.className = `${PREFIX}__btn-icon`;
  iconEl.innerHTML = ICON_STRUCTURE;
  button.appendChild(iconEl);

  // --- 下拉面板 ---
  const dropdown = document.createElement('div');
  dropdown.className = `${PREFIX}__dropdown ${PREFIX}__structure-dropdown`;

  // 方向按钮：上/下/左/右 4 个
  const directionEls: HTMLElement[] = [];
  LAYOUT_DIRECTION_OPTIONS.forEach((opt) => {
    const item = document.createElement('button');
    item.className = `${PREFIX}__structure-direction-item`;
    item.type = 'button';
    item.title = opt.label;
    item.setAttribute('data-layout', opt.id);
    item.innerHTML = LAYOUT_ICON_MAP[opt.id];

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      activeLayout = opt.id;
      applyLayout(board, opt.id);
      updateDirectionState();
      updateButtonIcon();
    });

    directionEls.push(item);
    dropdown.appendChild(item);
  });

  button.appendChild(dropdown);

  // --- 打开/关闭下拉 ---
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 仅在点击按钮本身（非下拉面板内部）时切换
    if ((e.target as HTMLElement).closest(`.${PREFIX}__dropdown`)) return;
    toggleDropdown();
  });

  function toggleDropdown(): void {
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  function openDropdown(): void {
    isOpen = true;
    dropdown.classList.add('is-open');
    button.classList.add('is-dropdown-open');
    // 下一帧监听外部点击
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleOutsideClick, true);
    });
  }

  function closeDropdown(): void {
    isOpen = false;
    dropdown.classList.remove('is-open');
    button.classList.remove('is-dropdown-open');
    document.removeEventListener('mousedown', handleOutsideClick, true);
  }

  function handleOutsideClick(e: MouseEvent): void {
    if (!button.contains(e.target as Node)) {
      closeDropdown();
    }
  }

  // --- 更新方向选中态 ---
  function updateDirectionState(): void {
    directionEls.forEach((el) => {
      const layout = el.getAttribute('data-layout') as LayoutDirectionOption;
      el.classList.toggle('is-active', layout === activeLayout);
    });
  }

  // --- 更新按钮图标（跟随当前布局方向；null 回退默认四向图标）---
  function updateButtonIcon(): void {
    iconEl.innerHTML = activeLayout ? LAYOUT_ICON_MAP[activeLayout] : ICON_STRUCTURE;
  }

  // --- 公开方法 ---
  function setActiveStructure(layout: LayoutDirectionOption | null): void {
    activeLayout = layout;
    updateDirectionState();
    updateButtonIcon();
  }

  function setBoard(b: PlaitBoard): void {
    board = b;
  }

  function destroy(): void {
    closeDropdown();
    button.remove();
  }

  return { button, setActiveStructure, setBoard, destroy };
}

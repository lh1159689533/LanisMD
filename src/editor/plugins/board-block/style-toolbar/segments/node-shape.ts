/**
 * Board Style Toolbar - 节点形状能力组
 *
 * 工具栏按钮 + 下拉面板：2 种节点形状（下划线/圆角矩形）。
 * 选中项以灰色背景高亮。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次2：节点形状下拉面板                      | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.0.1 | 移除「直角矩形」选项                        | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import { PREFIX, SHAPE_OPTIONS, type ShapeOption } from '../constants';
import { ICON_SHAPE_UNDERLINE, ICON_SHAPE_ROUND_RECT } from '../icons';
import { applyShape } from '../transforms';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface NodeShapeSegment {
  /** 工具栏按钮 DOM */
  readonly button: HTMLElement;
  /** 更新当前形状回填 */
  setActiveShape(shape: ShapeOption): void;
  /** 绑定 board */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// 形状选项 → 图标 SVG 映射
// ---------------------------------------------------------------------------

const SHAPE_ICON_MAP: Record<ShapeOption, string> = {
  underline: ICON_SHAPE_UNDERLINE,
  'round-rectangle': ICON_SHAPE_ROUND_RECT,
};

// ---------------------------------------------------------------------------
// 创建
// ---------------------------------------------------------------------------

export function createNodeShapeSegment(): NodeShapeSegment {
  let board: PlaitBoard | null = null;
  let activeShape: ShapeOption = 'round-rectangle';
  let isOpen = false;

  // --- 工具栏按钮 ---
  const button = document.createElement('button');
  button.className = `${PREFIX}__btn`;
  button.type = 'button';
  button.title = '节点形状';
  button.innerHTML = ICON_SHAPE_ROUND_RECT;

  // --- 下拉面板 ---
  const dropdown = document.createElement('div');
  dropdown.className = `${PREFIX}__dropdown ${PREFIX}__shape-dropdown`;

  // 创建 3 个形状选项
  const optionEls: HTMLElement[] = [];
  SHAPE_OPTIONS.forEach((opt) => {
    const item = document.createElement('button');
    item.className = `${PREFIX}__shape-item`;
    item.type = 'button';
    item.title = opt.label;
    item.setAttribute('data-shape', opt.id);
    item.innerHTML = SHAPE_ICON_MAP[opt.id];

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      activeShape = opt.id;
      applyShape(board, opt.id);
      updateActiveState();
      closeDropdown();
    });

    optionEls.push(item);
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

  // --- 更新选中态 ---
  function updateActiveState(): void {
    optionEls.forEach((el) => {
      const shape = el.getAttribute('data-shape') as ShapeOption;
      el.classList.toggle('is-active', shape === activeShape);
    });
    // 更新按钮图标为当前形状
    const svgStr = SHAPE_ICON_MAP[activeShape] ?? ICON_SHAPE_ROUND_RECT;
    // 保留 dropdown 子节点，仅替换 SVG
    const svgEl = button.querySelector(':scope > svg');
    if (svgEl) {
      const tmp = document.createElement('div');
      tmp.innerHTML = svgStr;
      const newSvg = tmp.firstElementChild;
      if (newSvg) button.replaceChild(newSvg, svgEl);
    }
  }

  // --- 公开方法 ---
  function setActiveShape(shape: ShapeOption): void {
    activeShape = shape;
    updateActiveState();
  }

  function setBoard(b: PlaitBoard): void {
    board = b;
  }

  function destroy(): void {
    closeDropdown();
    button.remove();
  }

  return { button, setActiveShape, setBoard, destroy };
}

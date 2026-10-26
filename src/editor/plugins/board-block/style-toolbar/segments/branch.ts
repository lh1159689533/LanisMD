/**
 * Board Style Toolbar - 分支能力组
 *
 * 工具栏按钮 + 下拉面板：
 * - 连线形状：曲线 / 折线 2 项
 * - 宽度：数字输入框
 * - 颜色：取色面板（复用批次 2 的 color-panel）
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次3：分支（连线形状+宽+色）下拉面板        | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次3 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import {
  PREFIX,
  BRANCH_SHAPE_OPTIONS,
  DEFAULT_BRANCH_WIDTH,
  MIN_BRANCH_WIDTH,
  MAX_BRANCH_WIDTH,
  type BranchShapeOption,
} from '../constants';
import { ICON_BRANCH, ICON_BRANCH_BIGHT, ICON_BRANCH_POLYLINE } from '../icons';
import { createColorPanel, type ColorPanelController } from '../color-panel';
import { applyBranchShape, applyBranchWidth, applyBranchColor, resolveColor } from '../transforms';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface BranchSegment {
  readonly button: HTMLElement;
  /** 更新当前连线形状/分支宽/分支色回填 */
  setActiveBranch(branchShape: BranchShapeOption, branchWidth: number, branchColor: string | null): void;
  /** 绑定 board */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// 连线形状 → 图标 SVG 映射
// ---------------------------------------------------------------------------

const BRANCH_SHAPE_ICON_MAP: Record<BranchShapeOption, string> = {
  bight: ICON_BRANCH_BIGHT,
  polyline: ICON_BRANCH_POLYLINE,
};

// ---------------------------------------------------------------------------
// 创建
// ---------------------------------------------------------------------------

export function createBranchSegment(): BranchSegment {
  let board: PlaitBoard | null = null;
  let isOpen = false;
  let activeBranchShape: BranchShapeOption = 'bight';
  let currentColor: string | null = null;
  let currentWidth: number = DEFAULT_BRANCH_WIDTH;

  // --- 工具栏按钮 ---
  const button = document.createElement('button');
  button.className = `${PREFIX}__btn ${PREFIX}__btn--branch`;
  button.type = 'button';
  button.title = '分支';

  // 图标容器：与 dropdown 同为 button 子节点，更新图标时仅替换其内容，避免误删下拉面板
  const iconEl = document.createElement('span');
  iconEl.className = `${PREFIX}__btn-icon`;
  iconEl.innerHTML = ICON_BRANCH;
  button.appendChild(iconEl);

  // --- 下拉面板 ---
  const dropdown = document.createElement('div');
  dropdown.className = `${PREFIX}__dropdown ${PREFIX}__branch-dropdown`;

  // 连线形状行：曲线 / 折线
  const shapeRow = document.createElement('div');
  shapeRow.className = `${PREFIX}__branch-shape-row`;

  const shapeEls: HTMLElement[] = [];
  BRANCH_SHAPE_OPTIONS.forEach((opt) => {
    const item = document.createElement('button');
    item.className = `${PREFIX}__branch-shape-item`;
    item.type = 'button';
    item.title = opt.label;
    item.setAttribute('data-branch-shape', opt.id);
    item.innerHTML = BRANCH_SHAPE_ICON_MAP[opt.id];

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      activeBranchShape = opt.id;
      applyBranchShape(board, opt.id);
      updateShapeState();
      updateButtonIcon();
    });

    shapeEls.push(item);
    shapeRow.appendChild(item);
  });
  dropdown.appendChild(shapeRow);

  // 宽度 + 颜色预览行
  const topRow = document.createElement('div');
  topRow.className = `${PREFIX}__branch-top`;

  const widthInput = document.createElement('input');
  widthInput.className = `${PREFIX}__branch-width-input`;
  widthInput.type = 'number';
  widthInput.min = String(MIN_BRANCH_WIDTH);
  widthInput.max = String(MAX_BRANCH_WIDTH);
  widthInput.value = String(DEFAULT_BRANCH_WIDTH);
  widthInput.title = '分支宽度';

  widthInput.addEventListener('change', (e) => {
    e.stopPropagation();
    if (!board) return;
    let val = parseInt(widthInput.value, 10);
    if (isNaN(val)) val = DEFAULT_BRANCH_WIDTH;
    val = Math.max(MIN_BRANCH_WIDTH, Math.min(MAX_BRANCH_WIDTH, val));
    widthInput.value = String(val);
    currentWidth = val;
    applyBranchWidth(board, val);
  });

  // 阻止输入框的键盘事件冒泡到 Plait/PM
  widthInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });

  const colorPreview = document.createElement('div');
  colorPreview.className = `${PREFIX}__branch-color-preview`;
  colorPreview.style.backgroundColor = '#999999';

  topRow.appendChild(widthInput);
  topRow.appendChild(colorPreview);
  dropdown.appendChild(topRow);

  // 取色面板
  const colorPanel: ColorPanelController = createColorPanel((color) => {
    if (!board) return;
    const resolved = resolveColor(color);
    currentColor = resolved;
    applyBranchColor(board, resolved);
    colorPreview.style.backgroundColor = resolved ?? '#999999';
  });
  dropdown.appendChild(colorPanel.dom);

  // 配色面板默认收起：仅当点击颜色预览块时才展开
  let isColorPanelOpen = false;
  colorPanel.dom.style.display = 'none';

  /** 展开/收起取色面板 */
  function toggleColorPanel(): void {
    isColorPanelOpen = !isColorPanelOpen;
    colorPanel.dom.style.display = isColorPanelOpen ? '' : 'none';
  }

  // 点击颜色预览块切换取色面板显隐
  colorPreview.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleColorPanel();
  });

  button.appendChild(dropdown);

  // --- 打开/关闭 ---
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if ((e.target as HTMLElement).closest(`.${PREFIX}__dropdown`)) return;
    toggleDropdown();
  });

  function toggleDropdown(): void {
    isOpen ? closeDropdown() : openDropdown();
  }

  function openDropdown(): void {
    isOpen = true;
    dropdown.classList.add('is-open');
    button.classList.add('is-dropdown-open');
    // 每次打开下拉面板时取色面板默认收起
    collapseColorPanel();
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

  /** 收起取色面板 */
  function collapseColorPanel(): void {
    isColorPanelOpen = false;
    colorPanel.dom.style.display = 'none';
  }

  function handleOutsideClick(e: MouseEvent): void {
    if (!button.contains(e.target as Node)) {
      closeDropdown();
    }
  }

  // --- 更新连线形状选中态 ---
  function updateShapeState(): void {
    shapeEls.forEach((el) => {
      const branchShape = el.getAttribute('data-branch-shape') as BranchShapeOption;
      el.classList.toggle('is-active', branchShape === activeBranchShape);
    });
  }

  // --- 更新按钮图标（跟随当前连线形状）---
  function updateButtonIcon(): void {
    iconEl.innerHTML = BRANCH_SHAPE_ICON_MAP[activeBranchShape] ?? ICON_BRANCH;
  }

  // --- 公开方法 ---
  function setActiveBranch(
    branchShape: BranchShapeOption,
    branchWidth: number,
    branchColor: string | null,
  ): void {
    activeBranchShape = branchShape;
    currentWidth = branchWidth;
    currentColor = branchColor;
    updateShapeState();
    updateButtonIcon();
    widthInput.value = String(branchWidth);
    colorPreview.style.backgroundColor = branchColor ?? '#999999';
    colorPanel.setActiveColor(branchColor);
  }

  function setBoard(b: PlaitBoard): void {
    board = b;
    colorPanel.setBoard(b);
  }

  function destroy(): void {
    closeDropdown();
    colorPanel.destroy();
    button.remove();
  }

  return { button, setActiveBranch, setBoard, destroy };
}

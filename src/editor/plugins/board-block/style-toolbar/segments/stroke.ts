/**
 * Board Style Toolbar - 节点描边能力组
 *
 * 工具栏按钮（空心圆，stroke 随当前描边色变化）+ 下拉面板：
 * - 上方：宽度数字输入框 + 颜色预览方块
 * - 下方：取色面板（主题/默认 Tab + 色彩梯度）
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次2：节点描边下拉面板                      | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.0.1 | 新增 setVisible：下划线节点时隐藏能力组       | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import {
  PREFIX,
  DEFAULT_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  MAX_STROKE_WIDTH,
} from '../constants';
import { ICON_STROKE } from '../icons';
import { createColorPanel, type ColorPanelController } from '../color-panel';
import { applyStrokeColor, applyStrokeWidth, resolveColor } from '../transforms';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface StrokeSegment {
  readonly button: HTMLElement;
  /** 更新当前描边色和宽度回填 */
  setActiveStroke(color: string | null, width: number): void;
  /** 设置能力组显隐（隐藏时收起下拉面板） */
  setVisible(visible: boolean): void;
  /** 绑定 board */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// 创建
// ---------------------------------------------------------------------------

export function createStrokeSegment(): StrokeSegment {
  let board: PlaitBoard | null = null;
  let isOpen = false;
  let currentColor: string | null = null;
  let currentWidth: number = DEFAULT_STROKE_WIDTH;

  // --- 工具栏按钮 ---
  const button = document.createElement('button');
  button.className = `${PREFIX}__btn ${PREFIX}__btn--stroke`;
  button.type = 'button';
  button.title = '节点描边';
  button.innerHTML = ICON_STROKE;

  /** 更新按钮图标的 stroke 颜色 */
  function updateButtonColor(color: string | null): void {
    const circle = button.querySelector('circle');
    if (circle) {
      circle.setAttribute('stroke', color ?? '#999999');
    }
  }

  // --- 下拉面板 ---
  const dropdown = document.createElement('div');
  dropdown.className = `${PREFIX}__dropdown ${PREFIX}__stroke-dropdown`;

  // 上方：宽度 + 颜色预览
  const topRow = document.createElement('div');
  topRow.className = `${PREFIX}__stroke-top`;

  // 宽度输入框
  const widthInput = document.createElement('input');
  widthInput.className = `${PREFIX}__stroke-width-input`;
  widthInput.type = 'number';
  widthInput.min = String(MIN_STROKE_WIDTH);
  widthInput.max = String(MAX_STROKE_WIDTH);
  widthInput.value = String(DEFAULT_STROKE_WIDTH);
  widthInput.title = '描边宽度';

  widthInput.addEventListener('change', (e) => {
    e.stopPropagation();
    if (!board) return;
    let val = parseInt(widthInput.value, 10);
    if (isNaN(val)) val = DEFAULT_STROKE_WIDTH;
    val = Math.max(MIN_STROKE_WIDTH, Math.min(MAX_STROKE_WIDTH, val));
    widthInput.value = String(val);
    currentWidth = val;
    applyStrokeWidth(board, val);
  });

  // 阻止输入框的键盘事件冒泡到 Plait/PM
  widthInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });

  // 颜色预览方块
  const colorPreview = document.createElement('div');
  colorPreview.className = `${PREFIX}__stroke-color-preview`;
  colorPreview.style.backgroundColor = '#999999';

  topRow.appendChild(widthInput);
  topRow.appendChild(colorPreview);
  dropdown.appendChild(topRow);

  // 取色面板
  const colorPanel: ColorPanelController = createColorPanel((color) => {
    if (!board) return;
    const resolved = resolveColor(color);
    currentColor = resolved;
    applyStrokeColor(board, resolved);
    updateButtonColor(resolved);
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

  // --- 公开方法 ---
  function setActiveStroke(color: string | null, width: number): void {
    currentColor = color;
    currentWidth = width;
    updateButtonColor(color);
    colorPreview.style.backgroundColor = color ?? '#999999';
    widthInput.value = String(width);
    colorPanel.setActiveColor(color);
  }

  /** 设置能力组显隐：隐藏时先收起下拉，避免面板状态残留 */
  function setVisible(visible: boolean): void {
    if (!visible) {
      closeDropdown();
    }
    button.style.display = visible ? '' : 'none';
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

  return { button, setActiveStroke, setVisible, setBoard, destroy };
}

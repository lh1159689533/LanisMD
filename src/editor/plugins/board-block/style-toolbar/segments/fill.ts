/**
 * Board Style Toolbar - 节点填充能力组
 *
 * 工具栏按钮（实心圆，颜色随当前填充色变化）+ 下拉取色面板。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次2：节点填充下拉面板                      | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.0.1 | 新增 setVisible：下划线节点时隐藏能力组       | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import { PREFIX, COLOR_NONE } from '../constants';
import { ICON_FILL } from '../icons';
import { createColorPanel, type ColorPanelController } from '../color-panel';
import { applyFillColor, resolveColor } from '../transforms';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface FillSegment {
  readonly button: HTMLElement;
  /** 更新当前填充色回填 */
  setActiveFill(color: string | null): void;
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

export function createFillSegment(): FillSegment {
  let board: PlaitBoard | null = null;
  let isOpen = false;

  // --- 工具栏按钮 ---
  const button = document.createElement('button');
  button.className = `${PREFIX}__btn ${PREFIX}__btn--fill`;
  button.type = 'button';
  button.title = '节点填充';
  button.innerHTML = ICON_FILL;

  // 颜色指示器（按钮内的 SVG circle 动态着色）
  function updateButtonColor(color: string | null): void {
    const circle = button.querySelector('circle');
    if (circle) {
      circle.setAttribute('fill', color ?? '#e5e5e5');
    }
  }

  // --- 下拉面板 ---
  const dropdown = document.createElement('div');
  dropdown.className = `${PREFIX}__dropdown ${PREFIX}__fill-dropdown`;

  // 取色面板
  const colorPanel: ColorPanelController = createColorPanel((color) => {
    if (!board) return;
    const resolved = resolveColor(color);
    applyFillColor(board, resolved);
    updateButtonColor(resolved);
  });
  dropdown.appendChild(colorPanel.dom);
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

  // --- 公开方法 ---
  function setActiveFill(color: string | null): void {
    updateButtonColor(color);
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

  return { button, setActiveFill, setVisible, setBoard, destroy };
}

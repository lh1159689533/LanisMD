/**
 * Board Style Toolbar - 白板图形描边能力组
 *
 * 工具栏按钮（空心圆，stroke 随当前描边色变化）+ 下拉面板：
 * - 第一行：宽度数字输入框 + 颜色预览方块（点击展开取色面板）
 * - 第二行：线型三选一（实线 / 虚线 / 点线）
 * - 下方：取色面板（默认收起）
 *
 * 与导图的 `stroke.ts` 的区别：
 * 1. 多了「线型」一行（导图节点不支持 strokeStyle）。
 * 2. 写入走 `applyDrawStrokeXxx`，带 `getMemorizeKey`，使随后新建的图形
 *    自动继承刚设置的描边样式。
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                                      |
 * | v1.0.0 | 初始实现：白板描边下拉面板（色/宽/线型） | REQ: 20261027-board-whiteboard-draw §3.8  |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import {
  PREFIX,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  STROKE_STYLE_OPTIONS,
  type StrokeStyleOption,
} from '../constants';
import {
  ICON_STROKE,
  ICON_STROKE_DASHED,
  ICON_STROKE_DOTTED,
  ICON_STROKE_SOLID,
} from '../icons';
import { createColorPanel, type ColorPanelController } from '../color-panel';
import {
  applyDrawStrokeColor,
  applyDrawStrokeStyle,
  applyDrawStrokeWidth,
  resolveColor,
} from '../transforms';
import { createDropdownShell } from './dropdown-shell';

/** 线型 → 图标 */
const STROKE_STYLE_ICONS: Record<StrokeStyleOption, string> = {
  solid: ICON_STROKE_SOLID,
  dashed: ICON_STROKE_DASHED,
  dotted: ICON_STROKE_DOTTED,
};

export interface DrawStrokeSegment {
  readonly button: HTMLElement;
  /** 回填当前描边色 / 宽度 / 线型 */
  setActiveStroke(color: string | null, width: number, style: StrokeStyleOption): void;
  /** 设置能力组显隐（隐藏时收起下拉面板） */
  setVisible(visible: boolean): void;
  /** 绑定 board */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

export function createDrawStrokeSegment(): DrawStrokeSegment {
  let board: PlaitBoard | null = null;

  const shell = createDropdownShell({
    modifier: 'stroke',
    title: '描边',
    icon: ICON_STROKE,
  });

  /** 按钮内 SVG circle 的 stroke 跟随当前色 */
  function updateButtonColor(color: string | null): void {
    const circle = shell.button.querySelector('circle');
    if (circle) {
      circle.setAttribute('stroke', color ?? '#999999');
    }
  }

  // --- 第一行：宽度输入 + 颜色预览 -----------------------------------------
  const topRow = document.createElement('div');
  topRow.className = `${PREFIX}__stroke-top`;

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
    applyDrawStrokeWidth(board, val);
  });

  // 输入框的键盘事件不能冒泡到 Plait/ProseMirror，否则会被当成画布热键
  widthInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });

  const colorPreview = document.createElement('div');
  colorPreview.className = `${PREFIX}__stroke-color-preview`;
  colorPreview.style.backgroundColor = '#999999';

  topRow.appendChild(widthInput);
  topRow.appendChild(colorPreview);
  shell.dropdown.appendChild(topRow);

  // --- 第二行：线型三选一 ---------------------------------------------------
  const styleRow = document.createElement('div');
  styleRow.className = `${PREFIX}__stroke-style-row`;

  /** 线型 id → 选项按钮，用于回填高亮 */
  const styleButtons = new Map<StrokeStyleOption, HTMLButtonElement>();

  for (const option of STROKE_STYLE_OPTIONS) {
    const item = document.createElement('button');
    item.className = `${PREFIX}__stroke-style-item`;
    item.type = 'button';
    item.title = option.label;
    item.setAttribute('data-style', option.id);
    item.innerHTML = STROKE_STYLE_ICONS[option.id];
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      applyDrawStrokeStyle(board, option.id);
      setActiveStyle(option.id);
    });
    styleButtons.set(option.id, item);
    styleRow.appendChild(item);
  }

  shell.dropdown.appendChild(styleRow);

  // --- 取色面板（默认收起，点击颜色预览块展开） ------------------------------
  const colorPanel: ColorPanelController = createColorPanel((color) => {
    if (!board) return;
    const resolved = resolveColor(color);
    applyDrawStrokeColor(board, resolved);
    updateButtonColor(resolved);
    colorPreview.style.backgroundColor = resolved ?? '#999999';
  });
  shell.dropdown.appendChild(colorPanel.dom);

  let isColorPanelOpen = false;
  colorPanel.dom.style.display = 'none';

  colorPreview.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isColorPanelOpen = !isColorPanelOpen;
    colorPanel.dom.style.display = isColorPanelOpen ? '' : 'none';
  });

  /** 回填线型高亮 */
  function setActiveStyle(style: StrokeStyleOption): void {
    styleButtons.forEach((btn, id) => {
      btn.classList.toggle('is-active', id === style);
    });
  }

  function setActiveStroke(
    color: string | null,
    width: number,
    style: StrokeStyleOption = DEFAULT_STROKE_STYLE,
  ): void {
    updateButtonColor(color);
    colorPreview.style.backgroundColor = color ?? '#999999';
    widthInput.value = String(width);
    colorPanel.setActiveColor(color);
    setActiveStyle(style);
  }

  function setVisible(visible: boolean): void {
    if (!visible) {
      // 整组隐藏时把内嵌的取色面板也收起，避免下次展开时状态残留
      isColorPanelOpen = false;
      colorPanel.dom.style.display = 'none';
    }
    shell.setVisible(visible);
  }

  function setBoard(next: PlaitBoard): void {
    board = next;
    colorPanel.setBoard(next);
  }

  function destroy(): void {
    colorPanel.destroy();
    styleButtons.clear();
    shell.destroy();
  }

  setActiveStyle(DEFAULT_STROKE_STYLE);

  return {
    button: shell.button,
    setActiveStroke,
    setVisible,
    setBoard,
    destroy,
  };
}

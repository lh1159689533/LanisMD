/**
 * Board Style Toolbar - 不透明度能力组（白板专属）
 *
 * 工具栏按钮 + 下拉面板，面板内为四个预设档位（100% / 75% / 50% / 25%），
 * 点即应用。
 *
 * 为何用档位而非滑块（PRD Q21）：
 * - 与现有能力组（branch / node-shape）的「方格选项」风格一致；
 * - 滑块在拖动过程中会高频触发 `Transforms.setNode`，每一步都产生 op 与一条
 *   撤销记录，还会连带触发防抖回写，需要额外做节流/合并才可用。
 *
 * `opacity` 作用于整个元素：填充、描边、内部文字一起变淡。
 *
 * @changelog
 * | 版本   | 变更说明                   | 关联                                      |
 * | v1.0.0 | 初始实现：四档不透明度下拉面板 | REQ: 20261027-board-whiteboard-draw §3.8  |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import { PREFIX, DEFAULT_OPACITY, OPACITY_OPTIONS } from '../constants';
import { ICON_OPACITY } from '../icons';
import { applyOpacity } from '../transforms';
import { createDropdownShell } from './dropdown-shell';

/** 浮点比较容差：opacity 存的是 0.75 这类浮点，直接 === 比较不可靠 */
const EPSILON = 0.001;

export interface OpacitySegment {
  readonly button: HTMLElement;
  /** 回填当前不透明度 */
  setActiveOpacity(opacity: number): void;
  /** 设置能力组显隐（隐藏时收起下拉面板） */
  setVisible(visible: boolean): void;
  /** 绑定 board */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

export function createOpacitySegment(): OpacitySegment {
  let board: PlaitBoard | null = null;

  const shell = createDropdownShell({
    modifier: 'opacity',
    title: '不透明度',
    icon: ICON_OPACITY,
  });

  const row = document.createElement('div');
  row.className = `${PREFIX}__opacity-row`;
  shell.dropdown.appendChild(row);

  /** 档位值 → 选项按钮，用于回填高亮 */
  const items = new Map<number, HTMLButtonElement>();

  for (const value of OPACITY_OPTIONS) {
    const percent = Math.round(value * 100);
    const item = document.createElement('button');
    item.className = `${PREFIX}__opacity-item`;
    item.type = 'button';
    item.title = `${percent}%`;
    item.setAttribute('data-opacity', String(value));

    // 预览方块：用 CSS opacity 直观呈现该档位的通透程度
    const swatch = document.createElement('span');
    swatch.className = `${PREFIX}__opacity-swatch`;
    swatch.style.opacity = String(value);
    item.appendChild(swatch);

    const label = document.createElement('span');
    label.className = `${PREFIX}__opacity-label`;
    label.textContent = `${percent}%`;
    item.appendChild(label);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      applyOpacity(board, value);
      setActiveOpacity(value);
    });

    items.set(value, item);
    row.appendChild(item);
  }

  function setActiveOpacity(opacity: number): void {
    items.forEach((item, value) => {
      item.classList.toggle('is-active', Math.abs(value - opacity) < EPSILON);
    });
  }

  function setBoard(next: PlaitBoard): void {
    board = next;
  }

  function destroy(): void {
    items.clear();
    shell.destroy();
  }

  setActiveOpacity(DEFAULT_OPACITY);

  return {
    button: shell.button,
    setActiveOpacity,
    setVisible: shell.setVisible,
    setBoard,
    destroy,
  };
}

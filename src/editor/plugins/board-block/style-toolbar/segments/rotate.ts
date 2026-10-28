/**
 * Board Style Toolbar - 白板旋转角能力组
 *
 * 仅图形（geometry）选中时显示，下拉面板提供固定角度预设（0/45/90/135/180°），
 * 点选即把选中图形旋转到该绝对角度。
 *
 * 为何用预设而非输入框（PRD Q: rotate_ui）：
 * - 与既有 segment 的「方格选项」风格一致；
 * - 画布上已有拖拽旋转手柄，这里只需覆盖最常见的固定角度，输入框的数值
 *   解析与非法值校验不值得做。
 *
 * @changelog
 * | 版本   | 变更说明                         | 关联                                      |
 * | v1.0.0 | 初始实现：五档角度预设下拉面板      | REQ: 20261027-board-whiteboard-draw §3.8  |
 * /@changelog
 *
 * @author hhhuilli
 */

import { radiansToDegrees } from '@plait/core';
import type { PlaitBoard } from '@plait/core';

import { ANGLE_EPSILON_DEG, PREFIX, ROTATION_OPTIONS } from '../constants';
import { ICON_ROTATE } from '../icons';
import { applyRotation } from '../transforms';
import { createDropdownShell } from './dropdown-shell';

export interface RotateSegment {
  readonly button: HTMLElement;
  /** 回填当前旋转角（弧度），就近高亮预设档位 */
  setActiveAngle(angle: number): void;
  /** 设置能力组显隐（隐藏时收起下拉面板） */
  setVisible(visible: boolean): void;
  /** 绑定 board */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

export function createRotateSegment(): RotateSegment {
  let board: PlaitBoard | null = null;

  const shell = createDropdownShell({
    modifier: 'rotate',
    title: '旋转',
    icon: ICON_ROTATE,
  });

  const row = document.createElement('div');
  row.className = `${PREFIX}__rotate-row`;
  shell.dropdown.appendChild(row);

  const items = new Map<number, HTMLButtonElement>();

  for (const degree of ROTATION_OPTIONS) {
    const item = document.createElement('button');
    item.className = `${PREFIX}__rotate-item`;
    item.type = 'button';
    item.title = `旋转 ${degree}°`;
    item.setAttribute('data-degree', String(degree));
    item.textContent = `${degree}°`;

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      applyRotation(board, degree);
      setActiveDegree(degree);
    });

    items.set(degree, item);
    row.appendChild(item);
  }

  function setActiveDegree(degree: number): void {
    items.forEach((item, value) => {
      item.classList.toggle('is-active', value === degree);
    });
  }

  /** 弧度 → 度后按预设就近高亮（angle 为浮点，需容差比较） */
  function setActiveAngle(angle: number): void {
    const degree = radiansToDegrees(angle);
    let nearest = ROTATION_OPTIONS[0];
    let nearestDelta = Infinity;
    for (const preset of ROTATION_OPTIONS) {
      const delta = Math.abs(preset - degree);
      if (delta < nearestDelta) {
        nearestDelta = delta;
        nearest = preset;
      }
    }
    items.forEach((item, value) => {
      item.classList.toggle('is-active', value === nearest && nearestDelta <= ANGLE_EPSILON_DEG);
    });
  }

  function setBoard(next: PlaitBoard): void {
    board = next;
  }

  function destroy(): void {
    items.clear();
    shell.destroy();
  }

  return {
    button: shell.button,
    setActiveAngle,
    setVisible: shell.setVisible,
    setBoard,
    destroy,
  };
}

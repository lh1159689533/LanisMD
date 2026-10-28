/**
 * Board Style Toolbar - 白板矢量线形态能力组
 *
 * 仅矢量线（vector-line）选中时显示，下拉面板提供直线段 / 曲线段两档，
 * 调 `DrawTransforms.setVectorLineShape` 切换。
 *
 * 与箭头线的「端点 / 走线」刻意分离（PRD Q: line_shape_org）：矢量线没有端点
 * 标记语义，且只有直 / 曲两种形态，职责独立更清晰。
 *
 * @changelog
 * | 版本   | 变更说明                         | 关联                                      |
 * | v1.0.0 | 初始实现：矢量线直线段 / 曲线段切换 | REQ: 20261027-board-whiteboard-draw §3.7  |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import { PREFIX, VECTOR_LINE_SHAPE_OPTIONS, type VectorLineShapeOption } from '../constants';
import { ICON_VECTOR_LINE_SHAPE, VECTOR_LINE_SHAPE_ICONS } from '../icons';
import { applyVectorLineShape } from '../transforms';
import { createDropdownShell } from './dropdown-shell';

export interface VectorLineShapeSegment {
  readonly button: HTMLElement;
  /** 回填当前矢量线形态 */
  setActiveShape(shape: VectorLineShapeOption | null): void;
  /** 设置能力组显隐（隐藏时收起下拉面板） */
  setVisible(visible: boolean): void;
  /** 绑定 board */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

export function createVectorLineShapeSegment(): VectorLineShapeSegment {
  let board: PlaitBoard | null = null;

  const shell = createDropdownShell({
    modifier: 'vector-line-shape',
    title: '矢量线形态',
    icon: ICON_VECTOR_LINE_SHAPE,
  });

  const row = document.createElement('div');
  row.className = `${PREFIX}__vector-line-shape-row`;
  shell.dropdown.appendChild(row);

  const items = new Map<VectorLineShapeOption, HTMLButtonElement>();

  for (const option of VECTOR_LINE_SHAPE_OPTIONS) {
    const item = document.createElement('button');
    item.className = `${PREFIX}__vector-line-shape-item`;
    item.type = 'button';
    item.title = option.label;
    item.innerHTML = VECTOR_LINE_SHAPE_ICONS[option.id];

    const label = document.createElement('span');
    label.className = `${PREFIX}__vector-line-shape-label`;
    label.textContent = option.label;
    item.appendChild(label);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      applyVectorLineShape(board, option.id);
      setActiveShape(option.id);
    });

    items.set(option.id, item);
    row.appendChild(item);
  }

  function setActiveShape(shape: VectorLineShapeOption | null): void {
    items.forEach((item, id) => {
      item.classList.toggle('is-active', id === shape);
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
    setActiveShape,
    setVisible: shell.setVisible,
    setBoard,
    destroy,
  };
}

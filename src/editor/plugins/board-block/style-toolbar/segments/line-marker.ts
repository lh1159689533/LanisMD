/**
 * Board Style Toolbar - 画板箭头线端点与走线能力组
 *
 * 仅箭头线（arrow-line）选中时显示。下拉面板分三块：
 * 1. 走线形态：直线 / 曲线 / 折线（`setArrowLineShape`）
 * 2. 起点端点：9 种标记（`setArrowLineMark(source, ...)`）
 * 3. 终点端点：9 种标记（`setArrowLineMark(target, ...)`）
 *
 * 与矢量线形态刻意分离（PRD Q: line_shape_org）：矢量线无端点语义，且只有
 * 直 / 曲两种形态，故另立 `vector-line-shape.ts`，本文件只负责箭头线。
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                                      |
 * | v1.0.0 | 初始实现：箭头线端点（9×2）+ 走线形态（3） | REQ: 20261027-board-whiteboard-draw §3.6 / §3.8 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';
import { ArrowLineHandleKey } from '@plait/draw';

import {
  ARROW_LINE_MARKER_OPTIONS,
  ARROW_LINE_SHAPE_OPTIONS,
  PREFIX,
  type ArrowLineMarkerOption,
  type ArrowLineShapeOption,
} from '../constants';
import { ARROW_LINE_MARKER_ICONS, ARROW_LINE_SHAPE_ICONS, ICON_LINE_MARKER } from '../icons';
import { applyArrowLineMark, applyArrowLineShape } from '../transforms';
import { createDropdownShell } from './dropdown-shell';

export interface LineMarkerSegment {
  readonly button: HTMLElement;
  /** 回填当前走线形态与源/目标端点标记 */
  setActiveLine(
    shape: ArrowLineShapeOption | null,
    source: ArrowLineMarkerOption | null,
    target: ArrowLineMarkerOption | null,
  ): void;
  /** 设置能力组显隐（隐藏时收起下拉面板） */
  setVisible(visible: boolean): void;
  /** 绑定 board */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

export function createLineMarkerSegment(): LineMarkerSegment {
  let board: PlaitBoard | null = null;

  const shell = createDropdownShell({
    modifier: 'line-marker',
    title: '端点 / 走线',
    icon: ICON_LINE_MARKER,
  });

  // --- 走线形态行 -----------------------------------------------------------
  const shapeRow = document.createElement('div');
  shapeRow.className = `${PREFIX}__line-marker-shape-row`;
  shell.dropdown.appendChild(shapeRow);

  const shapeButtons = new Map<ArrowLineShapeOption, HTMLButtonElement>();
  for (const option of ARROW_LINE_SHAPE_OPTIONS) {
    const item = document.createElement('button');
    item.className = `${PREFIX}__line-marker-shape-item`;
    item.type = 'button';
    item.title = option.label;
    item.innerHTML = ARROW_LINE_SHAPE_ICONS[option.id];
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      applyArrowLineShape(board, option.id);
      setActiveShape(option.id);
    });
    shapeButtons.set(option.id, item);
    shapeRow.appendChild(item);
  }

  // --- 端点标记（源 / 目标） -------------------------------------------------
  const source = createMarkerRow(ArrowLineHandleKey.source, '起点');
  const target = createMarkerRow(ArrowLineHandleKey.target, '终点');
  shell.dropdown.appendChild(source.row);
  shell.dropdown.appendChild(target.row);

  /** 创建一个端点标记行（标题 + 9 个标记） */
  function createMarkerRow(
    handleKey: ArrowLineHandleKey,
    title: string,
  ): { row: HTMLElement; setActive: (marker: ArrowLineMarkerOption | null) => void } {
    const row = document.createElement('div');
    row.className = `${PREFIX}__line-marker-marker-row`;

    const label = document.createElement('div');
    label.className = `${PREFIX}__line-marker-marker-label`;
    label.textContent = title;
    row.appendChild(label);

    const grid = document.createElement('div');
    grid.className = `${PREFIX}__line-marker-marker-grid`;
    row.appendChild(grid);

    const map = new Map<ArrowLineMarkerOption, HTMLButtonElement>();
    for (const option of ARROW_LINE_MARKER_OPTIONS) {
      const item = document.createElement('button');
      item.className = `${PREFIX}__line-marker-marker-item`;
      item.type = 'button';
      item.title = option.label;
      item.innerHTML = ARROW_LINE_MARKER_ICONS[option.id];
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!board) return;
        applyArrowLineMark(board, handleKey, option.id);
        setActive(option.id);
      });
      map.set(option.id, item);
      grid.appendChild(item);
    }

    function setActive(marker: ArrowLineMarkerOption | null): void {
      map.forEach((btn, id) => {
        btn.classList.toggle('is-active', id === marker);
      });
    }

    return { row, setActive };
  }

  function setActiveShape(shape: ArrowLineShapeOption): void {
    shapeButtons.forEach((btn, id) => {
      btn.classList.toggle('is-active', id === shape);
    });
  }

  function setActiveLine(
    shape: ArrowLineShapeOption | null,
    sourceMarker: ArrowLineMarkerOption | null,
    targetMarker: ArrowLineMarkerOption | null,
  ): void {
    if (shape) setActiveShape(shape);
    source.setActive(sourceMarker);
    target.setActive(targetMarker);
  }

  function setBoard(next: PlaitBoard): void {
    board = next;
  }

  function destroy(): void {
    shapeButtons.clear();
    shell.destroy();
  }

  return {
    button: shell.button,
    setActiveLine,
    setVisible: shell.setVisible,
    setBoard,
    destroy,
  };
}

/**
 * Board Style Toolbar - 白板图形切换能力组
 *
 * 选中图形后，在下拉面板里从 21 种基础图形（文本图形除外）中选一个，
 * 调 `DrawTransforms.switchGeometryShape` 无损切换类型：内部仅改 `shape` 字段，
 * points / text / fill / angle 等其余字段原样保留。
 *
 * 缩略图复用共享的 `createShapeThumbnail`（与创建工具条同源），
 * 由 `drawGeometry` 实时渲染真实图形，与包升级永不脱节。
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                                      |
 * | v1.0.0 | 初始实现：图形切换下拉网格（缩略图 + 中文名） | REQ: 20261027-board-whiteboard-draw §3.8  |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';
import { BasicShapes, getBasicPointers, type GeometryShapes } from '@plait/draw';

import { getShapeLabel } from '../../draw-toolbar/constants';
import { createShapeThumbnail } from '../../shape-thumbnail';
import { PREFIX } from '../constants';
import { ICON_SHAPE_SWITCH } from '../icons';
import { applyGeometryShape } from '../transforms';
import { createDropdownShell } from './dropdown-shell';

/** 可切换的图形清单：21 种基础图形剔除 text（text box 语义特殊，切换 API 亦排除） */
const SHAPE_SWITCH_POINTERS = getBasicPointers().filter((pointer) => pointer !== BasicShapes.text);

export interface ShapeSwitchSegment {
  readonly button: HTMLElement;
  /** 回填当前图形类型（选中项高亮） */
  setActiveShape(shape: GeometryShapes | null): void;
  /** 设置能力组显隐（隐藏时收起下拉面板） */
  setVisible(visible: boolean): void;
  /** 绑定 board（用于渲染缩略图） */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

export function createShapeSwitchSegment(): ShapeSwitchSegment {
  let board: PlaitBoard | null = null;

  const shell = createDropdownShell({
    modifier: 'shape-switch',
    title: '图形切换',
    icon: ICON_SHAPE_SWITCH,
  });

  const grid = document.createElement('div');
  grid.className = `${PREFIX}__shape-switch-grid`;
  shell.dropdown.appendChild(grid);

  /** pointer → 网格项 DOM，用于回填高亮与缩略图渲染 */
  const itemMap = new Map<string, HTMLButtonElement>();

  for (const pointer of SHAPE_SWITCH_POINTERS) {
    const label = getShapeLabel(pointer);
    const item = document.createElement('button');
    item.className = `${PREFIX}__shape-switch-item`;
    item.type = 'button';
    item.title = label;
    item.setAttribute('data-pointer', pointer);

    const thumb = document.createElement('span');
    thumb.className = `${PREFIX}__shape-switch-thumb`;
    item.appendChild(thumb);

    const text = document.createElement('span');
    text.className = `${PREFIX}__shape-switch-label`;
    text.textContent = label;
    item.appendChild(text);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      applyGeometryShape(board, pointer as GeometryShapes);
      setActiveShape(pointer as GeometryShapes);
    });

    itemMap.set(pointer, item);
    grid.appendChild(item);
  }

  function setActiveShape(shape: GeometryShapes | null): void {
    itemMap.forEach((item, pointer) => {
      item.classList.toggle('is-active', pointer === shape);
    });
  }

  function setBoard(next: PlaitBoard): void {
    board = next;
    // 缩略图依赖 board 的 roughSVG，board 实例更换后旧缩略图失效，清空重绘
    itemMap.forEach((item, pointer) => {
      const thumb = item.querySelector(`.${PREFIX}__shape-switch-thumb`);
      if (!thumb) return;
      thumb.innerHTML = '';
      thumb.appendChild(createShapeThumbnail(next, pointer, getShapeLabel(pointer)));
    });
  }

  function destroy(): void {
    itemMap.clear();
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

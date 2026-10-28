/**
 * Board Draw Toolbar - 连线走线选择面板
 *
 * 点击工具条「连线」按钮后弹出的走线选择面板（直线 / 曲线 / 折线）。
 *
 * 交互与「图形」面板刻意不同（PRD Q19）：
 * - 图形：单击按钮只弹面板、不设 pointer，必须在面板中选一个才进入创建态。
 * - 连线：单击按钮**立即**以「上次选的走线」进入创建态，面板只是可选的切换器，
 *   用户完全可以无视面板直接去画布拉线。
 *
 * 面板作为工具条根 DOM 的后代渲染（不 portal 到 body），从而继承根上的
 * `plait-board-attached` 类——否则点击面板的瞬间 Plait 的 globalPointerUp
 * 会清空画板选中态。
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                                      |
 * | v1.0.0 | 初始实现：三种走线的弹出选择面板      | REQ: 20261027-board-whiteboard-draw §3.6  |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import { ARROW_LINE_TOOLS, DRAW_TOOLBAR_PREFIX as PREFIX } from './constants';
import type { DrawPanelController } from './types';

/**
 * 创建连线走线选择面板。
 *
 * @param onSelect 用户点选某种走线时回调（面板自身不写 board.pointer）
 */
export function createLinePanel(onSelect: (pointer: string) => void): DrawPanelController {
  let open = false;

  /** pointer → 选项 DOM，用于 setActive 回填高亮 */
  const itemMap = new Map<string, HTMLElement>();

  const dom = document.createElement('div');
  dom.className = `${PREFIX}__panel ${PREFIX}__line-panel`;
  dom.setAttribute('data-open', 'false');

  const list = document.createElement('div');
  list.className = `${PREFIX}__panel-list`;
  dom.appendChild(list);

  for (const tool of ARROW_LINE_TOOLS) {
    const item = document.createElement('button');
    item.className = `${PREFIX}__panel-row ${PREFIX}__panel-row--${tool.modifier}`;
    item.type = 'button';
    item.title = tool.title;
    item.setAttribute('data-pointer', tool.pointer);

    const icon = document.createElement('span');
    icon.className = `${PREFIX}__panel-row-icon`;
    icon.innerHTML = tool.icon;
    item.appendChild(icon);

    const label = document.createElement('span');
    label.className = `${PREFIX}__panel-row-label`;
    label.textContent = tool.title;
    item.appendChild(label);

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(tool.pointer);
      close();
    });

    itemMap.set(tool.pointer, item);
    list.appendChild(item);
  }

  /** 点击面板与触发按钮之外的区域时收起 */
  function handleOutsidePointerDown(event: MouseEvent): void {
    if (!open) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (dom.contains(target)) return;
    if (target.closest(`.${PREFIX}__btn--arrow-line`)) return;
    close();
  }

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    dom.setAttribute('data-open', next ? 'true' : 'false');
    if (next) {
      document.addEventListener('mousedown', handleOutsidePointerDown, true);
    } else {
      document.removeEventListener('mousedown', handleOutsidePointerDown, true);
    }
  }

  function openPanel(): void {
    setOpen(true);
  }

  function close(): void {
    setOpen(false);
  }

  function setActive(pointer: string | null): void {
    itemMap.forEach((item, value) => {
      item.classList.toggle('is-active', value === pointer);
    });
  }

  /** 连线面板不渲染 Plait 图元，无需 board；保留空实现以统一面板接口 */
  function setBoard(_board: PlaitBoard | null): void {}

  function destroy(): void {
    document.removeEventListener('mousedown', handleOutsidePointerDown, true);
    itemMap.clear();
    dom.remove();
  }

  return {
    dom,
    get isOpen() {
      return open;
    },
    open: openPanel,
    close,
    setBoard,
    setActive,
    destroy,
  };
}

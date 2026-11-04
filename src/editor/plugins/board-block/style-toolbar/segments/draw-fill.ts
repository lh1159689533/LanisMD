/**
 * Board Style Toolbar - 白板图形填充能力组
 *
 * 工具栏按钮（实心圆，颜色随当前填充色变化）+ 下拉取色面板。
 *
 * 与导图的 `fill.ts` 的区别只有两点，其余完全同构：
 * 1. 写入走 `applyDrawFillColor`，它带 `getMemorizeKey`，使随后新建的图形
 *    自动继承刚设置的填充色；导图侧不做这种记忆。
 * 2. 显隐条件不同：导图看「是否为下划线节点」，画板看「选中元素是否都是闭合图形」
 *    （连线没有填充语义），由 `index.ts` 依 `getDrawCapabilities().fill` 传入。
 *
 * @changelog
 * | 版本   | 变更说明               | 关联                                      |
 * | v1.0.0 | 初始实现：画板填充下拉面板 | REQ: 20261027-board-whiteboard-draw §3.8  |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import { ICON_FILL } from '../icons';
import { createColorPanel, type ColorPanelController } from '../color-panel';
import { applyDrawFillColor, resolveColor } from '../transforms';
import { createDropdownShell } from './dropdown-shell';

export interface DrawFillSegment {
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

export function createDrawFillSegment(): DrawFillSegment {
  let board: PlaitBoard | null = null;

  const shell = createDropdownShell({
    modifier: 'fill',
    title: '填充',
    icon: ICON_FILL,
  });

  /** 按钮内 SVG circle 的 fill 跟随当前色，作为颜色指示器 */
  function updateButtonColor(color: string | null): void {
    const circle = shell.button.querySelector('circle');
    if (circle) {
      circle.setAttribute('fill', color ?? '#e5e5e5');
    }
  }

  const colorPanel: ColorPanelController = createColorPanel((color) => {
    if (!board) return;
    const resolved = resolveColor(color);
    applyDrawFillColor(board, resolved);
    updateButtonColor(resolved);
  });
  shell.dropdown.appendChild(colorPanel.dom);

  function setActiveFill(color: string | null): void {
    updateButtonColor(color);
    colorPanel.setActiveColor(color);
  }

  function setBoard(next: PlaitBoard): void {
    board = next;
    colorPanel.setBoard(next);
  }

  function destroy(): void {
    colorPanel.destroy();
    shell.destroy();
  }

  return {
    button: shell.button,
    setActiveFill,
    setVisible: shell.setVisible,
    setBoard,
    destroy,
  };
}

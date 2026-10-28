/**
 * Board Context Menu - 命中检测与场景路由
 *
 * 把右键的屏幕坐标转换为画布坐标，检测命中的元素，并路由到四类场景之一。
 * 场景路由的产物（场景 + 命中元素 + 画布坐标）作为动作上下文透传给菜单动作。
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                          |
 * | v1.0.0 | 初始实现：命中检测 + 场景路由 | REQ: 20261028-board-context-menu TECH: 画板右键菜单方案 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { getHitElementByPoint, toHostPoint, toViewBoxPoint } from '@plait/core';
import type { PlaitBoard, PlaitElement } from '@plait/core';

import type { BoardBlockState, BoardMode } from '../types';
import type { BoardContextScene } from './types';

/** 命中检测结果 */
export interface HitResult {
  /** 路由到的场景 */
  scene: BoardContextScene;
  /** 命中的元素；空白 / 预览态为 null */
  hitElement: PlaitElement | null;
  /** 右键点击处的画布坐标；预览态为 null */
  viewBoxPoint: [number, number] | null;
}

/**
 * 依据画板形态、块状态与右键坐标，判定应展示的菜单场景。
 *
 * 场景判定规则：
 * - 预览态（只读）：任何位置都是 `preview`，菜单仅含画布操作
 * - 白板编辑态：命中元素 → `board-element`；未命中 → `board-blank`
 * - 导图编辑态：命中节点 → `mind-node`；未命中 → `mind-blank`
 */
export function detectContextScene(
  board: PlaitBoard,
  mode: BoardMode,
  state: BoardBlockState,
  clientX: number,
  clientY: number,
): HitResult {
  // 预览态：只读挂载，不做命中检测，只给画布操作
  if (state === 'preview') {
    return { scene: 'preview', hitElement: null, viewBoxPoint: null };
  }

  const hostPoint = toHostPoint(board, clientX, clientY);
  const viewBoxPoint = toViewBoxPoint(board, hostPoint) as [number, number];
  const hitElement = getHitElementByPoint(board, viewBoxPoint);

  if (mode === 'board') {
    return hitElement
      ? { scene: 'board-element', hitElement, viewBoxPoint }
      : { scene: 'board-blank', hitElement: null, viewBoxPoint };
  }

  return hitElement
    ? { scene: 'mind-node', hitElement, viewBoxPoint }
    : { scene: 'mind-blank', hitElement: null, viewBoxPoint };
}

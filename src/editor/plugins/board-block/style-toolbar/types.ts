/**
 * Board Style Toolbar - 内部类型定义
 *
 * 节点样式工具栏的共享类型，含「选中元素类型判定」的分流入口。
 *
 * 分流原则（PRD §3.8 风险应对）：
 * 导图分支（`isMindElement` + mind 专属 segments）保持原实现不动，
 * 白板分支以并列的新函数/新 segments 实现，两者在 `index.ts` 按 `mode` 装配，
 * 避免重构触碰已交付的导图逻辑。
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                                        |
 * | v1.0.0 | 批次1地基：selection 联动类型  | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §3.1 |
 * | v1.1.0 | 新增白板分支：draw 元素判定 + 控制器 setMode | REQ: 20261027-board-whiteboard-draw §3.8 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard, PlaitElement } from '@plait/core';

import type { BoardMode } from '../types';

/** 工具栏可见性变更的回调 */
export type ToolbarVisibilityHandler = (visible: boolean) => void;

/**
 * 样式工具栏控制器接口。
 *
 * 由 `createStyleToolbar` 创建并返回，供 NodeView 在编辑态挂载/销毁。
 */
export interface StyleToolbarController {
  /** 工具栏根 DOM（浮在选中元素上方） */
  readonly dom: HTMLElement;
  /** 绑定 board 实例并开始监听 selection 变化 */
  attach(board: PlaitBoard): void;
  /** 解绑 board 并停止监听（还原 board.onChange） */
  detach(): void;
  /**
   * 切换画板形态，按形态重新装配能力组。
   *
   * 主窗口 NodeView 在构造时即知形态，直接由工厂参数传入；
   * 全屏窗口要等主窗口下发数据解码后才知道，故需要这个运行时入口。
   */
  setMode(mode: BoardMode): void;
  /** 立即按当前选中态刷新显隐与回填（一般由 selection 变更自动触发） */
  sync(): void;
  /** 销毁：移除 DOM 与所有监听 */
  destroy(): void;
}

/**
 * 判定一个 Plait 元素是否为思维导图节点（根 `mind` 或子 `mind_child`）。
 *
 * 导图模式下样式工具栏仅在选中 mind 节点时浮现。
 */
export function isMindElement(element: PlaitElement): boolean {
  const type = (element as { type?: string }).type;
  return type === 'mind' || type === 'mind_child';
}

/**
 * 白板模式下工具栏关注的元素类型。
 *
 * 刻意不直接用 `@plait/draw` 的 `PlaitDrawElement.isDrawElement`：后者还覆盖
 * table / swimlane（本期明确不接入，见 PRD Q4），放进来会让工具栏对不支持的
 * 元素也浮现。这里显式枚举本期支持的四种类型。
 */
const DRAW_ELEMENT_TYPES = new Set(['geometry', 'arrow-line', 'vector-line', 'image']);

/** 判定一个 Plait 元素是否为本期支持的 draw 元素 */
export function isDrawElement(element: PlaitElement): boolean {
  const type = (element as { type?: string }).type;
  return !!type && DRAW_ELEMENT_TYPES.has(type);
}

/** 按画板形态取对应的元素判定函数 */
export function getElementMatcherByMode(mode: BoardMode): (element: PlaitElement) => boolean {
  return mode === 'board' ? isDrawElement : isMindElement;
}

/**
 * Board Style Toolbar - 内部类型定义
 *
 * 节点样式工具栏的共享类型。批次 1 仅含地基所需的最小类型，
 * 后续批次（形状/填充/描边/分支/文字）在此扩展能力组配置。
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                                        |
 * | v1.0.0 | 批次1地基：selection 联动类型  | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §3.1 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard, PlaitElement } from '@plait/core';

/** 工具栏可见性变更的回调 */
export type ToolbarVisibilityHandler = (visible: boolean) => void;

/**
 * 样式工具栏控制器接口。
 *
 * 由 `createStyleToolbar` 创建并返回，供 NodeView 在编辑态挂载/销毁。
 */
export interface StyleToolbarController {
  /** 工具栏根 DOM（浮在画板视口顶部居中） */
  readonly dom: HTMLElement;
  /** 绑定 board 实例并开始监听 selection 变化 */
  attach(board: PlaitBoard): void;
  /** 解绑 board 并停止监听（还原 board.onChange） */
  detach(): void;
  /** 立即按当前选中态刷新显隐与回填（一般由 selection 变更自动触发） */
  sync(): void;
  /** 销毁：移除 DOM 与所有监听 */
  destroy(): void;
}

/**
 * 判定一个 Plait 元素是否为思维导图节点（根 `mind` 或子 `mind_child`）。
 *
 * 样式工具栏仅在选中 mind 节点时浮现。
 */
export function isMindElement(element: PlaitElement): boolean {
  const type = (element as { type?: string }).type;
  return type === 'mind' || type === 'mind_child';
}

/**
 * Board Canvas Toolbar - 类型定义
 *
 * 画布级工具栏的共享类型。
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                                     |
 * | v1.0.0 | 初始实现：画布工具栏控制器类型 | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §二 |
 * | v1.1.0 | 新增可选的编辑/完成操作卡回调  | REQ: 20261026-board-fullscreen-maximize |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard, ThemeColorMode } from '@plait/core';

import type { BoardBlockState } from '../types';

/** 指针模式：手型（平移）/ 选择（选中与框选） */
export type CanvasPointerMode = 'hand' | 'selection';

/** 画布工具栏回调 */
export interface CanvasToolbarCallbacks {
  /**
   * 主题变更回调。
   *
   * 工具栏自身不写 board，由宿主负责调用 `BoardTransforms.updateThemeColor`
   * 并完成持久化（纯主题变更不触发 Wrapper 的 onValueChange，须走
   * onThemeChange，详见 board-react.tsx 的说明）。
   */
  onThemeChange: (mode: ThemeColorMode) => void;
  /**
   * 指针模式变更回调（含同步刷新时的当前值）。
   *
   * 工具栏不直接操作宿主 DOM；由宿主决定把该状态打在哪个节点上，
   * 供 CSS 切换画布光标（Plait 自身不处理 hand 模式的光标样式）。
   */
  onPointerModeChange?: (mode: CanvasPointerMode) => void;
  /**
   * 切换编辑 / 预览态。
   *
   * 仅当传入时才渲染「操作卡」（编辑/完成按钮）。主窗口 NodeView 已有节点外
   * 竖排的块工具栏承担该入口，故不传；全屏子窗口没有块工具栏，由本卡片提供，
   * 使编辑按钮与画布操作按钮同排且样式统一。
   */
  onToggleEdit?: () => void;
}

/**
 * 画布工具栏控制器。
 *
 * 由 `createCanvasToolbar` 创建，宿主（NodeView / 全屏窗口）负责：
 * - board 就绪时 `attach(board)`
 * - 预览/编辑态切换时 `setBlockState(state)`
 * - 卸载时 `destroy()`
 */
export interface CanvasToolbarController {
  /** 工具栏根 DOM（绝对定位于画板块右上角） */
  readonly dom: HTMLElement;
  /** 绑定 board 实例并开始监听视口变化 */
  attach(board: PlaitBoard): void;
  /** 解绑 board 并停止监听（还原 board.onChange） */
  detach(): void;
  /** 切换块状态：预览态隐藏手型/选择开关，编辑态显示全部 */
  setBlockState(state: BoardBlockState): void;
  /** 按当前 board 状态刷新缩放百分比、按钮禁用态与主题勾选 */
  sync(): void;
  /** 销毁：移除 DOM 与所有监听 */
  destroy(): void;
}

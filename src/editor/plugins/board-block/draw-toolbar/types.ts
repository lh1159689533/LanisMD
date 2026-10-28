/**
 * Board Draw Toolbar - 类型定义
 *
 * 白板块左侧竖排创建工具条的共享类型。
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                                      |
 * | v1.0.0 | 初始实现：创建工具条控制器与工具项类型 | REQ: 20261027-board-whiteboard-draw §3.4  |
 * | v1.1.0 | 新增图形分类与弹出面板控制器类型      | REQ: 20261027-board-whiteboard-draw §3.5  |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import type { BoardBlockState } from '../types';

/**
 * 工具项定义。
 *
 * 一个工具项对应一个 `board.pointer` 取值：点击即把该值写入 board，
 * 之后在画布上的拖拽行为由对应的 Plait 插件接管。
 */
export interface DrawToolItem {
  /** `board.pointer` 的目标值（`PlaitPointerType` 或 `DrawPointerType`） */
  pointer: string;
  /** BEM 修饰名，生成 `__btn--{modifier}` 类 */
  modifier: string;
  /** 原生 tooltip 文案（中文显示名） */
  title: string;
  /** 按钮图标（SVG 字符串） */
  icon: string;
}

/** 图形分类（网格面板的一个 tab） */
export interface ShapeCategory {
  /** 分类标识，用于 BEM 修饰名与 data 属性 */
  id: 'basic' | 'flowchart' | 'uml';
  /** tab 显示名 */
  label: string;
  /** 该分类下的全部 pointer（从 `@plait/draw` 动态获取） */
  pointers: string[];
  /** 本批次是否已实现；false 时 tab 渲染为禁用态 */
  enabled: boolean;
  /** 禁用态的 tooltip 说明 */
  disabledHint?: string;
}

/**
 * 弹出面板控制器的公共形态。
 *
 * 面板一律作为工具条根 DOM 的后代渲染（不 portal 到 body），从而继承根上的
 * `plait-board-attached` 类——否则点击面板的瞬间 Plait 的 globalPointerUp
 * 会清空画板选中态。
 */
export interface DrawPanelController {
  /** 面板根 DOM */
  readonly dom: HTMLElement;
  /** 面板是否展开 */
  readonly isOpen: boolean;
  /** 展开面板 */
  open(): void;
  /** 收起面板 */
  close(): void;
  /** 绑定 board（图形缩略图需用 board 的 roughSVG 渲染） */
  setBoard(board: PlaitBoard | null): void;
  /** 回填当前选中项的高亮 */
  setActive(pointer: string | null): void;
  /** 销毁：移除监听与 DOM */
  destroy(): void;
}

/** 创建工具条回调 */
export interface DrawToolbarCallbacks {
  /**
   * 当前指针模式变更回调（含同步刷新时的当前值）。
   *
   * 工具条不直接操作宿主 DOM：由宿主决定把该状态打在哪个节点上，供 CSS 切换
   * 画布光标。Plait 自身只在创建 board 时按 pointer 给容器打类，运行时改写
   * `board.pointer` 不会重新计算该类名（与 canvas-toolbar 的手型光标同理）。
   */
  onPointerChange?: (pointer: string) => void;
}

/**
 * 创建工具条控制器。
 *
 * 与 `canvas-toolbar` / `style-toolbar` 保持同一套控制器范式，由宿主
 * （NodeView / 全屏窗口）负责：
 * - board 就绪时 `attach(board)`
 * - 预览/编辑态切换时 `setBlockState(state)`
 * - `readonly` 跳变导致 pointer 被强制重设后调用 `sync()`
 * - 卸载时 `destroy()`
 *
 * **仅白板块创建本控制器**；导图块完全不创建，避免无谓 DOM 与监听。
 */
export interface DrawToolbarController {
  /** 工具条根 DOM（绝对定位于画板块左侧） */
  readonly dom: HTMLElement;
  /** 绑定 board 实例并开始监听变更 */
  attach(board: PlaitBoard): void;
  /** 解绑 board 并停止监听（还原 board.onChange） */
  detach(): void;
  /** 切换块状态：仅编辑态显示工具条 */
  setBlockState(state: BoardBlockState): void;
  /** 按当前 `board.pointer` 刷新按钮高亮与禁用态 */
  sync(): void;
  /** 销毁：移除 DOM 与所有监听 */
  destroy(): void;
}

/**
 * Board Context Menu - 类型定义
 *
 * 画板右键菜单的共享类型：触发场景、菜单项结构、动作上下文。
 *
 * @changelog
 * | 版本   | 变更说明               | 关联                                          |
 * | v1.0.0 | 初始实现：右键菜单类型定义 | REQ: 20261028-board-context-menu TECH: 画板右键菜单方案 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard, PlaitElement } from '@plait/core';

import type { BoardBlockState, BoardMode } from '../types';

// ---------------------------------------------------------------------------
// 触发场景
// ---------------------------------------------------------------------------

/**
 * 右键菜单触发场景。
 *
 * 由 `mode`（导图/白板）× `state`（预览/编辑）× 命中结果 共同确定：
 * - `preview`：只读态，任何位置都只显示「实际尺寸 / 适应画布」
 * - `board-element`：白板编辑态，命中某个图形/连线/图片
 * - `board-blank`：白板编辑态，未命中任何元素
 * - `mind-node`：导图编辑态，命中某个导图节点
 * - `mind-blank`：导图编辑态，未命中任何节点
 */
export type BoardContextScene =
  | 'preview'
  | 'board-element'
  | 'board-blank'
  | 'mind-node'
  | 'mind-blank';

// ---------------------------------------------------------------------------
// 动作上下文
// ---------------------------------------------------------------------------

/**
 * 菜单动作上下文。
 *
 * 把「命中检测」阶段拿到的结果原样透传给每个动作，动作据此读取 board、
 * 命中元素与坐标，避免动作内部重复做命中检测。
 */
export interface ContextMenuActionContext {
  /** Plait board 实例 */
  board: PlaitBoard;
  /** 命中的元素；空白 / 预览态为 null */
  hitElement: PlaitElement | null;
  /**
   * 右键点击处的画布坐标（viewBox point），用于粘贴定位。
   * 空白 / 预览态为 null（粘贴到画布中心或忽略位置）。
   */
  viewBoxPoint: [number, number] | null;
  /** 当前场景 */
  scene: BoardContextScene;
  /** 画板形态 */
  mode: BoardMode;
}

/** 菜单项动作；粘贴等读剪贴板的操作为异步 */
export type MenuAction = (ctx: ContextMenuActionContext) => void | Promise<void>;

// ---------------------------------------------------------------------------
// 菜单项结构
// ---------------------------------------------------------------------------

/**
 * 菜单项定义。
 *
 * 纯数据描述，不含 DOM：由 `menu-builder` 按场景产出，`index.ts` 负责渲染。
 * 支持「普通项 / 分隔线 / 子菜单」三种形态。
 */
export interface MenuItemDef {
  /** 显示文案；分隔线时忽略 */
  label: string;
  /** 图标（SVG 字符串） */
  icon?: string;
  /** 是否为分隔线 */
  separator?: boolean;
  /** 禁用态；可为函数，按上下文动态判定 */
  disabled?: boolean | ((ctx: ContextMenuActionContext) => boolean);
  /** 点击动作 */
  action?: MenuAction;
  /** 子菜单项（非空时渲染为可展开的子菜单） */
  children?: MenuItemDef[];
}

/** 菜单构建器：由场景 + 动作集产出菜单项 */
export type MenuBuilder = (ctx: ContextMenuActionContext) => MenuItemDef[];

// ---------------------------------------------------------------------------
// 控制器
// ---------------------------------------------------------------------------

/**
 * 右键菜单控制器。
 *
 * 与画板其它工具栏（canvas / style / draw）同范式：原生 DOM、由宿主（NodeView）
 * 负责 attach / detach / destroy。与其它工具栏的差异在于本控制器不持有一段
 * 常驻 DOM，而是按需在 `document.body` 上弹出临时菜单。
 */
export interface BoardContextMenuController {
  /** 绑定 board 实例 */
  attach(board: PlaitBoard): void;
  /** 解绑 board（关闭菜单） */
  detach(): void;
  /** 切换块状态：预览态与编辑态菜单内容不同 */
  setBlockState(state: BoardBlockState): void;
  /** 在指定屏幕坐标弹出菜单（由宿主在 contextmenu 事件中调用） */
  show(clientX: number, clientY: number): void;
  /** 关闭当前菜单 */
  close(): void;
  /** 销毁：关闭菜单并释放监听 */
  destroy(): void;
}

/** 创建控制器的入参 */
export interface BoardContextMenuOptions {
  /** 画板形态（块级不可变） */
  mode: BoardMode;
  /**
   * 创建态回调：右键「添加连线」时通知宿主。
   *
   * 由宿主负责把 `board.pointer` 写入 + 设置 creation mode（与 draw-toolbar
   * 的创建入口一致），菜单本身只负责「请求进入某个 pointer 的创建态」。
   */
  onEnterCreation?: (pointer: string) => void;
  /**
   * 直接插入图形回调：右键「添加图形」时通知宿主。
   *
   * 由宿主在给定画布坐标处插入默认矩形并选中（不走创建态）。
   */
  onInsertShape?: (point: [number, number]) => void;
}

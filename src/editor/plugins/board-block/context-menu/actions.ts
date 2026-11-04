/**
 * Board Context Menu - 菜单动作
 *
 * 把右键菜单的每一项映射到 Plait Transform 或项目已有封装。
 * 全部动作只读 `ContextMenuActionContext`（board / 命中元素 / 坐标），
 * 不直接操作 DOM，保持纯函数化、可测试。
 *
 * 能力来源：
 * - 剪切 / 复制 / 粘贴：@plait/core 的 setFragment / getClipboardData
 * - 删除：@plait/core 的 deleteFragment（删除选中元素，画板）/ 导图删除子树
 * - 层级：Transforms.moveUp / moveDown / moveToTop / moveToBottom
 * - 导图插入 / 折叠：@plait/mind 的 MindTransforms / Transforms.setNode
 * - 实际尺寸 / 适应画布：canvas-toolbar/viewport-actions 的 resetZoom / fitViewport
 * - 添加图形：回调宿主在右键位置直接插入默认矩形并选中；添加连线：回调宿主进入创建态
 *
 * @changelog
 * | 版本   | 变更说明             | 关联                                          |
 * | v1.0.0 | 初始实现：菜单动作封装 | REQ: 20261028-board-context-menu TECH: 画板右键菜单方案 |
 * | v1.1.0 | 「添加图形」改为右键位置直接插入默认矩形并选中 | REQ: 20261028-board-context-menu |
 * /@changelog
 *
 * @author hhhuilli
 */

import {
  Transforms,
  WritableClipboardOperationType,
  deleteFragment,
  getClipboardData,
  setFragment,
} from '@plait/core';
import { PlaitBoard } from '@plait/core';
import { MindTransforms } from '@plait/mind';

import { createDefaultMindmap } from '../constants';
import { DEFAULT_ARROW_LINE_SHAPE } from '../draw-toolbar/constants';
import { fitViewport, resetZoom } from '../canvas-toolbar/viewport-actions';
import type { ContextMenuActionContext, MenuAction } from './types';

/** 创建菜单动作集 */
export interface BoardContextActions {
  copy: MenuAction;
  cut: MenuAction;
  paste: MenuAction;
  delete: MenuAction;
  moveUp: MenuAction;
  moveDown: MenuAction;
  moveToTop: MenuAction;
  moveToBottom: MenuAction;
  insertChild: MenuAction;
  insertSibling: MenuAction;
  toggleCollapse: MenuAction;
  addMind: MenuAction;
  addShape: MenuAction;
  addLine: MenuAction;
  resetZoom: MenuAction;
  fitViewport: MenuAction;
}

/** 创建动作集的入参 */
export interface CreateActionsOptions {
  /** 进入创建态回调（添加连线时触发，由宿主写入 board.pointer + creation mode） */
  onEnterCreation?: (pointer: string) => void;
  /** 直接插入图形回调（添加图形时触发，由宿主插入默认矩形并选中） */
  onInsertShape?: (point: [number, number]) => void;
}

/**
 * 创建菜单动作集。
 *
 * @param options 构造选项
 */
export function createActions(options: CreateActionsOptions = {}): BoardContextActions {
  return {
    /** 复制：选中元素写入系统剪贴板 */
    copy: (ctx) => {
      setFragment(ctx.board, WritableClipboardOperationType.copy, null);
    },

    /** 剪切：复制后删除选中元素 */
    cut: (ctx) => {
      setFragment(ctx.board, WritableClipboardOperationType.cut, null);
      deleteFragment(ctx.board);
    },

    /** 粘贴：读剪贴板后插入到右键点击处 */
    paste: async (ctx) => {
      const data = await getClipboardData(null);
      if (!data || Object.keys(data).length === 0) return;
      const point = ctx.viewBoxPoint ?? [0, 0];
      ctx.board.insertFragment(data, point, WritableClipboardOperationType.paste);
    },

    /** 删除选中元素（画板）/ 选中节点及其子树（导图） */
    delete: (ctx) => {
      deleteFragment(ctx.board);
    },

    /** 上移一层 */
    moveUp: (ctx) => {
      Transforms.moveUp(ctx.board);
    },

    /** 下移一层 */
    moveDown: (ctx) => {
      Transforms.moveDown(ctx.board);
    },

    /** 置顶 */
    moveToTop: (ctx) => {
      Transforms.moveToTop(ctx.board);
    },

    /** 置底 */
    moveToBottom: (ctx) => {
      Transforms.moveToBottom(ctx.board);
    },

    /** 导图：给命中节点插入子级 */
    insertChild: (ctx) => {
      if (ctx.hitElement) {
        MindTransforms.insertChildNode(ctx.board as never, ctx.hitElement as never);
      }
    },

    /** 导图：给命中节点插入同级 */
    insertSibling: (ctx) => {
      if (ctx.hitElement) {
        MindTransforms.insertSiblingNode(ctx.board as never, ctx.hitElement as never);
      }
    },

    /** 导图：折叠 / 展开命中节点（切换 isCollapsed） */
    toggleCollapse: (ctx) => {
      const element = ctx.hitElement as { isCollapsed?: boolean } | null;
      if (!element) return;
      const path = PlaitBoard.findPath(ctx.board, ctx.hitElement!);
      Transforms.setNode(ctx.board, { isCollapsed: !element.isCollapsed }, path);
    },

    /** 导图：在空白处添加一个思维导图根节点 */
    addMind: (ctx) => {
      const mind = createDefaultMindmap()[0];
      if (ctx.viewBoxPoint) {
        (mind as { points: [number, number][] }).points = [ctx.viewBoxPoint];
      }
      MindTransforms.insertMind(ctx.board as never, mind as never);
    },

    /** 画板：在右键位置直接插入默认矩形并选中 */
    addShape: (ctx) => {
      if (ctx.viewBoxPoint) {
        options.onInsertShape?.(ctx.viewBoxPoint);
      }
    },

    /** 画板：进入默认连线（直线）创建态 */
    addLine: (ctx) => {
      options.onEnterCreation?.(DEFAULT_ARROW_LINE_SHAPE);
    },

    /** 实际尺寸：重置缩放为 100% */
    resetZoom: (ctx) => {
      resetZoom(ctx.board);
    },

    /** 适应画布：缩放并居中到内容整体可见 */
    fitViewport: (ctx) => {
      fitViewport(ctx.board);
    },
  };
}

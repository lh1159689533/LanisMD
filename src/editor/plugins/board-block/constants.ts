/**
 * Board Block - 常量与默认数据
 *
 * 定义画板插件的常量：CSS 前缀、Schema 版本、默认视口高度，
 * 以及「插入即预置」的默认思维导图工厂函数。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                 |
 * | v1.0.0 | 初始实现：常量 + 默认思维导图工厂 + 工具栏图标  | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * | v1.0.1 | 默认思维导图布局方向改为 right（子节点向右）   | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { idCreator } from '@plait/core';
import type { PlaitElement } from '@plait/core';
import { MIND_CENTRAL_TEXT } from '@plait/mind';

// ---------------------------------------------------------------------------
// 基础常量
// ---------------------------------------------------------------------------

/** CSS 类名前缀 */
export const CSS_PREFIX = 'lanismd-board-block';

/**
 * 数据 Schema 版本号。
 *
 * 未来引入 pako 压缩或结构变更时递增，`codec.decode` 依据此字段判别格式，
 * 保证对旧数据向后兼容。
 */
export const SCHEMA_VERSION = 1;

/** 文档内画板视口默认高度（px） */
export const DEFAULT_HEIGHT = 420;

/** 视口高度可拖拽范围（px） */
export const MIN_HEIGHT = 200;
export const MAX_HEIGHT = 1200;

/** 数据回写防抖延迟（ms） */
export const WRITE_BACK_DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// 默认思维导图
// ---------------------------------------------------------------------------

/**
 * 构造一份「插入即预置」的最小思维导图：单个根节点 + 中心主题文本。
 *
 * 每次调用都会生成全新的节点 id，避免同一文档内多个画板共享 id 导致的渲染冲突。
 * 与 Plait 的 `createEmptyMind` 等价，但无需 board 实例即可静态构造
 * （节点尺寸与位置由 `withMind` 插件在挂载时自动布局并 fitViewport）。
 *
 * @returns Plait 画板元素树（长度为 1 的思维导图根节点数组）
 */
export function createDefaultMindmap(): PlaitElement[] {
  return [
    {
      id: idCreator(),
      // 思维导图根节点类型为 'mind'（子节点为 'mind_child'）
      type: 'mind',
      // 根节点起始坐标，实际位置由 withMind 布局后 fitViewport 校正
      points: [[0, 0]],
      // 默认布局方向：'right' 等价于 MindLayoutType.right，即中心主题在左、
      // 子节点向右展开。不设置时 Plait 回落到 standard（左右平衡），会导致新建
      // 子节点排到左侧。此处仅设默认值，用户后续仍可通过 Plait 交互手动切换方向。
      layout: 'right',
      // 文本走 Slate 段落结构：{ type: 'paragraph', children: [{ text }] }
      data: {
        topic: {
          type: 'paragraph',
          children: [{ text: MIND_CENTRAL_TEXT }],
        },
      },
      children: [],
    } as unknown as PlaitElement,
  ];
}

// ---------------------------------------------------------------------------
// 工具栏图标
// ---------------------------------------------------------------------------

/** 工具栏 SVG 图标集 */
export const ICONS = {
  /** 编辑图标 */
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  /** 预览（完成）图标 */
  preview: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  /** 删除图标 */
  delete: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
} as const;

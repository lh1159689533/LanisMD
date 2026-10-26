/**
 * Board Block - 类型定义
 *
 * 画板插件（思维导图 MVP）的共享类型定义。
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                                 |
 * | v1.0.0 | 初始实现：画板块共享类型定义   | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * | v1.1.0 | 新增画板主题字段（块级持久化）  | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §六 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitElement, ThemeColorMode, Viewport } from '@plait/core';

// ---------------------------------------------------------------------------
// 状态类型
// ---------------------------------------------------------------------------

/** 画板块的显示状态：预览态（只读挂载）/ 编辑态（可交互） */
export type BoardBlockState = 'preview' | 'editing';

// ---------------------------------------------------------------------------
// 编解码数据结构
// ---------------------------------------------------------------------------

/**
 * 画板持久化的数据载荷。
 *
 * 序列化时以 `base64(JSON)` 内联存储于 Markdown 的 ` ```plait ` 围栏中。
 */
export interface BoardPayload {
  /** Schema 版本号，供未来数据迁移 / 压缩格式判别 */
  v: number;
  /** Plait 画板元素树（思维导图根节点及其子树） */
  children: PlaitElement[];
  /** 视口信息（缩放、平移），可选 */
  viewport?: Viewport;
  /**
   * 画板主题（Plait `ThemeColorMode`），可选。
   *
   * 作用域为「单个画板块」：同一文档内多个画板各自独立，互不影响。
   * 旧数据缺失该字段时由解码侧回落默认主题，无需升 `SCHEMA_VERSION`。
   */
  theme?: ThemeColorMode;
}

/**
 * `decode` 的解码结果。
 *
 * 与 `BoardPayload` 的差异：字段命名更贴近使用方（`elements` 而非 `children`），
 * 并保证 `elements` 一定为数组（兜底空画板时为默认思维导图）。
 */
export interface DecodedBoard {
  /** Schema 版本号 */
  version: number;
  /** Plait 画板元素树 */
  elements: PlaitElement[];
  /** 视口信息，可选 */
  viewport?: Viewport;
  /** 画板主题；旧数据缺失时回落 `ThemeColorMode.default` */
  theme: ThemeColorMode;
}

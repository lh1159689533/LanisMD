/**
 * Board Block - 类型定义
 *
 * 画板插件（思维导图 MVP）的共享类型定义。
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                                 |
 * | v1.0.0 | 初始实现：画板块共享类型定义   | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * | v1.1.0 | 新增画板主题字段（块级持久化）  | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §六 |
 * | v1.2.0 | 新增 mode 字段（导图 / 白板双形态）| REQ: 20261027-board-whiteboard-draw §3.1 |
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

/**
 * 画板形态。
 *
 * - `mindmap`：思维导图块，注册 `withMind`，工具条为导图结构工具（已交付形态）
 * - `board`：白板块，注册 `withDraw`，工具条为图形 / 连线创建工具
 *
 * 形态在块的生命周期内不可变：由 NodeView 挂载时 decode 一次确定。
 */
export type BoardMode = 'mindmap' | 'board';

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
  /**
   * 画板形态，可选。
   *
   * 缺失或非法时由解码侧回落 `'mindmap'`，使本期之前写入的全部 ` ```plait `
   * 文档行为零变化（故无需递增 `SCHEMA_VERSION`）。
   */
  mode?: BoardMode;
  /** Plait 画板元素树（导图为根节点及其子树；白板为图形 / 连线等平铺元素） */
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
 * `mode` 归一化为必填，且 `elements` 一定为数组。
 *
 * 注意 `elements` 不再保证非空：白板块的空画布是合法状态，
 * 只有导图形态才在空数据时兜底默认思维导图（见 `codec.normalize`）。
 */
export interface DecodedBoard {
  /** Schema 版本号 */
  version: number;
  /** 画板形态；缺失或非法时回落 `'mindmap'` */
  mode: BoardMode;
  /** Plait 画板元素树 */
  elements: PlaitElement[];
  /** 视口信息，可选 */
  viewport?: Viewport;
  /** 画板主题；旧数据缺失时回落 `ThemeColorMode.default` */
  theme: ThemeColorMode;
}

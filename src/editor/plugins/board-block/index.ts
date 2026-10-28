/**
 * Board Block Plugin
 *
 * 画板插件（思维导图 MVP）对外聚合入口。
 *
 * 组成：
 * - remarkBoardPlugin：将 code(lang=plait) 改写为 board_block mdast 节点（解析方向）。
 * - boardBlockSchema：board_block 的 ProseMirror 节点与 Markdown 双向序列化。
 * - boardBlockView：绑定 BoardBlockNodeView（React + Plait 挂载）。
 *
 * 注册顺序建议：schema → remark → view（见 editor-setup.ts）。
 *
 * @changelog
 * | 版本   | 变更说明                       | 关联                                                 |
 * | v1.0.0 | 初始实现：画板插件聚合入口与工厂  | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { $view } from '@milkdown/kit/utils';

import { boardBlockSchema, remarkBoardPlugin } from './schema';
import { BoardBlockNodeView } from './node-view';

// ---------------------------------------------------------------------------
// NodeView 绑定
// ---------------------------------------------------------------------------

/** 注册 board_block 的 NodeView */
export const boardBlockView = $view(boardBlockSchema.node, () => {
  return (node, view, getPos) => new BoardBlockNodeView(node, view, getPos);
});

// ---------------------------------------------------------------------------
// 对外导出
// ---------------------------------------------------------------------------

export { boardBlockSchema, remarkBoardPlugin };
export { createDefaultMindmap, DEFAULT_HEIGHT, SCHEMA_VERSION } from './constants';
export { encode, decode } from './codec';
export type { EncodeOptions } from './codec';
export type { BoardBlockState, BoardMode } from './types';

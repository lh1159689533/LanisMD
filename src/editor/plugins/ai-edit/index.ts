/**
 * ai-edit 插件入口
 *
 * 负责润色（行内 diff）、翻译（就地弹窗+语言切换）、解释（就地弹窗）、
 * 转图表和转公式等 AI 编辑功能。
 *
 * - `runAiCommand` / `runUnifiedAiPopup`：供 slash-menu、tooltip-toolbar 和右键菜单调用
 * - `registerContextMenu`：供编辑器注册右键菜单
 * - `aiMarkdownBridgePlugin`：需在 editor-setup 中注册，为写回提供 parser/serializer
 */

export { runAiCommand, runUnifiedAiPopup } from './generator';
export type { CommandResolver } from './generator';
export { registerContextMenu } from './context-menu';
export { aiMarkdownBridgePlugin } from './commit/markdown-bridge';
export type { GeneratorCommandOption } from './ui/generator-popup';
export type { AiRunContext } from './types';

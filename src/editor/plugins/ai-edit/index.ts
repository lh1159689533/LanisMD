/**
 * ai-edit 插件入口
 *
 * 负责润色（风格 + 分块 diff）、翻译（就地弹窗+语言记忆）、解释（就地弹窗+追问）、
 * 转图表和转公式（生成后校验与自动修复）等 AI 编辑功能。
 *
 * - `runAiCommand` / `runUnifiedAiPopup`：供 slash-menu、tooltip-toolbar 和右键菜单调用
 * - `openAiAssistant`：打开统一 AI 助手弹窗（斜杠菜单 / Mod-J）
 * - `registerContextMenu`：供编辑器注册右键菜单
 * - `aiMarkdownBridgePlugin`：需在 editor-setup 中注册，为写回提供 parser/serializer
 * - `aiKeymapPlugin`：Mod-J 唤起 AI
 * - `chat-bridge`：右键「添加到 AI 对话」、对话回复写回文档
 */

export { runAiCommand, runUnifiedAiPopup } from './generator';
export type { CommandResolver } from './generator';
export {
  openAiAssistant,
  buildAssistantOptions,
  resolveAssistantCommand,
} from './command-registry';
export { registerContextMenu } from './context-menu';
export {
  buildSourceChatMenuItems,
  getChatWriteBlocker,
  writeChatResultToEditor,
} from './chat-bridge';
export type { ChatWriteMode } from './chat-bridge';
export { aiMarkdownBridgePlugin } from './commit/markdown-bridge';
export { aiKeymapPlugin } from './keymap';
export type { GeneratorCommandOption } from './ui/generator-popup';
export type { AiRunContext } from './types';

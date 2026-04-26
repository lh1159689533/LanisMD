/**
 * ai-edit 插件入口
 *
 * 负责润色（行内 diff）、翻译（就地弹窗+语言切换）、解释（就地弹窗）、
 * 转图表和转公式等 AI 编辑功能。
 *
 * 导出 `runAiCommand` 供 slash-menu、tooltip-toolbar 和右键菜单调用。
 * 导出 `registerContextMenu` 供编辑器注册右键菜单。
 */

export { runAiCommand } from './generator';
export { registerContextMenu } from './context-menu';
export type { AiRunContext } from './types';

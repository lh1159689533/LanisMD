/**
 * Slash menu 内部类型
 */

import type { EditorView } from '@milkdown/kit/prose/view';

export interface SlashCommand {
  /** 显示名称 */
  label: string;
  /** SVG 图标字符串 */
  icon: string;
  /** 快捷键提示（仅展示） */
  shortcut?: string;
  /** 关键词（用于搜索过滤） */
  keywords: string[];
  /** 执行回调（当无 children 时必传） */
  execute: (view: EditorView) => void;
  /** 子命令列表（存在时本项只作为入口） */
  children?: SlashCommand[];
  /** 额外 className，用于让 AI 分组高亮 */
  extraClass?: string;
}

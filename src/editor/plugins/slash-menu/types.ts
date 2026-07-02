/**
 * Slash menu 内部类型
 */

import type { EditorView } from '@milkdown/kit/prose/view';

export interface SlashCommand {
  /** 命令唯一标识 */
  id?: string;
  /** 显示名称 */
  label: string;
  /** 命令描述（换行显示在名称下方） */
  description?: string;
  /** SVG 图标字符串 */
  icon: string;
  /** 快捷键提示（仅展示，已废弃，使用 markdown） */
  shortcut?: string;
  /** Markdown 语法标记（显示在右侧） */
  markdown?: string;
  /** 关键词（用于搜索过滤） */
  keywords: string[];
  /** 执行回调（当无 children 时必传） */
  execute: (view: EditorView) => void;
  /** 子命令列表（存在时本项只作为入口） */
  children?: SlashCommand[];
  /** 额外 className，用于让 AI 分组高亮 */
  extraClass?: string;
  /** 是否为快捷访问命令（用于筛选常用命令） */
  isQuickAccess?: boolean;
  /**
   * 是否使用表格网格选择器作为子面板。
   * 为 true 时，hover / 右方向键会在右侧展示可交互网格，
   * 直接点击或回车则按 `execute` 插入默认表格。
   */
  tableGrid?: boolean;
}

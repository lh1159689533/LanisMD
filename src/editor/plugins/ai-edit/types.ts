/**
 * ai-edit 插件内部类型
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import type { AiCommand } from '@/types/ai';

/** 单次 AI 生成任务的运行上下文 */
export interface AiRunContext {
  /** 当前编辑器 view */
  view: EditorView;
  /** 本次执行的指令元数据 */
  command: AiCommand;
  /** 替换或插入的目标起点（ProseMirror 文档位置） */
  from: number;
  /** 替换或插入的目标终点（ProseMirror 文档位置） */
  to: number;
  /** 选中的原始文本（用于 buildPrompt） */
  selection: string;
  /** 光标所在段落之前的上下文（留作续写等指令使用） */
  context: string;
}

/**
 * ai-edit 插件内部类型
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import type { AiRuntime } from '@/services/ai/runtime';
import type { AiCommand, AiPromptInput } from '@/types/ai';

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
  /** 选中内容（Markdown 形式，用于 buildPrompt） */
  selection: string;
  /** 写作背景：标题/标签 + 标题路径 + 当前章节（已按预算裁剪） */
  context: string;
}

/** 各交互模式的统一入参 */
export interface AiModeInput {
  ctx: AiRunContext;
  runtime: AiRuntime;
  /** 构造 prompt 的输入（已合并选区、上下文与调用方额外参数） */
  prompt: AiPromptInput;
}

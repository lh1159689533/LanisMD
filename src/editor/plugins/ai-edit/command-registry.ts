/**
 * 统一 AI 助手弹窗的指令注册表（内置 + 自定义）
 *
 * 斜杠菜单与 Mod-J 快捷键共用，此前写在 slash-menu 内部。
 *
 * @changelog
 * | 版本   | 变更说明                                    | 关联                         |
 * | v1.0.0 | 从 slash-menu 抽出；自定义指令按出现位置过滤 | REQ: AI 体验短板-自定义指令 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import { AI_COMMANDS, AI_COMMAND_ORDER, supportsRewriteFollowUps } from '@/services/ai/commands';
import {
  CUSTOM_COMMAND_PREFIX,
  buildCustomCommand,
  customPromptsFor,
  resolveCustomCommand,
} from '@/services/ai/custom-commands';
import type { AiCommand } from '@/types/ai';

import { runUnifiedAiPopup } from './generator';
import type { GeneratorCommandOption } from './ui/generator-popup';

const BUILTIN_PLACEHOLDERS: Record<string, string> = {
  mermaid: '描述图表内容，例如：用户登录流程',
  latex: '描述公式，例如：二次方程求根公式',
};

/** 统一弹窗的下拉选项（内置 + 出现在斜杠菜单的自定义指令） */
export function buildAssistantOptions(): GeneratorCommandOption[] {
  const builtin = AI_COMMAND_ORDER.map((id) => ({
    id,
    label: AI_COMMANDS[id].label,
    placeholder: BUILTIN_PLACEHOLDERS[id] ?? '请输入描述...',
    rewriteFollowUps: supportsRewriteFollowUps(AI_COMMANDS[id]),
  }));

  const custom = customPromptsFor('slash').map((p) => ({
    id: `${CUSTOM_COMMAND_PREFIX}${p.id}`,
    label: p.label,
    placeholder: `描述你想让"${p.label}"处理的内容...`,
    rewriteFollowUps: supportsRewriteFollowUps(buildCustomCommand(p)),
  }));

  return [...builtin, ...custom];
}

/** 按选项 id 解析指令 */
export function resolveAssistantCommand(commandId: string): AiCommand | null {
  if (commandId in AI_COMMANDS) return AI_COMMANDS[commandId as keyof typeof AI_COMMANDS];
  return resolveCustomCommand(commandId);
}

/** 打开统一 AI 助手弹窗 */
export function openAiAssistant(view: EditorView, defaultCommandId?: string): void {
  const options = buildAssistantOptions();
  if (options.length === 0) return;
  void runUnifiedAiPopup(view, options, resolveAssistantCommand, defaultCommandId ?? options[0].id);
}

/**
 * Slash menu 的 AI 助手统一入口
 *
 * 点击"AI 助手"后直接弹出统一对话框，通过 Tab 选择转图表/转公式/自定义指令。
 * 润色/翻译/解释已移至 tooltip-toolbar 和右键菜单。
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import { AI_COMMANDS, AI_COMMAND_ORDER } from '@/services/ai/commands';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiCommand, AiChatMessage, CustomPrompt } from '@/types/ai';

import { icons, getIcon } from './icons';
import { removeSlashTrigger } from './commands-basic';
import type { SlashCommand } from './types';
import { runUnifiedAiPopup } from '../ai-edit';
import type { GeneratorCommandOption } from '../ai-edit/generator-popup';

/**
 * 构建统一弹窗的指令选项列表（内置 + 自定义）
 */
function buildCommandOptions(): GeneratorCommandOption[] {
  // 内置指令
  const builtinOptions: GeneratorCommandOption[] = AI_COMMAND_ORDER.map((id) => {
    const cmd = AI_COMMANDS[id];
    const placeholderMap: Record<string, string> = {
      mermaid: '描述图表内容，例如：用户登录流程',
      latex: '描述公式，例如：二次方程求根公式',
    };
    return {
      id,
      label: cmd.label,
      placeholder: placeholderMap[id] ?? '请输入描述...',
    };
  });

  // 用户自定义 Prompt 模板
  const customPrompts: CustomPrompt[] =
    useSettingsStore.getState().config.ai?.customPrompts ?? [];

  const customOptions: GeneratorCommandOption[] = customPrompts.map((p) => ({
    id: `custom_${p.id}`,
    label: p.label,
    placeholder: `描述你想让"${p.label}"处理的内容...`,
  }));

  return [...builtinOptions, ...customOptions];
}

/**
 * 根据选中的指令 id 获取对应的 AiCommand 定义
 */
function resolveCommand(commandId: string): AiCommand | null {
  // 内置指令
  if (commandId in AI_COMMANDS) {
    return AI_COMMANDS[commandId as keyof typeof AI_COMMANDS];
  }

  // 自定义指令：id 格式为 custom_{promptId}
  if (commandId.startsWith('custom_')) {
    const promptId = commandId.slice('custom_'.length);
    const customPrompts: CustomPrompt[] =
      useSettingsStore.getState().config.ai?.customPrompts ?? [];
    const customPrompt = customPrompts.find((p) => p.id === promptId);
    if (!customPrompt) return null;

    return {
      id: commandId as never,
      label: customPrompt.label,
      icon: icons.ai,
      keywords: [customPrompt.label],
      insertMode: 'insert-after',
      buildPrompt: (input) => {
        const messages: AiChatMessage[] = [
          { role: 'system', content: customPrompt.prompt },
        ];
        if (input.arg) {
          messages.push({ role: 'user', content: input.arg });
        } else if (input.selection) {
          messages.push({ role: 'user', content: input.selection });
        } else if (input.context) {
          messages.push({ role: 'user', content: input.context });
        } else {
          messages.push({ role: 'user', content: '请根据上述指令生成内容。' });
        }
        return messages;
      },
    };
  }

  return null;
}

/**
 * 打开统一 AI 助手弹窗
 *
 * 在弹窗内通过 Tab 选择指令类型，输入描述后生成结果。
 */
function openUnifiedAiPopup(view: EditorView) {
  removeSlashTrigger(view);

  requestAnimationFrame(() => {
    const commandOptions = buildCommandOptions();
    if (commandOptions.length === 0) return;

    void runUnifiedAiPopup(
      view,
      commandOptions,
      resolveCommand,
      commandOptions[0].id,
    );
  });
}

/** 顶层 "AI 助手" 菜单项（点击直接弹出统一对话框） */
export function createAiSlashCommand(): SlashCommand {
  return {
    id: 'ai',
    label: 'AI 助手',
    description: '自然语言生成公式、图表',
    icon: getIcon('ai'),
    keywords: ['ai', 'AI', '助手', 'zs', '公式', '图表', 'mermaid', 'latex'],
    extraClass: 'milkdown-slash-item-ai',
    execute: (view: EditorView) => openUnifiedAiPopup(view),
  };
}

/**
 * Slash menu 的 AI 指令分组
 *
 * 仅保留转图表(mermaid)和转公式(latex)两个指令。
 * 润色/翻译/解释已移至 tooltip-toolbar 和右键菜单。
 * 参数输入已由 generator-popup 弹窗统一接管。
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import { AI_COMMANDS, AI_COMMAND_ORDER } from '@/services/ai/commands';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiCommand, CustomPrompt } from '@/types/ai';

import { icons } from './icons';
import { removeSlashTrigger } from './commands-basic';
import type { SlashCommand } from './types';
import { runAiCommand } from '../ai-edit';

/**
 * 执行一个 AI 指令：清掉 `/xxx` 触发文本后，交给 `ai-edit` 插件处理流式生成。
 *
 * 参数输入已由 generator-popup 弹窗统一接管，此处不再区分 requireArg。
 */
function triggerAiCommand(view: EditorView, command: AiCommand, slashArg?: string) {
  removeSlashTrigger(view);
  // 等 DOM 更新后再启动，避免触发文本残留影响定位
  requestAnimationFrame(() => {
    void runAiCommand(view, command, slashArg ? { arg: slashArg } : undefined);
  });
}

/** AI 分组的子命令（转图表 + 转公式 + 用户自定义指令） */
function buildAiChildren(): SlashCommand[] {
  const builtinItems = AI_COMMAND_ORDER.map((id) => {
    const cmd = AI_COMMANDS[id];
    return {
      label: cmd.label,
      icon: cmd.icon,
      keywords: cmd.keywords,
      extraClass: 'milkdown-slash-item-ai',
      execute: (view: EditorView) => triggerAiCommand(view, cmd),
    };
  });

  // 读取用户自定义 Prompt 模板
  const customPrompts: CustomPrompt[] =
    useSettingsStore.getState().config.ai?.customPrompts ?? [];

  if (customPrompts.length === 0) return builtinItems;

  // 构建自定义指令条目（分隔线标记）
  const customItems: SlashCommand[] = customPrompts.map((p) => ({
    label: p.label,
    icon: icons.ai,
    keywords: [p.label, 'custom', '自定义'],
    extraClass: 'milkdown-slash-item-ai',
    execute: (view: EditorView) => triggerCustomPrompt(view, p),
  }));

  // 在内置和自定义之间插入分隔条目
  const separator: SlashCommand = {
    label: '---',
    icon: '',
    keywords: [],
    extraClass: 'milkdown-slash-separator',
    execute: () => {},
  };

  return [...builtinItems, separator, ...customItems];
}

/** 顶层 "AI 助手" 菜单项（带子菜单） */
export function createAiSlashCommand(): SlashCommand {
  return {
    label: 'AI 助手',
    icon: icons.ai,
    keywords: ['ai', 'AI', '助手', 'zs'],
    extraClass: 'milkdown-slash-item-ai',
    execute: () => {},
    children: buildAiChildren(),
  };
}

/**
 * 触发用户自定义 Prompt 指令
 *
 * 将自定义 system prompt 封装为 AiCommand 格式，调用 runAiCommand 执行。
 * 自定义指令默认使用 insert-after 模式，且要求选中文本。
 */
function triggerCustomPrompt(view: EditorView, customPrompt: CustomPrompt) {
  removeSlashTrigger(view);
  requestAnimationFrame(() => {
    const command: AiCommand = {
      id: customPrompt.id as never,
      label: customPrompt.label,
      icon: icons.ai,
      keywords: [customPrompt.label],
      insertMode: 'insert-after',
      buildPrompt: (input) => {
        const messages: import('@/types/ai').AiChatMessage[] = [
          { role: 'system', content: customPrompt.prompt },
        ];
        if (input.selection) {
          messages.push({ role: 'user', content: input.selection });
        } else if (input.context) {
          messages.push({ role: 'user', content: input.context });
        } else {
          messages.push({ role: 'user', content: '请根据上述指令生成内容。' });
        }
        return messages;
      },
    };
    void runAiCommand(view, command);
  });
}

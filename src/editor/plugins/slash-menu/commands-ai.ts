/**
 * Slash menu 的 AI 助手统一入口
 *
 * 点击"AI 助手"后直接弹出统一对话框，在下拉中选择转图表/转公式/自定义指令。
 * 润色/翻译/解释位于划词浮层和右键菜单；指令列表由 ai-edit/command-registry 统一维护。
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import { getIcon } from './icons';
import { removeSlashTrigger } from './commands-basic';
import type { SlashCommand } from './types';
import { openAiAssistant } from '../ai-edit';

/** 打开统一 AI 助手弹窗 */
function openUnifiedAiPopup(view: EditorView) {
  removeSlashTrigger(view);
  requestAnimationFrame(() => openAiAssistant(view));
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

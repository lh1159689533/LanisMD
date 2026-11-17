/**
 * AI 快捷键：Mod-J 唤起 AI
 *
 * - 有选区：直接润色（通用风格）
 * - 无选区：打开统一 AI 助手弹窗
 *
 * 沉浸式阅读（只读）时不响应，交给其他处理器。
 *
 * @changelog
 * | 版本   | 变更说明                 | 关联                  |
 * | v1.0.0 | 初始实现：Mod-J 唤起 AI | REQ: AI 体验短板-其他 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { keymap } from '@milkdown/kit/prose/keymap';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';

import { AI_COMMANDS } from '@/services/ai/commands';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';

import { openAiAssistant } from './command-registry';
import { runAiCommand } from './generator';

function triggerAi(view: EditorView): boolean {
  if (useUIStore.getState().immersiveReading) return false;

  if (!useSettingsStore.getState().config.ai?.enabled) {
    useUIStore.getState().addToast({
      type: 'info',
      message: 'AI 助手未启用，请在 设置 -> AI 助手 中开启',
      duration: 3500,
    });
    return true;
  }

  if (view.state.selection.empty) openAiAssistant(view);
  else void runAiCommand(view, AI_COMMANDS.polish);
  return true;
}

export const aiKeymapPlugin = $prose(() =>
  keymap({
    'Mod-j': (_state, _dispatch, view) => (view ? triggerAi(view) : false),
  }),
);

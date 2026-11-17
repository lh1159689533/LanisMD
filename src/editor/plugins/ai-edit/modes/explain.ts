/**
 * 解释模式：就地弹窗展示解释内容（仅关闭）
 *
 * @changelog
 * | 版本   | 变更说明                              | 关联               |
 * | v1.0.0 | 从 generator.ts 拆出，改用 AiSession | REQ: AI 架构改造#3 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { recordAiHistory } from '@/services/ai/history';
import { startCommand } from '@/services/ai/generation';
import { createAiSession } from '@/services/ai/session';

import type { AiModeInput } from '../types';
import { createAiPopup } from '../ui/ai-popup';

export function runExplainMode({ ctx, runtime, prompt }: AiModeInput): void {
  const { command } = ctx;

  const session = createAiSession(runtime, {
    onDelta: (delta) => popup.appendContent(delta),
    onReasoning: () => popup.setThinking(),
    onDone: (full, _info, usage) => {
      popup.setDone();
      popup.setUsage(usage);
      recordAiHistory(command, full, ctx.selection);
    },
    onError: (message) => popup.setError(message),
    onCanceled: () => popup.destroy(),
  });

  const popup = createAiPopup({
    view: ctx.view,
    from: ctx.from,
    to: ctx.to,
    mode: 'explain',
    onClose: () => session.dispose(),
  });

  void startCommand(session, command, prompt);
}

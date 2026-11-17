/**
 * 解释模式：就地弹窗展示解释内容，可插入到下方、可追问（多轮对话）
 *
 * @changelog
 * | 版本   | 变更说明                              | 关联                  |
 * | v1.0.0 | 从 generator.ts 拆出，改用 AiSession | REQ: AI 架构改造#3    |
 * | v2.0.0 | 支持插入到下方与追问                  | REQ: AI 体验短板-解释 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { EXPLAIN_FOLLOW_UPS } from '@/services/ai/follow-ups';
import { recordAiHistory } from '@/services/ai/history';
import { startCommand } from '@/services/ai/generation';
import { createAiSession } from '@/services/ai/session';

import { cleanOutput } from '../commit/clean-output';
import { insertMarkdownAfterBlock } from '../commit/markdown-bridge';
import type { AiModeInput } from '../types';
import { createAiPopup } from '../ui/ai-popup';

export function runExplainMode({ ctx, runtime, prompt }: AiModeInput): void {
  const { view, command } = ctx;

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
    view,
    from: ctx.from,
    to: ctx.to,
    mode: 'explain',
    quickFollowUps: EXPLAIN_FOLLOW_UPS,
    onInsertAfter: (text) => {
      session.dispose();
      insertMarkdownAfterBlock(view, ctx.to, cleanOutput('insert-after', text));
    },
    onClose: () => session.dispose(),
    onFollowUp: (instruction) => void session.followUp(instruction),
  });

  void startCommand(session, command, prompt);
}

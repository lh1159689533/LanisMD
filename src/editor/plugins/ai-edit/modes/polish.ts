/**
 * 润色模式：状态弹窗 + 生成完成后在原文位置展示行内 diff
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

import { cleanOutput } from '../commit/clean-output';
import { replaceRangeWithMarkdown } from '../commit/markdown-bridge';
import type { AiModeInput } from '../types';
import { showInlineDiff, type InlineDiffHandle } from '../ui/inline-diff';
import { createPolishPopup } from '../ui/polish-popup';

export function runPolishMode({ ctx, runtime, prompt }: AiModeInput): void {
  const { view, command } = ctx;
  let diffHandle: InlineDiffHandle | null = null;

  const session = createAiSession(runtime, {
    onDelta: () => popup.setStreaming(),
    onReasoning: () => {
      if (!session.text) popup.setThinking();
    },
    onDone: (full, _info, usage) => {
      diffHandle = showInlineDiff({
        view,
        from: ctx.from,
        to: ctx.to,
        original: ctx.selection,
        revised: cleanOutput(command.insertMode, full),
        onAccept: (finalText) => {
          replaceRangeWithMarkdown(view, ctx.from, ctx.to, finalText);
          recordAiHistory(command, full, ctx.selection);
        },
        // 拒绝：不改动文档
        onReject: () => {},
      });
      popup.setDone();
      popup.setUsage(usage);
    },
    onError: (message) => popup.setError(message),
    onCanceled: () => popup.destroy(),
  });

  const popup = createPolishPopup({
    view,
    from: ctx.from,
    to: ctx.to,
    onAccept: () => diffHandle?.accept(),
    onReject: () => {
      diffHandle?.destroy();
      session.cancel();
    },
  });

  void startCommand(session, command, prompt);
}

/**
 * 通用插入模式：在选区后方显示占位浮层流式预览，确认后写入文档
 *
 * 用于 insertMode 为 replace-selection / insert-after 的指令（如自定义指令）。
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
import { commitResult } from '../commit/commit-result';
import type { AiModeInput } from '../types';
import { createPlaceholder } from '../ui/placeholder';

export function runInsertMode(input: AiModeInput): void {
  const { ctx, runtime, prompt } = input;
  const { view, command } = ctx;
  const placeholder = createPlaceholder(view, ctx.to);

  const session = createAiSession(runtime, {
    onDelta: (delta, full) => {
      // 首个正文增量到达时清掉"思考中"提示
      if (full === delta) placeholder.textEl.textContent = '';
      placeholder.setStatus('streaming');
      placeholder.textEl.appendChild(document.createTextNode(delta));
    },
    onReasoning: () => {
      if (!session.text) placeholder.textEl.textContent = '深度思考中...';
    },
    onDone: (_full, _info, usage) => {
      placeholder.setStatus('done');
      placeholder.setUsage(usage);
    },
    onError: (message) => {
      placeholder.setStatus('error');
      placeholder.textEl.textContent = message;
    },
    onCanceled: () => placeholder.destroy(),
  });

  placeholder.setCancelHandler(() => session.cancel());
  placeholder.setCommitHandler(() => {
    placeholder.destroy();
    commitResult(ctx, cleanOutput(command.insertMode, session.text));
    recordAiHistory(command, session.text, ctx.selection);
  });
  placeholder.setRetryHandler(() => {
    session.dispose();
    placeholder.destroy();
    runInsertMode(input);
  });

  void startCommand(session, command, prompt);
}

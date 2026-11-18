/**
 * 润色模式：状态弹窗 + 生成完成后在原文位置展示分块 diff
 *
 * 风格由 prompt.options.style 指定（纠错 / 精简 / 扩写 / 正式 / 口语 / 学术，缺省为通用润色）。
 * 每处改动可单独接受或拒绝，最终按各处的选择拼出结果写回。
 *
 * @changelog
 * | 版本   | 变更说明                              | 关联                  |
 * | v1.0.0 | 从 generator.ts 拆出，改用 AiSession | REQ: AI 架构改造#3    |
 * | v2.0.0 | 润色风格；分块 diff 逐处取舍          | REQ: AI 体验短板-润色 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { getPolishStyle } from '@/services/ai/commands';
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
  const style = getPolishStyle(prompt.options?.style);
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
        mountTo: popup.overlay,
        onAccept: (finalText) => {
          // 在新增文本内按 Enter 也会触发应用，此时需一并关闭弹窗（重复调用无副作用）
          popup.destroy();
          replaceRangeWithMarkdown(view, ctx.from, ctx.to, finalText);
          recordAiHistory({ id: command.id, label: style.label }, full, ctx.selection);
        },
        // 拒绝：不改动文档
        onReject: () => {},
        onDecisionChange: (summary) => popup.setSummary(summary),
      });
      popup.setDone(diffHandle.summary());
      popup.setUsage(usage);
      popup.placeBelow(diffHandle.container);
    },
    onError: (message) => popup.setError(message),
    onCanceled: () => popup.destroy(),
  });

  const popup = createPolishPopup({
    view,
    from: ctx.from,
    to: ctx.to,
    styleLabel: style.label,
    onAccept: () => diffHandle?.accept(),
    onReject: () => {
      diffHandle?.destroy();
      session.cancel();
    },
  });

  void startCommand(session, command, prompt);
}

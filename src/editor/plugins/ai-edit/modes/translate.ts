/**
 * 翻译模式：就地弹窗，支持切换目标语言、继续调整译文
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                      |
 * | v1.0.0 | 从 generator.ts 拆出，改用 AiSession           | REQ: AI 架构改造#3        |
 * | v1.1.0 | 自动识别原文语言：中文译英文，其他译中文       | REQ: AI 弹窗体验优化     |
 * | v2.0.0 | 记住上次选择的语言；支持多轮继续调整译文       | REQ: AI 体验短板-翻译/追问 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { REWRITE_FOLLOW_UPS } from '@/services/ai/follow-ups';
import { recordAiHistory } from '@/services/ai/history';
import { startCommand } from '@/services/ai/generation';
import { createAiSession } from '@/services/ai/session';

import { cleanOutput } from '../commit/clean-output';
import { insertMarkdownAfterBlock, replaceRangeWithMarkdown } from '../commit/markdown-bridge';
import { getLanguageLabel, rememberLanguage, resolveTargetLanguage } from '../context/language';
import type { AiModeInput } from '../types';
import { createAiPopup, type TranslateLanguageId } from '../ui/ai-popup';

export function runTranslateMode({ ctx, runtime, prompt }: AiModeInput): void {
  const { view, command } = ctx;
  // 调用方显式指定了目标语言时优先使用，否则按「记忆 > 自动识别」解析
  const initialLang =
    (prompt.options?.targetLangId as TranslateLanguageId | undefined) ??
    resolveTargetLanguage(ctx.selection);

  const promptFor = (langId: TranslateLanguageId) => ({
    ...prompt,
    options: { ...prompt.options, targetLang: getLanguageLabel(langId) },
  });

  const session = createAiSession(runtime, {
    onDelta: (delta) => popup.appendContent(delta),
    onReasoning: () => popup.setThinking(),
    onDone: (_full, _info, usage) => {
      popup.setDone();
      popup.setUsage(usage);
    },
    onError: (message) => popup.setError(message),
  });

  const popup = createAiPopup({
    view,
    from: ctx.from,
    to: ctx.to,
    mode: 'translate',
    initialLang,
    quickFollowUps: REWRITE_FOLLOW_UPS,
    onReplace: (text) => {
      replaceRangeWithMarkdown(view, ctx.from, ctx.to, cleanOutput('replace-selection', text));
      recordAiHistory(command, text, ctx.selection);
    },
    onInsertAfter: (text) => {
      insertMarkdownAfterBlock(view, ctx.to, cleanOutput('insert-after', text));
      recordAiHistory(command, text, ctx.selection);
    },
    onClose: () => session.dispose(),
    onLanguageChange: (langId) => {
      // 手动选择的语言记下来，下次翻译默认使用
      rememberLanguage(langId);
      // start 会静默丢弃仍在进行的旧语言请求，并开启新的对话
      void startCommand(session, command, promptFor(langId));
    },
    onFollowUp: (instruction) => void session.followUp(instruction),
  });

  void startCommand(session, command, promptFor(initialLang));
}

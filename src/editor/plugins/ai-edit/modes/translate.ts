/**
 * 翻译模式：就地弹窗，支持切换目标语言后重新翻译
 *
 * @changelog
 * | 版本   | 变更说明                              | 关联               |
 * | v1.0.0 | 从 generator.ts 拆出，改用 AiSession | REQ: AI 架构改造#3 |
 * | v1.1.0 | 自动识别原文语言：中文译英文，其他译中文 | REQ: AI 弹窗体验优化 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { recordAiHistory } from '@/services/ai/history';
import { startCommand } from '@/services/ai/generation';
import { createAiSession } from '@/services/ai/session';

import { cleanOutput } from '../commit/clean-output';
import { detectTargetLanguage } from '../context/language';
import { insertMarkdownAfterBlock, replaceRangeWithMarkdown } from '../commit/markdown-bridge';
import type { AiModeInput } from '../types';
import { createAiPopup, TRANSLATE_LANGUAGES, type TranslateLanguageId } from '../ui/ai-popup';

/** 语言 id -> prompt 中使用的语言名称 */
function getLanguageLabel(langId: TranslateLanguageId): string {
  return TRANSLATE_LANGUAGES.find((l) => l.id === langId)?.label ?? '英语';
}

export function runTranslateMode({ ctx, runtime, prompt }: AiModeInput): void {
  const { view, command } = ctx;
  // 首次翻译的目标语言由原文决定，用户仍可在弹窗中手动切换
  const initialLang = detectTargetLanguage(ctx.selection);
  const initialPrompt = {
    ...prompt,
    options: { ...prompt.options, targetLang: getLanguageLabel(initialLang) },
  };

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
      const targetLang = getLanguageLabel(langId);
      popup.resetContent();
      // start 会静默丢弃仍在进行的旧语言请求
      void startCommand(session, command, {
        ...prompt,
        options: { ...prompt.options, targetLang },
      });
    },
  });

  void startCommand(session, command, initialPrompt);
}

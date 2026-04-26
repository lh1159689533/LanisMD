/**
 * 内置 AI 指令的元数据与 prompt 模板
 *
 * ai-edit 插件使用的指令定义：
 * - polish（润色）：行内 diff 模式
 * - translate（翻译）：就地弹窗模式
 * - explain（解释）：就地弹窗模式（仅关闭）
 * - mermaid（转图表）：插入 mermaid code_block
 * - latex（转公式）：插入 math_block
 */

import type { AiCommand, AiCommandId } from '@/types/ai';

// ---------------------------------------------------------------------------
// 图标（统一 16x16 lucide 风格）
// ---------------------------------------------------------------------------

const ICON_POLISH =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

const ICON_TRANSLATE =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>';

const ICON_EXPLAIN =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>';

const ICON_MERMAID =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="7" height="5" rx="1"/><rect x="15" y="2" width="7" height="5" rx="1"/><rect x="8.5" y="17" width="7" height="5" rx="1"/><line x1="5.5" y1="7" x2="5.5" y2="11"/><line x1="18.5" y1="7" x2="18.5" y2="11"/><line x1="5.5" y1="11" x2="18.5" y2="11"/><line x1="12" y1="11" x2="12" y2="17"/></svg>';

const ICON_LATEX =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L20 4"/><path d="M4 4l4 16"/><path d="M16 4l4 16"/><path d="M2 12h6"/><path d="M16 12h6"/></svg>';

// ---------------------------------------------------------------------------
// 指令定义
// ---------------------------------------------------------------------------

export const AI_COMMANDS: Record<AiCommandId, AiCommand> = {
  polish: {
    id: 'polish',
    label: '润色',
    icon: ICON_POLISH,
    keywords: ['polish', 'rewrite', '润色', '改写', 'rs'],
    insertMode: 'inline-diff',
    requireSelection: true,
    buildPrompt: ({ selection, fullDocument }) => {
      // 根据是否传入 fullDocument 区分"仅选中"和"完整上下文"模式
      const systemPrompt = fullDocument
        ? `你是一位专业的写作编辑。以下是完整文档内容，请仅对"待润色片段"进行润色，保持原意，让表达更通顺自然。只输出润色后的文本，不要任何解释。\n\n---完整文档---\n${fullDocument}\n---文档结束---`
        : '你是一位专业的写作编辑。请对下面这段文字进行润色，保持原意，让表达更通顺自然。只输出润色后的文本，不要任何解释。';
      return [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `待润色片段：\n${selection ?? ''}` },
      ];
    },
  },
  translate: {
    id: 'translate',
    label: '翻译',
    icon: ICON_TRANSLATE,
    keywords: ['translate', 'translation', '翻译', 'fy'],
    insertMode: 'popup-translate',
    requireSelection: true,
    buildPrompt: ({ selection, options }) => {
      const targetLang = options?.targetLang ?? '英语';
      return [
        {
          role: 'system',
          content: `你是一位专业翻译。请将以下文本翻译为${targetLang}。只输出译文，不要任何解释或注释。`,
        },
        { role: 'user', content: selection ?? '' },
      ];
    },
  },
  explain: {
    id: 'explain',
    label: '解释',
    icon: ICON_EXPLAIN,
    keywords: ['explain', '解释', 'js'],
    insertMode: 'popup-explain',
    requireSelection: true,
    buildPrompt: ({ selection }) => [
      {
        role: 'system',
        content:
          '请用通俗易懂、简洁的中文解释下面的内容。如果是代码，解释它做什么；如果是概念，解释它是什么。直接输出解释内容，使用纯文本格式。',
      },
      { role: 'user', content: selection ?? '' },
    ],
  },
  mermaid: {
    id: 'mermaid',
    label: '转图表',
    icon: ICON_MERMAID,
    keywords: ['mermaid', 'diagram', '图表', '流程图', 'tb'],
    insertMode: 'insert-as-mermaid',
    requireArg: true,
    buildPrompt: ({ arg, selection }) => [
      {
        role: 'system',
        content:
          '你是 Mermaid 语法专家。根据用户描述生成 Mermaid 图表代码。只输出纯代码本身，不要包裹 ```mermaid 标记，不要任何解释。',
      },
      { role: 'user', content: arg ?? selection ?? '' },
    ],
  },
  latex: {
    id: 'latex',
    label: '转公式',
    icon: ICON_LATEX,
    keywords: ['latex', 'formula', '公式', 'gs'],
    insertMode: 'insert-as-latex',
    requireArg: true,
    buildPrompt: ({ arg, selection }) => [
      {
        role: 'system',
        content:
          '将用户描述转为 LaTeX 数学公式。只输出公式本身（不要 $$ 或 $ 包裹），不要任何解释。',
      },
      { role: 'user', content: arg ?? selection ?? '' },
    ],
  },
};

/** 斜杠菜单中展示的 AI 指令顺序（仅保留转图表和转公式） */
export const AI_COMMAND_ORDER: AiCommandId[] = ['mermaid', 'latex'];

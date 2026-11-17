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

import { proportionalOutput } from './generation';

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

// 转公式图标：使用 Σ（Sigma）字符，跟随主题色
const ICON_LATEX =
  '<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><text x="12" y="13" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="26" font-weight="400" fill="currentColor">Σ</text></svg>';

// ---------------------------------------------------------------------------
// Prompt 公共片段
// ---------------------------------------------------------------------------

/** 完整上下文模式下，在文档中标记选区所在位置的占位符 */
export const FRAGMENT_MARKER = '[[待处理片段所在位置]]';

/** 要求模型保留 Markdown 格式（选区以 Markdown 形式传入，结果按 Markdown 解析写回） */
const KEEP_MARKDOWN_RULE =
  '输入是 Markdown 文本，请原样保留其中的 Markdown 标记与结构（加粗、斜体、链接、行内代码、列表、标题、公式等），不要额外包裹代码块。';

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
    // 润色输出约等于原文长度
    generation: ({ selection }) => ({
      temperature: 0.5,
      maxTokens: proportionalOutput(selection, 1.5),
    }),
    buildPrompt: ({ selection, fullDocument }) => {
      // 根据是否传入 fullDocument 区分"仅选中"和"完整上下文"模式
      const base = `你是一位专业的写作编辑。请对"待润色片段"进行润色，保持原意，让表达更通顺自然。${KEEP_MARKDOWN_RULE}只输出润色后的片段本身，不要任何解释。`;
      // 完整上下文模式：附带（已按 token 预算裁剪的）文档，帮助模型保持术语与语气一致
      const systemPrompt = fullDocument
        ? `${base}\n\n以下是片段所在文档的内容，仅供参考，${FRAGMENT_MARKER} 标记了片段的位置，不要输出文档其余部分。\n\n---文档---\n${fullDocument}\n---文档结束---`
        : base;
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
    // 中译英等场景 token 数可能膨胀数倍
    generation: ({ selection }) => ({
      temperature: 0.3,
      maxTokens: proportionalOutput(selection, 3),
    }),
    buildPrompt: ({ selection, options }) => {
      const targetLang = options?.targetLang ?? '英语';
      return [
        {
          role: 'system',
          content: `你是一位专业翻译。请将以下文本翻译为${targetLang}。${KEEP_MARKDOWN_RULE}代码、链接地址与公式内容保持原样不翻译。只输出译文，不要任何解释或注释。`,
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
    generation: ({ selection }) => ({
      temperature: 0.5,
      maxTokens: proportionalOutput(selection, 1),
    }),
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
    // 代码类输出需要稳定
    generation: () => ({ temperature: 0.2, maxTokens: proportionalOutput('', 0) }),
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
    generation: () => ({ temperature: 0.2, maxTokens: proportionalOutput('', 0) }),
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

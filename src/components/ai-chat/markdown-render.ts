/**
 * AI 对话回复的 Markdown 渲染（marked + DOMPurify）
 *
 * - GFM、软换行
 * - 公式：$...$ / $$...$$ / \(...\) / \[...\]，复用编辑器的 KaTeX 渲染
 * - 代码块：带语言标签与复制按钮；mermaid 代码块输出占位节点，由组件异步渲染为图表
 * - 输出经 DOMPurify 清洗，防止模型输出的 HTML 注入脚本
 *
 * @changelog
 * | 版本   | 变更说明                        | 关联           |
 * | v1.0.0 | 初始实现：对话 Markdown 渲染 | REQ: AI 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

import DOMPurify from 'dompurify';
import { Marked, type TokenizerAndRendererExtension, type Tokens } from 'marked';

import { renderBlockMath, renderInlineMath } from '@/editor/plugins/math-inline/renderer';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface MathToken extends Tokens.Generic {
  text: string;
}

/** 块级公式：$$...$$ 或 \[...\]，独占若干行 */
const mathBlock: TokenizerAndRendererExtension = {
  name: 'mathBlock',
  level: 'block',
  start: (src) => src.match(/\$\$|\\\[/)?.index,
  tokenizer(src) {
    const match =
      /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src) ??
      /^\\\[([\s\S]+?)\\\][^\S\n]*(?:\n|$)/.exec(src);
    if (!match) return undefined;
    return { type: 'mathBlock', raw: match[0], text: match[1].trim() };
  },
  renderer: (token) =>
    `<div class="lanismd-ai-chat-math">${renderBlockMath((token as MathToken).text).html}</div>`,
};

/**
 * 行内公式：$...$（首尾不能是空白、结束符后不能紧跟数字，避免误伤金额）、$$...$$、\(...\)
 */
const mathInline: TokenizerAndRendererExtension = {
  name: 'mathInline',
  level: 'inline',
  start: (src) => src.match(/\$|\\\(/)?.index,
  tokenizer(src) {
    const match =
      /^\$\$([^$]+?)\$\$/.exec(src) ??
      /^\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/.exec(src) ??
      /^\\\(([\s\S]+?)\\\)/.exec(src);
    if (!match) return undefined;
    return { type: 'mathInline', raw: match[0], text: match[1].trim() };
  },
  renderer: (token) => renderInlineMath((token as MathToken).text).html,
};

const marked = new Marked({ gfm: true, breaks: true });

marked.use({
  extensions: [mathBlock, mathInline],
  renderer: {
    code({ text, lang }: Tokens.Code) {
      const language = (lang ?? '').trim().split(/\s+/)[0].toLowerCase();
      const code = escapeHtml(text);
      if (language === 'mermaid') {
        return `<div class="lanismd-ai-chat-mermaid" data-code="${code}"><pre><code>${code}</code></pre></div>`;
      }
      return [
        '<div class="lanismd-ai-chat-code">',
        '<div class="lanismd-ai-chat-code-header">',
        `<span>${escapeHtml(language || 'text')}</span>`,
        '<button type="button" class="lanismd-ai-chat-code-copy" data-action="copy-code">复制</button>',
        '</div>',
        `<pre><code>${code}</code></pre>`,
        '</div>',
      ].join('');
    },
  },
});

/** 渲染 Markdown 为安全的 HTML 字符串 */
export function renderChatMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

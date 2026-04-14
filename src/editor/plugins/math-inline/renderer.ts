/**
 * Math Inline - KaTeX 渲染器
 *
 * 使用 KaTeX 将 LaTeX 源码渲染为 HTML
 */

import katex from 'katex';

/**
 * 将 LaTeX 源码渲染为行内公式 HTML
 * @param latex LaTeX 源码
 * @returns 渲染后的 HTML 字符串，失败时返回错误提示 HTML
 */
export function renderInlineMath(latex: string): { html: string; error?: string } {
  const trimmed = latex.trim();
  if (!trimmed) {
    return { html: '', error: '空公式' };
  }

  try {
    const html = katex.renderToString(trimmed, {
      displayMode: false,
      throwOnError: false,
      errorColor: '#ef4444',
      trust: true,
      strict: false,
    });
    return { html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      html: `<span class="katex-error" style="color: #ef4444;">${escapeHtml(trimmed)}</span>`,
      error: message,
    };
  }
}

/**
 * 将 LaTeX 源码渲染为块级公式 HTML
 * @param latex LaTeX 源码
 * @returns 渲染后的 HTML 字符串，失败时返回错误提示 HTML
 */
export function renderBlockMath(latex: string): { html: string; error?: string } {
  const trimmed = latex.trim();
  if (!trimmed) {
    return { html: '', error: '空公式' };
  }

  try {
    const html = katex.renderToString(trimmed, {
      displayMode: true,
      throwOnError: false,
      errorColor: '#ef4444',
      trust: true,
      strict: false,
    });
    return { html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      html: `<span class="katex-error" style="color: #ef4444;">${escapeHtml(trimmed)}</span>`,
      error: message,
    };
  }
}

/** 简单的 HTML 转义 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

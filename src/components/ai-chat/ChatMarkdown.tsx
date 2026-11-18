/**
 * 对话回复的 Markdown 展示
 *
 * - 渲染结果经 useMemo 缓存，流式生成时只在正文变化时重新解析
 * - mermaid 代码块在生成结束后异步渲染为图表（生成中代码不完整，渲染必然失败）
 * - 事件委托：代码块复制、链接走应用内的链接打开逻辑（外链确认 / 本地文件），
 *   避免 WebView 直接跳转离开应用
 *
 * @changelog
 * | 版本   | 变更说明                    | 关联           |
 * | v1.0.0 | 初始实现：回复 Markdown 展示 | REQ: AI 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';

import { openLink } from '@/editor/plugins/link/actions';
import { renderMermaid } from '@/editor/plugins/mermaid-block/renderer';
import { onThemeChange, startThemeObserver } from '@/editor/plugins/mermaid-block/theme';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';

import { renderChatMarkdown } from './markdown-render';

interface ChatMarkdownProps {
  content: string;
  /** 是否仍在生成中 */
  streaming?: boolean;
  className?: string;
}

/** 把容器内未渲染的 mermaid 占位节点渲染为图表 */
async function hydrateMermaid(container: HTMLElement): Promise<void> {
  const nodes = container.querySelectorAll<HTMLElement>('.lanismd-ai-chat-mermaid[data-code]');
  if (nodes.length === 0) return;
  startThemeObserver();
  for (const node of Array.from(nodes)) {
    const code = node.dataset.code ?? '';
    const result = await renderMermaid(code);
    if (!node.isConnected) continue;
    if (result.success && result.svg) {
      // 图表源码来自模型输出，同样清洗一遍（保留 mermaid 所需的 foreignObject 与内联样式）
      node.innerHTML = DOMPurify.sanitize(result.svg, {
        USE_PROFILES: { svg: true, svgFilters: true, html: true },
        ADD_TAGS: ['foreignObject', 'style'],
      });
      node.classList.add('is-rendered');
    } else {
      node.classList.add('is-error');
      node.title = `图表渲染失败：${result.error ?? '语法错误'}`;
    }
  }
}

export function ChatMarkdown({ content, streaming, className }: ChatMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderChatMarkdown(content), [content]);
  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => onThemeChange(() => setThemeVersion((v) => v + 1)), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || streaming) return;
    void hydrateMermaid(container);
  }, [html, streaming, themeVersion]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    const copyBtn = target.closest<HTMLButtonElement>('[data-action="copy-code"]');
    if (copyBtn) {
      const code = copyBtn.closest('.lanismd-ai-chat-code')?.querySelector('code')?.textContent;
      if (code != null) {
        void navigator.clipboard.writeText(code).then(() => {
          copyBtn.textContent = '已复制';
          setTimeout(() => (copyBtn.textContent = '复制'), 1500);
        });
      }
      return;
    }

    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute('href') ?? '';
      if (href.startsWith('#')) {
        useUIStore.getState().addToast({ type: 'info', message: '对话中的锚点链接无法跳转' });
        return;
      }
      openLink(undefined, href);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn('lanismd-ai-chat-markdown', className)}
      onClick={handleClick}
      // 内容已经过 DOMPurify 清洗
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

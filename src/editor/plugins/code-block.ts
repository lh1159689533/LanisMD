/**
 * Code Block Plugin
 *
 * 集成 @milkdown/components/code-block + CodeMirror 6，提供增强的代码块功能：
 * - 语法高亮（30+ 语言懒加载）
 * - 可搜索的语言选择器（hover 时显示）
 * - 复制代码按钮（hover 时显示）
 * - 行号（可通过设置开关）
 * - 自动缩进、括号匹配
 * - 亮色 / 暗色主题跟随
 */

import { codeBlockComponent, codeBlockConfig } from '@milkdown/kit/component/code-block';
import type { Ctx } from '@milkdown/kit/ctx';

import { languages } from '@codemirror/language-data';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { keymap, lineNumbers, EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import type { Extension } from '@codemirror/state';

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const expandIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

const searchIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

const clearSearchIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="check-icon"><polyline points="20 6 9 17 4 12"/></svg>`;

// ---------------------------------------------------------------------------
// Copy Button Tracking (用于追踪最近点击的复制按钮)
// ---------------------------------------------------------------------------

let lastClickedCopyButton: HTMLElement | null = null;

// 设置全局点击事件监听，追踪复制按钮点击
function setupCopyButtonTracking() {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const copyButton = target.closest('.copy-button') as HTMLElement | null;
    if (copyButton) {
      lastClickedCopyButton = copyButton;
      // 短暂保持引用，避免内存泄漏
      setTimeout(() => {
        if (lastClickedCopyButton === copyButton) {
          lastClickedCopyButton = null;
        }
      }, 1000);
    }
  }, true); // 使用捕获阶段，确保在其他处理之前执行
}

// 初始化追踪
setupCopyButtonTracking();

// ---------------------------------------------------------------------------
// Light Theme (for CodeMirror)
// ---------------------------------------------------------------------------

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#d73a49' },
  { tag: tags.comment, color: '#6a737d', fontStyle: 'italic' },
  { tag: tags.string, color: '#032f62' },
  { tag: tags.number, color: '#005cc5' },
  { tag: tags.variableName, color: '#24292e' },
  { tag: tags.function(tags.variableName), color: '#6f42c1' },
  { tag: tags.typeName, color: '#22863a' },
  { tag: tags.className, color: '#6f42c1' },
  { tag: tags.definition(tags.variableName), color: '#e36209' },
  { tag: tags.propertyName, color: '#005cc5' },
  { tag: tags.operator, color: '#d73a49' },
  { tag: tags.punctuation, color: '#24292e' },
  { tag: tags.bool, color: '#005cc5' },
  { tag: tags.regexp, color: '#032f62' },
  { tag: tags.tagName, color: '#22863a' },
  { tag: tags.attributeName, color: '#6f42c1' },
  { tag: tags.attributeValue, color: '#032f62' },
  { tag: tags.meta, color: '#6a737d' },
]);

const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#f6f8fa',
      color: '#24292e',
    },
    '.cm-gutters': {
      backgroundColor: '#f6f8fa',
      color: '#6e7781',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(37, 99, 235, 0.06)',
      color: '#24292e',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(37, 99, 235, 0.04)',
    },
    '.cm-cursor': {
      borderLeftColor: '#24292e',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(37, 99, 235, 0.15)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(37, 99, 235, 0.12)',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(37, 99, 235, 0.2)',
      outline: '1px solid rgba(37, 99, 235, 0.3)',
    },
  },
  { dark: false },
);

// ---------------------------------------------------------------------------
// Dark Theme (for CodeMirror - Tokyo Night inspired)
// ---------------------------------------------------------------------------

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#bb9af7' },
  { tag: tags.comment, color: '#565f89', fontStyle: 'italic' },
  { tag: tags.string, color: '#9ece6a' },
  { tag: tags.number, color: '#ff9e64' },
  { tag: tags.variableName, color: '#c0caf5' },
  { tag: tags.function(tags.variableName), color: '#7aa2f7' },
  { tag: tags.typeName, color: '#2ac3de' },
  { tag: tags.className, color: '#bb9af7' },
  { tag: tags.definition(tags.variableName), color: '#e0af68' },
  { tag: tags.propertyName, color: '#7dcfff' },
  { tag: tags.operator, color: '#89ddff' },
  { tag: tags.punctuation, color: '#c0caf5' },
  { tag: tags.bool, color: '#ff9e64' },
  { tag: tags.regexp, color: '#b4f9f8' },
  { tag: tags.tagName, color: '#f7768e' },
  { tag: tags.attributeName, color: '#bb9af7' },
  { tag: tags.attributeValue, color: '#9ece6a' },
  { tag: tags.meta, color: '#565f89' },
]);

const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#1a1b26',
      color: '#c0caf5',
    },
    '.cm-gutters': {
      backgroundColor: '#1a1b26',
      color: '#3b4261',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(122, 162, 247, 0.08)',
      color: '#c0caf5',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(122, 162, 247, 0.06)',
    },
    '.cm-cursor': {
      borderLeftColor: '#c0caf5',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(122, 162, 247, 0.2)',
    },
    '.cm-selectionBackground': {
      backgroundColor: 'rgba(122, 162, 247, 0.15)',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(122, 162, 247, 0.25)',
      outline: '1px solid rgba(122, 162, 247, 0.4)',
    },
  },
  { dark: true },
);

// ---------------------------------------------------------------------------
// Build extensions based on current settings and theme
// ---------------------------------------------------------------------------

function getCodeMirrorExtensions(): Extension[] {
  const isDark = document.documentElement.classList.contains('dark');

  const extensions: Extension[] = [
    keymap.of(defaultKeymap.concat(indentWithTab)),
    basicSetup,
    bracketMatching(),
    EditorView.lineWrapping,
    lineNumbers(), // 始终加载行号，通过 CSS 控制显示/隐藏
  ];

  // Theme
  if (isDark) {
    extensions.push(darkTheme, syntaxHighlighting(darkHighlightStyle));
  } else {
    extensions.push(lightTheme, syntaxHighlighting(lightHighlightStyle));
  }

  return extensions;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export function configureCodeBlock(ctx: Ctx) {
  ctx.update(codeBlockConfig.key, (defaultConfig) => ({
    ...defaultConfig,
    languages,
    extensions: getCodeMirrorExtensions(),

    // Icons (SVG strings)
    expandIcon,
    searchIcon,
    clearSearchIcon,
    copyIcon,

    // Text labels (中文)
    searchPlaceholder: '搜索语言…',
    noResultText: '未找到匹配语言',
    copyText: '', // 不显示文字，只显示图标

    // Language renderer
    renderLanguage: (language: string, selected: boolean) =>
      selected ? `✓ ${language}` : language,

    // Copy callback - show visual feedback when copied
    onCopy: (_text: string) => {
      // 使用之前追踪到的复制按钮
      const copyButton = lastClickedCopyButton;
      
      if (copyButton) {
        const iconContainer = copyButton.querySelector('.milkdown-icon');
        if (iconContainer) {
          const originalIcon = iconContainer.innerHTML;
          // 切换为勾选图标
          iconContainer.innerHTML = checkIcon;
          copyButton.classList.add('copied');
          
          // 2秒后恢复
          setTimeout(() => {
            iconContainer.innerHTML = originalIcon;
            copyButton.classList.remove('copied');
          }, 2000);
        }
        // 清除引用
        lastClickedCopyButton = null;
      }
    },
  }));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { codeBlockComponent };

// ---------------------------------------------------------------------------
// Dynamic extension rebuild (for theme/setting changes)
// ---------------------------------------------------------------------------

/**
 * Rebuild CodeMirror extensions and re-configure.
 * Call this when theme or codeBlock settings change.
 */
export function rebuildCodeBlockExtensions(ctx: Ctx) {
  ctx.update(codeBlockConfig.key, (prev) => ({
    ...prev,
    extensions: getCodeMirrorExtensions(),
  }));
}

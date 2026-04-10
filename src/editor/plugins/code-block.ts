/**
 * Code Block Plugin
 *
 * 集成 @milkdown/components/code-block + CodeMirror 6，提供增强的代码块功能：
 * - 语法高亮（30+ 语言懒加载）
 * - 可搜索的语言选择器（hover 时显示）
 * - 复制代码按钮（hover 时显示）
 * - 行号（可通过设置开关）
 * - 自动缩进、括号匹配
 * - 主题通过 CSS 变量自动跟随
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
// Unified CodeMirror Theme (消费 CSS 变量)
// ---------------------------------------------------------------------------

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--lanismd-cm-bg)',
    color: 'var(--lanismd-cm-text)',
  },
  '.cm-content': {
    caretColor: 'var(--lanismd-cm-cursor)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--lanismd-cm-gutter-bg)',
    color: 'var(--lanismd-cm-gutter-text)',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--lanismd-cm-gutter-active)',
    color: 'var(--lanismd-cm-text)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--lanismd-cm-line-active)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--lanismd-cm-cursor)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--lanismd-cm-selection)',
  },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    backgroundColor: 'var(--lanismd-cm-bracket-match)',
    outline: '1px solid var(--lanismd-cm-bracket-outline)',
  },
});

// ---------------------------------------------------------------------------
// Syntax Highlighting (消费 CSS 变量)
// ---------------------------------------------------------------------------

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--lanismd-syntax-keyword)' },
  { tag: tags.comment, color: 'var(--lanismd-syntax-comment)', fontStyle: 'italic' },
  { tag: tags.string, color: 'var(--lanismd-syntax-string)' },
  { tag: tags.number, color: 'var(--lanismd-syntax-number)' },
  { tag: tags.variableName, color: 'var(--lanismd-syntax-variable)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--lanismd-syntax-function)' },
  { tag: tags.typeName, color: 'var(--lanismd-syntax-type)' },
  { tag: tags.className, color: 'var(--lanismd-syntax-class)' },
  { tag: tags.definition(tags.variableName), color: 'var(--lanismd-syntax-definition)' },
  { tag: tags.propertyName, color: 'var(--lanismd-syntax-property)' },
  { tag: tags.operator, color: 'var(--lanismd-syntax-operator)' },
  { tag: tags.punctuation, color: 'var(--lanismd-syntax-punctuation)' },
  { tag: tags.bool, color: 'var(--lanismd-syntax-bool)' },
  { tag: tags.regexp, color: 'var(--lanismd-syntax-regexp)' },
  { tag: tags.tagName, color: 'var(--lanismd-syntax-tag)' },
  { tag: tags.attributeName, color: 'var(--lanismd-syntax-attr-name)' },
  { tag: tags.attributeValue, color: 'var(--lanismd-syntax-attr-value)' },
  { tag: tags.meta, color: 'var(--lanismd-syntax-meta)' },
]);

// ---------------------------------------------------------------------------
// Build extensions based on current settings
// ---------------------------------------------------------------------------

function getCodeMirrorExtensions(): Extension[] {
  const extensions: Extension[] = [
    keymap.of(defaultKeymap.concat(indentWithTab)),
    basicSetup,
    bracketMatching(),
    EditorView.lineWrapping,
    lineNumbers(), // 始终加载行号，通过 CSS 控制显示/隐藏
    // 统一的主题和语法高亮（使用 CSS 变量，自动跟随主题切换）
    editorTheme,
    syntaxHighlighting(highlightStyle),
  ];

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
// 动态扩展重建（用于主题/设置变更）
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

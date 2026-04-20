import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { typewriterScrollForSource } from '../plugins/typewriter-mode';

// 统一的 CodeMirror 主题（消费 CSS 变量）
const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--lanismd-editor-bg)',
    color: 'var(--lanismd-editor-text)',
  },
  '.cm-content': {
    caretColor: 'var(--lanismd-accent)',
    fontFamily: 'var(--lanismd-font-mono)',
    padding: '0',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--lanismd-accent)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    background: 'var(--lanismd-cm-selection) !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--lanismd-cm-line-active)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--lanismd-editor-bg)',
    color: 'var(--lanismd-text-muted)',
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--lanismd-cm-gutter-active)',
    color: 'var(--lanismd-editor-text)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 16px',
    minWidth: '40px',
    textAlign: 'right',
  },
});

// Markdown 语法高亮样式（消费 CSS 变量）
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: '600', fontSize: '1.5em' },
  { tag: tags.heading2, fontWeight: '600', fontSize: '1.3em' },
  { tag: tags.heading3, fontWeight: '600', fontSize: '1.15em' },
  { tag: tags.heading, fontWeight: '600', color: 'var(--lanismd-heading-color)' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', opacity: '0.7' },
  { tag: tags.link, color: 'var(--lanismd-link-color)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--lanismd-link-color)', opacity: '0.7' },
  { tag: tags.quote, color: 'var(--lanismd-blockquote-text)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--lanismd-accent)' },
  { tag: tags.contentSeparator, color: 'var(--lanismd-hr-color)' },
  { tag: tags.monospace, color: 'var(--lanismd-inline-code-text)', fontFamily: 'var(--lanismd-font-mono)' },
  { tag: tags.processingInstruction, color: 'var(--lanismd-text-muted)' },
]);

/**
 * 源码模式专注模式：为非当前行添加淡化类名
 * 通过直接操作 DOM class 实现，性能优于 Decoration
 */
function updateFocusModeLines(view: EditorView): void {
  const { focusMode } = useEditorStore.getState();
  const lines = view.dom.querySelectorAll('.cm-line');

  if (!focusMode) {
    // 关闭时清除所有 blur 类
    lines.forEach((line) => line.classList.remove('lanismd-focus-blur'));
    return;
  }

  // 获取当前光标所在行号
  const pos = view.state.selection.main.head;
  const currentLineNumber = view.state.doc.lineAt(pos).number;

  lines.forEach((lineEl) => {
    // 通过 posAtDOM 从 DOM 元素反查文档位置，再获取行号进行精确比较
    try {
      const linePos = view.posAtDOM(lineEl, 0);
      const lineNumber = view.state.doc.lineAt(linePos).number;

      if (lineNumber === currentLineNumber) {
        lineEl.classList.remove('lanismd-focus-blur');
      } else {
        lineEl.classList.add('lanismd-focus-blur');
      }
    } catch {
      // posAtDOM 可能在某些边界情况下抛出异常，安全忽略
      lineEl.classList.add('lanismd-focus-blur');
    }
  });
}

export function SourceEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalUpdate = useRef(false);

  const currentFile = useFileStore((s) => s.currentFile);
  const updateContent = useFileStore((s) => s.updateContent);
  const updateStats = useEditorStore((s) => s.updateStats);
  const updateCursor = useEditorStore((s) => s.updateCursor);
  const theme = useSettingsStore((s) => s.config.theme);
  const editorFontSize = useSettingsStore((s) => s.config.editor.fontSize);
  const editorLineHeight = useSettingsStore((s) => s.config.editor.lineHeight);
  const editorWordWrap = useSettingsStore((s) => s.config.editor.wordWrap);

  // 内容变更处理
  const handleDocChange = useCallback(
    (content: string) => {
      if (isInternalUpdate.current) return;
      updateContent(content);
      updateStats(content);
    },
    [updateContent, updateStats],
  );

  // 光标位置更新
  const handleSelectionChange = useCallback(
    (view: EditorView) => {
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      const lineNumber = line.number;
      const column = pos - line.from + 1;
      updateCursor(lineNumber, column);
    },
    [updateCursor],
  );

  // 初始化编辑器
  useEffect(() => {
    if (!containerRef.current || !currentFile) return;

    const extensions = [
      // 基础功能
      history(),
      drawSelection(),
      bracketMatching(),
      highlightActiveLine(),

      // 键盘映射
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),

      // Markdown 语法支持
      markdown(),
      syntaxHighlighting(markdownHighlightStyle, { fallback: true }),

      // 统一主题（使用 CSS 变量，自动跟随主题切换）
      editorTheme,

      // 监听变更
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          handleDocChange(update.state.doc.toString());
        }
        if (update.selectionSet) {
          handleSelectionChange(update.view);
          // 打字机模式：选区变化时滚动光标到视口中央
          typewriterScrollForSource(update.view);
          // 专注模式：更新行级淡化
          updateFocusModeLines(update.view);
        }
      }),

      // 编辑器样式（消费 CSS 变量，跟随设置面板配置）
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: 'var(--lanismd-editor-font-size, 16px)',
          lineHeight: 'var(--lanismd-editor-line-height, 1.75)',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'var(--lanismd-font-mono)',
        },
        '.cm-content': {
          wordWrap: 'var(--lanismd-editor-word-wrap, normal)',
          overflowWrap: 'var(--lanismd-editor-word-wrap, normal)',
          overflowX: 'var(--lanismd-editor-overflow-x, hidden)',
        },
      }),
    ];

    const state = EditorState.create({
      doc: currentFile.content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    // 注册 EditorView 到 store，供大纲同步等功能使用
    useEditorStore.getState().setSourceView(view);

    // 初始化光标位置
    handleSelectionChange(view);

    return () => {
      view.destroy();
      viewRef.current = null;
      useEditorStore.getState().setSourceView(null);
    };
    // 主题/编辑器配置变化时重建编辑器以应用新的 CSS 变量
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile?.id, theme, editorFontSize, editorLineHeight, editorWordWrap]);

  // 同步外部内容变更到编辑器
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !currentFile) return;

    const currentContent = view.state.doc.toString();
    if (currentContent !== currentFile.content) {
      isInternalUpdate.current = true;
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: currentFile.content,
        },
      });
      isInternalUpdate.current = false;
    }
  }, [currentFile?.content]);

  return (
    <div
      ref={containerRef}
      className="source-editor-root"
      style={{ maxWidth: 'var(--lanismd-editor-max-width, 800px)' }}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
    />
  );
}

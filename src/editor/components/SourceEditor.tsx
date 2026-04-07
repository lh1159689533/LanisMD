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
    backgroundColor: 'var(--lanismd-cm-selection)',
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

export function SourceEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalUpdate = useRef(false);

  const currentFile = useFileStore((s) => s.currentFile);
  const updateContent = useFileStore((s) => s.updateContent);
  const updateStats = useEditorStore((s) => s.updateStats);
  const updateCursor = useEditorStore((s) => s.updateCursor);
  const theme = useSettingsStore((s) => s.config.theme);

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
        }
      }),

      // 编辑器样式
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '16px',
          lineHeight: '1.75',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'var(--lanismd-font-mono)',
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

    // 初始化光标位置
    handleSelectionChange(view);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 主题变化时重建编辑器以应用新的 CSS 变量
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile?.id, theme]);

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

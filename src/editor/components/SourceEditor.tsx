import { useEffect, useRef, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

// 自定义浅色主题
const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--lanismd-editor-bg)',
      color: 'var(--lanismd-editor-text)',
    },
    '.cm-content': {
      caretColor: 'var(--lanismd-accent)',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
      padding: '0',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--lanismd-accent)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(37, 99, 235, 0.15)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(0, 0, 0, 0.03)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--lanismd-editor-bg)',
      color: 'var(--lanismd-sidebar-text)',
      border: 'none',
      paddingRight: '8px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(0, 0, 0, 0.03)',
      color: 'var(--lanismd-editor-text)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 16px',
      minWidth: '40px',
      textAlign: 'right',
    },
  },
  { dark: false },
);

// 自定义暗色主题（基于 oneDark 但调整部分颜色）
const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: 'var(--lanismd-editor-bg)',
      color: 'var(--lanismd-editor-text)',
    },
    '.cm-content': {
      caretColor: 'var(--lanismd-accent)',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
      padding: '0',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--lanismd-accent)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(122, 162, 247, 0.2)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--lanismd-editor-bg)',
      color: 'var(--lanismd-sidebar-text)',
      border: 'none',
      paddingRight: '8px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 255, 255, 0.03)',
      color: 'var(--lanismd-editor-text)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 8px 0 16px',
      minWidth: '40px',
      textAlign: 'right',
    },
  },
  { dark: true },
);

export function SourceEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isInternalUpdate = useRef(false);

  const currentFile = useFileStore((s) => s.currentFile);
  const updateContent = useFileStore((s) => s.updateContent);
  const updateStats = useEditorStore((s) => s.updateStats);
  const updateCursor = useEditorStore((s) => s.updateCursor);
  const theme = useSettingsStore((s) => s.config.theme);

  // 判断是否为暗色主题
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

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
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),

      // 主题
      isDark ? oneDark : lightTheme,
      isDark ? darkTheme : [],

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
          fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
        },
      }),
    ].flat();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile?.id, isDark]);

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

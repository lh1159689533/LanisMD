import { useEffect, useRef } from 'react';
import type { Editor } from '@milkdown/kit/core';
import { createEditor, setupEditorListeners, type EditorListener } from '../editor-setup';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';

export function useEditor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const currentFile = useFileStore((s) => s.currentFile);
  const currentFileId = currentFile?.id ?? null;
  const updateStats = useEditorStore((s) => s.updateStats);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !currentFileId) return;

    const file = useFileStore.getState().currentFile;
    if (!file) return;

    // 用于标记当前 effect 是否已被清理（处理 StrictMode 双重执行）
    let cancelled = false;

    // 先清理旧实例
    if (editorRef.current) {
      editorRef.current.destroy();
      editorRef.current = null;
    }

    const listeners: EditorListener = {
      onMarkdownUpdated: (markdown) => {
        if (cancelled) return;
        updateStats(markdown);
        const state = useFileStore.getState();
        if (state.currentFile?.id === file.id) {
          state.updateContent(markdown);
        }
      },
    };

    const editorInstance = createEditor(root, file.content);

    editorInstance
      .create()
      .then((editor) => {
        if (cancelled) {
          // effect 已被清理，销毁这个迟到的编辑器实例
          editor.destroy();
          return;
        }
        editorRef.current = editor;
        setupEditorListeners(editor, listeners);
        updateStats(file.content);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('Failed to create Milkdown editor:', err);
        }
      });

    return () => {
      cancelled = true;
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
    // Only re-create editor when currentFileId changes, NOT when content changes
  }, [currentFileId, updateStats]);

  return { rootRef, editorRef };
}

import { useEffect, useRef } from 'react';
import type { Crepe } from '@milkdown/crepe';
import { createCrepeEditor, type EditorListener } from '../editor-setup';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';

export function useEditor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);

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
    if (crepeRef.current) {
      crepeRef.current.destroy();
      crepeRef.current = null;
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

    const crepe = createCrepeEditor(root, file.content, listeners);

    crepe
      .create()
      .then(() => {
        if (cancelled) {
          // effect 已被清理，销毁这个迟到的编辑器实例
          crepe.destroy();
          return;
        }
        crepeRef.current = crepe;
        updateStats(file.content);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('Failed to create Milkdown editor:', err);
        }
      });

    return () => {
      cancelled = true;
      if (crepeRef.current) {
        crepeRef.current.destroy();
        crepeRef.current = null;
      }
    };
    // Only re-create editor when currentFileId changes, NOT when content changes
  }, [currentFileId, updateStats]);

  return { rootRef, crepeRef };
}

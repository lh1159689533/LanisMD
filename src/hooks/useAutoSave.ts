import { useCallback, useEffect, useRef } from 'react';
import { useFileStore } from '@/stores/file-store';
import { fileService } from '@/services/tauri';
import { save as tauriSave } from '@tauri-apps/plugin-dialog';

const AUTO_SAVE_DELAY = 1000; // 1 second debounce

interface AutoSaveOptions {
  /** Called after a successful save to disk (used by file watcher to ignore self-writes) */
  onAfterSave?: () => void;
}

/**
 * Auto-save hook: handles debounced save on content change + save on window blur.
 * Also provides `saveNow` for Cmd+S immediate trigger.
 */
export function useAutoSave(options?: AutoSaveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const onAfterSaveRef = useRef(options?.onAfterSave);
  onAfterSaveRef.current = options?.onAfterSave;

  /** Perform the actual save to disk */
  const performSave = useCallback(async () => {
    const file = useFileStore.getState().currentFile;
    if (!file || !file.isDirty) return;

    // If no file path (Untitled), skip auto-save (user needs "Save As")
    if (!file.filePath) return;

    if (isSavingRef.current) return;
    isSavingRef.current = true;

    try {
      useFileStore.getState().setSaveStatus('saving');

      await fileService.writeFile({
        path: file.filePath,
        content: file.content,
        encoding: file.encoding,
      });

      useFileStore.getState().markSaved();
      onAfterSaveRef.current?.();
    } catch (err) {
      console.error('Auto-save failed:', err);
      useFileStore.getState().setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  /** Schedule a debounced save (called on every content change) */
  const scheduleSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      performSave();
    }, AUTO_SAVE_DELAY);
  }, [performSave]);

  /** Immediately save (for Cmd+S and focus loss) */
  const saveNow = useCallback(async () => {
    // Cancel any pending debounced save
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const file = useFileStore.getState().currentFile;
    if (!file) return;

    // If file has no path, trigger "Save As" dialog
    if (!file.filePath) {
      if (!file.isDirty && file.content === '') return; // Empty untitled, skip

      const filePath = await tauriSave({
        defaultPath: `${file.fileName}.md`,
        filters: [
          {
            name: 'Markdown',
            extensions: ['md', 'markdown'],
          },
        ],
      });

      if (!filePath) return;

      try {
        useFileStore.getState().setSaveStatus('saving');
        await fileService.writeFile({
          path: filePath,
          content: file.content,
          encoding: file.encoding,
        });
        const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? '未知';
        useFileStore.getState().markSaved(filePath, fileName);
        onAfterSaveRef.current?.();
      } catch (err) {
        console.error('Save failed:', err);
        useFileStore.getState().setSaveStatus('error');
      }
      return;
    }

    // Normal save for files with a path
    await performSave();
  }, [performSave]);

  // Subscribe to content changes for auto-save debounce
  useEffect(() => {
    const unsub = useFileStore.subscribe((state, prevState) => {
      const curr = state.currentFile;
      const prev = prevState.currentFile;

      // Only trigger when content actually changed and file is dirty
      if (curr && curr.isDirty && curr.content !== prev?.content) {
        scheduleSave();
      }
    });

    return () => {
      unsub();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [scheduleSave]);

  // 窗口/文档失焦时保存（失去焦点）
  useEffect(() => {
    const handleBlur = () => {
      const file = useFileStore.getState().currentFile;
      if (file?.isDirty && file.filePath) {
        performSave();
      }
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        handleBlur();
      }
    });

    return () => {
      window.removeEventListener('blur', handleBlur);
    };
  }, [performSave]);

  return { saveNow };
}

import { useEffect, useRef, useCallback } from 'react';
import { watch } from '@tauri-apps/plugin-fs';
import type { WatchEvent } from '@tauri-apps/plugin-fs';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useFileStore } from '@/stores/file-store';
import { fileService } from '@/services/tauri';
import { showConfirmDialog } from '@/services/tauri/dialog-service';

/** Debounce delay for refreshing the file tree (ms) */
const TREE_REFRESH_DEBOUNCE = 500;

/** How long to ignore fs events after our own save (ms) */
const SELF_WRITE_COOLDOWN = 1500;

/** How long to suppress tree refresh after a frontend file operation (ms) */
const TREE_REFRESH_SUPPRESS_COOLDOWN = 2000;

/**
 * Checks if a WatchEvent represents a meaningful file change
 * (create / modify-data / remove / rename), filtering out access-only events.
 */
function isRelevantChange(event: WatchEvent): boolean {
  const { type } = event;
  if (type === 'any' || type === 'other') return true;
  if (typeof type === 'object') {
    if ('create' in type) return true;
    if ('remove' in type) return true;
    if ('modify' in type) {
      const modify = type.modify;
      // Only care about data/rename changes, not metadata-only
      if (typeof modify === 'object' && 'kind' in modify) {
        return modify.kind === 'data' || modify.kind === 'rename' || modify.kind === 'any';
      }
      return true;
    }
    // access events are not relevant
    if ('access' in type) return false;
  }
  return false;
}

/**
 * Hook that watches the currently opened folder for file system changes.
 *
 * Responsibilities:
 * 1. Auto-refresh the file tree when files are created/deleted/modified
 * 2. Auto-reload the currently open file when it's changed externally
 *    - If clean (not dirty) → silent reload
 *    - If dirty → prompt user with a confirm dialog
 */
export function useFileWatcher() {
  const rootPath = useFileTreeStore((s) => s.rootPath);
  const unwatchRef = useRef<(() => void) | null>(null);
  const treeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReloadingRef = useRef(false);

  /**
   * Timestamp of the last save we performed ourselves.
   * Used to ignore the fs event triggered by our own write.
   */
  const lastSelfWriteRef = useRef(0);

  /**
   * Notify the watcher that we just wrote a file, so the resulting
   * fs event can be ignored.
   */
  const notifySelfWrite = useCallback(() => {
    lastSelfWriteRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!rootPath) return;

    let cancelled = false;

    const startWatching = async () => {
      try {
        const unwatch = await watch(
          rootPath,
          (event: WatchEvent) => {
            if (cancelled) return;
            if (!isRelevantChange(event)) return;

            // --- 1. Debounced tree refresh (skip if within suppress window) ---
            if (
              Date.now() - useFileTreeStore.getState().lastUserOpTimestamp <
              TREE_REFRESH_SUPPRESS_COOLDOWN
            ) {
              // Frontend just did a file operation and already refreshed the tree;
              // skip the watcher-triggered refresh to avoid flicker.
            } else {
              if (treeRefreshTimerRef.current) {
                clearTimeout(treeRefreshTimerRef.current);
              }
              treeRefreshTimerRef.current = setTimeout(() => {
                treeRefreshTimerRef.current = null;
                useFileTreeStore.getState().refreshTree();
              }, TREE_REFRESH_DEBOUNCE);
            }

            // --- 2. Check if current open file was changed ---
            const currentFile = useFileStore.getState().currentFile;
            if (!currentFile?.filePath) return;

            const changedPaths = event.paths ?? [];
            const currentFileChanged = changedPaths.some((p) => p === currentFile.filePath);
            if (!currentFileChanged) return;

            // Ignore events triggered by our own save
            if (Date.now() - lastSelfWriteRef.current < SELF_WRITE_COOLDOWN) {
              return;
            }

            // Prevent concurrent reloads
            if (isReloadingRef.current) return;
            isReloadingRef.current = true;

            handleCurrentFileChanged(currentFile.filePath, currentFile.isDirty).finally(() => {
              isReloadingRef.current = false;
            });
          },
          {
            recursive: true,
            delayMs: 300,
          },
        );

        if (!cancelled) {
          unwatchRef.current = unwatch;
        } else {
          // Already cleaned up, stop watching immediately
          unwatch();
        }
      } catch (err) {
        console.error('[useFileWatcher] Failed to start watching:', err);
      }
    };

    startWatching();

    return () => {
      cancelled = true;
      if (treeRefreshTimerRef.current) {
        clearTimeout(treeRefreshTimerRef.current);
        treeRefreshTimerRef.current = null;
      }
      if (unwatchRef.current) {
        unwatchRef.current();
        unwatchRef.current = null;
      }
    };
  }, [rootPath]);

  // Expose notifySelfWrite so useAutoSave can call it
  return { notifySelfWrite };
}

/**
 * Handle the scenario where the currently open file was modified externally.
 */
async function handleCurrentFileChanged(filePath: string, isDirty: boolean): Promise<void> {
  if (isDirty) {
    // File has unsaved local changes → ask user
    const shouldReload = await showConfirmDialog(
      '文件已被外部修改',
      '当前文件已在外部被修改。是否重新加载磁盘上的最新内容？\n（选择"是"将丢弃未保存的更改）',
    );
    if (!shouldReload) return;
  }

  // 从磁盘重新加载文件内容
  try {
    const result = await fileService.readFile({
      path: filePath,
      encoding: 'utf-8',
    });

    const state = useFileStore.getState();
    const current = state.currentFile;

    // Double-check it's still the same file
    if (current?.filePath !== filePath) return;

    // Use reloadContent to update without triggering isDirty
    state.reloadContent(result.content);
  } catch (err) {
    console.error('[useFileWatcher] Failed to reload file:', err);
  }
}

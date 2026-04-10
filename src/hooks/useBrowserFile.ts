import { useEffect, useRef, useCallback } from 'react';
import { useFileStore } from '@/stores/file-store';
import { browserStorageService } from '@/services/browser';

const AUTO_SAVE_INTERVAL = 3000; // 3 seconds

/**
 * Hook for browser mode file operations
 * - Auto-loads document from IndexedDB on mount
 * - Auto-saves document to IndexedDB periodically
 */
export function useBrowserFile() {
  const { currentFile, createUntitledFile, updateContent, markSaved } = useFileStore();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const isInitializedRef = useRef(false);

  // Initialize: load document from IndexedDB or create new
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initDocument = async () => {
      try {
        const savedContent = await browserStorageService.loadDocument();
        
        // Create untitled file first
        createUntitledFile();
        
        // If we have saved content, update it
        if (savedContent !== null) {
          // Small delay to ensure the file is created
          setTimeout(() => {
            updateContent(savedContent);
            lastSavedContentRef.current = savedContent;
            markSaved();
          }, 50);
        }
      } catch (error) {
        console.error('Failed to load document from browser storage:', error);
        createUntitledFile();
      }
    };

    initDocument();
  }, [createUntitledFile, updateContent, markSaved]);

  // Auto-save function
  const saveToStorage = useCallback(async () => {
    const file = useFileStore.getState().currentFile;
    if (!file) return;
    
    // Only save if content has changed
    if (file.content === lastSavedContentRef.current) return;

    try {
      await browserStorageService.saveDocument(file.content);
      lastSavedContentRef.current = file.content;
      markSaved();
    } catch (error) {
      console.error('Failed to save document to browser storage:', error);
    }
  }, [markSaved]);

  // Set up auto-save timer
  useEffect(() => {
    if (!currentFile) return;

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Set up periodic save
    const scheduleNextSave = () => {
      saveTimerRef.current = setTimeout(async () => {
        await saveToStorage();
        scheduleNextSave();
      }, AUTO_SAVE_INTERVAL);
    };

    scheduleNextSave();

    // Save on unmount
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      // Final save
      saveToStorage();
    };
  }, [currentFile, saveToStorage]);

  // 页面卸载前保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      const file = useFileStore.getState().currentFile;
      if (file && file.content !== lastSavedContentRef.current) {
        // 同步保存尝试（可能不总是成功）
        browserStorageService.saveDocument(file.content).catch(console.error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return {
    saveNow: saveToStorage,
  };
}

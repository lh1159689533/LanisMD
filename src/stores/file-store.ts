import { create } from 'zustand';
import type { EditorTab, SaveStatus } from '@/types';

function generateId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface FileState {
  /** Current open file (single file mode, no tabs) */
  currentFile: EditorTab | null;
  /** Save status indicator for the title bar */
  saveStatus: SaveStatus;

  openFile: (path: string, content: string, encoding: string, fileName: string) => void;
  createUntitledFile: () => void;
  updateContent: (content: string) => void;
  /** Reload content from disk without marking as dirty (for external file changes) */
  reloadContent: (content: string) => void;
  markSaved: (filePath?: string, fileName?: string) => void;
  setSaveStatus: (status: SaveStatus) => void;
  closeFile: () => void;
  /** Update file path and name (e.g. after rename) */
  updateFilePath: (newPath: string, newName: string) => void;
  getCurrentFile: () => EditorTab | null;

  // Legacy aliases for backward compatibility during migration
  /** @deprecated Use currentFile directly */
  tabs: EditorTab[];
  /** @deprecated Use currentFile?.id */
  activeTabId: string | null;
  /** @deprecated Use getCurrentFile */
  getActiveTab: () => EditorTab | null;
  /** @deprecated Use updateContent */
  updateTabContent: (tabId: string, content: string) => void;
  /** @deprecated Use markSaved */
  markTabSaved: (tabId: string) => void;
}

export const useFileStore = create<FileState>()((set, get) => ({
  currentFile: null,
  saveStatus: 'idle' as SaveStatus,

  openFile: (path, content, encoding, fileName) => {
    // If the same file is already open, do nothing
    const current = get().currentFile;
    if (current?.filePath === path) return;

    const newFile: EditorTab = {
      id: generateId(),
      filePath: path,
      fileName,
      content,
      lastSavedContent: content,
      encoding,
      isDirty: false,
      cursorPosition: { line: 1, column: 1 },
      scrollPosition: 0,
      editorMode: 'wysiwyg',
      isReadOnly: false,
      createdAt: Date.now(),
    };

    set({
      currentFile: newFile,
      saveStatus: 'idle',
    });
  },

  createUntitledFile: () => {
    const newFile: EditorTab = {
      id: generateId(),
      filePath: null,
      fileName: '未命名',
      content: '',
      lastSavedContent: '',
      encoding: 'utf-8',
      isDirty: false,
      cursorPosition: { line: 1, column: 1 },
      scrollPosition: 0,
      editorMode: 'wysiwyg',
      isReadOnly: false,
      createdAt: Date.now(),
    };

    set({
      currentFile: newFile,
      saveStatus: 'idle',
    });
  },

  updateContent: (content) => {
    const current = get().currentFile;
    if (!current) return;

    set({
      currentFile: {
        ...current,
        content,
        isDirty: content !== current.lastSavedContent,
      },
    });
  },

  reloadContent: (content) => {
    const current = get().currentFile;
    if (!current) return;

    // Generate a new id to trigger editor re-creation in useEditor
    set({
      currentFile: {
        ...current,
        id: generateId(),
        content,
        lastSavedContent: content,
        isDirty: false,
      },
    });
  },

  markSaved: (filePath?: string, fileName?: string) => {
    const current = get().currentFile;
    if (!current) return;

    set({
      currentFile: {
        ...current,
        filePath: filePath ?? current.filePath,
        fileName: fileName ?? current.fileName,
        lastSavedContent: current.content,
        isDirty: false,
      },
      saveStatus: 'saved',
    });

    // Reset save status to idle after 2 seconds
    setTimeout(() => {
      if (get().saveStatus === 'saved') {
        set({ saveStatus: 'idle' });
      }
    }, 2000);
  },

  setSaveStatus: (status) => {
    set({ saveStatus: status });
  },

  closeFile: () => {
    set({ currentFile: null, saveStatus: 'idle' });
  },

  updateFilePath: (newPath: string, newName: string) => {
    const current = get().currentFile;
    if (!current) return;
    set({
      currentFile: {
        ...current,
        filePath: newPath,
        fileName: newName,
      },
    });
  },

  getCurrentFile: () => get().currentFile,

  // Legacy computed properties for backward compatibility
  get tabs() {
    const current = get().currentFile;
    return current ? [current] : [];
  },

  get activeTabId() {
    return get().currentFile?.id ?? null;
  },

  getActiveTab: () => get().currentFile,

  updateTabContent: (_tabId: string, content: string) => {
    get().updateContent(content);
  },

  markTabSaved: (_tabId: string) => {
    get().markSaved();
  },
}));

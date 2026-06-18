import { create } from 'zustand';
import type { EditorTab, SaveStatus } from '@/types';
import { useSessionStore } from './session-store';
import { saveViewState } from './scroll-position-cache';
import { useEditorStore } from './editor-store';

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

    // 切换前保存当前文件的滚动位置和光标位置（仅 WYSIWYG 模式）
    if (current?.filePath) {
      const pmView = useEditorStore.getState().wysiwygView;
      if (pmView) {
        // 查找真正的滚动容器（需要同时满足 overflow 样式和实际可滚动）
        let scrollContainer: HTMLElement | null = pmView.dom.parentElement;
        while (scrollContainer) {
          const { overflow, overflowY } = getComputedStyle(scrollContainer);
          const hasOverflowStyle =
            overflow === 'auto' || overflow === 'scroll' ||
            overflowY === 'auto' || overflowY === 'scroll';
          // 除了 overflow 属性匹配外，还要确认元素确实有可滚动区域
          if (hasOverflowStyle && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
            break;
          }
          scrollContainer = scrollContainer.parentElement;
        }

        const scrollTop = scrollContainer?.scrollTop ?? 0;
        const { anchor, head } = pmView.state.selection;

        saveViewState(current.filePath, {
          scrollTop,
          cursorAnchor: anchor,
          cursorHead: head,
          timestamp: Date.now(),
        });
      }
    }

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

    // 同步会话快照：记录上次打开的文件路径
    useSessionStore.getState().setLastFile(path);
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

    const nextPath = filePath ?? current.filePath;

    set({
      currentFile: {
        ...current,
        filePath: nextPath,
        fileName: fileName ?? current.fileName,
        lastSavedContent: current.content,
        isDirty: false,
      },
      saveStatus: 'saved',
    });

    // 另存为场景：filePath 变化时同步会话快照
    if (filePath && filePath !== current.filePath) {
      useSessionStore.getState().setLastFile(filePath);
    }

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
    // 用户主动关闭文件 → 清空会话快照中的文件
    useSessionStore.getState().setLastFile(null);
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
    // 重命名后同步会话快照
    useSessionStore.getState().setLastFile(newPath);
  },

  getCurrentFile: () => get().currentFile,

  // 向后兼容的旧计算属性
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

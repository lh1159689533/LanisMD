import { create } from 'zustand';
import type { Toast } from '@/types';

function generateToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface UIState {
  sidebarOpen: boolean;
  sidebarPanel: 'outline' | 'files' | 'search';
  sidebarWidth: number;
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  settingsActiveSection: string;
  /** AI 历史面板是否打开 */
  aiHistoryOpen: boolean;
  /** AI 历史面板宽度 */
  aiHistoryWidth: number;
  /** 「最近打开文件夹」浮层是否展开（由 Sidebar 入口触发，浮层在 FileTree 内渲染） */
  recentFoldersOpen: boolean;
  /** 触发「最近打开」浮层的所有按钮 DOM 元素，供浮层 outside-click 排除使用 */
  recentFoldersTriggerEls: Set<HTMLElement>;
  toasts: Toast[];

  toggleSidebar: () => void;
  /** 原子地关闭侧边栏并设置下次打开的宽度 */
  collapseSidebar: (nextWidth: number) => void;
  /** 原子地以给定宽度打开侧边栏 */
  expandSidebar: (width: number) => void;
  setSidebarPanel: (panel: 'outline' | 'files' | 'search') => void;
  setSidebarWidth: (width: number) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openSettings: (section?: string) => void;
  closeSettings: () => void;
  toggleAiHistory: () => void;
  closeAiHistory: () => void;
  setAiHistoryWidth: (width: number) => void;
  toggleRecentFolders: () => void;
  setRecentFoldersOpen: (open: boolean) => void;
  registerRecentFoldersTriggerEl: (el: HTMLElement) => void;
  unregisterRecentFoldersTriggerEl: (el: HTMLElement) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  sidebarPanel: 'files',
  sidebarWidth: 280,
  commandPaletteOpen: false,
  settingsOpen: false,
  settingsActiveSection: 'general',
  aiHistoryOpen: false,
  aiHistoryWidth: 320,
  recentFoldersOpen: false,
  recentFoldersTriggerEls: new Set<HTMLElement>(),
  toasts: [],

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  collapseSidebar: (nextWidth) => set({ sidebarOpen: false, sidebarWidth: nextWidth }),
  expandSidebar: (width) => set({ sidebarOpen: true, sidebarWidth: width }),
  setSidebarPanel: (panel) => set({ sidebarPanel: panel, sidebarOpen: true }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  openSettings: (section) =>
    set({
      settingsOpen: true,
      settingsActiveSection: section ?? 'general',
    }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleAiHistory: () => set((s) => ({ aiHistoryOpen: !s.aiHistoryOpen })),
  closeAiHistory: () => set({ aiHistoryOpen: false }),
  setAiHistoryWidth: (width) => set({ aiHistoryWidth: width }),
  toggleRecentFolders: () => set((s) => ({ recentFoldersOpen: !s.recentFoldersOpen })),
  setRecentFoldersOpen: (open) => set({ recentFoldersOpen: open }),
  registerRecentFoldersTriggerEl: (el) =>
    set((s) => {
      if (s.recentFoldersTriggerEls.has(el)) return s;
      const next = new Set(s.recentFoldersTriggerEls);
      next.add(el);
      return { recentFoldersTriggerEls: next };
    }),
  unregisterRecentFoldersTriggerEl: (el) =>
    set((s) => {
      if (!s.recentFoldersTriggerEls.has(el)) return s;
      const next = new Set(s.recentFoldersTriggerEls);
      next.delete(el);
      return { recentFoldersTriggerEls: next };
    }),
  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: generateToastId() }],
    })),
  removeToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
}));

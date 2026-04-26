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
  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: generateToastId() }],
    })),
  removeToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
}));

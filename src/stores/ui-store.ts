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
  toasts: Toast[];

  toggleSidebar: () => void;
  /** Atomically close sidebar and set the width for next open */
  collapseSidebar: (nextWidth: number) => void;
  /** Atomically open sidebar with a given width */
  expandSidebar: (width: number) => void;
  setSidebarPanel: (panel: 'outline' | 'files' | 'search') => void;
  setSidebarWidth: (width: number) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openSettings: (section?: string) => void;
  closeSettings: () => void;
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
  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: generateToastId() }],
    })),
  removeToast: (id) =>
    set((s) => ({
      toasts: s.toasts.filter((t) => t.id !== id),
    })),
}));

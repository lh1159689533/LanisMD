import { create } from 'zustand';
import type { Toast } from '@/types';

function generateToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// AI 对话输入框高度：本地持久化键（0 表示随内容自适应）
const AI_CHAT_INPUT_HEIGHT_KEY = 'lanismd:ai-chat-input-height';

function readInputHeight(): number {
  try {
    const value = Number(localStorage.getItem(AI_CHAT_INPUT_HEIGHT_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeInputHeight(value: number): void {
  try {
    if (value > 0) localStorage.setItem(AI_CHAT_INPUT_HEIGHT_KEY, String(Math.round(value)));
    else localStorage.removeItem(AI_CHAT_INPUT_HEIGHT_KEY);
  } catch {
    // 忽略 localStorage 不可用场景
  }
}

// 沉浸式阅读：本地持久化键（仅持久化该字段，避免改动整个 UI store 的存储行为）
const IMMERSIVE_READING_STORAGE_KEY = 'lanismd:immersive-reading';

function readImmersivePersisted(): boolean {
  try {
    return localStorage.getItem(IMMERSIVE_READING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeImmersivePersisted(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(IMMERSIVE_READING_STORAGE_KEY, '1');
    } else {
      localStorage.removeItem(IMMERSIVE_READING_STORAGE_KEY);
    }
  } catch {
    // 忽略 localStorage 不可用场景
  }
}

/** 侧边栏面板：changes / history 仅在 Git 仓库下可用 */
export type SidebarPanel = 'outline' | 'files' | 'search' | 'changes' | 'history';

interface UIState {
  sidebarOpen: boolean;
  sidebarPanel: SidebarPanel;
  sidebarWidth: number;
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  settingsActiveSection: string;
  /** AI 对话面板是否打开 */
  aiChatOpen: boolean;
  /** AI 对话面板宽度 */
  aiChatWidth: number;
  /** AI 对话输入框高度（px）；0 表示随内容自适应 */
  aiChatInputHeight: number;
  /** 「最近打开文件夹」浮层是否展开（由 Sidebar 入口触发，浮层在 FileTree 内渲染） */
  recentFoldersOpen: boolean;
  /** 触发「最近打开」浮层的所有按钮 DOM 元素，供浮层 outside-click 排除使用 */
  recentFoldersTriggerEls: Set<HTMLElement>;
  toasts: Toast[];

  /**
   * 沉浸式阅读模式：开启后编辑器只读、各类工具栏/菜单隐藏、模式切换被锁定。
   * 该状态会被持久化到 localStorage，跨文件保持、应用重启后恢复。
   */
  immersiveReading: boolean;

  /**
   * 外部链接确认弹窗状态。
   * - `null` 表示无弹窗
   * - 非 null 时弹窗显示 `url`，用户操作后调用 `resolve`：
   *   - `dontAskAgain=true` + 继续：调用方需将设置 `confirmExternalLinkOpen` 置为 false
   */
  linkConfirm: {
    url: string;
    resolve: (result: { confirmed: boolean; dontAskAgain: boolean }) => void;
  } | null;

  /**
   * 附件删除确认弹窗状态。
   * - `null` 表示无弹窗
   * - 非 null 时弹窗显示文件名，用户操作后调用 `resolve`：
   *   - `confirmed=true, deleteFile=true`：删除节点 + 删除本地文件
   *   - `confirmed=true, deleteFile=false`：仅移除节点
   *   - `confirmed=false`：取消操作
   */
  deleteConfirm: {
    fileName: string;
    resolve: (result: { confirmed: boolean; deleteFile: boolean }) => void;
  } | null;

  toggleSidebar: () => void;
  /** 原子地关闭侧边栏并设置下次打开的宽度 */
  collapseSidebar: (nextWidth: number) => void;
  /** 原子地以给定宽度打开侧边栏 */
  expandSidebar: (width: number) => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
  setSidebarWidth: (width: number) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openSettings: (section?: string) => void;
  closeSettings: () => void;
  toggleAiChat: () => void;
  openAiChat: () => void;
  closeAiChat: () => void;
  setAiChatWidth: (width: number) => void;
  /** 设置输入框高度并持久化；传 0 恢复自适应 */
  setAiChatInputHeight: (height: number) => void;
  toggleRecentFolders: () => void;
  setRecentFoldersOpen: (open: boolean) => void;
  registerRecentFoldersTriggerEl: (el: HTMLElement) => void;
  unregisterRecentFoldersTriggerEl: (el: HTMLElement) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;

  /** 切换沉浸式阅读模式 */
  toggleImmersiveReading: () => void;
  /** 显式设置沉浸式阅读模式 */
  setImmersiveReading: (value: boolean) => void;

  /**
   * 请求弹出外部链接确认框。
   * 返回 Promise，resolve 为 `{ confirmed, dontAskAgain }`。
   * 同一时间只允许一个确认框，重复调用会先取消上一个（resolve 为 false）。
   */
  requestLinkConfirm: (url: string) => Promise<{ confirmed: boolean; dontAskAgain: boolean }>;
  /** 由弹窗组件调用：用户做出选择后回调 resolve */
  resolveLinkConfirm: (result: { confirmed: boolean; dontAskAgain: boolean }) => void;

  /**
   * 请求弹出附件删除确认框。
   * 返回 Promise，resolve 为 `{ confirmed, deleteFile }`。
   */
  requestDeleteConfirm: (fileName: string) => Promise<{ confirmed: boolean; deleteFile: boolean }>;
  /** 由弹窗组件调用：用户做出选择后回调 resolve */
  resolveDeleteConfirm: (result: { confirmed: boolean; deleteFile: boolean }) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  sidebarPanel: 'files',
  sidebarWidth: 280,
  commandPaletteOpen: false,
  settingsOpen: false,
  settingsActiveSection: 'general',
  aiChatOpen: false,
  aiChatWidth: 400,
  aiChatInputHeight: readInputHeight(),
  recentFoldersOpen: false,
  recentFoldersTriggerEls: new Set<HTMLElement>(),
  toasts: [],
  immersiveReading: readImmersivePersisted(),
  linkConfirm: null,
  deleteConfirm: null,

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
  toggleAiChat: () => set((s) => ({ aiChatOpen: !s.aiChatOpen })),
  openAiChat: () => set({ aiChatOpen: true }),
  closeAiChat: () => set({ aiChatOpen: false }),
  setAiChatWidth: (width) => set({ aiChatWidth: width }),
  setAiChatInputHeight: (height) => {
    writeInputHeight(height);
    set({ aiChatInputHeight: height });
  },
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

  toggleImmersiveReading: () =>
    set((s) => {
      const next = !s.immersiveReading;
      writeImmersivePersisted(next);
      return { immersiveReading: next };
    }),
  setImmersiveReading: (value) => {
    writeImmersivePersisted(value);
    set({ immersiveReading: value });
  },

  requestLinkConfirm: (url) =>
    new Promise((resolve) => {
      set((s) => {
        // 若已有未完成的确认，先按取消处理，避免悬挂
        if (s.linkConfirm) {
          s.linkConfirm.resolve({ confirmed: false, dontAskAgain: false });
        }
        return { linkConfirm: { url, resolve } };
      });
    }),
  resolveLinkConfirm: (result) =>
    set((s) => {
      if (s.linkConfirm) {
        s.linkConfirm.resolve(result);
      }
      return { linkConfirm: null };
    }),

  requestDeleteConfirm: (fileName) =>
    new Promise((resolve) => {
      set((s) => {
        // 若已有未完成的确认，先按取消处理
        if (s.deleteConfirm) {
          s.deleteConfirm.resolve({ confirmed: false, deleteFile: false });
        }
        return { deleteConfirm: { fileName, resolve } };
      });
    }),
  resolveDeleteConfirm: (result) =>
    set((s) => {
      if (s.deleteConfirm) {
        s.deleteConfirm.resolve(result);
      }
      return { deleteConfirm: null };
    }),
}));

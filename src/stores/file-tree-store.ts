import { create } from 'zustand';
import type { FileTreeNode } from '@/types';
import { fileService } from '@/services/tauri';

interface FileTreeState {
  /** 根文件夹路径 */
  rootPath: string | null;
  /** 文件树数据 */
  tree: FileTreeNode[];
  /** 已展开的目录路径集合 */
  expandedDirs: Set<string>;
  /** 树中当前选中的文件路径 */
  selectedFile: string | null;
  /** 当前选中的目录路径（用于新建文件/文件夹目标） */
  selectedDir: string | null;
  /** 加载状态 */
  isLoading: boolean;
  /** 最后一次用户发起的文件操作（创建/重命名/删除/复制）的时间戳
   *  用于文件监视器跳过冗余的树刷新 */
  lastUserOpTimestamp: number;

  /** 打开文件夹并加载树 */
  openFolder: (path: string) => Promise<void>;
  /** 刷新当前文件夹树 */
  refreshTree: () => Promise<void>;
  /** 关闭当前文件夹 */
  closeFolder: () => void;
  /** 切换目录的展开状态 */
  toggleDir: (path: string) => void;
  /** 在树中选择文件 */
  selectFile: (path: string | null) => void;
  /** 在树中选择目录 */
  selectDir: (path: string | null) => void;
  /** 标记用户刚执行了文件操作，以便监视器可以跳过树刷新 */
  notifyUserOp: () => void;
}

export const useFileTreeStore = create<FileTreeState>()((set, get) => ({
  rootPath: null,
  tree: [],
  expandedDirs: new Set<string>(),
  selectedFile: null,
  selectedDir: null,
  isLoading: false,
  lastUserOpTimestamp: 0,

  openFolder: async (path: string) => {
    set({ isLoading: true });
    try {
      const tree = await fileService.listDirectory(path);
      set({
        rootPath: path,
        tree,
        expandedDirs: new Set<string>(),
        selectedFile: null,
        selectedDir: null,
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to open folder:', err);
      set({ isLoading: false });
    }
  },

  refreshTree: async () => {
    const { rootPath } = get();
    if (!rootPath) return;

    set({ isLoading: true });
    try {
      const tree = await fileService.listDirectory(rootPath);
      set({ tree, isLoading: false });
    } catch (err) {
      console.error('Failed to refresh tree:', err);
      set({ isLoading: false });
    }
  },

  closeFolder: () => {
    set({
      rootPath: null,
      tree: [],
      expandedDirs: new Set<string>(),
      selectedFile: null,
      selectedDir: null,
    });
  },

  toggleDir: (path: string) => {
    set((state) => {
      const newExpanded = new Set(state.expandedDirs);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      return { expandedDirs: newExpanded, selectedDir: path, selectedFile: null };
    });
  },

  selectFile: (path: string | null) => {
    set({ selectedFile: path, selectedDir: null });
  },

  selectDir: (path: string | null) => {
    set({ selectedDir: path });
  },

  notifyUserOp: () => {
    set({ lastUserOpTimestamp: Date.now() });
  },
}));

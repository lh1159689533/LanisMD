import { create } from "zustand";
import type { FileTreeNode } from "@/types";
import { fileService } from "@/services/tauri";

interface FileTreeState {
  /** Root folder path */
  rootPath: string | null;
  /** File tree data */
  tree: FileTreeNode[];
  /** Set of expanded directory paths */
  expandedDirs: Set<string>;
  /** Currently selected file path in the tree */
  selectedFile: string | null;
  /** Currently selected directory path (for new file/folder target) */
  selectedDir: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Timestamp of the last user-initiated file operation (create/rename/delete/duplicate).
   *  Used by the file watcher to skip redundant tree refreshes. */
  lastUserOpTimestamp: number;

  /** Open a folder and load the tree */
  openFolder: (path: string) => Promise<void>;
  /** Refresh the current folder tree */
  refreshTree: () => Promise<void>;
  /** Close the current folder */
  closeFolder: () => void;
  /** Toggle a directory's expanded state */
  toggleDir: (path: string) => void;
  /** Select a file in the tree */
  selectFile: (path: string | null) => void;
  /** Select a directory in the tree */
  selectDir: (path: string | null) => void;
  /** Mark that the user just performed a file operation, so watcher can skip tree refresh */
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
      console.error("Failed to open folder:", err);
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
      console.error("Failed to refresh tree:", err);
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

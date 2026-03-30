import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_RECENT_FOLDERS = 20;

interface RecentFolder {
  path: string;
  name: string;
  timestamp: number;
}

interface RecentFoldersState {
  recentFolders: RecentFolder[];
  addRecentFolder: (folderPath: string) => void;
}

export const useRecentFoldersStore = create<RecentFoldersState>()(
  persist(
    (set, get) => ({
      recentFolders: [],

      addRecentFolder: (folderPath: string) => {
        const name =
          folderPath.split('/').filter(Boolean).pop() ??
          folderPath.split('\\').filter(Boolean).pop() ??
          folderPath;

        set(() => {
          // Remove existing entry for this path
          const filtered = get().recentFolders.filter((f) => f.path !== folderPath);

          // Add to front
          const updated = [{ path: folderPath, name, timestamp: Date.now() }, ...filtered].slice(
            0,
            MAX_RECENT_FOLDERS,
          );

          return { recentFolders: updated };
        });
      },
    }),
    {
      name: 'recent-folders-store',
      partialize: (state) => ({ recentFolders: state.recentFolders }),
    },
  ),
);

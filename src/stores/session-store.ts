import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 会话快照 Store
 *
 * 仅记录"上次会话"中需要恢复的最小信息：
 * - lastFolderPath：上次打开的根文件夹路径
 * - lastFilePath：上次打开的文件路径（仅当文件已落盘时记录）
 *
 * 注意：本 Store 只负责存储与读取，不参与启动恢复流程的判断。
 * 是否恢复由 settings.restoreSession 决定（在 App 启动 effect 中读取）。
 */
interface SessionState {
  lastFolderPath: string | null;
  lastFilePath: string | null;
  setLastFolder: (path: string | null) => void;
  setLastFile: (path: string | null) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      lastFolderPath: null,
      lastFilePath: null,
      setLastFolder: (path) => set({ lastFolderPath: path }),
      setLastFile: (path) => set({ lastFilePath: path }),
    }),
    {
      name: 'session-store',
      partialize: (state) => ({
        lastFolderPath: state.lastFolderPath,
        lastFilePath: state.lastFilePath,
      }),
    },
  ),
);

/**
 * 同步状态管理 Store
 */

import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { syncService } from '@/services/tauri/sync-service';
import type {
  SyncRepoConfig,
  SyncManifest,
  SyncProgress,
  SyncFileProgress,
  PullRequest,
  PushRequest,
} from '@/types/sync';

/** 5 分钟超时（毫秒） */
const DISMISS_TIMEOUT_MS = 5 * 60 * 1000;

interface SyncState {
  /** 已配置的远程仓库列表 */
  repos: SyncRepoConfig[];
  /** 当前同步操作状态（拉取/推送），非 null 时按钮置灰 */
  activeSync: SyncProgress | null;
  /** 当前文件夹的同步清单（从 lanismd-sync.json 读取） */
  manifest: SyncManifest | null;
  /** 仓库配置是否已加载 */
  reposLoaded: boolean;
  /** 文件级同步进度列表 */
  fileProgressList: SyncFileProgress[];
  /** 同步进度面板是否可见 */
  syncPanelVisible: boolean;
  /** 用户是否手动关闭了面板（本轮同步期间不再自动打开） */
  userClosedPanel: boolean;
  /** 最近一次同步使用的请求参数（用于失败重试） */
  lastSyncRequest:
    | { type: 'pull'; request: PullRequest }
    | { type: 'push'; request: PushRequest }
    | null;

  // Actions
  /** 加载所有仓库配置 */
  loadRepos: () => Promise<void>;
  /** 保存仓库配置 */
  saveRepo: (config: SyncRepoConfig) => Promise<void>;
  /** 删除仓库配置 */
  deleteRepo: (id: string) => Promise<void>;
  /** 拉取：弹窗确认后调用 */
  startPull: (request: PullRequest) => Promise<void>;
  /** 推送：有清单时直接推送，无清单时需传入仓库/分支配置 */
  startPush: (request: PushRequest) => Promise<void>;
  /** 加载当前文件夹的同步清单 */
  loadManifest: (localPath: string) => Promise<void>;
  /** 清除当前清单状态 */
  clearManifest: () => void;
  /** 监听 Tauri Event 更新进度，返回取消监听函数 */
  listenProgress: () => Promise<UnlistenFn>;
  /** 切换同步进度面板显隐 */
  toggleSyncPanel: () => void;
  /** 设置同步进度面板显隐 */
  setSyncPanelVisible: (visible: boolean) => void;
  /** 用户手动关闭面板（标记为用户行为，同步期间不再自动打开） */
  dismissPanel: () => void;
  /** 清除所有同步进度状态（面板关闭 + 指示器消失） */
  clearSyncState: () => void;
  /** 重试指定的失败文件 */
  retryFailedFile: (filePath: string) => Promise<void>;
}

/** 超时定时器引用，用于清理 */
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export const useSyncStore = create<SyncState>()((set, get) => ({
  repos: [],
  activeSync: null,
  manifest: null,
  reposLoaded: false,
  fileProgressList: [],
  syncPanelVisible: true,
  userClosedPanel: false,
  lastSyncRequest: null,

  loadRepos: async () => {
    try {
      const repos = await syncService.getRepos();
      set({ repos, reposLoaded: true });
    } catch (error) {
      console.error('加载同步仓库配置失败:', error);
    }
  },

  saveRepo: async (config: SyncRepoConfig) => {
    try {
      const saved = await syncService.saveRepo(config);
      const repos = get().repos;
      const idx = repos.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        const updated = [...repos];
        updated[idx] = saved;
        set({ repos: updated });
      } else {
        set({ repos: [...repos, saved] });
      }
    } catch (error) {
      console.error('保存同步仓库配置失败:', error);
      throw error;
    }
  },

  deleteRepo: async (id: string) => {
    try {
      await syncService.deleteRepo(id);
      set({ repos: get().repos.filter((r) => r.id !== id) });
    } catch (error) {
      console.error('删除同步仓库配置失败:', error);
      throw error;
    }
  },

  startPull: async (request: PullRequest) => {
    try {
      // 清除上次超时定时器
      if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
      }
      // 重置面板状态，记录请求参数
      set({
        activeSync: {
          repoId: request.configId,
          phase: 'scanning',
          current: 0,
          total: 0,
          currentFile: '',
          message: '正在准备拉取...',
        },
        fileProgressList: [],
        syncPanelVisible: true,
        userClosedPanel: false,
        lastSyncRequest: { type: 'pull', request },
      });

      await syncService.pull(request);

      // 拉取完成后重新加载清单
      await get().loadManifest(request.localPath);
    } catch (error) {
      console.error('拉取失败:', error);
      // 如果还没有开始处理任何文件（配置阶段就失败了），
      // 清除进度状态而不是显示错误面板
      if (get().fileProgressList.length === 0) {
        set({
          activeSync: null,
          syncPanelVisible: false,
          userClosedPanel: false,
          lastSyncRequest: null,
        });
      } else {
        set({
          activeSync: {
            repoId: request.configId,
            phase: 'error',
            current: 0,
            total: 0,
            currentFile: '',
            message: String(error),
          },
        });
      }
      throw error;
    }
  },

  startPush: async (request: PushRequest) => {
    try {
      // 清除上次超时定时器
      if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
      }
      const repoId = request.configId || get().manifest?.repoConfig.configId || '';
      // 重置面板状态，记录请求参数
      set({
        activeSync: {
          repoId,
          phase: 'scanning',
          current: 0,
          total: 0,
          currentFile: '',
          message: '正在准备推送...',
        },
        fileProgressList: [],
        syncPanelVisible: true,
        userClosedPanel: false,
        lastSyncRequest: { type: 'push', request },
      });

      await syncService.push(request);

      // 推送完成后重新加载清单
      await get().loadManifest(request.localPath);
    } catch (error) {
      console.error('推送失败:', error);
      // 如果还没有开始处理任何文件（配置阶段就失败了），
      // 清除进度状态而不是显示错误面板，避免右下角闪现失败进度
      if (get().fileProgressList.length === 0) {
        set({
          activeSync: null,
          syncPanelVisible: false,
          userClosedPanel: false,
          lastSyncRequest: null,
        });
      } else {
        set({
          activeSync: {
            repoId: request.configId || '',
            phase: 'error',
            current: 0,
            total: 0,
            currentFile: '',
            message: String(error),
          },
        });
      }
      throw error;
    }
  },

  loadManifest: async (localPath: string) => {
    try {
      console.log('[SyncStore] loadManifest called with path:', localPath);
      const manifest = await syncService.readManifest(localPath);
      console.log('[SyncStore] loadManifest result:', manifest);
      set({ manifest });
    } catch (error) {
      console.error('[SyncStore] 加载同步清单失败:', error);
      set({ manifest: null });
    }
  },

  clearManifest: () => {
    set({ manifest: null });
  },

  listenProgress: async () => {
    const unlisten = await listen<SyncProgress>('sync-progress', (event) => {
      const progress = event.payload;

      // 单文件完成事件：实时标记对应文件为 done
      if (progress.phase === 'file_done' && progress.currentFile) {
        const list = [...get().fileProgressList];
        const idx = list.findIndex((f) => f.path === progress.currentFile);
        if (idx >= 0) {
          list[idx] = { ...list[idx], status: 'done', percent: 100 };
        }
        // 更新总进度中的 current 为已完成数
        const currentSync = get().activeSync;
        set({
          fileProgressList: list,
          activeSync: currentSync
            ? { ...currentSync, current: progress.current, total: progress.total }
            : null,
        });
        return;
      }

      // 单文件失败事件：实时标记对应文件为 failed
      if (progress.phase === 'file_failed' && progress.currentFile) {
        const list = [...get().fileProgressList];
        const idx = list.findIndex((f) => f.path === progress.currentFile);
        if (idx >= 0) {
          list[idx] = { ...list[idx], status: 'failed', percent: 0 };
        } else {
          // 文件读取就失败，可能还没 upsert 到列表中
          const currentPhase = get().activeSync?.phase;
          const direction: 'upload' | 'download' =
            currentPhase === 'uploading' ? 'upload' : 'download';
          list.push({
            path: progress.currentFile,
            direction,
            status: 'failed',
            percent: 0,
          });
        }
        set({ fileProgressList: list });
        return;
      }

      // 正在处理某个文件（uploading/downloading）：upsert 为 syncing
      if (
        progress.currentFile &&
        (progress.phase === 'uploading' || progress.phase === 'downloading')
      ) {
        const direction: 'upload' | 'download' =
          progress.phase === 'uploading' ? 'upload' : 'download';
        const list = [...get().fileProgressList];
        const idx = list.findIndex((f) => f.path === progress.currentFile);
        const entry: import('@/types/sync').SyncFileProgress = {
          path: progress.currentFile,
          direction,
          status: 'syncing',
          percent: 0,
        };
        if (idx >= 0) {
          // 仅当文件还未标记完成/失败时才更新为 syncing
          if (list[idx].status !== 'done' && list[idx].status !== 'failed') {
            list[idx] = entry;
          }
        } else {
          list.push(entry);
        }
        set({ fileProgressList: list });
      }

      if (progress.phase === 'completed') {
        // 将所有仍处于 syncing 的文件标记为完成（兜底逻辑）
        const doneList = get().fileProgressList.map((f) =>
          f.status === 'syncing' ? { ...f, status: 'done' as const, percent: 100 } : f,
        );
        set({ fileProgressList: doneList });

        // 完成后不立即清除，启动 5 分钟超时定时器
        if (dismissTimer) {
          clearTimeout(dismissTimer);
        }
        dismissTimer = setTimeout(() => {
          get().clearSyncState();
          dismissTimer = null;
        }, DISMISS_TIMEOUT_MS);
      } else if (progress.phase === 'error') {
        // 将当前正在同步的文件标记为失败
        const failList = get().fileProgressList.map((f) =>
          f.status === 'syncing' ? { ...f, status: 'failed' as const } : f,
        );
        set({ fileProgressList: failList });

        // 有失败条目时不自动清除，保持面板打开让用户看到失败文件
        // 不启动超时定时器
      }

      set({ activeSync: progress });
    });
    return unlisten;
  },

  toggleSyncPanel: () => {
    const next = !get().syncPanelVisible;
    set({ syncPanelVisible: next });
    // 如果用户手动关闭，标记为用户行为
    if (!next) {
      set({ userClosedPanel: true });
    }
  },

  setSyncPanelVisible: (visible: boolean) => {
    set({ syncPanelVisible: visible });
  },

  dismissPanel: () => {
    set({ syncPanelVisible: false, userClosedPanel: true });
  },

  clearSyncState: () => {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    set({
      activeSync: null,
      fileProgressList: [],
      syncPanelVisible: false,
      userClosedPanel: false,
      lastSyncRequest: null,
    });
  },

  retryFailedFile: async (filePath: string) => {
    const { lastSyncRequest, fileProgressList } = get();
    if (!lastSyncRequest) return;

    // 将该文件标记为重新同步中
    const updatedList = fileProgressList.map((f) =>
      f.path === filePath ? { ...f, status: 'syncing' as const, percent: 0 } : f,
    );
    set({ fileProgressList: updatedList });

    // 重新触发同步（整个同步流程会再次运行，Tauri 后端会跳过已完成的文件）
    try {
      if (lastSyncRequest.type === 'pull') {
        await syncService.pull(lastSyncRequest.request);
      } else {
        await syncService.push(lastSyncRequest.request);
      }
    } catch (error) {
      console.error('重试失败:', error);
      // 将该文件重新标记为失败
      const failList = get().fileProgressList.map((f) =>
        f.path === filePath ? { ...f, status: 'failed' as const } : f,
      );
      set({ fileProgressList: failList });
    }
  },
}));

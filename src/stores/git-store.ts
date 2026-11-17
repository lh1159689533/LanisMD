/**
 * Git 状态管理 Store：仓库信息、更改列表、提交历史、diff 目标与各类操作
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                         |
 * | v1.0.0 | 初始实现：替代旧 sync-store   | REQ: Git 改造 TECH: 系统 git |
 * /@changelog
 *
 * @author hhhuilli
 */

import { create } from 'zustand';
import { fileService } from '@/services/tauri';
import { gitErrorMessage, gitService, toEntry } from '@/services/tauri/git-service';
import { useFileStore } from '@/stores/file-store';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useUIStore } from '@/stores/ui-store';
import type {
  BranchInfo,
  ChangedFile,
  CommitInfo,
  ConflictStrategy,
  DiffTarget,
  GitAvailability,
  PullResult,
  RepoInfo,
} from '@/types/git';

/** 每页提交数 */
const HISTORY_PAGE_SIZE = 50;
/** 文件系统事件触发刷新的防抖时间 */
const REFRESH_DEBOUNCE_MS = 800;

export type GitOperation = 'pull' | 'commit' | 'checkout' | 'discard' | 'resolve' | null;

interface GitState {
  availability: GitAvailability | null;
  /** 当前打开的文件夹所在仓库；null 表示不是 Git 仓库 */
  repo: RepoInfo | null;
  /** 当前打开的文件夹（用于路径换算） */
  folderPath: string | null;
  changes: ChangedFile[];
  changesLoading: boolean;
  history: CommitInfo[];
  historyLoading: boolean;
  historyHasMore: boolean;
  /** 历史视图中展开的提交 */
  expandedCommits: Set<string>;
  commitFiles: Record<string, ChangedFile[]>;
  /** 主区域 diff 面板展示目标，非 null 时覆盖编辑器 */
  diffTarget: DiffTarget | null;
  operation: GitOperation;
  lastSyncAt: number | null;
  commitDialogOpen: boolean;
  cloneDialogOpen: boolean;

  checkAvailability: () => Promise<GitAvailability>;
  /** 打开的文件夹变化时调用 */
  attach: (folderPath: string | null) => Promise<void>;
  refresh: () => Promise<void>;
  scheduleRefresh: () => void;
  loadHistory: (reset?: boolean) => Promise<void>;
  toggleCommit: (hash: string) => Promise<void>;
  openDiff: (target: DiffTarget) => void;
  closeDiff: () => void;
  pull: (options?: { silent?: boolean }) => Promise<PullResult | null>;
  /**
   * Commit & Push（原子）：成功返回 null，失败返回错误信息（推送失败时提交已回滚）。
   * silent 为 true 时不弹出错误提示，由调用方自行展示。
   */
  commit: (
    files: ChangedFile[],
    message: string,
    options?: { silent?: boolean },
  ) => Promise<string | null>;
  discard: (files: ChangedFile[]) => Promise<void>;
  resolveConflict: (file: ChangedFile, strategy: ConflictStrategy) => Promise<void>;
  abortMerge: () => Promise<void>;
  listBranches: () => Promise<BranchInfo[]>;
  checkout: (branch: BranchInfo) => Promise<void>;
  setCommitDialogOpen: (open: boolean) => void;
  setCloneDialogOpen: (open: boolean) => void;
  /** 仓库相对路径 -> 绝对路径（优先映射到打开的文件夹，保证与文件树路径一致） */
  absPath: (relPath: string) => string;
  /** 仓库相对路径 -> 相对打开文件夹的显示路径 */
  displayPath: (relPath: string) => string;
  /**
   * 仓库相对路径 -> 所在目录的显示文本，与文件树列表模式一致：
   * 根目录下为「文件夹名」，子目录为「文件夹名/子目录」
   */
  displayDir: (relPath: string) => string;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
/** 防止并发 refresh 时旧结果覆盖新结果 */
let refreshSeq = 0;

function toast(type: 'info' | 'success' | 'warning' | 'error', message: string) {
  useUIStore.getState().addToast({ type, message, duration: type === 'success' ? 2500 : 3500 });
}

/** 操作前落盘当前未保存的文件，避免提交/同步遗漏或覆盖编辑内容 */
async function flushCurrentFile(): Promise<void> {
  const current = useFileStore.getState().currentFile;
  if (!current?.isDirty || !current.filePath) return;
  await fileService.writeFile({
    path: current.filePath,
    content: current.content,
    encoding: current.encoding,
  });
  useFileStore.getState().markSaved();
}

/** 同步后若当前文件内容在磁盘上变化，静默重新加载 */
async function reloadCurrentFile(): Promise<void> {
  const current = useFileStore.getState().currentFile;
  if (!current?.filePath || current.isDirty) return;
  try {
    const result = await fileService.readFile({ path: current.filePath, encoding: 'utf-8' });
    if (result.content !== useFileStore.getState().currentFile?.content) {
      useFileStore.getState().reloadContent(result.content);
    }
  } catch {
    // 文件可能已被远程删除，保持现状
  }
}

/** 推送是否因远程有新提交被拒绝（需先同步） */
export function isPushRejected(message: string): boolean {
  return message.includes('推送被拒绝');
}

function joinPath(base: string, rel: string): string {
  if (!rel) return base;
  return `${base.replace(/[\\/]+$/, '')}/${rel}`;
}

export const useGitStore = create<GitState>()((set, get) => ({
  availability: null,
  repo: null,
  folderPath: null,
  changes: [],
  changesLoading: false,
  history: [],
  historyLoading: false,
  historyHasMore: true,
  expandedCommits: new Set<string>(),
  commitFiles: {},
  diffTarget: null,
  operation: null,
  lastSyncAt: null,
  commitDialogOpen: false,
  cloneDialogOpen: false,

  checkAvailability: async () => {
    const availability = await gitService.check();
    set({ availability });
    return availability;
  },

  attach: async (folderPath) => {
    set({
      folderPath,
      repo: null,
      changes: [],
      history: [],
      historyHasMore: true,
      expandedCommits: new Set(),
      commitFiles: {},
      diffTarget: null,
      lastSyncAt: null,
    });
    if (!folderPath) return;
    if (!get().availability) {
      await get()
        .checkAvailability()
        .catch(() => null);
    }
    await get().refresh();
  },

  refresh: async () => {
    const { folderPath } = get();
    if (!folderPath) return;
    const seq = ++refreshSeq;
    try {
      const repo = await gitService.repoInfo(folderPath);
      if (seq !== refreshSeq || get().folderPath !== folderPath) return;
      if (!repo) {
        set({ repo: null, changes: [] });
        const panel = useUIStore.getState().sidebarPanel;
        if (panel === 'changes' || panel === 'history') {
          useUIStore.getState().setSidebarPanel('files');
        }
        return;
      }
      set({ repo, changesLoading: true });
      const changes = await gitService.status(repo.root, repo.scope);
      if (seq !== refreshSeq) return;
      set({ changes, changesLoading: false });
    } catch (error) {
      console.error('[git] 刷新仓库状态失败:', error);
      set({ changesLoading: false });
    }
  },

  scheduleRefresh: () => {
    if (!get().repo) return;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void get().refresh();
      // 历史视图打开时同步刷新首页
      if (useUIStore.getState().sidebarPanel === 'history') {
        void get().loadHistory(true);
      }
    }, REFRESH_DEBOUNCE_MS);
  },

  loadHistory: async (reset = false) => {
    const { repo, history, historyLoading } = get();
    if (!repo || (historyLoading && !reset)) return;
    const skip = reset ? 0 : history.length;
    set({ historyLoading: true });
    try {
      const page = await gitService.log(repo.root, repo.scope, skip, HISTORY_PAGE_SIZE);
      set({
        history: reset ? page : [...get().history, ...page],
        historyHasMore: page.length === HISTORY_PAGE_SIZE,
        historyLoading: false,
      });
    } catch (error) {
      set({ historyLoading: false });
      toast('error', `加载提交历史失败：${gitErrorMessage(error)}`);
    }
  },

  toggleCommit: async (hash) => {
    const { repo, expandedCommits, commitFiles } = get();
    if (!repo) return;
    const next = new Set(expandedCommits);
    if (next.has(hash)) {
      next.delete(hash);
      set({ expandedCommits: next });
      return;
    }
    next.add(hash);
    set({ expandedCommits: next });
    if (commitFiles[hash]) return;
    try {
      const files = await gitService.commitFiles(repo.root, repo.scope, hash);
      set({ commitFiles: { ...get().commitFiles, [hash]: files } });
    } catch (error) {
      toast('error', `读取提交内容失败：${gitErrorMessage(error)}`);
    }
  },

  openDiff: (target) => set({ diffTarget: target }),
  closeDiff: () => set({ diffTarget: null }),

  pull: async (options) => {
    const { repo, operation } = get();
    if (!repo || operation) return null;
    set({ operation: 'pull' });
    try {
      await flushCurrentFile();
      const result = await gitService.pull(repo.root);
      set({ lastSyncAt: Date.now() });
      if (result.conflicts.length > 0) {
        toast('warning', result.summary);
        useUIStore.getState().setSidebarPanel('changes');
      } else if (!options?.silent || result.updated) {
        toast(result.updated ? 'success' : 'info', result.summary);
      }
      if (result.updated) {
        await useFileTreeStore.getState().refreshTree();
        await reloadCurrentFile();
      }
      return result;
    } catch (error) {
      // 自动同步失败不打扰用户，仅记录日志
      if (options?.silent) {
        console.warn('[git] 自动同步失败:', error);
      } else {
        toast('error', `同步失败：${gitErrorMessage(error)}`);
      }
      return null;
    } finally {
      set({ operation: null });
      await get().refresh();
    }
  },

  commit: async (files, message, options) => {
    const { repo, operation } = get();
    if (!repo) return '当前文件夹不是 Git 仓库';
    if (operation) return '有其他 Git 操作正在进行，请稍后再试';
    set({ operation: 'commit' });
    try {
      await flushCurrentFile();
      await gitService.commit(repo.root, files.map(toEntry), message);
      toast('success', '已提交并推送');
      if (useUIStore.getState().sidebarPanel === 'history') {
        void get().loadHistory(true);
      }
      return null;
    } catch (error) {
      const message = gitErrorMessage(error);
      if (!options?.silent) {
        useUIStore.getState().addToast({
          type: 'error',
          message: `提交失败：${message}`,
          actions: isPushRejected(message)
            ? [{ label: '同步', primary: true, onClick: () => void get().pull() }]
            : undefined,
        });
      }
      return message;
    } finally {
      set({ operation: null });
      await get().refresh();
    }
  },

  discard: async (files) => {
    const { repo } = get();
    if (!repo || files.length === 0) return;
    set({ operation: 'discard' });
    try {
      await gitService.discard(repo.root, files.map(toEntry));
      const diff = get().diffTarget;
      if (diff?.kind === 'working' && files.some((f) => f.path === diff.file.path)) {
        set({ diffTarget: null });
      }
      await useFileTreeStore.getState().refreshTree();
      await reloadCurrentFile();
    } catch (error) {
      toast('error', `放弃更改失败：${gitErrorMessage(error)}`);
    } finally {
      set({ operation: null });
      await get().refresh();
    }
  },

  resolveConflict: async (file, strategy) => {
    const { repo } = get();
    if (!repo) return;
    set({ operation: 'resolve' });
    try {
      await gitService.resolveConflict(repo.root, file.path, strategy);
      await reloadCurrentFile();
    } catch (error) {
      toast('error', `解决冲突失败：${gitErrorMessage(error)}`);
    } finally {
      set({ operation: null });
      await get().refresh();
    }
  },

  abortMerge: async () => {
    const { repo } = get();
    if (!repo) return;
    try {
      await gitService.abortMerge(repo.root);
      toast('info', '已放弃合并，恢复到同步前的状态');
      await useFileTreeStore.getState().refreshTree();
      await reloadCurrentFile();
    } catch (error) {
      toast('error', `放弃合并失败：${gitErrorMessage(error)}`);
    } finally {
      await get().refresh();
    }
  },

  listBranches: async () => {
    const { repo } = get();
    if (!repo) return [];
    try {
      return await gitService.branches(repo.root);
    } catch (error) {
      toast('error', `读取分支失败：${gitErrorMessage(error)}`);
      return [];
    }
  },

  checkout: async (branch) => {
    const { repo, operation } = get();
    if (!repo || operation || branch.current) return;
    set({ operation: 'checkout' });
    try {
      await flushCurrentFile();
      await gitService.checkout(repo.root, branch.name, branch.remote);
      toast('success', `已切换到 ${branch.name}`);
      set({ diffTarget: null, history: [], expandedCommits: new Set(), commitFiles: {} });
      await useFileTreeStore.getState().refreshTree();
      await reloadCurrentFile();
    } catch (error) {
      toast('error', `切换分支失败：${gitErrorMessage(error)}`);
    } finally {
      set({ operation: null });
      await get().refresh();
      if (useUIStore.getState().sidebarPanel === 'history') {
        void get().loadHistory(true);
      }
    }
  },

  setCommitDialogOpen: (open) => set({ commitDialogOpen: open }),
  setCloneDialogOpen: (open) => set({ cloneDialogOpen: open }),

  absPath: (relPath) => {
    const { repo, folderPath } = get();
    if (!repo) return relPath;
    if (folderPath && repo.scope) {
      const prefix = `${repo.scope}/`;
      if (relPath.startsWith(prefix)) return joinPath(folderPath, relPath.slice(prefix.length));
    } else if (folderPath && !repo.scope) {
      return joinPath(folderPath, relPath);
    }
    return joinPath(repo.root, relPath);
  },

  displayPath: (relPath) => {
    const scope = get().repo?.scope;
    if (scope && relPath.startsWith(`${scope}/`)) return relPath.slice(scope.length + 1);
    return relPath;
  },

  displayDir: (relPath) => {
    const { folderPath, repo, displayPath } = get();
    const base = folderPath ?? repo?.root ?? '';
    const rootName = base.split(/[\\/]/).filter(Boolean).pop() ?? base;
    const rel = displayPath(relPath);
    const idx = rel.lastIndexOf('/');
    const subDir = idx < 0 ? '' : rel.slice(0, idx);
    return subDir ? `${rootName}/${subDir}` : rootName;
  },
}));

// 切换编辑文件或离开 Git 视图时关闭 diff 面板，让编辑器回到前台
useFileStore.subscribe((state, prev) => {
  if (
    state.currentFile?.filePath !== prev.currentFile?.filePath &&
    useGitStore.getState().diffTarget
  ) {
    useGitStore.getState().closeDiff();
  }
});
useUIStore.subscribe((state, prev) => {
  if (state.sidebarPanel === prev.sidebarPanel) return;
  if (state.sidebarPanel !== 'changes' && state.sidebarPanel !== 'history') {
    useGitStore.getState().closeDiff();
  }
  if (state.sidebarPanel === 'history' && useGitStore.getState().history.length === 0) {
    void useGitStore.getState().loadHistory(true);
  }
});

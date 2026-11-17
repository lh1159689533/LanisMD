/**
 * Git 自动化：
 * 1. 打开的文件夹变化时挂载仓库；
 * 2. 自动同步：按间隔将远程拉取到本地；
 * 3. 自动提交：停止编辑达到设定时长后，自动 Commit & Push 全部更改。
 *
 * @changelog
 * | 版本   | 变更说明                    | 关联                              |
 * | v1.0.0 | 初始实现：自动同步与空闲自动提交 | REQ: Git 改造 TECH: 自动同步/提交 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect } from 'react';
import { generateCommitMessage, isAiCommitAvailable } from '@/services/ai/commit-message';
import { toEntry } from '@/services/tauri/git-service';
import { useFileStore } from '@/stores/file-store';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useGitStore } from '@/stores/git-store';
import { useSettingsStore } from '@/stores/settings-store';

const MINUTE_MS = 60 * 1000;

/** 自动提交说明：优先 AI，失败或未开启时使用模板 */
async function buildAutoCommitMessage(): Promise<string> {
  const { repo, changes } = useGitStore.getState();
  const fallback = `chore: 自动提交 ${changes.length} 个文件的更改`;
  if (!repo) return fallback;
  try {
    if (await isAiCommitAvailable()) {
      const message = await generateCommitMessage(repo.root, changes.map(toEntry));
      if (message) return message;
    }
  } catch (error) {
    console.warn('[git] AI 生成自动提交说明失败，使用模板:', error);
  }
  return fallback;
}

async function runAutoCommit(): Promise<void> {
  const git = useGitStore.getState();
  if (!git.repo || git.operation || git.repo.merging || git.commitDialogOpen) return;
  await git.refresh();
  const { changes } = useGitStore.getState();
  // 有冲突时不自动提交，交由用户处理
  if (changes.length === 0 || changes.some((f) => f.status === 'conflicted')) return;
  const message = await buildAutoCommitMessage();
  await useGitStore.getState().commit(useGitStore.getState().changes, message);
}

export function useGitAutomation() {
  const rootPath = useFileTreeStore((s) => s.rootPath);
  const hasRepo = useGitStore((s) => s.repo !== null);
  const autoSync = useSettingsStore((s) => s.config.git.autoSync);
  const autoCommit = useSettingsStore((s) => s.config.git.autoCommit);

  // 1. 挂载仓库
  useEffect(() => {
    void useGitStore.getState().attach(rootPath);
  }, [rootPath]);

  // 2. 自动同步（打开仓库时先同步一次）
  useEffect(() => {
    if (!hasRepo || !autoSync.enabled) return;
    const interval = Math.max(1, autoSync.intervalMinutes) * MINUTE_MS;
    void useGitStore.getState().pull({ silent: true });
    const timer = setInterval(() => {
      void useGitStore.getState().pull({ silent: true });
    }, interval);
    return () => clearInterval(timer);
  }, [hasRepo, rootPath, autoSync.enabled, autoSync.intervalMinutes]);

  // 3. 空闲自动提交：每次编辑重置计时器
  useEffect(() => {
    if (!hasRepo || !autoCommit.enabled) return;
    const idle = Math.max(1, autoCommit.idleMinutes) * MINUTE_MS;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useFileStore.subscribe((state, prev) => {
      const current = state.currentFile;
      if (!current || current.content === prev.currentFile?.content) return;
      if (current.filePath !== prev.currentFile?.filePath) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void runAutoCommit();
      }, idle);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [hasRepo, rootPath, autoCommit.enabled, autoCommit.idleMinutes]);
}

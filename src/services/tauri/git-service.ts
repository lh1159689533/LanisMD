/**
 * Git 服务层：对 src-tauri/src/commands/git_commands.rs 的薄封装
 *
 * @changelog
 * | 版本   | 变更说明                    | 关联                         |
 * | v1.0.0 | 初始实现：替代旧 sync-service | REQ: Git 改造 TECH: 系统 git |
 * /@changelog
 *
 * @author hhhuilli
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  BranchInfo,
  ChangedFile,
  CloneProgress,
  CloneRequest,
  CommitInfo,
  CommitResult,
  ConflictStrategy,
  FileEntryRequest,
  FileVersions,
  GitAvailability,
  GitCredentialView,
  PullResult,
  RemoteBranches,
  RepoInfo,
  SaveCredentialRequest,
} from '@/types/git';

/** 将后端错误（{ code, message } 或字符串）转为可读文本 */
export function gitErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** 将 ChangedFile 转为后端请求条目 */
export function toEntry(file: ChangedFile): FileEntryRequest {
  return { path: file.path, oldPath: file.oldPath, status: file.status };
}

class GitService {
  check(): Promise<GitAvailability> {
    return invoke('git_check');
  }

  installTools(): Promise<boolean> {
    return invoke('git_install_tools');
  }

  repoInfo(path: string): Promise<RepoInfo | null> {
    return invoke('git_repo_info', { path });
  }

  status(repoPath: string, scope: string): Promise<ChangedFile[]> {
    return invoke('git_status', { repoPath, scope });
  }

  log(repoPath: string, scope: string, skip: number, limit: number): Promise<CommitInfo[]> {
    return invoke('git_log', { repoPath, scope, skip, limit });
  }

  commitFiles(repoPath: string, scope: string, hash: string): Promise<ChangedFile[]> {
    return invoke('git_commit_files', { repoPath, scope, hash });
  }

  fileVersions(request: {
    repoPath: string;
    filePath: string;
    oldPath: string | null;
    status: string;
    commit: string | null;
  }): Promise<FileVersions> {
    return invoke('git_file_versions', { request });
  }

  diffText(repoPath: string, files: FileEntryRequest[]): Promise<string> {
    return invoke('git_diff_text', { repoPath, files });
  }

  /** Commit & Push 原子操作：推送失败时后端会撤销本次提交 */
  commit(repoPath: string, files: FileEntryRequest[], message: string): Promise<CommitResult> {
    return invoke('git_commit', { repoPath, files, message });
  }

  push(repoPath: string): Promise<void> {
    return invoke('git_push', { repoPath });
  }

  pull(repoPath: string): Promise<PullResult> {
    return invoke('git_pull', { repoPath });
  }

  discard(repoPath: string, files: FileEntryRequest[]): Promise<void> {
    return invoke('git_discard', { repoPath, files });
  }

  resolveConflict(repoPath: string, filePath: string, strategy: ConflictStrategy): Promise<void> {
    return invoke('git_resolve_conflict', { repoPath, filePath, strategy });
  }

  abortMerge(repoPath: string): Promise<void> {
    return invoke('git_abort_merge', { repoPath });
  }

  branches(repoPath: string): Promise<BranchInfo[]> {
    return invoke('git_branches', { repoPath });
  }

  checkout(repoPath: string, name: string, remote: boolean): Promise<void> {
    return invoke('git_checkout', { repoPath, name, remote });
  }

  setIdentity(repoPath: string, name: string, email: string, global: boolean): Promise<void> {
    return invoke('git_set_identity', { repoPath, name, email, global });
  }

  lsRemote(url: string): Promise<RemoteBranches> {
    return invoke('git_ls_remote', { url });
  }

  clone(request: CloneRequest): Promise<string> {
    return invoke('git_clone', { request });
  }

  cancelClone(cloneId: string): Promise<void> {
    return invoke('git_cancel_clone', { cloneId });
  }

  onCloneProgress(handler: (p: CloneProgress) => void): Promise<UnlistenFn> {
    return listen<CloneProgress>('git-clone-progress', (e) => handler(e.payload));
  }

  getCredentials(): Promise<GitCredentialView[]> {
    return invoke('git_get_credentials');
  }

  saveCredential(request: SaveCredentialRequest): Promise<GitCredentialView> {
    return invoke('git_save_credential', { request });
  }

  deleteCredential(id: string): Promise<void> {
    return invoke('git_delete_credential', { id });
  }
}

export const gitService = new GitService();

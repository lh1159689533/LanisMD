/**
 * Git 相关类型定义（与 src-tauri/src/services/git/types.rs 字段对齐）
 *
 * @changelog
 * | 版本   | 变更说明                   | 关联                                    |
 * | v1.0.0 | 初始实现：替代旧 sync 类型   | REQ: Git 改造 TECH: 系统 git            |
 * | v1.1.0 | 分支条目补充末端提交摘要字段 | REQ: 分支列表详情展示 TECH: for-each-ref |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 系统 git 可用性 */
export interface GitAvailability {
  installed: boolean;
  version: string | null;
  path: string | null;
}

/** 仓库概要信息 */
export interface RepoInfo {
  /** 仓库根目录 */
  root: string;
  /** 打开的文件夹相对仓库根目录的路径，相同则为空串 */
  scope: string;
  branch: string | null;
  detached: boolean;
  headShort: string | null;
  hasCommits: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  remoteName: string | null;
  remoteUrl: string | null;
  webUrl: string | null;
  merging: boolean;
  userName: string | null;
  userEmail: string | null;
}

/** 变更状态 */
export type ChangeStatus =
  'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted';

/** 变更文件（路径均相对仓库根目录） */
export interface ChangedFile {
  path: string;
  oldPath: string | null;
  status: ChangeStatus;
  additions: number | null;
  deletions: number | null;
  binary: boolean;
}

/** 提交记录 */
export interface CommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  /** Unix 秒 */
  timestamp: number;
  added: number;
  modified: number;
  deleted: number;
}

/** 文件两个版本（diff 面板） */
export interface FileVersions {
  original: string | null;
  modified: string | null;
  binary: boolean;
  originalDataUrl: string | null;
  modifiedDataUrl: string | null;
}

/** 提交 / 放弃更改时传给后端的文件条目 */
export interface FileEntryRequest {
  path: string;
  oldPath: string | null;
  status: ChangeStatus;
}

/** Commit & Push 结果；推送失败时后端已回滚提交并以错误返回 */
export interface CommitResult {
  commitHash: string;
}

export interface PullResult {
  updated: boolean;
  conflicts: string[];
  summary: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  remote: boolean;
  /** 末端提交短哈希，字段缺失时为 null */
  shortHash: string | null;
  /** 末端提交作者 */
  authorName: string | null;
  /** 末端提交时间（Unix 秒） */
  timestamp: number | null;
  /** 末端提交标题 */
  subject: string | null;
}

export interface RemoteBranches {
  defaultBranch: string | null;
  branches: string[];
}

export interface CloneProgress {
  cloneId: string;
  phase: string;
  percent: number | null;
  message: string;
}

export interface CloneRequest {
  cloneId: string;
  url: string;
  targetDir: string;
  branch: string | null;
}

/** HTTPS 凭据视图（不含 token） */
export interface GitCredentialView {
  id: string;
  host: string;
  username: string;
  hasToken: boolean;
  updatedAt: string;
}

export interface SaveCredentialRequest {
  id: string | null;
  host: string;
  username: string;
  /** 为 null 表示保留原 token */
  token: string | null;
}

/** 冲突解决策略 */
export type ConflictStrategy = 'local' | 'remote' | 'mark';

/** diff 面板当前展示的目标 */
export type DiffTarget =
  | { kind: 'working'; file: ChangedFile }
  | { kind: 'commit'; commit: CommitInfo; file: ChangedFile };

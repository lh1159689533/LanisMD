/**
 * 同步功能前端类型定义
 */

/** 远程仓库平台 */
export type Platform = 'github' | 'gitee';

/** 远程仓库配置（设置页面管理） */
export interface SyncRepoConfig {
  /** UUID */
  id: string;
  /** 用户自定义名称 */
  name: string;
  /** 平台类型 */
  platform: Platform;
  /** Personal Access Token */
  token: string;
  /** 仓库拥有者 */
  owner: string;
  /** 仓库名 */
  repo: string;
  /** 目标分支，默认 "main" */
  branch: string;
  /** 绑定的本地文件夹路径 */
  localPath: string | null;
  /** 白名单 glob 模式 */
  includePatterns: string[];
  /** 黑名单 glob 模式 */
  excludePatterns: string[];
  /** 创建时间 ISO 8601 */
  createdAt: string;
  /** 更新时间 ISO 8601 */
  updatedAt: string;
}

/** 同步清单中的仓库配置快照（脱敏，不含 token） */
export interface SyncManifestRepoConfig {
  platform: Platform;
  owner: string;
  repo: string;
  configId: string;
}

/** 单个文件的同步记录 */
export interface SyncFileEntry {
  /** 文件 MD5（始终与远端文件内容一致） */
  md5: string;
  /** 远程文件 SHA */
  remoteSha: string | null;
  /** 文件大小(字节) */
  size: number;
  /** 该文件的同步时间 */
  syncedAt: string;
}

/** 本地同步清单（lanismd-sync.json） */
export interface SyncManifest {
  /** 仓库连接信息快照 */
  repoConfig: SyncManifestRepoConfig;
  /** 同步分支 */
  branch: string;
  /** 白名单 glob */
  includePatterns: string[];
  /** 黑名单 glob */
  excludePatterns: string[];
  /** 上次同步时间 ISO 8601 */
  lastSyncAt: string | null;
  /** 上次操作方向 */
  syncDirection: 'pull' | 'push';
  /** 文件条目：相对路径 -> 文件信息 */
  fileEntries: Record<string, SyncFileEntry>;
}

/** 远程目录浏览条目 */
export interface RemoteEntry {
  /** 文件/目录名 */
  name: string;
  /** 相对路径 */
  path: string;
  /** 类型 */
  entryType: 'file' | 'dir';
  /** 文件大小（目录为 0） */
  size: number;
  /** 文件 SHA */
  sha: string | null;
}

/** 拉取请求参数 */
export interface PullRequest {
  /** 仓库配置 ID */
  configId: string;
  /** 目标分支 */
  branch: string;
  /** 本地目标文件夹路径 */
  localPath: string;
  /** 白名单 glob */
  includePatterns: string[];
  /** 黑名单 glob */
  excludePatterns: string[];
}

/** 推送请求参数 */
export interface PushRequest {
  /** 本地文件夹路径 */
  localPath: string;
  /** 仓库配置 ID（无清单时必填） */
  configId?: string;
  /** 目标分支（无清单时必填） */
  branch?: string;
  /** 白名单 glob */
  includePatterns?: string[];
  /** 黑名单 glob */
  excludePatterns?: string[];
}

/** 同步操作结果 */
export interface SyncResult {
  /** 是否成功 */
  success: boolean;
  /** 操作类型 */
  operation: 'pull' | 'push';
  /** 处理的文件数 */
  filesProcessed: number;
  /** 跳过的文件数 */
  filesSkipped: number;
  /** 失败的文件数 */
  filesFailed: number;
  /** 错误信息 */
  errorMessage: string | null;
}

/** 差异对比结果 */
export interface DiffResult {
  /** 新增的文件 */
  added: string[];
  /** 修改的文件 */
  modified: string[];
  /** 删除的文件 */
  deleted: string[];
  /** 未变更的文件 */
  unchanged: string[];
}

/** 单个文件的同步进度状态 */
export type SyncFileStatus = 'waiting' | 'syncing' | 'done' | 'failed';

/** 单个文件的同步进度条目 */
export interface SyncFileProgress {
  /** 文件相对路径 */
  path: string;
  /** 操作方向：上传/下载 */
  direction: 'upload' | 'download';
  /** 文件状态 */
  status: SyncFileStatus;
  /** 进度百分比 0-100 */
  percent: number;
  /** 失败原因（仅 status 为 failed 时有值） */
  errorMessage?: string;
}

/** 同步进度事件 */
export interface SyncProgress {
  /** 仓库配置 ID */
  repoId: string;
  /** 阶段：file_done/file_failed 为单文件完成/失败的实时通知 */
  phase:
    | 'scanning'
    | 'uploading'
    | 'downloading'
    | 'file_done'
    | 'file_failed'
    | 'completed'
    | 'error';
  /** 当前进度（file_done/file_failed 时为已成功完成的文件数） */
  current: number;
  /** 总数 */
  total: number;
  /** 当前处理的文件 */
  currentFile: string;
  /** 附加信息 */
  message: string | null;
}

// ---------------------------------------------------------------------------
// 同步白名单/黑名单默认值
// ---------------------------------------------------------------------------

/** 默认白名单 glob 模式（数组形式，用于配置存储） */
export const DEFAULT_INCLUDE_PATTERNS: string[] = [
  '**/*.md',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.svg',
  '**/*.webp',
];

/** 默认黑名单 glob 模式（数组形式，用于配置存储） */
export const DEFAULT_EXCLUDE_PATTERNS: string[] = ['**/node_modules/**', '**/.git/**'];

/** 默认白名单（逗号分隔字符串形式，用于表单输入） */
export const DEFAULT_INCLUDE_PATTERNS_STR = DEFAULT_INCLUDE_PATTERNS.join(', ');

/** 默认黑名单（逗号分隔字符串形式，用于表单输入） */
export const DEFAULT_EXCLUDE_PATTERNS_STR = DEFAULT_EXCLUDE_PATTERNS.join(', ');

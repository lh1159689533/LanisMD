/**
 * 同步服务前端封装
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  SyncRepoConfig,
  RemoteEntry,
  PullRequest,
  PushRequest,
  SyncResult,
  DiffResult,
  PullPreviewResult,
  SyncManifest,
  TestConnectionResult,
} from '@/types/sync';

/**
 * 同步服务层，封装所有 Tauri 后端同步命令的调用
 */
class SyncService {
  /** 获取所有仓库配置 */
  async getRepos(): Promise<SyncRepoConfig[]> {
    return invoke<SyncRepoConfig[]>('sync_get_repos');
  }

  /** 保存仓库配置（新增或更新） */
  async saveRepo(config: SyncRepoConfig): Promise<SyncRepoConfig> {
    return invoke<SyncRepoConfig>('sync_save_repo', { config });
  }

  /** 删除仓库配置 */
  async deleteRepo(id: string): Promise<void> {
    return invoke<void>('sync_delete_repo', { id });
  }

  /** 测试仓库连接 */
  async testConnection(config: SyncRepoConfig): Promise<TestConnectionResult> {
    return invoke<TestConnectionResult>('sync_test_connection', { config });
  }

  /** 获取远程仓库分支列表 */
  async listBranches(configId: string): Promise<string[]> {
    return invoke<string[]>('sync_list_branches', { configId });
  }

  /** 浏览远程目录 */
  async browseRemote(configId: string, branch?: string, path?: string): Promise<RemoteEntry[]> {
    return invoke<RemoteEntry[]>('sync_browse_remote', {
      configId,
      branch: branch ?? null,
      path: path ?? null,
    });
  }

  /** 预览拉取（返回将要下载的文件列表，不实际下载） */
  async previewPull(request: PullRequest): Promise<PullPreviewResult> {
    return invoke<PullPreviewResult>('sync_preview_pull', { request });
  }

  /** 拉取（远程 -> 本地） */
  async pull(request: PullRequest): Promise<SyncResult> {
    return invoke<SyncResult>('sync_pull', { request });
  }

  /** 推送（本地 -> 远程） */
  async push(request: PushRequest): Promise<SyncResult> {
    return invoke<SyncResult>('sync_push', { request });
  }

  /**
   * 对比差异
   *
   * @param localPath 本地仓库根路径（manifest 所在目录）
   * @param subDir 可选子目录，传入后只扫描该子目录下的文件变更
   * @param includePatterns 可选，调用方实时的白名单（不传则后端使用清单中的值）
   */
  async diff(
    localPath: string,
    subDir?: string,
    includePatterns?: string[],
  ): Promise<DiffResult> {
    return invoke<DiffResult>('sync_diff', {
      localPath,
      subDir: subDir ?? null,
      includePatterns: includePatterns ?? null,
    });
  }

  /** 读取文件夹下的同步清单 */
  async readManifest(localPath: string): Promise<SyncManifest | null> {
    return invoke<SyncManifest | null>('sync_read_manifest', { localPath });
  }
}

export const syncService = new SyncService();

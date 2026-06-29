/**
 * 拉取弹窗
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  RiDownloadCloud2Line,
  RiLoader4Line,
  RiLockLine,
  RiRefreshLine,
  RiAlertLine,
  RiEyeLine,
} from 'react-icons/ri';
import { useSyncStore } from '@/stores/sync-store';
import { syncService } from '@/services/tauri/sync-service';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { cn } from '@/utils/cn';
import { mergeIncludePatterns } from '@/types/sync';
import type { RemoteEntry, PullPreviewEntry } from '@/types/sync';
import { Dialog } from '@/components/common/Dialog';
import { WhitelistInput } from './WhitelistInput';

import '../../styles/sync/sync-dialog.css';

interface SyncPullDialogProps {
  onClose: () => void;
}

export function SyncPullDialog({ onClose }: SyncPullDialogProps) {
  const { repos, reposLoaded, loadRepos, manifest, startPull } = useSyncStore();
  const rootPath = useFileTreeStore((s) => s.rootPath);

  // 判断 manifest 是否锁定了仓库/分支配置
  const manifestLocked = useMemo(() => {
    if (!manifest) return false;
    const { platform, owner, repo } = manifest.repoConfig;
    const branch = manifest.branch;
    return Boolean(platform && owner && repo && branch);
  }, [manifest]);

  // 锁定时从 manifest 获取展示信息
  const lockedRepoDisplay = useMemo(() => {
    if (!manifestLocked || !manifest) return null;
    const { platform, owner, repo } = manifest.repoConfig;
    return `${platform}: ${owner}/${repo}`;
  }, [manifestLocked, manifest]);

  const lockedBranch = useMemo(() => {
    if (!manifestLocked || !manifest) return null;
    return manifest.branch;
  }, [manifestLocked, manifest]);

  // 锁定时找到匹配的仓库配置 ID（用于提交拉取请求）
  const lockedConfigId = useMemo(() => {
    if (!manifestLocked || !manifest) return null;
    const { platform, owner, repo, configId } = manifest.repoConfig;
    // 优先用 configId 精确匹配
    const matched =
      repos.find((r) => r.id === configId) ||
      repos.find((r) => r.platform === platform && r.owner === owner && r.repo === repo);
    return matched?.id || null;
  }, [manifestLocked, manifest, repos]);

  // 表单状态
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  // 用户额外追加的白名单（不含硬编码默认值）
  const [extraInclude, setExtraInclude] = useState('');

  // 远程目录相关状态（优先从 manifest 中读取上次使用的远程目录）
  const [remoteDir, setRemoteDir] = useState<string>(manifest?.remoteDir || '/');
  const [remoteDirs, setRemoteDirs] = useState<RemoteEntry[]>([]);
  const [loadingRemoteDirs, setLoadingRemoteDirs] = useState(false);
  const [remoteDirError, setRemoteDirError] = useState<string | null>(null);

  // 预览相关状态
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewList, setPreviewList] = useState<PullPreviewEntry[]>([]);
  const [previewed, setPreviewed] = useState(false);
  // 上次预览时使用的参数快照（用于检测是否需要重新预览）
  const [lastPreviewRepoId, setLastPreviewRepoId] = useState<string>('');
  const [lastPreviewBranch, setLastPreviewBranch] = useState<string>('');
  const [lastPreviewRemoteDir, setLastPreviewRemoteDir] = useState<string>('/');
  const [lastPreviewExtraInclude, setLastPreviewExtraInclude] = useState<string>('');

  // 过滤条件是否已变更（需要重新预览）
  const previewParamsChanged = useMemo(() => {
    if (!previewed) return false;
    const effectiveRepoId = manifestLocked ? lockedConfigId || '' : selectedRepoId;
    const effectiveBranch = manifestLocked ? lockedBranch || '' : branch;
    return (
      effectiveRepoId !== lastPreviewRepoId ||
      effectiveBranch !== lastPreviewBranch ||
      remoteDir !== lastPreviewRemoteDir ||
      extraInclude !== lastPreviewExtraInclude
    );
  }, [
    previewed,
    manifestLocked,
    lockedConfigId,
    lockedBranch,
    selectedRepoId,
    branch,
    remoteDir,
    extraInclude,
    lastPreviewRepoId,
    lastPreviewBranch,
    lastPreviewRemoteDir,
    lastPreviewExtraInclude,
  ]);

  // 加载仓库列表
  useEffect(() => {
    if (!reposLoaded) {
      loadRepos();
    }
  }, [reposLoaded, loadRepos]);

  // 自动选中第一个仓库
  useEffect(() => {
    if (repos.length > 0 && !selectedRepoId) {
      const first = repos[0];
      setSelectedRepoId(first.id);
      setBranch(first.branch);
      setExtraInclude(first.includePatterns.join(', '));
    }
  }, [repos, selectedRepoId]);

  // 选择仓库后加载分支列表
  useEffect(() => {
    if (!selectedRepoId) return;
    let cancelled = false;
    setLoadingBranches(true);
    syncService
      .listBranches(selectedRepoId)
      .then((list) => {
        if (!cancelled) {
          setBranches(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBranches([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBranches(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRepoId]);

  // 仓库和分支确定后加载远程第一层目录
  useEffect(() => {
    const effectiveRepoId = manifestLocked ? lockedConfigId : selectedRepoId;
    const effectiveBranch = manifestLocked ? lockedBranch : branch;
    if (!effectiveRepoId || !effectiveBranch) return;
    let cancelled = false;
    setLoadingRemoteDirs(true);
    setRemoteDirError(null);
    syncService
      .browseRemote(effectiveRepoId, effectiveBranch)
      .then((entries) => {
        if (!cancelled) {
          // 只保留第一层目录
          setRemoteDirs(entries.filter((e) => e.entryType === 'dir'));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setRemoteDirs([]);
          setRemoteDirError(typeof err === 'string' ? err : '加载远程目录失败');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRemoteDirs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manifestLocked, lockedConfigId, lockedBranch, selectedRepoId, branch]);

  /** 仓库选择变更 */
  const handleRepoChange = useCallback(
    (repoId: string) => {
      setSelectedRepoId(repoId);
      const repo = repos.find((r) => r.id === repoId);
      if (repo) {
        setBranch(repo.branch);
        setExtraInclude(repo.includePatterns.join(', '));
      }
    },
    [repos],
  );

  /** 预览拉取文件列表 */
  const handlePreview = useCallback(async () => {
    const effectiveRepoId = manifestLocked ? lockedConfigId : selectedRepoId;
    const effectiveBranch = manifestLocked ? lockedBranch : branch;
    if (!effectiveRepoId || !rootPath || !effectiveBranch) return;

    setPreviewing(true);
    setPreviewError(null);

    try {
      const parsedExtra = extraInclude
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const mergedInclude = mergeIncludePatterns(parsedExtra);

      const result = await syncService.previewPull({
        configId: effectiveRepoId,
        branch: effectiveBranch,
        localPath: rootPath,
        remoteDir: remoteDir === '/' ? undefined : remoteDir,
        includePatterns: mergedInclude,
      });

      // 按类型排序：新增 > 更新
      const sorted = [...result.files].sort((a, b) => {
        const order = { added: 0, modified: 1 };
        return order[a.changeType] - order[b.changeType];
      });

      setPreviewList(sorted);
      setPreviewed(true);
      // 记录本次预览的参数快照
      setLastPreviewRepoId(effectiveRepoId);
      setLastPreviewBranch(effectiveBranch);
      setLastPreviewRemoteDir(remoteDir);
      setLastPreviewExtraInclude(extraInclude);
    } catch (err) {
      setPreviewError(typeof err === 'string' ? err : (err as Error).message || '预览失败');
      setPreviewed(true);
      // 即使失败也记录参数快照
      setLastPreviewRepoId(effectiveRepoId || '');
      setLastPreviewBranch(effectiveBranch || '');
      setLastPreviewRemoteDir(remoteDir);
      setLastPreviewExtraInclude(extraInclude);
    } finally {
      setPreviewing(false);
    }
  }, [
    manifestLocked,
    lockedConfigId,
    lockedBranch,
    selectedRepoId,
    branch,
    rootPath,
    remoteDir,
    extraInclude,
  ]);

  /** 确认拉取 */
  const handlePull = useCallback(() => {
    const effectiveRepoId = manifestLocked ? lockedConfigId : selectedRepoId;
    const effectiveBranch = manifestLocked ? lockedBranch : branch;
    if (!effectiveRepoId || !rootPath || !effectiveBranch) return;

    // 合并硬编码默认值 + 用户额外追加的白名单
    const parsedExtra = extraInclude
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const mergedInclude = mergeIncludePatterns(parsedExtra);

    // 前端参数预校验通过，发起拉取并立即关闭弹窗
    // 后续的拉取进度/错误全部由 SyncProgressPanel 接管展示
    startPull({
      configId: effectiveRepoId,
      branch: effectiveBranch,
      localPath: rootPath,
      remoteDir: remoteDir === '/' ? undefined : remoteDir,
      includePatterns: mergedInclude,
    });
    onClose();
  }, [
    manifestLocked,
    lockedConfigId,
    lockedBranch,
    selectedRepoId,
    branch,
    rootPath,
    remoteDir,
    extraInclude,
    startPull,
    onClose,
  ]);

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title="拉取远程文档"
      icon={
        <div className="sync-dialog-header-icon pull">
          <RiDownloadCloud2Line size={16} />
        </div>
      }
      size="md"
      className="sync-dialog"
      footer={
        <>
          <button className="sync-dialog-btn sync-dialog-btn-cancel" onClick={onClose}>
            关闭
          </button>
          <button
            className="sync-dialog-btn sync-dialog-btn-primary"
            onClick={handlePull}
            disabled={manifestLocked ? !lockedConfigId : !selectedRepoId || !branch}
          >
            <RiDownloadCloud2Line size={14} />
            <span>开始拉取</span>
          </button>
        </>
      }
    >
      <div className="sync-dialog-body-inner">
        {/* 仓库选择 */}
        <div className="sync-dialog-field">
          <label className="sync-dialog-label">选择仓库</label>
          {manifestLocked ? (
            <div className="sync-dialog-locked-value">
              <RiLockLine size={13} className="sync-dialog-locked-icon" />
              <span>{lockedRepoDisplay}</span>
            </div>
          ) : (
            <select
              className="sync-dialog-select"
              value={selectedRepoId}
              onChange={(e) => handleRepoChange(e.target.value)}
            >
              <option value="" disabled>
                请选择仓库配置
              </option>
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.platform}: {r.owner}/{r.repo})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 分支选择 */}
        <div className="sync-dialog-field">
          <label className="sync-dialog-label">分支</label>
          {manifestLocked ? (
            <div className="sync-dialog-locked-value">
              <RiLockLine size={13} className="sync-dialog-locked-icon" />
              <span>{lockedBranch}</span>
            </div>
          ) : loadingBranches ? (
            <div className="sync-dialog-loading">
              <RiLoader4Line size={14} className="sync-spin" />
              <span>加载分支列表...</span>
            </div>
          ) : branches.length > 0 ? (
            <select
              className="sync-dialog-select"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              <option value="" disabled>
                请选择分支
              </option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="sync-dialog-input"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
            />
          )}
        </div>

        {/* 锁定提示 */}
        {manifestLocked && (
          <div className="sync-dialog-locked-hint">
            仓库和分支由本地同步配置文件 (lanismd-sync.json) 锁定
          </div>
        )}

        {/* 远程目录选择 */}
        <div className="sync-dialog-field">
          <label className="sync-dialog-label">远程目录</label>
          {loadingRemoteDirs ? (
            <div className="sync-dialog-loading">
              <RiLoader4Line size={14} className="sync-spin" />
              <span>加载远程目录...</span>
            </div>
          ) : remoteDirError ? (
            <div className="sync-dialog-select-wrap">
              <select
                className="sync-dialog-select"
                value={remoteDir}
                onChange={(e) => setRemoteDir(e.target.value)}
              >
                <option value="/">/</option>
              </select>
              <span className="sync-dialog-field-hint sync-dialog-field-hint--error">
                {remoteDirError}
              </span>
            </div>
          ) : (
            <div className="sync-dialog-select-wrap">
              <select
                className="sync-dialog-select"
                value={remoteDir}
                onChange={(e) => setRemoteDir(e.target.value)}
              >
                <option value="" disabled>
                  请选择远程目录
                </option>
                <option value="/">/</option>
                {remoteDirs.map((dir) => (
                  <option key={dir.path} value={dir.path}>
                    /{dir.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 白名单 */}
        <WhitelistInput
          className="sync-dialog-field"
          value={extraInclude}
          onChange={setExtraInclude}
        />

        {/* 预览文件列表 */}
        <div className="sync-dialog-field">
          {/* 工具栏：预览按钮 + 参数变更提示 */}
          <div className="sync-dialog-change-toolbar">
            <label className="sync-dialog-label sync-dialog-change-toolbar-label">
              文件预览
              {previewed && !previewing && (
                <span className="sync-dialog-change-count">
                  {previewList.length > 0 ? ` (${previewList.length})` : ''}
                </span>
              )}
            </label>

            {previewParamsChanged && !previewing && (
              <>
                <span className="sync-dialog-filter-changed-inline">
                  <RiAlertLine size={13} className="sync-dialog-filter-changed-icon" />
                  <span className="sync-dialog-filter-changed-text">参数已变更，请重新预览</span>
                </span>
                <button className="sync-dialog-filter-changed-btn" onClick={handlePreview}>
                  <RiRefreshLine size={12} />
                  <span>重新预览</span>
                </button>
              </>
            )}
          </div>

          {/* 内容容器 */}
          <div className="sync-dialog-change-wrap">
            {!previewed && !previewing ? (
              <div className="sync-dialog-change-hint">
                {!previewed && !previewing && !previewParamsChanged && (
                  <button
                    className="sync-dialog-preview-btn"
                    onClick={handlePreview}
                    disabled={manifestLocked ? !lockedConfigId : !selectedRepoId || !branch}
                  >
                    <RiEyeLine size={12} />
                    <span>预览</span>
                  </button>
                )}
                <span>点击"预览"查看将要拉取的文件</span>
              </div>
            ) : previewError && previewList.length === 0 && !previewing ? (
              <div className="sync-dialog-change-hint">
                <span>{previewError}</span>
              </div>
            ) : previewed && previewList.length === 0 && !previewing ? (
              <div className="sync-dialog-change-empty">没有需要拉取的文件（远程无变更）</div>
            ) : previewList.length > 0 ? (
              <div className="sync-dialog-change-list">
                {previewList.map((entry) => (
                  <div
                    key={entry.path}
                    className={cn(
                      'sync-dialog-change-item',
                      `sync-dialog-change-item--${entry.changeType}`,
                    )}
                  >
                    <span className="sync-dialog-change-path" title={entry.path}>
                      {entry.path}
                    </span>
                    <span className="sync-dialog-change-badge">
                      {entry.changeType === 'added' ? '新增' : '更新'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sync-dialog-change-placeholder" aria-hidden="true" />
            )}

            {/* 预览中浮层 */}
            {previewing && (
              <div className="sync-dialog-scanning-overlay">
                <div className="sync-dialog-scanning-badge">
                  <RiLoader4Line size={14} className="sync-spin" />
                  <span>正在获取远程文件列表...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * 拉取弹窗
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { RiCloseLine, RiDownloadCloud2Line, RiLoader4Line, RiLockLine } from 'react-icons/ri';
import { useSyncStore } from '@/stores/sync-store';
import { syncService } from '@/services/tauri/sync-service';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { DEFAULT_INCLUDE_PATTERNS_STR, DEFAULT_EXCLUDE_PATTERNS_STR } from '@/types/sync';

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
  const [includePatterns, setIncludePatterns] = useState(DEFAULT_INCLUDE_PATTERNS_STR);
  const [excludePatterns, setExcludePatterns] = useState(DEFAULT_EXCLUDE_PATTERNS_STR);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      console.log('selectedRepoId11 first', first);
      setSelectedRepoId(first.id);
      setBranch(first.branch);
      setIncludePatterns(first.includePatterns.join(', '));
      setExcludePatterns(first.excludePatterns.join(', '));
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

  /** 仓库选择变更 */
  const handleRepoChange = useCallback(
    (repoId: string) => {
      setSelectedRepoId(repoId);
      setError(null);
      const repo = repos.find((r) => r.id === repoId);
      if (repo) {
        setBranch(repo.branch);
        setIncludePatterns(repo.includePatterns.join(', '));
        setExcludePatterns(repo.excludePatterns.join(', '));
      }
    },
    [repos],
  );

  /** 确认拉取 */
  const handlePull = useCallback(async () => {
    const effectiveRepoId = manifestLocked ? lockedConfigId : selectedRepoId;
    const effectiveBranch = manifestLocked ? lockedBranch : branch;
    if (!effectiveRepoId || !rootPath || !effectiveBranch) return;
    setPulling(true);
    setError(null);
    try {
      await startPull({
        configId: effectiveRepoId,
        branch: effectiveBranch,
        localPath: rootPath,
        includePatterns: includePatterns
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        excludePatterns: excludePatterns
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      // 拉取成功，刷新文件树并关闭弹窗
      useFileTreeStore.getState().refreshTree();
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : (err as Error).message || '拉取失败');
    } finally {
      setPulling(false);
    }
  }, [
    manifestLocked,
    lockedConfigId,
    lockedBranch,
    selectedRepoId,
    branch,
    rootPath,
    includePatterns,
    excludePatterns,
    startPull,
    onClose,
  ]);

  return (
    <div className="sync-dialog-overlay">
      <div className="sync-dialog">
        {/* 头部 */}
        <div className="sync-dialog-header">
          <div className="sync-dialog-header-icon pull">
            <RiDownloadCloud2Line size={16} />
          </div>
          <h3 className="sync-dialog-title">拉取远程文档</h3>
          <button className="sync-dialog-close" onClick={onClose}>
            <RiCloseLine size={16} />
          </button>
        </div>

        {/* 内容 */}
        <div className="sync-dialog-body">
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
                disabled={pulling}
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
                disabled={pulling}
              >
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
                disabled={pulling}
              />
            )}
          </div>

          {/* 锁定提示 */}
          {manifestLocked && (
            <div className="sync-dialog-locked-hint">
              仓库和分支由本地同步配置文件 (lanismd-sync.json) 锁定
            </div>
          )}

          {/* 白名单 */}
          <div className="sync-dialog-field">
            <label className="sync-dialog-label">白名单 (glob, 逗号分隔)</label>
            <input
              type="text"
              className="sync-dialog-input"
              value={includePatterns}
              onChange={(e) => setIncludePatterns(e.target.value)}
              placeholder="**/*.md"
              disabled={pulling}
            />
          </div>

          {/* 黑名单 */}
          <div className="sync-dialog-field">
            <label className="sync-dialog-label">黑名单 (glob, 逗号分隔)</label>
            <input
              type="text"
              className="sync-dialog-input"
              value={excludePatterns}
              onChange={(e) => setExcludePatterns(e.target.value)}
              placeholder="**/node_modules/**"
              disabled={pulling}
            />
          </div>

          {/* 错误信息 */}
          {error && (
            <div className="sync-dialog-error">
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="sync-dialog-footer">
          <button
            className="sync-dialog-btn sync-dialog-btn-cancel"
            onClick={onClose}
            disabled={pulling}
          >
            取消
          </button>
          <button
            className="sync-dialog-btn sync-dialog-btn-primary"
            onClick={handlePull}
            disabled={pulling || (manifestLocked ? !lockedConfigId : !selectedRepoId || !branch)}
          >
            {pulling ? (
              <>
                <RiLoader4Line size={14} className="sync-spin" />
                <span>拉取中...</span>
              </>
            ) : (
              <>
                <RiDownloadCloud2Line size={14} />
                <span>开始拉取</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

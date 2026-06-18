/**
 * 推送弹窗
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  RiCloseLine,
  RiUploadCloud2Line,
  RiLoader4Line,
  RiLockLine,
  RiFileTextLine,
  RiRefreshLine,
  RiAlertLine,
} from 'react-icons/ri';
import { useSyncStore } from '@/stores/sync-store';
import { syncService } from '@/services/tauri/sync-service';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { cn } from '@/utils/cn';
import type { DiffResult } from '@/types/sync';
import { DEFAULT_INCLUDE_PATTERNS_STR, DEFAULT_EXCLUDE_PATTERNS_STR } from '@/types/sync';

import '../../styles/sync/sync-dialog.css';

/** 变更文件条目类型 */
type ChangeType = 'added' | 'modified' | 'deleted';

/** 变更文件条目 */
interface ChangeEntry {
  path: string;
  type: ChangeType;
}

interface SyncPushDialogProps {
  onClose: () => void;
}

export function SyncPushDialog({ onClose }: SyncPushDialogProps) {
  const { repos, reposLoaded, loadRepos, manifest, startPush } = useSyncStore();
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

  // 锁定时找到匹配的仓库配置 ID（用于提交推送请求）
  const lockedConfigId = useMemo(() => {
    if (!manifestLocked || !manifest) return null;
    const { platform, owner, repo, configId } = manifest.repoConfig;
    const matched =
      repos.find((r) => r.id === configId) ||
      repos.find((r) => r.platform === platform && r.owner === owner && r.repo === repo);
    return matched?.id || null;
  }, [manifestLocked, manifest, repos]);

  // 表单状态
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [branch, setBranch] = useState('main');
  const [branches, setBranches] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [includePatterns, setIncludePatterns] = useState(DEFAULT_INCLUDE_PATTERNS_STR);
  const [excludePatterns, setExcludePatterns] = useState(DEFAULT_EXCLUDE_PATTERNS_STR);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 变更扫描状态
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [changeList, setChangeList] = useState<ChangeEntry[]>([]);
  const [scanned, setScanned] = useState(false);

  // 上次扫描时使用的白/黑名单（用于检测是否变更）
  const [lastScanInclude, setLastScanInclude] = useState<string>('');
  const [lastScanExclude, setLastScanExclude] = useState<string>('');
  // 过滤条件是否已变更（需要重新扫描）
  const filtersChanged = useMemo(() => {
    // 尚未扫描过，不显示提示
    if (!scanned) return false;
    return includePatterns !== lastScanInclude || excludePatterns !== lastScanExclude;
  }, [scanned, includePatterns, excludePatterns, lastScanInclude, lastScanExclude]);

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
        if (!cancelled) setBranches(list);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingBranches(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRepoId]);

  /**
   * 扫描变更文件
   */
  const scanChanges = useCallback(
    async (includeStr: string = includePatterns, excludeStr: string = excludePatterns) => {
      if (!rootPath) return;

      setScanning(true);
      setScanError(null);
      // 注意：扫描期间不清空 changeList，保留旧列表显示以避免弹窗高度突变导致抖动
      // loading 状态以浮层形式叠加在列表上方（参见 JSX 渲染部分）

      try {
        const parsedInclude = includeStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const parsedExclude = excludeStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const diff: DiffResult = await syncService.diff(rootPath, parsedInclude, parsedExclude);
        const entries: ChangeEntry[] = [
          ...diff.added.map((path) => ({ path, type: 'added' as ChangeType })),
          ...diff.modified.map((path) => ({ path, type: 'modified' as ChangeType })),
          ...diff.deleted.map((path) => ({ path, type: 'deleted' as ChangeType })),
        ];
        // 按类型排序：新增 > 更新 > 删除
        entries.sort((a, b) => {
          const order = { added: 0, modified: 1, deleted: 2 };
          return order[a.type] - order[b.type];
        });
        setChangeList(entries);
        setScanned(true);
        // 记录本次扫描时实际使用的过滤条件
        setLastScanInclude(includeStr);
        setLastScanExclude(excludeStr);
      } catch (err) {
        setScanError(typeof err === 'string' ? err : (err as Error).message || '扫描变更失败');
        setScanned(true);
        // 即使扫描失败也记录过滤条件，避免持续显示提示条
        setLastScanInclude(includeStr);
        setLastScanExclude(excludeStr);
      } finally {
        setScanning(false);
      }
    },
    [rootPath, manifest, includePatterns, excludePatterns],
  );

  // 是否已触发过自动初始扫描（避免依赖 patterns 导致每次输入都重扫）
  const [autoScanned, setAutoScanned] = useState(false);

  // 有 manifest 时，弹窗打开自动扫描变更（仅一次）
  useEffect(() => {
    if (!rootPath || autoScanned) return;
    // 等仓库配置完成初始化（或确实无可用仓库配置但 manifest 存在）
    // 用 selectedRepoId 作为初始化完成的标志：repos 加载后会自动选中第一个并把 patterns 写入
    const reposReadyOrUnavailable = reposLoaded && (repos.length === 0 || selectedRepoId !== '');
    if (!reposReadyOrUnavailable) return;
    setAutoScanned(true);
    scanChanges(includePatterns, excludePatterns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath, reposLoaded, repos.length, selectedRepoId, autoScanned]);

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

  /** 推送按钮是否禁用 */
  const pushDisabled = useMemo(() => {
    // 推送中
    if (pushing) return true;
    // 扫描中（无论是手动重新扫描还是初始扫描）
    if (scanning) return true;
    // 有 manifest 时：如果扫描完毕且变更为空且过滤条件未变更，禁用
    if (scanned && changeList.length === 0 && !filtersChanged) return true;
    // 无 manifest 时：必须选择仓库和分支
    if (!manifestLocked && (!selectedRepoId || !branch)) return true;
    // 有 manifest 但找不到对应配置
    if (manifestLocked && !lockedConfigId) return true;
    return false;
  }, [
    pushing,
    scanning,
    scanned,
    changeList.length,
    filtersChanged,
    manifestLocked,
    selectedRepoId,
    branch,
    lockedConfigId,
  ]);

  /** 确认推送 */
  const handlePush = useCallback(async () => {
    const effectiveRepoId = manifestLocked ? lockedConfigId : selectedRepoId;
    const effectiveBranch = manifestLocked ? lockedBranch : branch;
    if (!effectiveRepoId || !rootPath || !effectiveBranch) return;
    setPushing(true);
    setError(null);
    try {
      await startPush({
        localPath: rootPath,
        configId: effectiveRepoId,
        branch: effectiveBranch,
        includePatterns: includePatterns
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        excludePatterns: excludePatterns
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : (err as Error).message || '推送失败');
    } finally {
      setPushing(false);
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
    startPush,
    onClose,
  ]);

  /** 获取变更类型的显示标签 */
  const getChangeLabel = (type: ChangeType) => {
    switch (type) {
      case 'added':
        return '新增';
      case 'modified':
        return '更新';
      case 'deleted':
        return '删除';
    }
  };

  return (
    <div className="sync-dialog-overlay">
      <div className="sync-dialog sync-dialog--push">
        {/* 头部 */}
        <div className="sync-dialog-header">
          <div className="sync-dialog-header-icon push">
            <RiUploadCloud2Line size={16} />
          </div>
          <h3 className="sync-dialog-title">推送到远程仓库</h3>
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
                disabled={pushing}
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
                disabled={pushing}
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
                disabled={pushing}
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
              disabled={pushing}
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
              disabled={pushing}
            />
          </div>

          {/* 变更文件列表 */}
          <div className="sync-dialog-field">
            {/* label 行：固定高度，过滤变更提示与“重新扫描”按钮内联在此行；
                即使提示未显示，行高也保持一致，避免弹窗抖动 */}
            <div className="sync-dialog-change-toolbar">
              <label className="sync-dialog-label sync-dialog-change-toolbar-label">
                变更文件
                {scanned && !scanning && (
                  <span className="sync-dialog-change-count">
                    {changeList.length > 0 ? ` (${changeList.length})` : ''}
                  </span>
                )}
              </label>

              {filtersChanged && !scanning && (
                <>
                  <span className="sync-dialog-filter-changed-inline">
                    <RiAlertLine size={13} className="sync-dialog-filter-changed-icon" />
                    <span className="sync-dialog-filter-changed-text">
                      过滤条件已变更，文件列表可能不准确
                    </span>
                  </span>
                  <button
                    className="sync-dialog-filter-changed-btn"
                    onClick={() => scanChanges(includePatterns, excludePatterns)}
                    disabled={pushing}
                  >
                    <RiRefreshLine size={12} />
                    <span>重新扫描</span>
                  </button>
                </>
              )}
            </div>

            {/* 内容容器：扫描时保留旧内容显示，loading 以浮层叠加在上方，
                避免因高度突变导致弹窗在屏幕上抖动。设置最小高度保证首次扫描
                （changeList 为空）时容器也有足够高度承载 loading 浮层。 */}
            <div className="sync-dialog-change-wrap">
              {scanError && changeList.length === 0 && !scanning ? (
                <div className="sync-dialog-change-hint">
                  <RiFileTextLine size={14} />
                  <span>{scanError}</span>
                </div>
              ) : scanned && changeList.length === 0 && !scanning ? (
                <div className="sync-dialog-change-empty">没有需要推送的文件变更</div>
              ) : changeList.length > 0 ? (
                <div className="sync-dialog-change-list">
                  {changeList.map((entry) => (
                    <div
                      key={entry.path}
                      className={cn(
                        'sync-dialog-change-item',
                        `sync-dialog-change-item--${entry.type}`,
                      )}
                    >
                      <span className="sync-dialog-change-path" title={entry.path}>
                        {entry.path}
                      </span>
                      <span className="sync-dialog-change-badge">{getChangeLabel(entry.type)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                // 首次扫描尚无任何内容时，用一个最小高度占位块支撑 loading 浮层
                <div className="sync-dialog-change-placeholder" aria-hidden="true" />
              )}

              {/* 扫描中浮层：绝对定位覆盖在内容之上，不影响容器高度 */}
              {scanning && (
                <div className="sync-dialog-scanning-overlay">
                  <div className="sync-dialog-scanning-badge">
                    <RiLoader4Line size={14} className="sync-spin" />
                    <span>正在扫描变更...</span>
                  </div>
                </div>
              )}
            </div>
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
            disabled={pushing}
          >
            关闭
          </button>
          <button
            className="sync-dialog-btn sync-dialog-btn-primary"
            onClick={handlePush}
            disabled={pushDisabled}
          >
            {pushing ? (
              <>
                <RiLoader4Line size={14} className="sync-spin" />
                <span>推送中...</span>
              </>
            ) : (
              <>
                <RiUploadCloud2Line size={14} />
                <span>开始推送</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 推送弹窗
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  RiCloseLine,
  RiUploadCloud2Line,
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
import type { DiffResult, RemoteEntry } from '@/types/sync';
import { mergeIncludePatterns } from '@/types/sync';
import { WhitelistInput } from './WhitelistInput';

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
  // 用户额外追加的白名单（不含硬编码默认值）
  const [extraInclude, setExtraInclude] = useState('');

  // 远程目录相关状态（优先从 manifest 中读取上次使用的远程目录）
  const [remoteDir, setRemoteDir] = useState<string>(manifest?.remoteDir || '/');
  const [remoteDirs, setRemoteDirs] = useState<RemoteEntry[]>([]);
  const [loadingRemoteDirs, setLoadingRemoteDirs] = useState(false);
  const [remoteDirError, setRemoteDirError] = useState<string | null>(null);
  const [keepDirStructure, setKeepDirStructure] = useState(true);

  // 变更扫描状态
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [changeList, setChangeList] = useState<ChangeEntry[]>([]);
  const [scanned, setScanned] = useState(false);

  // 上次扫描时使用的额外白名单（用于检测是否变更）
  const [lastScanExtraInclude, setLastScanExtraInclude] = useState<string>('');
  // 上次扫描时使用的远程目录和保持结构选项（用于检测是否变更）
  const [lastScanRemoteDir, setLastScanRemoteDir] = useState<string>('/');
  const [lastScanKeepDirStructure, setLastScanKeepDirStructure] = useState<boolean>(true);
  // 过滤条件是否已变更（需要重新扫描）
  const filtersChanged = useMemo(() => {
    // 尚未扫描过，不显示提示
    if (!scanned) return false;
    return (
      extraInclude !== lastScanExtraInclude ||
      remoteDir !== lastScanRemoteDir ||
      keepDirStructure !== lastScanKeepDirStructure
    );
  }, [
    scanned,
    extraInclude,
    lastScanExtraInclude,
    remoteDir,
    lastScanRemoteDir,
    keepDirStructure,
    lastScanKeepDirStructure,
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

  /**
   * 扫描变更文件
   * 当选择了非根远程目录且勾选保持本地目录结构时，通过后端 sub_dir 参数只扫描子目录
   */
  const scanChanges = useCallback(
    async (extraIncludeStr: string = extraInclude) => {
      if (!rootPath) return;

      setScanning(true);
      setScanError(null);
      // 注意：扫描期间不清空 changeList，保留旧列表显示以避免弹窗高度突变导致抖动
      // loading 状态以浮层形式叠加在列表上方（参见 JSX 渲染部分）

      try {
        const parsedExtra = extraIncludeStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        // 合并硬编码默认值 + 用户额外追加的白名单
        const mergedInclude = mergeIncludePatterns(parsedExtra);

        // 当选择了非根远程目录且保持本地目录结构时，传入 subDir 让后端只扫描子目录
        const subDir = remoteDir !== '/' && keepDirStructure ? remoteDir : undefined;

        const diff: DiffResult = await syncService.diff(rootPath, subDir, mergedInclude);

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
        setLastScanExtraInclude(extraIncludeStr);
        setLastScanRemoteDir(remoteDir);
        setLastScanKeepDirStructure(keepDirStructure);
      } catch (err) {
        setScanError(typeof err === 'string' ? err : (err as Error).message || '扫描变更失败');
        setScanned(true);
        // 即使扫描失败也记录过滤条件，避免持续显示提示条
        setLastScanExtraInclude(extraIncludeStr);
        setLastScanRemoteDir(remoteDir);
        setLastScanKeepDirStructure(keepDirStructure);
      } finally {
        setScanning(false);
      }
    },
    [rootPath, manifest, extraInclude, remoteDir, keepDirStructure],
  );

  /** 手动触发预览（扫描变更） */
  const handlePreview = useCallback(() => {
    scanChanges(extraInclude);
  }, [scanChanges, extraInclude]);

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

  /** 推送按钮是否禁用 */
  const pushDisabled = useMemo(() => {
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
  const handlePush = useCallback(() => {
    const effectiveRepoId = manifestLocked ? lockedConfigId : selectedRepoId;
    const effectiveBranch = manifestLocked ? lockedBranch : branch;
    if (!effectiveRepoId || !rootPath || !effectiveBranch) return;

    // 合并硬编码默认值 + 用户额外追加的白名单
    const parsedExtra = extraInclude
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const mergedInclude = mergeIncludePatterns(parsedExtra);

    // 前端参数预校验通过，发起推送并立即关闭弹窗
    // 后续的推送进度/错误全部由 SyncProgressPanel 接管展示
    startPush({
      localPath: rootPath,
      configId: effectiveRepoId,
      branch: effectiveBranch,
      remoteDir: remoteDir === '/' ? undefined : remoteDir,
      keepDirStructure,
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
    keepDirStructure,
    extraInclude,
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

          {/* 保持目录结构复选框（仅选择非根目录时显示） */}
          {remoteDir !== '/' && (
            <div className="sync-dialog-field sync-dialog-field--checkbox">
              <label className="sync-dialog-checkbox-label">
                <input
                  type="checkbox"
                  className="sync-dialog-checkbox"
                  checked={keepDirStructure}
                  onChange={(e) => setKeepDirStructure(e.target.checked)}
                />
                <span>保持本地目录结构</span>
              </label>
              <span className="sync-dialog-field-hint">
                {keepDirStructure
                  ? `推送本地 /${remoteDir} 目录内容到远程 /${remoteDir}`
                  : `推送本地工作区所有文件到远程 /${remoteDir}`}
              </span>
            </div>
          )}

          {/* 白名单 */}
          <WhitelistInput
            className="sync-dialog-field"
            value={extraInclude}
            onChange={setExtraInclude}
          />

          {/* 变更文件预览 */}
          <div className="sync-dialog-field">
            {/* 工具栏：预览按钮 + 参数变更提示 */}
            <div className="sync-dialog-change-toolbar">
              <label className="sync-dialog-label sync-dialog-change-toolbar-label">
                文件预览
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
                      过滤条件已变更，请重新预览
                    </span>
                  </span>
                  <button
                    className="sync-dialog-filter-changed-btn"
                    onClick={handlePreview}
                  >
                    <RiRefreshLine size={12} />
                    <span>重新预览</span>
                  </button>
                </>
              )}
            </div>

            {/* 内容容器 */}
            <div className="sync-dialog-change-wrap">
              {!scanned && !scanning ? (
                <div className="sync-dialog-change-hint">
                  {!scanned && !scanning && !filtersChanged && (
                    <button
                      className="sync-dialog-preview-btn"
                      onClick={handlePreview}
                      disabled={manifestLocked ? !lockedConfigId : !selectedRepoId || !branch}
                    >
                      <RiEyeLine size={12} />
                      <span>预览</span>
                    </button>
                  )}
                  <span>点击"预览"查看将要推送的文件</span>
                </div>
              ) : scanError && changeList.length === 0 && !scanning ? (
                <div className="sync-dialog-change-hint">
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
                <div className="sync-dialog-change-placeholder" aria-hidden="true" />
              )}

              {/* 扫描中浮层 */}
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
        </div>

        {/* 底部操作 */}
        <div className="sync-dialog-footer">
          <button className="sync-dialog-btn sync-dialog-btn-cancel" onClick={onClose}>
            关闭
          </button>
          <button
            className="sync-dialog-btn sync-dialog-btn-primary"
            onClick={handlePush}
            disabled={pushDisabled}
          >
            <RiUploadCloud2Line size={14} />
            <span>开始推送</span>
          </button>
        </div>
      </div>
    </div>
  );
}

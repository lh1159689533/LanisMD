/**
 * 打开远程仓库（方案 A：克隆对话框）
 * 地址 + 分支 + 认证提示 + 克隆目录；本地已存在同一仓库时直接打开，避免重复克隆。
 *
 * @changelog
 * | 版本   | 变更说明                  | 关联                               |
 * | v1.0.0 | 初始实现：克隆并打开远程仓库 | REQ: Git 改造 第 1/2 点 TECH: 方案A |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RiAlertLine,
  RiCheckLine,
  RiFolderOpenLine,
  RiGitBranchLine,
  RiLoader4Line,
} from 'react-icons/ri';
import { homeDir, join } from '@tauri-apps/api/path';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import { Dialog } from '@/components/common/Dialog';
import { openFolderPath } from '@/hooks/useOpenFolder';
import { gitErrorMessage, gitService } from '@/services/tauri/git-service';
import { useGitStore } from '@/stores/git-store';
import { useRecentFoldersStore } from '@/stores/recent-folders-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { httpHostOf, isLikelyGitUrl, normalizeRemote, repoNameFromUrl } from '@/utils/git';
import type { CloneProgress, RemoteBranches } from '@/types/git';
import { GitInstallHint } from './GitInstallHint';

import '@/styles/git/git-dialog.css';

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; data: RemoteBranches }
  | { kind: 'error'; message: string; auth: boolean };

const CHECK_DEBOUNCE_MS = 600;

/** 查找本地已克隆的同一仓库：目标目录 + 最近打开中同名的文件夹 */
async function findLocalClone(url: string, candidates: string[]): Promise<string | null> {
  const wanted = normalizeRemote(url);
  for (const path of candidates) {
    try {
      if (!(await exists(path))) continue;
      const info = await gitService.repoInfo(path);
      if (info?.remoteUrl && normalizeRemote(info.remoteUrl) === wanted && !info.scope) return path;
    } catch {
      // 忽略不可访问的目录
    }
  }
  return null;
}

export function CloneDialog() {
  const open = useGitStore((s) => s.cloneDialogOpen);
  if (!open) return null;
  return <CloneDialogContent />;
}

function CloneDialogContent() {
  const setOpen = useGitStore((s) => s.setCloneDialogOpen);
  const availability = useGitStore((s) => s.availability);
  const checkAvailability = useGitStore((s) => s.checkAvailability);
  const cloneDirSetting = useSettingsStore((s) => s.config.git.cloneDir);
  const recentFolders = useRecentFoldersStore((s) => s.recentFolders);

  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [parentDir, setParentDir] = useState('');
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' });
  const [existing, setExisting] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [progress, setProgress] = useState<CloneProgress | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [token, setToken] = useState({ username: '', token: '', saving: false });
  const cloneIdRef = useRef<string>('');
  const urlInputRef = useRef<HTMLInputElement>(null);

  const trimmedUrl = url.trim();
  const validUrl = isLikelyGitUrl(trimmedUrl);
  const repoName = validUrl ? repoNameFromUrl(trimmedUrl) : '';
  const host = httpHostOf(trimmedUrl);
  const [targetDir, setTargetDir] = useState('');

  const close = useCallback(() => {
    if (cloning) return;
    setOpen(false);
  }, [cloning, setOpen]);

  // 初始化（仅一次）：检测 git、默认克隆目录、聚焦地址输入框
  useEffect(() => {
    if (!useGitStore.getState().availability) void checkAvailability().catch(() => null);
    void (async () => {
      const fallback = await join(await homeDir(), 'LanisMD');
      setParentDir((prev) => prev || cloneDirSetting || fallback);
    })();
    // Dialog 打开后会在 80ms 内抢占焦点到容器，延后聚焦输入框
    const timer = window.setTimeout(() => urlInputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
    // 仅在弹窗打开时初始化一次
  }, []);

  useEffect(() => {
    if (!parentDir || !repoName) {
      setTargetDir('');
      return;
    }
    void join(parentDir, repoName).then(setTargetDir);
  }, [parentDir, repoName]);

  // 地址变化：防抖校验访问权限并读取分支
  const runCheck = useCallback(async (value: string) => {
    setCheck({ kind: 'checking' });
    try {
      const data = await gitService.lsRemote(value);
      setCheck({ kind: 'ok', data });
    } catch (error) {
      const message = gitErrorMessage(error);
      setCheck({ kind: 'error', message, auth: /认证失败|仓库不存在或没有访问权限/.test(message) });
    }
  }, []);

  useEffect(() => {
    setBranch('');
    setCloneError(null);
    if (!validUrl || availability?.installed === false) {
      setCheck({ kind: 'idle' });
      return;
    }
    const timer = setTimeout(() => void runCheck(trimmedUrl), CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmedUrl, validUrl, availability?.installed, runCheck]);

  // 本地是否已有该仓库
  const candidates = useMemo(() => {
    const list = recentFolders.filter((f) => f.name === repoName).map((f) => f.path);
    if (targetDir) list.unshift(targetDir);
    return Array.from(new Set(list));
  }, [recentFolders, repoName, targetDir]);

  useEffect(() => {
    if (!validUrl) {
      setExisting(null);
      return;
    }
    let cancelled = false;
    void findLocalClone(trimmedUrl, candidates).then((p) => !cancelled && setExisting(p));
    return () => {
      cancelled = true;
    };
  }, [trimmedUrl, validUrl, candidates]);

  // 克隆进度
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void gitService
      .onCloneProgress((p) => {
        if (p.cloneId === cloneIdRef.current) setProgress(p);
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  const pickParent = async () => {
    const selected = await tauriOpen({ directory: true, multiple: false, title: '选择克隆位置' });
    if (typeof selected === 'string') setParentDir(selected);
  };

  const saveToken = async () => {
    if (!host || !token.token) return;
    setToken((t) => ({ ...t, saving: true }));
    try {
      await gitService.saveCredential({
        id: null,
        host,
        username: token.username,
        token: token.token,
      });
      setToken({ username: '', token: '', saving: false });
      await runCheck(trimmedUrl);
    } catch (error) {
      setToken((t) => ({ ...t, saving: false }));
      setCheck({ kind: 'error', message: gitErrorMessage(error), auth: true });
    }
  };

  const openExisting = async () => {
    if (!existing) return;
    setOpen(false);
    await openFolderPath(existing, true);
  };

  const handleClone = async () => {
    if (!validUrl || !targetDir) return;
    if (await exists(targetDir)) {
      setCloneError(`目标目录已存在：${targetDir}，请更换克隆位置`);
      return;
    }
    cloneIdRef.current = crypto.randomUUID();
    setCloning(true);
    setCloneError(null);
    setProgress(null);
    try {
      const path = await gitService.clone({
        cloneId: cloneIdRef.current,
        url: trimmedUrl,
        targetDir,
        branch: branch || null,
      });
      setOpen(false);
      await openFolderPath(path, true);
      useUIStore
        .getState()
        .addToast({ type: 'success', message: `已克隆并打开 ${repoName}`, duration: 2500 });
    } catch (error) {
      setCloneError(gitErrorMessage(error));
    } finally {
      setCloning(false);
    }
  };

  const branches = check.kind === 'ok' ? check.data.branches : [];
  const defaultBranch = check.kind === 'ok' ? check.data.defaultBranch : null;
  const canClone =
    validUrl &&
    !!targetDir &&
    !cloning &&
    check.kind !== 'checking' &&
    availability?.installed !== false;

  return (
    <Dialog
      open
      onClose={close}
      title="打开远程仓库"
      icon={
        <span className="git-dialog-header-icon clone">
          <RiGitBranchLine size={16} />
        </span>
      }
      showCloseButton={!cloning}
      footer={
        cloning ? (
          <button
            type="button"
            className="git-dialog-btn git-dialog-btn-cancel"
            onClick={() => void gitService.cancelClone(cloneIdRef.current)}
          >
            取消克隆
          </button>
        ) : (
          <>
            <button type="button" className="git-dialog-btn git-dialog-btn-cancel" onClick={close}>
              取消
            </button>
            {existing ? (
              <button
                type="button"
                className="git-dialog-btn git-dialog-btn-primary"
                onClick={() => void openExisting()}
              >
                直接打开
              </button>
            ) : (
              <button
                type="button"
                className="git-dialog-btn git-dialog-btn-primary"
                disabled={!canClone}
                onClick={() => void handleClone()}
              >
                克隆并打开
              </button>
            )}
          </>
        )
      }
    >
      <div className="git-dialog-body-inner">
        {availability?.installed === false && <GitInstallHint />}

        <div className="git-dialog-field">
          <label className="git-dialog-label">仓库地址</label>
          <input
            ref={urlInputRef}
            className="git-dialog-input"
            placeholder="https://github.com/user/repo.git 或 git@host:group/repo.git"
            value={url}
            disabled={cloning}
            spellCheck={false}
            onChange={(e) => setUrl(e.target.value)}
          />
          {trimmedUrl && !validUrl && (
            <span className="git-dialog-field-error">请输入有效的 HTTPS 或 SSH 仓库地址</span>
          )}
          {check.kind === 'checking' && (
            <span className="git-dialog-field-hint">
              <RiLoader4Line size={12} className="lanismd-git-spin" /> 正在检查仓库访问权限...
            </span>
          )}
          {check.kind === 'ok' && (
            <span className="git-dialog-field-ok">
              <RiCheckLine size={12} /> 可以访问
              {defaultBranch ? `，默认分支 ${defaultBranch}` : '（空仓库）'}
            </span>
          )}
          {check.kind === 'error' && (
            <span className="git-dialog-field-error">{check.message}</span>
          )}
        </div>

        {check.kind === 'error' && check.auth && host && (
          <div className="git-dialog-field git-dialog-token">
            <label className="git-dialog-label">为 {host} 添加访问令牌</label>
            <div className="git-dialog-row">
              <input
                className="git-dialog-input"
                placeholder="用户名（可选）"
                value={token.username}
                onChange={(e) => setToken({ ...token, username: e.target.value })}
              />
              <input
                className="git-dialog-input"
                type="password"
                placeholder="Personal Access Token"
                value={token.token}
                onChange={(e) => setToken({ ...token, token: e.target.value })}
              />
              <button
                type="button"
                className="git-dialog-btn git-dialog-btn-secondary"
                disabled={!token.token || token.saving}
                onClick={() => void saveToken()}
              >
                保存并重试
              </button>
            </div>
            <span className="git-dialog-field-hint">
              令牌保存在本机，可在「设置 &gt; Git」中管理
            </span>
          </div>
        )}

        <div className="git-dialog-row">
          <div className="git-dialog-field git-dialog-grow">
            <label className="git-dialog-label">分支</label>
            <select
              className="git-dialog-select"
              value={branch}
              disabled={cloning || branches.length === 0}
              onChange={(e) => setBranch(e.target.value)}
            >
              <option value="">
                {defaultBranch ? `默认分支（${defaultBranch}）` : '默认分支'}
              </option>
              {branches
                .filter((b) => b !== defaultBranch)
                .map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
            </select>
          </div>
          <div className="git-dialog-field git-dialog-grow">
            <label className="git-dialog-label">认证方式</label>
            <div className="git-dialog-static">
              {trimmedUrl.startsWith('http') ? 'HTTPS：令牌 / 系统凭据' : 'SSH：本机密钥'}
            </div>
          </div>
        </div>

        <div className="git-dialog-field">
          <label className="git-dialog-label">克隆到</label>
          <div className="git-dialog-row">
            <input
              className="git-dialog-input"
              value={parentDir}
              disabled={cloning}
              onChange={(e) => setParentDir(e.target.value)}
            />
            <button
              type="button"
              className="git-dialog-btn git-dialog-btn-secondary"
              disabled={cloning}
              onClick={() => void pickParent()}
            >
              <RiFolderOpenLine size={14} />
              <span>浏览</span>
            </button>
          </div>
          {targetDir && <span className="git-dialog-field-hint">将创建：{targetDir}</span>}
        </div>

        {existing && !cloning && (
          <div className="git-dialog-info">
            <RiCheckLine size={14} />
            <span>本地已存在该仓库：{existing}，可直接打开，无需重复克隆。</span>
          </div>
        )}

        {cloning && (
          <div className="git-dialog-progress">
            <div className="git-dialog-progress-label">
              <span>{progress?.phase ?? '正在连接远程仓库'}</span>
              {progress?.percent != null && <span>{progress.percent}%</span>}
            </div>
            <div className="git-dialog-progress-bar">
              <span
                className={progress?.percent == null ? 'is-indeterminate' : undefined}
                style={progress?.percent != null ? { width: `${progress.percent}%` } : undefined}
              />
            </div>
          </div>
        )}

        {cloneError && (
          <div className="git-dialog-error">
            <RiAlertLine size={14} />
            <span>{cloneError}</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

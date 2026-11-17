/**
 * 状态栏 Git 区：当前分支 | 更改 | 提交 | 同步（含自动同步设置）| 历史
 * 仅在打开的文件夹位于 Git 仓库中时显示。
 *
 * @changelog
 * | 版本   | 变更说明                | 关联                  |
 * | v1.0.0 | 初始实现：状态栏 Git 区  | REQ: Git 改造 第 7 点 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  RiArrowDownSLine,
  RiCheckLine,
  RiCloudLine,
  RiFileList3Line,
  RiGitBranchLine,
  RiGitCommitLine,
  RiLoader4Line,
  RiPulseLine,
  RiRefreshLine,
} from 'react-icons/ri';
import { useGitStore } from '@/stores/git-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';
import { timeAgo } from '@/utils/time';
import type { BranchInfo } from '@/types/git';

import '@/styles/git/git-panels.css';

const ITEM_CLASS = 'flex items-center gap-1 transition-colors hover:text-[var(--lanismd-accent)]';
export const SYNC_INTERVAL_OPTIONS = [1, 5, 10, 15, 30, 60];
export const IDLE_OPTIONS = [1, 2, 5, 10, 15, 30];

/** 状态栏上方弹出层，点击外部关闭 */
function Popover({
  anchor,
  open,
  onClose,
  children,
}: {
  anchor: ReactNode;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return (
    <div ref={ref} className="relative flex items-center">
      {anchor}
      {open && <div className="lanismd-git-popover">{children}</div>}
    </div>
  );
}

function BranchItem() {
  const repo = useGitStore((s) => s.repo);
  const operation = useGitStore((s) => s.operation);
  const listBranches = useGitStore((s) => s.listBranches);
  const checkout = useGitStore((s) => s.checkout);
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[] | null>(null);

  if (!repo) return null;
  const label = repo.branch ?? (repo.headShort ? `游离于 ${repo.headShort}` : '无分支');

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setBranches(null);
    setBranches(await listBranches());
  };

  const local = branches?.filter((b) => !b.remote) ?? [];
  const remote = branches?.filter((b) => b.remote) ?? [];

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      anchor={
        <button
          type="button"
          className={cn(ITEM_CLASS, open && 'text-[var(--lanismd-accent)]')}
          title={repo.merging ? '合并进行中' : '切换分支'}
          onClick={() => void toggle()}
        >
          {operation === 'checkout' ? (
            <RiLoader4Line size={12} className="lanismd-git-spin" />
          ) : (
            <RiGitBranchLine size={12} />
          )}
          <span className="max-w-[140px] truncate">{label}</span>
          {repo.merging && <span className="text-[var(--lanismd-warning)]">合并中</span>}
        </button>
      }
    >
      <div className="lanismd-git-popover-title">切换分支</div>
      {!branches ? (
        <div className="lanismd-git-popover-empty">
          <RiLoader4Line size={12} className="lanismd-git-spin" /> 读取中...
        </div>
      ) : (
        <div className="lanismd-git-popover-list">
          {local.map((b) => (
            <button
              type="button"
              key={b.name}
              className={cn('lanismd-git-popover-item', b.current && 'active')}
              disabled={operation !== null}
              onClick={() => {
                setOpen(false);
                void checkout(b);
              }}
            >
              <span className="lanismd-git-popover-check">
                {b.current && <RiCheckLine size={12} />}
              </span>
              <span className="truncate">{b.name}</span>
            </button>
          ))}
          {remote.length > 0 && <div className="lanismd-git-popover-section">远程分支</div>}
          {remote.map((b) => (
            <button
              type="button"
              key={b.name}
              className="lanismd-git-popover-item"
              disabled={operation !== null}
              onClick={() => {
                setOpen(false);
                void checkout(b);
              }}
            >
              <span className="lanismd-git-popover-check">
                <RiCloudLine size={12} />
              </span>
              <span className="truncate">{b.name}</span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function SyncItem() {
  const repo = useGitStore((s) => s.repo);
  const operation = useGitStore((s) => s.operation);
  const lastSyncAt = useGitStore((s) => s.lastSyncAt);
  const pull = useGitStore((s) => s.pull);
  const gitConfig = useSettingsStore((s) => s.config.git);
  const setNestedConfig = useSettingsStore((s) => s.setNestedConfig);
  const [open, setOpen] = useState(false);

  if (!repo) return null;
  const pulling = operation === 'pull';
  const title = [
    repo.upstream ? `从 ${repo.upstream} 同步` : '同步远程到本地',
    repo.behind > 0 ? `远程有 ${repo.behind} 个新提交` : null,
    repo.ahead > 0 ? `本地有 ${repo.ahead} 个提交未推送` : null,
    lastSyncAt ? `上次同步：${timeAgo(lastSyncAt)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      anchor={
        <span className="flex items-center">
          <button
            type="button"
            className={cn(ITEM_CLASS, pulling && 'text-[var(--lanismd-accent)]')}
            title={title}
            disabled={operation !== null || !repo.remoteName}
            onClick={() => void pull()}
          >
            <RiRefreshLine size={12} className={cn(pulling && 'lanismd-git-spin')} />
            <span>同步</span>
            {repo.behind > 0 && <span>↓{repo.behind}</span>}
            {repo.ahead > 0 && <span>↑{repo.ahead}</span>}
            {gitConfig.autoSync.enabled && (
              <span className="lanismd-git-auto-dot" title="已开启自动同步" />
            )}
          </button>
          <button
            type="button"
            className={cn(ITEM_CLASS, 'ml-0.5 opacity-70', open && 'text-[var(--lanismd-accent)]')}
            title="同步设置"
            onClick={() => setOpen((v) => !v)}
          >
            <RiArrowDownSLine size={12} />
          </button>
        </span>
      }
    >
      <div className="lanismd-git-popover-title">同步设置</div>
      <label className="lanismd-git-popover-row">
        <span>自动同步</span>
        <input
          type="checkbox"
          checked={gitConfig.autoSync.enabled}
          onChange={(e) => setNestedConfig('git.autoSync.enabled', e.target.checked)}
        />
      </label>
      <label className="lanismd-git-popover-row">
        <span>同步间隔</span>
        <select
          value={gitConfig.autoSync.intervalMinutes}
          disabled={!gitConfig.autoSync.enabled}
          onChange={(e) => setNestedConfig('git.autoSync.intervalMinutes', Number(e.target.value))}
        >
          {SYNC_INTERVAL_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} 分钟
            </option>
          ))}
        </select>
      </label>
      <div className="lanismd-git-popover-divider" />
      <label className="lanismd-git-popover-row">
        <span>自动提交</span>
        <input
          type="checkbox"
          checked={gitConfig.autoCommit.enabled}
          onChange={(e) => setNestedConfig('git.autoCommit.enabled', e.target.checked)}
        />
      </label>
      <label className="lanismd-git-popover-row">
        <span>停止编辑后</span>
        <select
          value={gitConfig.autoCommit.idleMinutes}
          disabled={!gitConfig.autoCommit.enabled}
          onChange={(e) => setNestedConfig('git.autoCommit.idleMinutes', Number(e.target.value))}
        >
          {IDLE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m} 分钟
            </option>
          ))}
        </select>
      </label>
      <div className="lanismd-git-popover-hint">
        {lastSyncAt ? `上次同步：${timeAgo(lastSyncAt)}` : '本次启动尚未同步'}
      </div>
    </Popover>
  );
}

export function GitStatusItems() {
  const repo = useGitStore((s) => s.repo);
  const changesCount = useGitStore((s) => s.changes.length);
  const operation = useGitStore((s) => s.operation);
  const setCommitDialogOpen = useGitStore((s) => s.setCommitDialogOpen);
  const sidebarPanel = useUIStore((s) => s.sidebarPanel);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarPanel = useUIStore((s) => s.setSidebarPanel);

  if (!repo) return null;

  /** 点击切换到对应视图；再次点击回到文件树 */
  const togglePanel = (panel: 'changes' | 'history') => {
    setSidebarPanel(sidebarOpen && sidebarPanel === panel ? 'files' : panel);
  };

  return (
    <div className="flex items-center gap-3">
      <BranchItem />
      <button
        type="button"
        className={cn(
          ITEM_CLASS,
          sidebarOpen && sidebarPanel === 'changes' && 'text-[var(--lanismd-accent)]',
        )}
        title="查看更改"
        onClick={() => togglePanel('changes')}
      >
        <RiFileList3Line size={12} />
        <span>更改 {changesCount}</span>
      </button>
      <button
        type="button"
        className={cn(ITEM_CLASS, 'disabled:cursor-not-allowed disabled:opacity-40')}
        title={changesCount > 0 ? '提交并推送更改' : '没有需要提交的更改'}
        disabled={(changesCount === 0 && !repo.merging) || operation !== null}
        onClick={() => setCommitDialogOpen(true)}
      >
        {operation === 'commit' ? (
          <RiLoader4Line size={12} className="lanismd-git-spin" />
        ) : (
          <RiGitCommitLine size={12} />
        )}
        <span>提交</span>
      </button>
      <SyncItem />
      <button
        type="button"
        className={cn(
          ITEM_CLASS,
          sidebarOpen && sidebarPanel === 'history' && 'text-[var(--lanismd-accent)]',
        )}
        title="查看提交历史"
        onClick={() => togglePanel('history')}
      >
        <RiPulseLine size={12} />
        <span>历史</span>
      </button>
    </div>
  );
}

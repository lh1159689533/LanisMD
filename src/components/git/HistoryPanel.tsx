/**
 * 侧边栏「历史」视图：按天分组展示提交，展开查看提交内文件，点击文件在右侧展示 diff
 *
 * @changelog
 * | 版本   | 变更说明              | 关联                         |
 * | v1.0.0 | 初始实现：提交历史视图 | REQ: Git 改造 第 6 点         |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiExternalLinkLine,
  RiGitCommitLine,
  RiLoader4Line,
  RiPulseLine,
  RiRefreshLine,
} from 'react-icons/ri';
import { navigateLink } from '@/editor/plugins/link/click';
import { useGitStore } from '@/stores/git-store';
import { cn } from '@/utils/cn';
import { STATUS_LETTER, groupCommitsByDay, splitPath } from '@/utils/git';
import { timeAgo } from '@/utils/time';
import type { CommitInfo } from '@/types/git';
import { ChangeStats } from './ChangeStats';

import '@/styles/git/git-panels.css';

function CommitFiles({ commit }: { commit: CommitInfo }) {
  const files = useGitStore((s) => s.commitFiles[commit.hash]);
  const diffTarget = useGitStore((s) => s.diffTarget);
  const openDiff = useGitStore((s) => s.openDiff);
  const displayDir = useGitStore((s) => s.displayDir);

  if (!files) {
    return (
      <div className="lanismd-git-commit-files is-loading">
        <RiLoader4Line size={12} className="lanismd-git-spin" />
      </div>
    );
  }
  if (files.length === 0) {
    return (
      <div className="lanismd-git-commit-files is-empty">该提交在当前文件夹内没有文件变更</div>
    );
  }
  return (
    <div className="lanismd-git-commit-files">
      {files.map((file) => {
        const dir = displayDir(file.path);
        const { name } = splitPath(file.path);
        const selected =
          diffTarget?.kind === 'commit' &&
          diffTarget.commit.hash === commit.hash &&
          diffTarget.file.path === file.path;
        return (
          <button
            type="button"
            key={file.path}
            className={cn('lanismd-git-commit-file', selected && 'selected')}
            title={file.path}
            onClick={() => openDiff({ kind: 'commit', commit, file })}
          >
            <span className={cn('lanismd-git-status-letter', `is-${file.status}`)}>
              {STATUS_LETTER[file.status]}
            </span>
            <span className="lanismd-git-commit-file-name">{name}</span>
            <span className="lanismd-git-commit-file-dir">{dir}</span>
            <ChangeStats
              additions={file.additions}
              deletions={file.deletions}
              binary={file.binary}
            />
          </button>
        );
      })}
    </div>
  );
}

function CommitItem({ commit, unpushed }: { commit: CommitInfo; unpushed: boolean }) {
  const webUrl = useGitStore((s) => s.repo?.webUrl);
  const expanded = useGitStore((s) => s.expandedCommits.has(commit.hash));
  const toggleCommit = useGitStore((s) => s.toggleCommit);
  const openDiff = useGitStore((s) => s.openDiff);

  const handleClick = async () => {
    const willExpand = !expanded;
    await toggleCommit(commit.hash);
    // 展开时默认展示第一个文件的 diff
    if (willExpand) {
      const files = useGitStore.getState().commitFiles[commit.hash];
      if (files?.length) openDiff({ kind: 'commit', commit, file: files[0] });
    }
  };

  return (
    <div className={cn('lanismd-git-commit', expanded && 'expanded')}>
      <button type="button" className="lanismd-git-commit-row" onClick={() => void handleClick()}>
        <div className="lanismd-git-commit-line">
          <RiGitCommitLine size={14} className="lanismd-git-commit-icon" />
          <span className="lanismd-git-commit-subject" title={commit.subject}>
            {commit.subject}
          </span>
          {webUrl ? (
            <span
              role="link"
              tabIndex={0}
              className="lanismd-git-hash-link"
              title="在浏览器中查看提交"
              onClick={(e) => {
                e.stopPropagation();
                void navigateLink(`${webUrl}/commit/${commit.hash}`);
              }}
            >
              {commit.shortHash}
              <RiExternalLinkLine size={11} />
            </span>
          ) : (
            <span className="lanismd-git-hash">{commit.shortHash}</span>
          )}
        </div>
        <div className="lanismd-git-commit-meta">
          <span title={new Date(commit.timestamp * 1000).toLocaleString()}>
            {timeAgo(commit.timestamp * 1000)}
          </span>
          {commit.added > 0 && <span className="is-add">+{commit.added}</span>}
          {commit.modified > 0 && <span className="is-mod">~{commit.modified}</span>}
          {commit.deleted > 0 && <span className="is-del">-{commit.deleted}</span>}
          {unpushed && <span className="lanismd-git-unpushed">未推送</span>}
          <span className="lanismd-git-commit-author">{commit.authorName}</span>
        </div>
      </button>
      {expanded && <CommitFiles commit={commit} />}
    </div>
  );
}

export function HistoryPanel() {
  const history = useGitStore((s) => s.history);
  const loading = useGitStore((s) => s.historyLoading);
  const hasMore = useGitStore((s) => s.historyHasMore);
  const loadHistory = useGitStore((s) => s.loadHistory);
  const ahead = useGitStore((s) => s.repo?.ahead ?? 0);
  const hasCommits = useGitStore((s) => s.repo?.hasCommits ?? false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const bodyRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => groupCommitsByDay(history), [history]);
  // 按 HEAD 倒序排列时，前 ahead 条即为未推送的提交（线性历史下准确）
  const unpushed = useMemo(
    () => new Set(history.slice(0, ahead).map((c) => c.hash)),
    [history, ahead],
  );

  useEffect(() => {
    if (history.length === 0 && hasCommits) void loadHistory(true);
  }, [history.length, hasCommits, loadHistory]);

  // 滚动到底部附近时加载下一页
  const handleScroll = () => {
    const el = bodyRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 120) void loadHistory();
  };

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="lanismd-git-panel">
      <div className="lanismd-git-panel-header">
        <span className="lanismd-git-panel-title">
          <RiPulseLine size={14} className="lanismd-git-panel-title-icon" />
          历史
        </span>
        <div className="lanismd-git-panel-actions">
          <button
            type="button"
            className="file-tree-header-btn"
            title="刷新"
            onClick={() => void loadHistory(true)}
          >
            {loading ? (
              <RiLoader4Line size={13} className="lanismd-git-spin" />
            ) : (
              <RiRefreshLine size={13} />
            )}
          </button>
        </div>
      </div>
      <div ref={bodyRef} className="lanismd-git-panel-body" onScroll={handleScroll}>
        {!hasCommits ? (
          <div className="lanismd-git-panel-empty">还没有任何提交</div>
        ) : history.length === 0 && loading ? (
          <div className="lanismd-git-panel-empty">正在加载提交历史...</div>
        ) : (
          <>
            {groups.map((group) => {
              const isCollapsed = collapsed.has(group.key);
              return (
                <div key={group.key} className="lanismd-git-day">
                  <button
                    type="button"
                    className="lanismd-git-day-header"
                    onClick={() => toggleGroup(group.key)}
                  >
                    {isCollapsed ? <RiArrowRightSLine size={14} /> : <RiArrowDownSLine size={14} />}
                    <span>{group.label}</span>
                    <span className="lanismd-git-day-count">（{group.commits.length} 个提交）</span>
                  </button>
                  {!isCollapsed &&
                    group.commits.map((commit) => (
                      <CommitItem
                        key={commit.hash}
                        commit={commit}
                        unpushed={unpushed.has(commit.hash)}
                      />
                    ))}
                </div>
              );
            })}
            {hasMore && (
              <button
                type="button"
                className="lanismd-git-load-more"
                disabled={loading}
                onClick={() => void loadHistory()}
              >
                {loading ? '加载中...' : '加载更多'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

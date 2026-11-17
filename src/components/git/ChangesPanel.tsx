/**
 * 侧边栏「更改」视图：参考文件树列表视图，显示 Git 变更状态与行数统计，点击在右侧展示 diff
 *
 * @changelog
 * | 版本   | 变更说明              | 关联                         |
 * | v1.0.0 | 初始实现：更改文件视图 | REQ: Git 改造 第 5 点         |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useMemo, useState } from 'react';
import {
  RiArrowGoBackLine,
  RiCheckDoubleLine,
  RiFileTextLine,
  RiGitCommitLine,
  RiLoader4Line,
  RiMapPinLine,
  RiRefreshLine,
  RiAlertLine,
} from 'react-icons/ri';
import { ContextMenu, type ContextMenuGroup } from '@/components/common/ContextMenu';
import { useGitStore } from '@/stores/git-store';
import { cn } from '@/utils/cn';
import { STATUS_LABEL, STATUS_LETTER, splitPath } from '@/utils/git';
import type { ChangedFile } from '@/types/git';
import { ChangeStats } from './ChangeStats';
import { confirmDiscard, openChangedFile, revealChangedFile } from './change-actions';

import '@/styles/git/git-panels.css';

interface MenuState {
  x: number;
  y: number;
  file: ChangedFile;
}

function ChangeItem({
  file,
  selected,
  onClick,
  onContextMenu,
}: {
  file: ChangedFile;
  selected: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const displayDir = useGitStore((s) => s.displayDir);
  const dir = displayDir(file.path);
  const { name } = splitPath(file.path);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  return (
    <button
      type="button"
      className={cn(
        'file-list-item lanismd-git-change-item',
        selected && 'selected',
        `is-${file.status}`,
      )}
      title={`${STATUS_LABEL[file.status]}：${file.path}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="file-list-item-meta">
        <span className="file-list-item-folder">{dir}</span>
        <ChangeStats additions={file.additions} deletions={file.deletions} binary={file.binary} />
      </div>
      <div className="lanismd-git-change-name">
        <span className={cn('file-list-item-name', file.status === 'deleted' && 'is-deleted')}>
          <span className="file-list-item-stem">{stem}</span>
          <span className="file-list-item-ext">{ext}</span>
        </span>
        <span className={cn('lanismd-git-status-letter', `is-${file.status}`)}>
          {STATUS_LETTER[file.status]}
        </span>
      </div>
    </button>
  );
}

export function ChangesPanel() {
  const repo = useGitStore((s) => s.repo);
  const changes = useGitStore((s) => s.changes);
  const loading = useGitStore((s) => s.changesLoading);
  const diffTarget = useGitStore((s) => s.diffTarget);
  const openDiff = useGitStore((s) => s.openDiff);
  const refresh = useGitStore((s) => s.refresh);
  const abortMerge = useGitStore((s) => s.abortMerge);
  const resolveConflict = useGitStore((s) => s.resolveConflict);
  const setCommitDialogOpen = useGitStore((s) => s.setCommitDialogOpen);
  const operation = useGitStore((s) => s.operation);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const conflicts = useMemo(() => changes.filter((f) => f.status === 'conflicted'), [changes]);
  const others = useMemo(() => changes.filter((f) => f.status !== 'conflicted'), [changes]);
  const totals = useMemo(
    () =>
      changes.reduce(
        (acc, f) => ({ add: acc.add + (f.additions ?? 0), del: acc.del + (f.deletions ?? 0) }),
        { add: 0, del: 0 },
      ),
    [changes],
  );

  const buildMenu = useCallback(
    (file: ChangedFile): ContextMenuGroup[] => {
      const groups: ContextMenuGroup[] = [];
      if (file.status === 'conflicted') {
        groups.push({
          items: [
            { label: '保留本地版本', onClick: () => void resolveConflict(file, 'local') },
            { label: '使用远程版本', onClick: () => void resolveConflict(file, 'remote') },
            {
              label: '标记为已解决',
              icon: <RiCheckDoubleLine size={14} />,
              onClick: () => void resolveConflict(file, 'mark'),
            },
          ],
        });
      }
      groups.push({
        items: [
          {
            label: '打开文件',
            icon: <RiFileTextLine size={14} />,
            disabled: file.status === 'deleted' || file.binary,
            onClick: () => void openChangedFile(file),
          },
          {
            label: '在文件树中定位',
            icon: <RiMapPinLine size={14} />,
            disabled: file.status === 'deleted',
            onClick: () => revealChangedFile(file),
          },
        ],
      });
      if (file.status !== 'conflicted') {
        groups.push({
          items: [
            {
              label: '放弃更改',
              icon: <RiArrowGoBackLine size={14} />,
              onClick: () => void confirmDiscard([file]),
            },
          ],
        });
      }
      return groups;
    },
    [resolveConflict],
  );

  const renderItem = (file: ChangedFile) => (
    <ChangeItem
      key={file.path}
      file={file}
      selected={diffTarget?.kind === 'working' && diffTarget.file.path === file.path}
      onClick={() => openDiff({ kind: 'working', file })}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, file });
      }}
    />
  );

  return (
    <div className="lanismd-git-panel">
      <div className="lanismd-git-panel-header">
        <span className="lanismd-git-panel-title">
          更改
          {changes.length > 0 && <span className="lanismd-git-panel-count">{changes.length}</span>}
        </span>
        <div className="lanismd-git-panel-actions">
          <button
            type="button"
            className="file-tree-header-btn"
            title="刷新"
            onClick={() => void refresh()}
          >
            {loading ? (
              <RiLoader4Line size={13} className="lanismd-git-spin" />
            ) : (
              <RiRefreshLine size={13} />
            )}
          </button>
          <button
            type="button"
            className="file-tree-header-btn"
            title="提交更改"
            disabled={changes.length === 0 || operation !== null}
            onClick={() => setCommitDialogOpen(true)}
          >
            <RiGitCommitLine size={13} />
          </button>
        </div>
      </div>

      {changes.length > 0 && (
        <div className="lanismd-git-panel-summary">
          <span>{changes.length} 个文件</span>
          <span className="lanismd-git-stats">
            <span className="is-add">+{totals.add}</span>
            <span className="is-del">-{totals.del}</span>
          </span>
        </div>
      )}

      {(repo?.merging || conflicts.length > 0) && (
        <div className="lanismd-git-merge-banner">
          <RiAlertLine size={14} />
          <span>
            {conflicts.length > 0
              ? `${conflicts.length} 个文件存在冲突，解决后提交即可完成同步`
              : '冲突已全部解决，提交以完成合并'}
          </span>
          {repo?.merging && (
            <button type="button" onClick={() => void abortMerge()}>
              放弃合并
            </button>
          )}
        </div>
      )}

      <div className="lanismd-git-panel-body">
        {changes.length === 0 ? (
          <div className="lanismd-git-panel-empty">
            {loading ? '正在读取更改...' : '没有未提交的更改'}
          </div>
        ) : (
          <div className="file-list">
            {conflicts.length > 0 && <div className="lanismd-git-section-label">冲突</div>}
            {conflicts.map(renderItem)}
            {conflicts.length > 0 && others.length > 0 && (
              <div className="lanismd-git-section-label">更改</div>
            )}
            {others.map(renderItem)}
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          groups={buildMenu(menu.file)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

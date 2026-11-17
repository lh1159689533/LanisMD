/**
 * 主区域 diff 面板：展示工作区更改或某次提交中文件的差异（基于 @codemirror/merge）
 *
 * @changelog
 * | 版本   | 变更说明                        | 关联                                |
 * | v1.0.0 | 初始实现：并排/行内 diff、图片对比 | REQ: Git 改造 TECH: 更改/历史 diff 面板 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RiCloseLine,
  RiExternalLinkLine,
  RiFileTextLine,
  RiLayoutColumnLine,
  RiLayoutRowLine,
  RiLoader4Line,
  RiArrowGoBackLine,
} from 'react-icons/ri';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { navigateLink } from '@/editor/plugins/link/click';
import { gitErrorMessage, gitService } from '@/services/tauri/git-service';
import { useGitStore } from '@/stores/git-store';
import { cn } from '@/utils/cn';
import { STATUS_LABEL } from '@/utils/git';
import { timeAgo } from '@/utils/time';
import type { FileVersions } from '@/types/git';
import { ChangeStats } from './ChangeStats';
import { ConflictActions } from './ConflictActions';
import { openChangedFile, confirmDiscard } from './change-actions';

import '@/styles/git/git-diff.css';

type DiffLayout = 'split' | 'unified';
const LAYOUT_STORAGE_KEY = 'lanismd:git-diff-layout';

/** diff 编辑器主题：消费 CSS 变量，跟随应用主题 */
const diffTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--lanismd-editor-bg)',
    color: 'var(--lanismd-editor-text)',
    fontSize: '13px',
  },
  '.cm-content': { fontFamily: 'var(--lanismd-font-mono)' },
  '.cm-gutters': {
    backgroundColor: 'var(--lanismd-editor-bg)',
    color: 'var(--lanismd-text-muted)',
    border: 'none',
  },
});

function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    markdown(),
    diffTheme,
    EditorView.lineWrapping,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
  ];
}

const COLLAPSE = { margin: 3, minSize: 6 };

function DiffEditor({ versions, layout }: { versions: FileVersions; layout: DiffLayout }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const original = versions.original ?? '';
    const modified = versions.modified ?? '';
    if (layout === 'split') {
      const view = new MergeView({
        a: { doc: original, extensions: baseExtensions() },
        b: { doc: modified, extensions: baseExtensions() },
        parent: host,
        gutter: true,
        highlightChanges: true,
        collapseUnchanged: COLLAPSE,
      });
      return () => view.destroy();
    }
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: modified,
        extensions: [
          ...baseExtensions(),
          unifiedMergeView({
            original,
            mergeControls: false,
            gutter: true,
            highlightChanges: true,
            collapseUnchanged: COLLAPSE,
          }),
        ],
      }),
    });
    return () => view.destroy();
  }, [versions, layout]);

  return <div ref={hostRef} className="lanismd-git-diff-editor" />;
}

function ImageDiff({ versions }: { versions: FileVersions }) {
  return (
    <div className="lanismd-git-diff-images">
      <figure>
        <figcaption>修改前</figcaption>
        {versions.originalDataUrl ? (
          <img src={versions.originalDataUrl} alt="修改前" />
        ) : (
          <span>无</span>
        )}
      </figure>
      <figure>
        <figcaption>修改后</figcaption>
        {versions.modifiedDataUrl ? (
          <img src={versions.modifiedDataUrl} alt="修改后" />
        ) : (
          <span>无</span>
        )}
      </figure>
    </div>
  );
}

export function GitDiffPanel() {
  const target = useGitStore((s) => s.diffTarget);
  const repo = useGitStore((s) => s.repo);
  const changes = useGitStore((s) => s.changes);
  const closeDiff = useGitStore((s) => s.closeDiff);
  const displayPath = useGitStore((s) => s.displayPath);
  const [versions, setVersions] = useState<FileVersions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<DiffLayout>(
    () => (localStorage.getItem(LAYOUT_STORAGE_KEY) as DiffLayout) || 'split',
  );

  // 工作区 diff：文件在查看期间被修改时，用最新的统计作为刷新依据
  const liveFile = useMemo(() => {
    if (target?.kind !== 'working') return null;
    return changes.find((f) => f.path === target.file.path) ?? null;
  }, [target, changes]);
  const file = target?.kind === 'working' ? (liveFile ?? target.file) : target?.file;
  const refreshKey = liveFile
    ? `${liveFile.status}:${liveFile.additions}:${liveFile.deletions}`
    : '';

  useEffect(() => {
    if (!target || !repo || !file) return;
    let cancelled = false;
    setError(null);
    setVersions(null);
    gitService
      .fileVersions({
        repoPath: repo.root,
        filePath: file.path,
        oldPath: file.oldPath,
        status: file.status,
        commit: target.kind === 'commit' ? target.commit.hash : null,
      })
      .then((v) => !cancelled && setVersions(v))
      .catch((e) => !cancelled && setError(gitErrorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [target, repo?.root, file?.path, refreshKey]);

  if (!target || !file) return null;

  const switchLayout = (next: DiffLayout) => {
    setLayout(next);
    localStorage.setItem(LAYOUT_STORAGE_KEY, next);
  };
  const isWorking = target.kind === 'working';
  const fileGone = isWorking && !liveFile;
  const commitUrl =
    target.kind === 'commit' && repo?.webUrl ? `${repo.webUrl}/commit/${target.commit.hash}` : null;

  return (
    <div className="lanismd-git-diff">
      <div className="lanismd-git-diff-header">
        <div className="lanismd-git-diff-title">
          <span className={cn('lanismd-git-status-badge', `is-${file.status}`)}>
            {STATUS_LABEL[file.status]}
          </span>
          <span className="lanismd-git-diff-path" title={file.path}>
            {file.oldPath ? `${displayPath(file.oldPath)} → ` : ''}
            {displayPath(file.path)}
          </span>
          <ChangeStats additions={file.additions} deletions={file.deletions} binary={file.binary} />
        </div>
        <div className="lanismd-git-diff-actions">
          {!versions?.binary && (
            <>
              <button
                type="button"
                className={cn('lanismd-git-icon-btn', layout === 'split' && 'active')}
                title="并排对比"
                onClick={() => switchLayout('split')}
              >
                <RiLayoutColumnLine size={14} />
              </button>
              <button
                type="button"
                className={cn('lanismd-git-icon-btn', layout === 'unified' && 'active')}
                title="行内对比"
                onClick={() => switchLayout('unified')}
              >
                <RiLayoutRowLine size={14} />
              </button>
            </>
          )}
          {isWorking && !fileGone && file.status !== 'deleted' && !file.binary && (
            <button
              type="button"
              className="lanismd-git-icon-btn"
              title="打开文件"
              onClick={() => void openChangedFile(file)}
            >
              <RiFileTextLine size={14} />
            </button>
          )}
          {isWorking && !fileGone && file.status !== 'conflicted' && (
            <button
              type="button"
              className="lanismd-git-icon-btn"
              title="放弃更改"
              onClick={() => void confirmDiscard([file])}
            >
              <RiArrowGoBackLine size={14} />
            </button>
          )}
          <button type="button" className="lanismd-git-icon-btn" title="关闭" onClick={closeDiff}>
            <RiCloseLine size={16} />
          </button>
        </div>
      </div>

      {target.kind === 'commit' && (
        <div className="lanismd-git-diff-commit">
          <span className="lanismd-git-diff-commit-subject">{target.commit.subject}</span>
          <span className="lanismd-git-diff-commit-meta">
            {target.commit.authorName} · {timeAgo(target.commit.timestamp * 1000)} ·{' '}
            {commitUrl ? (
              <button
                type="button"
                className="lanismd-git-hash-link"
                onClick={() => void navigateLink(commitUrl)}
              >
                {target.commit.shortHash}
                <RiExternalLinkLine size={11} />
              </button>
            ) : (
              <span className="lanismd-git-hash">{target.commit.shortHash}</span>
            )}
          </span>
        </div>
      )}

      {isWorking && liveFile?.status === 'conflicted' && (
        <div className="lanismd-git-diff-conflict">
          <span>该文件存在合并冲突，可直接编辑后标记已解决，或选择保留某一方的版本。</span>
          <ConflictActions file={liveFile} />
        </div>
      )}

      <div className="lanismd-git-diff-body">
        {fileGone ? (
          <div className="lanismd-git-diff-empty">该文件已没有未提交的更改</div>
        ) : error ? (
          <div className="lanismd-git-diff-empty is-error">{error}</div>
        ) : !versions ? (
          <div className="lanismd-git-diff-empty">
            <RiLoader4Line size={16} className="lanismd-git-spin" />
            <span>正在加载差异...</span>
          </div>
        ) : versions.binary ? (
          versions.originalDataUrl || versions.modifiedDataUrl ? (
            <ImageDiff versions={versions} />
          ) : (
            <div className="lanismd-git-diff-empty">二进制文件或文件过大，无法显示差异</div>
          )
        ) : versions.original === versions.modified ? (
          <div className="lanismd-git-diff-empty">内容无差异（可能仅修改了文件权限或换行符）</div>
        ) : (
          <DiffEditor versions={versions} layout={layout} />
        )}
      </div>
    </div>
  );
}

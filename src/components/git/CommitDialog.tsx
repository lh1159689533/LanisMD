/**
 * 提交弹窗：变更文件数 + 提交说明（支持 AI 生成）+ 可展开的文件预览（可勾选），主操作为 Commit & Push
 *
 * @changelog
 * | 版本   | 变更说明              | 关联                         |
 * | v1.0.0 | 初始实现：Commit & Push 弹窗 | REQ: Git 改造 第 3 点   |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RiAlertLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiGitBranchLine,
  RiGitCommitLine,
  RiLoader4Line,
} from 'react-icons/ri';
import { Dialog } from '@/components/common/Dialog';
import { AiIcon } from '@/components/common/AiIcon';
import { generateCommitMessage, isAiCommitAvailable } from '@/services/ai/commit-message';
import { gitErrorMessage, gitService, toEntry } from '@/services/tauri/git-service';
import { isPushRejected, useGitStore } from '@/stores/git-store';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/utils/cn';
import { STATUS_LETTER } from '@/utils/git';
import { ChangeStats } from './ChangeStats';

import '@/styles/git/git-dialog.css';

export function CommitDialog() {
  const open = useGitStore((s) => s.commitDialogOpen);
  if (!open) return null;
  return <CommitDialogContent />;
}

function CommitDialogContent() {
  const repo = useGitStore((s) => s.repo);
  const changes = useGitStore((s) => s.changes);
  const operation = useGitStore((s) => s.operation);
  const commit = useGitStore((s) => s.commit);
  const refresh = useGitStore((s) => s.refresh);
  const displayPath = useGitStore((s) => s.displayPath);
  const setOpen = useGitStore((s) => s.setCommitDialogOpen);
  const aiEnabled = useSettingsStore((s) => s.config.ai?.enabled === true);

  const [message, setMessage] = useState('');
  const [showFiles, setShowFiles] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [identity, setIdentity] = useState({ name: '', email: '', global: true });
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pull = useGitStore((s) => s.pull);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const merging = repo?.merging ?? false;
  const needIdentity = !repo?.userName || !repo?.userEmail;
  const conflicts = changes.filter((f) => f.status === 'conflicted');
  // 合并提交必须包含全部文件
  const selected = useMemo(
    () => (merging ? changes : changes.filter((f) => !excluded.has(f.path))),
    [changes, excluded, merging],
  );
  const busy = operation !== null || generating;
  const canSubmit =
    !busy &&
    conflicts.length === 0 &&
    (selected.length > 0 || merging) &&
    (message.trim().length > 0 || merging) &&
    (!needIdentity || (identity.name.trim() && identity.email.trim()));

  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    void refresh();
    // Dialog 打开后会在 80ms 内抢占焦点到容器，延后聚焦输入框
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const handleGenerate = async () => {
    if (!repo || selected.length === 0) return;
    setAiError(null);
    if (!(await isAiCommitAvailable())) {
      setAiError('请先在「设置 > AI 助手」中配置服务商的 API Key 与模型');
      return;
    }
    setGenerating(true);
    try {
      const text = await generateCommitMessage(repo.root, selected.map(toEntry), setMessage);
      setMessage(text);
    } catch (error) {
      setAiError(`生成失败：${gitErrorMessage(error)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!repo || !canSubmit) return;
    if (needIdentity) {
      try {
        await gitService.setIdentity(repo.root, identity.name, identity.email, identity.global);
        await refresh();
      } catch (error) {
        setIdentityError(gitErrorMessage(error));
        return;
      }
    }
    setSubmitError(null);
    const error = await commit(selected, message, { silent: true });
    if (error) {
      // 推送失败时提交已回滚，保持弹窗与提交说明，方便同步后重试
      setSubmitError(error);
      return;
    }
    close();
  };

  const toggleFile = (path: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const allSelected = excluded.size === 0;
  const target =
    repo?.upstream ?? (repo?.remoteName ? `${repo.remoteName}/${repo.branch ?? ''}` : null);

  return (
    <Dialog
      open
      onClose={close}
      title={merging ? '提交合并结果' : '提交更改'}
      icon={
        <span className="git-dialog-header-icon commit">
          <RiGitCommitLine size={16} />
        </span>
      }
      className="git-dialog--commit"
      footer={
        <>
          <span className="git-dialog-footer-hint">⌘/Ctrl + Enter 提交</span>
          <button type="button" className="git-dialog-btn git-dialog-btn-cancel" onClick={close}>
            取消
          </button>
          <button
            type="button"
            className="git-dialog-btn git-dialog-btn-primary"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {operation === 'commit' && <RiLoader4Line size={14} className="lanismd-git-spin" />}
            <span>Commit &amp; Push</span>
          </button>
        </>
      }
    >
      <div
        className="git-dialog-body-inner"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void handleSubmit();
          }
        }}
      >
        <div className="git-dialog-summary">
          <span className="git-dialog-summary-count">
            {changes.length} 个文件更改
            {!merging && selected.length !== changes.length && `（已选 ${selected.length} 个）`}
          </span>
          {repo?.branch && (
            <span
              className="git-dialog-summary-branch"
              title={target ? `推送到 ${target}` : undefined}
            >
              <RiGitBranchLine size={12} />
              {repo.branch}
              {target && <span className="git-dialog-summary-target">→ {target}</span>}
            </span>
          )}
        </div>

        {conflicts.length > 0 && (
          <div className="git-dialog-warning">
            <RiAlertLine size={14} />
            <span>存在 {conflicts.length} 个冲突文件，请先在「更改」视图中解决冲突。</span>
          </div>
        )}
        {!repo?.remoteName && (
          <div className="git-dialog-warning">
            <RiAlertLine size={14} />
            <span>当前仓库未配置远程仓库，提交后将无法推送。</span>
          </div>
        )}

        {submitError && (
          <div className="git-dialog-error">
            <RiAlertLine size={14} />
            <span>{submitError}</span>
            {isPushRejected(submitError) && !merging && (
              <span className="git-dialog-warning-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const result = await pull();
                    if (result && result.conflicts.length === 0) setSubmitError(null);
                  }}
                >
                  {operation === 'pull' ? '同步中...' : '先同步再提交'}
                </button>
              </span>
            )}
          </div>
        )}

        {needIdentity && (
          <div className="git-dialog-field">
            <label className="git-dialog-label">提交者身份（首次提交需要配置）</label>
            <div className="git-dialog-row">
              <input
                className="git-dialog-input"
                placeholder="姓名"
                value={identity.name}
                onChange={(e) => setIdentity({ ...identity, name: e.target.value })}
              />
              <input
                className="git-dialog-input"
                placeholder="邮箱"
                value={identity.email}
                onChange={(e) => setIdentity({ ...identity, email: e.target.value })}
              />
            </div>
            <label className="git-dialog-checkbox-label">
              <input
                type="checkbox"
                checked={identity.global}
                onChange={(e) => setIdentity({ ...identity, global: e.target.checked })}
              />
              <span>保存为全局配置（对所有仓库生效）</span>
            </label>
            {identityError && <span className="git-dialog-field-error">{identityError}</span>}
          </div>
        )}

        <div className="git-dialog-field">
          <div className="git-dialog-label-row">
            <label className="git-dialog-label">提交说明</label>
            {aiEnabled && (
              <button
                type="button"
                className="git-dialog-ai-btn"
                disabled={generating || selected.length === 0}
                onClick={() => void handleGenerate()}
              >
                {generating ? (
                  <RiLoader4Line size={12} className="lanismd-git-spin" />
                ) : (
                  <AiIcon size={12} />
                )}
                <span>{generating ? '生成中...' : 'AI 生成'}</span>
              </button>
            )}
          </div>
          <textarea
            ref={textareaRef}
            className="git-dialog-input git-dialog-textarea"
            rows={4}
            placeholder={
              merging ? '留空则使用默认的合并提交说明' : '描述本次修改，如：docs: 更新安装说明'
            }
            value={message}
            disabled={generating}
            onChange={(e) => setMessage(e.target.value)}
          />
          {aiError && <span className="git-dialog-field-error">{aiError}</span>}
          {aiEnabled && (
            <span className="git-dialog-field-hint">
              AI 生成时会将变更内容（最多 8KB）发送给当前 AI 服务商
            </span>
          )}
        </div>

        <div className="git-dialog-field">
          <button
            type="button"
            className="git-dialog-files-toggle"
            onClick={() => setShowFiles((v) => !v)}
          >
            {showFiles ? <RiArrowDownSLine size={14} /> : <RiArrowRightSLine size={14} />}
            <span>文件预览</span>
          </button>
          {showFiles && (
            <div className="git-dialog-change-list">
              {!merging && changes.length > 1 && (
                <label className="git-dialog-change-item git-dialog-change-all">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() =>
                      setExcluded(allSelected ? new Set(changes.map((f) => f.path)) : new Set())
                    }
                  />
                  <span>全选</span>
                </label>
              )}
              {changes.map((file) => (
                <label key={file.path} className="git-dialog-change-item">
                  <input
                    type="checkbox"
                    disabled={merging}
                    checked={merging || !excluded.has(file.path)}
                    onChange={() => toggleFile(file.path)}
                  />
                  <span className={cn('lanismd-git-status-letter', `is-${file.status}`)}>
                    {STATUS_LETTER[file.status]}
                  </span>
                  <span className="git-dialog-change-path" title={file.path}>
                    {displayPath(file.path)}
                  </span>
                  <ChangeStats
                    additions={file.additions}
                    deletions={file.deletions}
                    binary={file.binary}
                  />
                </label>
              ))}
              {merging && <div className="git-dialog-field-hint">合并提交需包含全部文件</div>}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

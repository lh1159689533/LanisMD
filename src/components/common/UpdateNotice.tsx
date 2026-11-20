/**
 * 右下角更新通知面板
 *
 * 由 useSystemStore 驱动：检查中 -> 已是最新 / 发现新版本 -> 下载进度 -> 重启生效。
 * 与 Toast 共用右下角堆叠容器，避免两者互相遮挡；面板可随时关闭，下载中关闭不会中断下载。
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                                |
 * | v1.0.0 | 初始实现：替代更新弹窗，支持稍后 / 更新 / 关闭 | REQ: 系统集成-更新通知 TECH: 状态机  |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  RiCheckLine,
  RiCloseLine,
  RiDownloadCloud2Line,
  RiErrorWarningLine,
  RiLoader4Line,
  RiRestartLine,
} from 'react-icons/ri';
import { useSystemStore } from '@/stores/system-store';
import { cn } from '@/utils/cn';
import type { UpdateInfo, UpdateStatus } from '@/types';
import '@/styles/common/update-notice.css';

/** 退出动画时长（毫秒），与 Toast 保持一致 */
const EXIT_ANIMATION_DURATION = 200;
/** 「已是最新版本」自动收起延迟（毫秒） */
const UP_TO_DATE_DURATION = 2500;

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('zh-CN');
}

interface NoticeContent {
  icon: ReactNode;
  title: string;
  tone: 'info' | 'success' | 'error';
}

function resolveContent(status: UpdateStatus, info: UpdateInfo | null): NoticeContent {
  switch (status) {
    case 'checking':
      return {
        icon: <RiLoader4Line size={14} className="animate-spin" />,
        title: '正在检查更新…',
        tone: 'info',
      };
    case 'up-to-date':
      return { icon: <RiCheckLine size={14} />, title: '当前已是最新版本', tone: 'success' };
    case 'downloading':
      return { icon: <RiDownloadCloud2Line size={14} />, title: '正在下载更新', tone: 'info' };
    case 'ready':
      return { icon: <RiRestartLine size={14} />, title: '更新已就绪', tone: 'success' };
    case 'error':
      return { icon: <RiErrorWarningLine size={14} />, title: '更新失败', tone: 'error' };
    default:
      return {
        icon: <RiDownloadCloud2Line size={14} />,
        title: info ? `发现新版本 ${info.version}` : '发现新版本',
        tone: 'info',
      };
  }
}

export function UpdateNotice() {
  const open = useSystemStore((s) => s.noticeOpen);
  const status = useSystemStore((s) => s.status);

  // idle 状态没有可展示的内容，即使 open 也不渲染
  if (!open || status === 'idle') return null;
  return <UpdateNoticePanel status={status} />;
}

function UpdateNoticePanel({ status }: { status: UpdateStatus }) {
  const info = useSystemStore((s) => s.info);
  const progress = useSystemStore((s) => s.progress);
  const error = useSystemStore((s) => s.error);
  const installUpdate = useSystemStore((s) => s.installUpdate);
  const relaunch = useSystemStore((s) => s.relaunch);
  const dismissUpdate = useSystemStore((s) => s.dismissUpdate);
  const checkForUpdate = useSystemStore((s) => s.checkForUpdate);
  const [isExiting, setIsExiting] = useState(false);

  /** 先播放退出动画，结束后再真正收起 */
  const close = useCallback(() => {
    setIsExiting(true);
    window.setTimeout(() => {
      dismissUpdate();
      setIsExiting(false);
    }, EXIT_ANIMATION_DURATION);
  }, [dismissUpdate]);

  useEffect(() => {
    if (status !== 'up-to-date') return;
    const timer = window.setTimeout(close, UP_TO_DATE_DURATION);
    return () => window.clearTimeout(timer);
  }, [status, close]);

  const content = resolveContent(status, info);
  const percent = Math.round(progress * 100);
  const publishDate = formatDate(info?.date);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'lanismd-update-notice',
        isExiting
          ? 'animate-out fade-out slide-out-to-right-2'
          : 'animate-in slide-in-from-right-2',
      )}
      style={{ animationDuration: isExiting ? `${EXIT_ANIMATION_DURATION}ms` : undefined }}
    >
      <div className="lanismd-update-notice-header">
        <span className={cn('lanismd-update-notice-icon', `is-${content.tone}`)}>
          {content.icon}
        </span>
        <span className="lanismd-update-notice-title">{content.title}</span>
        <button
          type="button"
          className="lanismd-update-notice-close"
          aria-label="关闭"
          title={status === 'downloading' ? '隐藏（下载将在后台继续）' : '关闭'}
          onClick={close}
        >
          <RiCloseLine size={14} />
        </button>
      </div>

      {status === 'available' && info && (
        <>
          <div className="lanismd-update-notice-meta">
            当前版本 {info.currentVersion}
            {publishDate ? ` · ${publishDate} 发布` : ''}
          </div>
          {info.body && <div className="lanismd-update-notice-notes">{info.body}</div>}
        </>
      )}

      {status === 'downloading' && (
        <div className="lanismd-update-notice-progress">
          <div className="lanismd-update-notice-progress-track">
            <div className="lanismd-update-notice-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="lanismd-update-notice-meta">{percent}%</span>
        </div>
      )}

      {status === 'ready' && (
        <div className="lanismd-update-notice-meta">新版本已安装，重启应用后生效。</div>
      )}

      {status === 'error' && error && <div className="lanismd-update-notice-error">{error}</div>}

      {status === 'available' && (
        <div className="lanismd-update-notice-actions">
          <button type="button" className="lanismd-update-notice-btn" onClick={close}>
            稍后
          </button>
          <button
            type="button"
            className="lanismd-update-notice-btn is-primary"
            onClick={() => void installUpdate()}
          >
            更新
          </button>
        </div>
      )}

      {status === 'ready' && (
        <div className="lanismd-update-notice-actions">
          <button type="button" className="lanismd-update-notice-btn" onClick={close}>
            稍后重启
          </button>
          <button
            type="button"
            className="lanismd-update-notice-btn is-primary"
            onClick={() => void relaunch()}
          >
            立即重启
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="lanismd-update-notice-actions">
          <button
            type="button"
            className="lanismd-update-notice-btn is-primary"
            onClick={() => void checkForUpdate(false)}
          >
            重新检查
          </button>
        </div>
      )}
    </div>
  );
}

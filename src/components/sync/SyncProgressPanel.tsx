/**
 * 同步进度浮动面板（文件列表）
 */

import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  RiCloseLine,
  RiUploadCloud2Line,
  RiDownloadCloud2Line,
  RiRefreshLine,
} from 'react-icons/ri';
import { useSyncStore } from '@/stores/sync-store';
import type { SyncFileProgress } from '@/types/sync';
import '@/styles/sync/sync-progress-panel.css';

/** 状态中文标签 */
const STATUS_LABEL: Record<SyncFileProgress['status'], string> = {
  waiting: '等待',
  syncing: '同步中',
  done: '完成',
  failed: '失败',
};

/** 从文件路径提取文件名 */
function getFileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * 从嵌套错误信息中提取核心原因
 * 例: "上传失败: Config error: Gitee 上传文件失败 (400 Bad Request): {"messages":["content is empty"]}"
 * 提取为: "content is empty"
 */
function extractErrorCause(message: string): string {
  // 尝试从 JSON 响应体中提取 messages 字段
  const jsonMatch = message.match(/\{"messages":\["(.+?)"\]/);
  if (jsonMatch) return jsonMatch[1];

  // 尝试从 JSON 响应体中提取 message 字段
  const msgMatch = message.match(/"message"\s*:\s*"(.+?)"/);
  if (msgMatch) return msgMatch[1];

  // 取最后一个冒号后的内容作为核心错误
  const lastColon = message.lastIndexOf(': ');
  if (lastColon > 0) {
    const tail = message.slice(lastColon + 2).trim();
    if (tail.length > 0) return tail;
  }

  return message;
}

/** 单个文件进度条目 */
function SyncFileItem({ file }: { file: SyncFileProgress }) {
  const DirectionIcon =
    file.direction === 'upload' ? RiUploadCloud2Line : RiDownloadCloud2Line;
  const retryFailedFile = useSyncStore((s) => s.retryFailedFile);
  const itemRef = useRef<HTMLDivElement>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // 进度条样式类名
  const barClass =
    file.status === 'done' ? 'done' : file.status === 'failed' ? 'failed' : file.direction;

  // 是否有失败信息需要展示 tooltip
  const hasError = file.status === 'failed' && file.errorMessage;

  // hover 时计算位置，在条目上方显示 tooltip
  const handleMouseEnter = useCallback(() => {
    if (!hasError || !itemRef.current) return;
    const rect = itemRef.current.getBoundingClientRect();
    setTooltipPos({ x: rect.left + 12, y: rect.top - 4 });
  }, [hasError]);

  const handleMouseLeave = useCallback(() => {
    setTooltipPos(null);
  }, []);

  return (
    <div
      ref={itemRef}
      className="lanismd-sync-file-item"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 方向图标 */}
      <div className={`lanismd-sync-file-icon ${file.direction}`}>
        <DirectionIcon size={14} />
      </div>

      {/* 文件名 + 进度条 */}
      <div className="lanismd-sync-file-info">
        <span className="lanismd-sync-file-name">{getFileName(file.path)}</span>
        <div className="lanismd-sync-file-progress">
          <div
            className={`lanismd-sync-file-progress-bar ${barClass}`}
            style={{ width: `${file.percent}%` }}
          />
        </div>
      </div>

      {/* 失败时显示重试按钮，否则显示状态标签 */}
      {file.status === 'failed' ? (
        <button
          className="lanismd-sync-file-retry"
          onClick={() => retryFailedFile(file.path)}
          title={`重试 ${getFileName(file.path)}`}
        >
          <RiRefreshLine size={12} />
          <span>重试</span>
        </button>
      ) : (
        <span className={`lanismd-sync-file-status ${file.status}`}>
          {STATUS_LABEL[file.status]}
        </span>
      )}

      {/* fixed 定位的错误 tooltip，通过 portal 渲染到 body，不受 overflow 裁切 */}
      {hasError &&
        tooltipPos &&
        createPortal(
          <div
            className="lanismd-sync-error-tooltip"
            style={{
              left: tooltipPos.x,
              top: tooltipPos.y,
              transform: 'translateY(-100%)',
            }}
          >
            {extractErrorCause(file.errorMessage!)}
          </div>,
          document.body,
        )}
    </div>
  );
}

/** 同步进度浮动面板 — 显示文件级同步进度列表 */
export function SyncProgressPanel() {
  const activeSync = useSyncStore((s) => s.activeSync);
  const fileList = useSyncStore((s) => s.fileProgressList);
  const visible = useSyncStore((s) => s.syncPanelVisible);
  const dismissPanel = useSyncStore((s) => s.dismissPanel);
  const clearSyncState = useSyncStore((s) => s.clearSyncState);

  // 面板被关闭或没有同步数据时不渲染
  const hasData = activeSync || fileList.length > 0;
  if (!visible || !hasData) return null;

  const phase = activeSync?.phase;
  const current = activeSync?.current ?? 0;
  const total = activeSync?.total ?? 0;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  const hasFailedFiles = fileList.some((f) => f.status === 'failed');

  // 阶段标题映射
  const phaseTitle: Record<string, string> = {
    scanning: '正在扫描文件...',
    downloading: '正在拉取文件',
    uploading: '正在推送文件',
    file_done: '正在同步文件',
    file_failed: '正在同步文件',
    completed: '同步完成',
    error: '同步出错',
  };

  // 根据状态确定标题
  const title = phase ? phaseTitle[phase] || '同步中' : hasFailedFiles ? '同步出错' : '同步完成';

  /** 关闭面板：标记用户手动关闭 */
  const handleClose = () => {
    // 如果没有失败文件且同步已完成/出错，关闭面板同时清除所有状态
    if (!hasFailedFiles && (phase === 'completed' || phase === 'error' || !phase)) {
      clearSyncState();
    } else {
      // 同步进行中或有失败文件时，仅隐藏面板
      dismissPanel();
    }
  };

  return (
    <div className="lanismd-sync-panel">
      {/* 头部 */}
      <div className="lanismd-sync-panel-header">
        <div className="lanismd-sync-panel-title">
          <span>{title}</span>
          {hasFailedFiles && (
            <span className="lanismd-sync-panel-fail-hint">
              {fileList.filter((f) => f.status === 'failed').length} 个文件失败
            </span>
          )}
        </div>
        <button className="lanismd-sync-panel-close" onClick={handleClose} title="关闭面板">
          <RiCloseLine size={14} />
        </button>
      </div>

      {/* 文件列表 */}
      <div className="lanismd-sync-panel-list">
        {fileList.length > 0 ? (
          fileList.map((file) => <SyncFileItem key={file.path} file={file} />)
        ) : (
          <div className="lanismd-sync-panel-empty">
            {phase === 'scanning' ? '正在扫描变更文件...' : '暂无文件'}
          </div>
        )}
      </div>

      {/* 底部总进度 */}
      {total > 0 && (
        <div className="lanismd-sync-panel-footer">
          <div className="lanismd-sync-panel-footer-progress">
            <div className="lanismd-sync-panel-footer-bar" style={{ width: `${percent}%` }} />
          </div>
          <span className="lanismd-sync-panel-footer-text">
            {current}/{total}
          </span>
        </div>
      )}
    </div>
  );
}

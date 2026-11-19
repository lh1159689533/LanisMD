/**
 * 自动更新对话框
 *
 * 由 useSystemStore 驱动：发现新版本 -> 下载安装（进度）-> 重启生效。
 * 检查更新失败不会打开此弹窗，仅以 Toast / 日志反馈。
 *
 * @changelog
 * | 版本   | 变更说明                             | 关联                                |
 * | v1.0.0 | 初始实现：更新信息、进度与重启入口   | REQ: 系统集成-自动更新 TECH: 状态机  |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useSystemStore } from '@/stores/system-store';
import { Dialog } from './Dialog';
import '@/styles/common/system-dialog.css';

function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('zh-CN');
}

export function UpdateDialog() {
  const status = useSystemStore((s) => s.status);
  const info = useSystemStore((s) => s.info);
  const progress = useSystemStore((s) => s.progress);
  const error = useSystemStore((s) => s.error);
  const open = useSystemStore((s) => s.updateDialogOpen);
  const installUpdate = useSystemStore((s) => s.installUpdate);
  const relaunch = useSystemStore((s) => s.relaunch);
  const dismissUpdate = useSystemStore((s) => s.dismissUpdate);
  const checkForUpdate = useSystemStore((s) => s.checkForUpdate);

  const downloading = status === 'downloading';
  const ready = status === 'ready';
  const failed = status === 'error';
  const publishDate = formatDate(info?.date);

  const footer = (
    <div className="lanismd-system-actions">
      <button
        type="button"
        className="lanismd-system-btn"
        disabled={downloading}
        onClick={dismissUpdate}
      >
        {ready ? '稍后重启' : '稍后'}
      </button>
      {failed ? (
        <button
          type="button"
          className="lanismd-system-btn lanismd-system-btn-primary"
          onClick={() => void checkForUpdate(false)}
        >
          重新检查
        </button>
      ) : ready ? (
        <button
          type="button"
          className="lanismd-system-btn lanismd-system-btn-primary"
          onClick={() => void relaunch()}
        >
          立即重启
        </button>
      ) : (
        <button
          type="button"
          className="lanismd-system-btn lanismd-system-btn-primary"
          disabled={downloading || !info}
          onClick={() => void installUpdate()}
        >
          {downloading ? '正在下载…' : '立即更新'}
        </button>
      )}
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={() => {
        // 下载过程中不允许关闭，避免安装完成后状态无人可见
        if (!downloading) dismissUpdate();
      }}
      title={ready ? '更新已安装' : failed ? '更新失败' : '发现新版本'}
      size="sm"
      showCloseButton={!downloading}
      footer={footer}
    >
      <div className="lanismd-system-body">
        {info && (
          <div className="lanismd-system-version">
            当前版本 <strong>{info.currentVersion}</strong> ，可更新至{' '}
            <strong>{info.version}</strong>
            {publishDate ? `（${publishDate} 发布）` : ''}
          </div>
        )}

        {ready && <p className="lanismd-system-description">新版本已完成安装，重启应用后生效。</p>}

        {info?.body && !ready && <div className="lanismd-system-notes">{info.body}</div>}

        {downloading && (
          <div className="lanismd-system-progress">
            <div className="lanismd-system-progress-track">
              <div
                className="lanismd-system-progress-fill"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="lanismd-system-version">
              正在下载更新包 {Math.round(progress * 100)}%
            </span>
          </div>
        )}

        {failed && error && <div className="lanismd-system-error">{error}</div>}
      </div>
    </Dialog>
  );
}

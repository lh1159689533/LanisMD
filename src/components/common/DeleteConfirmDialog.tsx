import { useEffect, useState, useRef } from 'react';
import { RiAlertLine } from 'react-icons/ri';
import { useUIStore } from '@/stores/ui-store';
import '@/styles/common/delete-confirm-dialog.css';

/**
 * 附件删除确认弹窗
 *
 * 受控于 useUIStore.deleteConfirm：
 * - 由 `requestDeleteConfirm(fileName)` 异步请求弹出
 * - 用户操作后通过 `resolveDeleteConfirm` 回调
 *
 * 行为：
 * - 点击「确认」-> resolve { confirmed: true, deleteFile }
 * - 点击「取消」/ Esc -> resolve { confirmed: false, deleteFile: false }
 * - 勾选「同时删除本地原文件」-> deleteFile = true
 */
export function DeleteConfirmDialog() {
  const deleteConfirm = useUIStore((s) => s.deleteConfirm);
  const resolveDeleteConfirm = useUIStore((s) => s.resolveDeleteConfirm);
  const [deleteFile, setDeleteFile] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 弹窗打开时：复位复选框状态并抢占焦点
  useEffect(() => {
    if (!deleteConfirm) return;
    setDeleteFile(false);
    const focusDialog = () => dialogRef.current?.focus({ preventScroll: true });
    focusDialog();
    const id = window.setTimeout(focusDialog, 80);
    return () => window.clearTimeout(id);
  }, [deleteConfirm]);

  // Esc 取消
  useEffect(() => {
    if (!deleteConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveDeleteConfirm({ confirmed: false, deleteFile: false });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [deleteConfirm, resolveDeleteConfirm]);

  if (!deleteConfirm) return null;

  const handleCancel = () => {
    resolveDeleteConfirm({ confirmed: false, deleteFile: false });
  };

  const handleConfirm = () => {
    resolveDeleteConfirm({ confirmed: true, deleteFile });
  };

  return (
    <div className="delete-confirm-overlay">
      <div
        ref={dialogRef}
        className="delete-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        tabIndex={-1}
      >
        {/* 顶部警示栏 */}
        <div className="delete-confirm-header">
          <span className="delete-confirm-icon" aria-hidden="true">
            <RiAlertLine size={20} />
          </span>
          <span id="delete-confirm-title" className="delete-confirm-title">
            删除附件
          </span>
        </div>

        {/* 正文 */}
        <div className="delete-confirm-body">
          确定要移除附件 &ldquo;{deleteConfirm.fileName}&rdquo; 吗？
        </div>

        {/* 底部 */}
        <div className="delete-confirm-footer">
          <label className="delete-confirm-checkbox">
            <input
              type="checkbox"
              checked={deleteFile}
              onChange={(e) => setDeleteFile(e.target.checked)}
            />
            <span>同时删除本地原文件（不可恢复）</span>
          </label>
          <div className="delete-confirm-actions">
            <button
              type="button"
              className="delete-confirm-btn delete-confirm-btn-cancel"
              onClick={handleCancel}
            >
              取消
            </button>
            <button
              type="button"
              className="delete-confirm-btn delete-confirm-btn-confirm"
              onClick={handleConfirm}
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

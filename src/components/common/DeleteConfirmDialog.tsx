import { useState, useEffect } from 'react';
import { RiAlertLine } from 'react-icons/ri';
import { useUIStore } from '@/stores/ui-store';
import { Dialog } from './Dialog';
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

  // 弹窗打开时复位复选框状态
  useEffect(() => {
    if (!deleteConfirm) return;
    setDeleteFile(false);
  }, [deleteConfirm]);

  const handleCancel = () => {
    resolveDeleteConfirm({ confirmed: false, deleteFile: false });
  };

  const handleConfirm = () => {
    resolveDeleteConfirm({ confirmed: true, deleteFile });
  };

  return (
    <Dialog
      open={Boolean(deleteConfirm)}
      onClose={handleCancel}
      title="删除附件"
      icon={<RiAlertLine size={20} />}
      size="sm"
      className="delete-confirm-dialog"
      footer={
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
      }
    >
      <div className="delete-confirm-body">
        确定要移除附件 &ldquo;{deleteConfirm?.fileName}&rdquo; 吗？
      </div>
    </Dialog>
  );
}

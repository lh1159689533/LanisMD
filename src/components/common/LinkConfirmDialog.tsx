import { useState, useEffect } from 'react';
import { RiAlertLine } from 'react-icons/ri';
import { useUIStore } from '@/stores/ui-store';
import { Dialog } from './Dialog';
import '@/styles/common/link-confirm-dialog.css';

/**
 * 外部链接访问确认弹窗
 *
 * 受控于 useUIStore.linkConfirm：
 * - 由 `requestLinkConfirm(url)` 异步请求弹出
 * - 用户操作后通过 `resolveLinkConfirm` 回调
 *
 * 行为：
 * - 点击「继续」-> resolve { confirmed: true, dontAskAgain }
 * - 点击「取消」/ Esc -> resolve { confirmed: false, dontAskAgain: false }
 * - 点击遮罩外部区域：不关闭弹窗（强模态，避免误触）
 * - 勾选「不再提示」+ 继续 -> 调用方负责把设置项关闭
 */
export function LinkConfirmDialog() {
  const linkConfirm = useUIStore((s) => s.linkConfirm);
  const resolveLinkConfirm = useUIStore((s) => s.resolveLinkConfirm);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  // 弹窗打开时复位「不再提示」
  useEffect(() => {
    if (!linkConfirm) return;
    setDontAskAgain(false);
  }, [linkConfirm]);

  const handleCancel = () => {
    resolveLinkConfirm({ confirmed: false, dontAskAgain: false });
  };

  const handleConfirm = () => {
    resolveLinkConfirm({ confirmed: true, dontAskAgain });
  };

  return (
    <Dialog
      open={Boolean(linkConfirm)}
      onClose={handleCancel}
      title="请注意您的账号和财产安全"
      icon={<RiAlertLine size={20} />}
      size="sm"
      className="link-confirm-dialog"
      footer={
        <div className="link-confirm-footer">
          <label className="link-confirm-checkbox">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
            />
            <span>不再提示</span>
          </label>
          <div className="link-confirm-actions">
            <button
              type="button"
              className="link-confirm-btn link-confirm-btn-cancel"
              onClick={handleCancel}
            >
              取消
            </button>
            <button
              type="button"
              className="link-confirm-btn link-confirm-btn-confirm"
              onClick={handleConfirm}
            >
              继续
            </button>
          </div>
        </div>
      }
    >
      <div className="link-confirm-body">
        <span className="link-confirm-leading">您即将离开 LanisMD，去往：</span>
        <span className="link-confirm-url" title={linkConfirm?.url}>
          {linkConfirm?.url}
        </span>
      </div>
    </Dialog>
  );
}

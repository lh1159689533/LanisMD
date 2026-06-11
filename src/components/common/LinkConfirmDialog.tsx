import { useEffect, useState, useRef } from 'react';
import { RiAlertLine } from 'react-icons/ri';
import { useUIStore } from '@/stores/ui-store';
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
  const dialogRef = useRef<HTMLDivElement>(null);

  // 弹窗打开时：复位「不再提示」并把焦点抢占到 dialog 容器，避免外部 fallback
  // 把焦点落到 checkbox 上（外部行为发生在 ~50ms，本处用稍长的延时确保覆盖）
  useEffect(() => {
    if (!linkConfirm) return;
    setDontAskAgain(false);
    // preventScroll 避免触发祖先容器滚动
    const focusDialog = () => dialogRef.current?.focus({ preventScroll: true });
    // 立即抢占一次
    focusDialog();
    // 再覆盖一次外部异步设置焦点的时机
    const id = window.setTimeout(focusDialog, 80);
    return () => window.clearTimeout(id);
  }, [linkConfirm]);

  // Esc 取消
  useEffect(() => {
    if (!linkConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveLinkConfirm({ confirmed: false, dontAskAgain: false });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [linkConfirm, resolveLinkConfirm]);

  if (!linkConfirm) return null;

  const handleCancel = () => {
    resolveLinkConfirm({ confirmed: false, dontAskAgain: false });
  };

  const handleConfirm = () => {
    resolveLinkConfirm({ confirmed: true, dontAskAgain });
  };

  return (
    <div className="link-confirm-overlay">
      <div
        ref={dialogRef}
        className="link-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-confirm-title"
        tabIndex={-1}
      >
        {/* 顶部警示栏 */}
        <div className="link-confirm-header">
          <span className="link-confirm-icon" aria-hidden="true">
            <RiAlertLine size={20} />
          </span>
          <span id="link-confirm-title" className="link-confirm-title">
            请注意您的账号和财产安全
          </span>
        </div>

        {/* 正文 */}
        <div className="link-confirm-body">
          <span className="link-confirm-leading">您即将离开 LanisMD，去往：</span>
          <span className="link-confirm-url" title={linkConfirm.url}>
            {linkConfirm.url}
          </span>
        </div>

        {/* 底部 */}
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
      </div>
    </div>
  );
}

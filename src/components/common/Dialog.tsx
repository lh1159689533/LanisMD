import { useEffect, useRef, type ReactNode } from 'react';
import { RiCloseLine } from 'react-icons/ri';
import { cn } from '@/utils/cn';
import '@/styles/components/dialog.css';

/**
 * 通用弹窗组件 Props
 */
export interface DialogProps {
  /** 是否显示弹窗 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 弹窗标题（不传则不渲染 header） */
  title?: string;
  /** 标题前的图标 */
  icon?: ReactNode;
  /** 尺寸预设 */
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** 是否显示关闭按钮（默认 true，仅在有 title 时生效） */
  showCloseButton?: boolean;
  /** 底部操作区（不传则不渲染 footer） */
  footer?: ReactNode;
  /** 自定义容器 className */
  className?: string;
  /** 弹窗内容 */
  children: ReactNode;
}

/**
 * 通用 Dialog 组件
 *
 * 提供：
 * - overlay 遮罩层
 * - Esc 键关闭
 * - 可选的 header（title + icon + close button）
 * - body 内容区
 * - 可选的 footer 操作区
 * - sm / md / lg / full 尺寸预设
 */
export function Dialog({
  open,
  onClose,
  title,
  icon,
  size = 'md',
  showCloseButton = true,
  footer,
  className,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // 弹窗打开时抢占焦点
  useEffect(() => {
    if (!open) return;
    const focusDialog = () => dialogRef.current?.focus({ preventScroll: true });
    focusDialog();
    // 覆盖外部异步设置焦点的时机
    const id = window.setTimeout(focusDialog, 80);
    return () => window.clearTimeout(id);
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const hasHeader = Boolean(title);

  return (
    <div className="lanismd-dialog-overlay">
      <div
        ref={dialogRef}
        className={cn('lanismd-dialog', `lanismd-dialog--${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasHeader ? 'lanismd-dialog-title' : undefined}
        tabIndex={-1}
      >
        {/* 头部 */}
        {hasHeader && (
          <div className="lanismd-dialog-header">
            {icon && <span className="lanismd-dialog-header-icon">{icon}</span>}
            <h3 id="lanismd-dialog-title" className="lanismd-dialog-title">
              {title}
            </h3>
            {showCloseButton && (
              <button
                type="button"
                className="lanismd-dialog-close"
                onClick={onClose}
                aria-label="关闭"
              >
                <RiCloseLine size={16} />
              </button>
            )}
          </div>
        )}

        {/* 内容区 */}
        <div className="lanismd-dialog-body">{children}</div>

        {/* 底部 */}
        {footer && <div className="lanismd-dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}

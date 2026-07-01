import { useEffect, useState, useCallback } from 'react';
import { RiCloseLine, RiCheckLine } from 'react-icons/ri';
import { AiOutlineInfo } from 'react-icons/ai';
import { PiExclamationMarkBold } from 'react-icons/pi';
import { HiXMark } from 'react-icons/hi2';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';
import type { ToastAction } from '@/types';

const ICON_MAP = {
  info: AiOutlineInfo,
  success: RiCheckLine,
  warning: PiExclamationMarkBold,
  error: HiXMark,
};

const COLOR_MAP = {
  info: 'bg-[var(--lanismd-info)]',
  success: 'bg-[var(--lanismd-success)]',
  warning: 'bg-[var(--lanismd-warning)]',
  error: 'bg-[var(--lanismd-danger)]',
};

/** 退出动画持续时间（毫秒） */
const EXIT_ANIMATION_DURATION = 200;

/** warning/error 类型是否需要持久展示（不自动消失） */
function isPersistentType(type: string): boolean {
  return type === 'warning' || type === 'error';
}

function ToastItem({
  id,
  type,
  message,
  duration = 3000,
  actions,
}: {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
  actions?: ToastAction[];
}) {
  const removeToast = useUIStore((s) => s.removeToast);
  const Icon = ICON_MAP[type];
  const [isExiting, setIsExiting] = useState(false);

  /** warning/error 强制不自动消失 */
  const effectiveDuration = isPersistentType(type) ? 0 : duration;
  /** warning/error 关闭按钮必显示；info/success 仅在不自动消失时显示 */
  const showClose = isPersistentType(type) || effectiveDuration <= 0;

  /** 触发退出动画，动画结束后再真正移除 */
  const triggerExit = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      removeToast(id);
    }, EXIT_ANIMATION_DURATION);
  }, [id, removeToast]);

  useEffect(() => {
    if (effectiveDuration <= 0) return;

    const timer = setTimeout(() => {
      triggerExit();
    }, effectiveDuration);

    return () => clearTimeout(timer);
  }, [id, effectiveDuration, triggerExit]);

  return (
    <div
      className={cn(
        'flex flex-col rounded-sm',
        'border border-[var(--lanismd-editor-border)]',
        'bg-[var(--lanismd-editor-bg)] px-3 py-2.5 text-xs',
        isExiting
          ? 'animate-out fade-out slide-out-to-right-2'
          : 'animate-in slide-in-from-right-2',
      )}
      style={{
        animationDuration: isExiting ? `${EXIT_ANIMATION_DURATION}ms` : undefined,
        boxShadow:
          '0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12), 0 9px 28px 8px rgba(0,0,0,0.05)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
            'text-[var(--lanismd-accent-contrast)]',
            COLOR_MAP[type],
          )}
        >
          <Icon size={11} />
        </span>
        <span className="flex-1 text-[var(--lanismd-editor-text)]">{message}</span>
        {showClose && (
          <button
            onClick={() => triggerExit()}
            className={cn(
              'shrink-0 rounded p-0.5',
              'text-[var(--lanismd-editor-text)] transition-colors',
              'hover:bg-[var(--lanismd-hover-bg)]',
            )}
          >
            <RiCloseLine size={14} />
          </button>
        )}
      </div>

      {/* 操作按钮（仅 warning/error 且有 actions 时显示） */}
      {isPersistentType(type) && actions && actions.length > 0 && (
        <div className="mt-2 flex items-center justify-end gap-2">
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={() => {
                action.onClick();
                triggerExit();
              }}
              className={cn(
                'rounded px-2.5 py-1 text-xs transition-colors',
                action.primary
                  ? 'bg-[var(--lanismd-accent)] text-[var(--lanismd-accent-contrast)] hover:opacity-90'
                  : 'bg-[var(--lanismd-hover-bg)] text-[var(--lanismd-editor-text)] hover:brightness-110',
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-8 right-4 z-[210] flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          type={toast.type}
          message={toast.message}
          duration={toast.duration}
          actions={toast.actions}
        />
      ))}
    </div>
  );
}

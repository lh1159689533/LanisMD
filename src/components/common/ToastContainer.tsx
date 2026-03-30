import { useEffect } from 'react';
import {
  RiCloseLine,
  RiCheckLine,
  RiInformationLine,
  RiAlertLine,
  RiErrorWarningLine,
} from 'react-icons/ri';
import { useUIStore } from '@/stores/ui-store';

const ICON_MAP = {
  info: RiInformationLine,
  success: RiCheckLine,
  warning: RiAlertLine,
  error: RiErrorWarningLine,
};

const COLOR_MAP = {
  info: 'bg-blue-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

function ToastItem({
  id,
  type,
  message,
  duration,
}: {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
}) {
  const removeToast = useUIStore((s) => s.removeToast);
  const Icon = ICON_MAP[type];

  useEffect(() => {
    const timeout = duration ?? 3000;
    if (timeout <= 0) return;

    const timer = setTimeout(() => {
      removeToast(id);
    }, timeout);

    return () => clearTimeout(timer);
  }, [id, duration, removeToast]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--editor-border)] bg-white px-3 py-2 text-xs shadow-lg animate-in slide-in-from-top-2 dark:bg-[#1f2335]">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${COLOR_MAP[type]}`}
      >
        <Icon size={12} />
      </span>
      <span className="flex-1 text-[var(--editor-text)]">{message}</span>
      <button
        onClick={() => removeToast(id)}
        className="rounded p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      >
        <RiCloseLine size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-12 z-[100] flex max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          type={toast.type}
          message={toast.message}
          duration={toast.duration}
        />
      ))}
    </div>
  );
}

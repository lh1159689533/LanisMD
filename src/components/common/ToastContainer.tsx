import { useEffect } from "react";
import { RiCloseLine, RiCheckLine, RiInformationLine, RiAlertLine, RiErrorWarningLine } from "react-icons/ri";
import { useUIStore } from "@/stores/ui-store";

const ICON_MAP = {
  info: RiInformationLine,
  success: RiCheckLine,
  warning: RiAlertLine,
  error: RiErrorWarningLine,
};

const COLOR_MAP = {
  info: "bg-blue-500",
  success: "bg-green-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

function ToastItem({ id, type, message, duration }: { id: string; type: "info" | "success" | "warning" | "error"; message: string; duration?: number }) {
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
    <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#1f2335] border border-[var(--editor-border)] rounded-lg shadow-lg text-xs animate-in slide-in-from-top-2">
      <span className={`flex items-center justify-center w-5 h-5 rounded-full text-white ${COLOR_MAP[type]}`}>
        <Icon size={12} />
      </span>
      <span className="flex-1 text-[var(--editor-text)]">{message}</span>
      <button
        onClick={() => removeToast(id)}
        className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
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
    <div className="fixed top-12 right-4 z-[100] flex flex-col gap-2 max-w-sm">
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

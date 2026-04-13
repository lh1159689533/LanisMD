import { useCallback, useEffect, useRef } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? 'metaKey' : 'ctrlKey';

export function useShortcuts(handlers?: {
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onSaveFile?: () => void;
  onToggleSidebar?: () => void;
  onToggleOutline?: () => void;
  onOpenSettings?: () => void;
  onToggleSearch?: () => void;
}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const h = handlersRef.current;
    if (!h) return;

    const target = e.target as HTMLElement;
    const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    // Cmd+F: 搜索替换 - 在所有上下文中都应该响应（包括编辑器和输入框）
    if (e[modKey] && e.key === 'f' && !e.shiftKey) {
      e.preventDefault();
      h.onToggleSearch?.();
      return;
    }

    // 其他快捷键：在 INPUT/TEXTAREA 中不响应
    if (isInputField) return;

    // Cmd+N: New file
    if (e[modKey] && e.key === 'n' && !e.shiftKey) {
      e.preventDefault();
      h.onNewFile?.();
    }

    // Cmd+O: Open file
    if (e[modKey] && e.key === 'o' && !e.shiftKey) {
      e.preventDefault();
      h.onOpenFile?.();
    }

    // Cmd+S: Immediately trigger save
    if (e[modKey] && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
      h.onSaveFile?.();
    }

    // Cmd+Shift+B: Toggle sidebar
    if (e[modKey] && e.shiftKey && e.key === 'b') {
      e.preventDefault();
      h.onToggleSidebar?.();
    }

    // Cmd+Shift+L: Toggle outline panel
    if (e[modKey] && e.shiftKey && e.key === 'l') {
      e.preventDefault();
      h.onToggleOutline?.();
    }

    // Cmd+,: Open settings
    if (e[modKey] && e.key === ',' && !e.shiftKey) {
      e.preventDefault();
      h.onOpenSettings?.();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

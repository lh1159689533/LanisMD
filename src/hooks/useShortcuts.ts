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
}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    const h = handlersRef.current;
    if (!h) return;

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

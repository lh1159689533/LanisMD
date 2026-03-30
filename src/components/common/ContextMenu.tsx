import { useEffect, useRef, useCallback } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export interface ContextMenuGroup {
  items: ContextMenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  groups: ContextMenuGroup[];
  onClose: () => void;
}

export function ContextMenu({ x, y, groups, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position so the menu stays within the viewport
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > vw) {
      adjustedX = vw - rect.width - 4;
    }
    if (y + rect.height > vh) {
      adjustedY = vh - rect.height - 4;
    }
    if (adjustedX < 0) adjustedX = 4;
    if (adjustedY < 0) adjustedY = 4;

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }, [x, y]);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Use capture to ensure we catch the event before anything else
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Prevent browser's default context menu on the component itself
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      ref={menuRef}
      onContextMenu={handleContextMenu}
      className="fixed z-[9999] min-w-[180px] rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-bg)] py-1 shadow-xl backdrop-blur-sm"
      style={{ left: x, top: y }}
    >
      {groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="mx-2 my-1 h-px bg-[var(--sidebar-border)]" />}
          {group.items.map((item, ii) => (
            <button
              key={ii}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  onClose();
                }
              }}
              disabled={item.disabled}
              className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors ${
                item.disabled
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:bg-[var(--accent)]/10 text-[var(--sidebar-text)] hover:text-[var(--accent)]'
              }`}
            >
              {item.icon && (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-70">
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

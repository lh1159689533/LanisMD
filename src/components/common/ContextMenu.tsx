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

  // 调整位置确保菜单不超出视口
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > vw - 8) {
      adjustedX = vw - rect.width - 8;
    }
    if (y + rect.height > vh - 8) {
      adjustedY = vh - rect.height - 8;
    }
    if (adjustedX < 4) adjustedX = 4;
    if (adjustedY < 4) adjustedY = 4;

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }, [x, y]);

  // 点击外部、Escape、滚动时关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();

    // 使用捕获阶段确保优先处理
    document.addEventListener('mousedown', handleClick, true);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClick, true);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  // 阻止菜单自身的浏览器右键菜单
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div
      ref={menuRef}
      onContextMenu={handleContextMenu}
      className="lanismd-context-menu"
      style={{ left: x, top: y }}
    >
      {groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="lanismd-context-menu-separator" />}
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
              className={
                'lanismd-context-menu-item' +
                (item.disabled ? ' lanismd-context-menu-item-disabled' : '')
              }
            >
              {item.icon && (
                <span className="lanismd-context-menu-icon">
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

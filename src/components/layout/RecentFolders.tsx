import { useRef, useEffect, useState } from 'react';
import { RiFolderLine, RiCloseLine } from 'react-icons/ri';
import { useRecentFoldersStore } from '@/stores/recent-folders-store';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';
import { ResizablePanel } from '@/components/common/ResizablePanel';

interface RecentFoldersPanelProps {
  /** Ref to the container (the file-tree root div) whose height is used for ratio calc */
  containerRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onSwitchFolder: (folderPath: string) => void;
}

export function RecentFoldersPanel({
  containerRef,
  onClose,
  onSwitchFolder,
}: RecentFoldersPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const recentFolders = useRecentFoldersStore((s) => s.recentFolders);
  const currentRootPath = useFileTreeStore((s) => s.rootPath);
  const closeOnClickOutside = useSettingsStore(
    (s) => s.config.recentFolders?.closeOnClickOutside !== false,
  );

  // Slide-in animation state
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Trigger entrance animation on next frame
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Close on outside click (if setting enabled)
  useEffect(() => {
    if (!closeOnClickOutside) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current && panelRef.current.contains(target)) return;
      // 排除所有已注册的触发按钮，避免触发关闭后再次 toggle 打开导致的闪烁
      const triggerEls = useUIStore.getState().recentFoldersTriggerEls;
      for (const el of triggerEls) {
        if (el.contains(target)) return;
      }
      onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeOnClickOutside, onClose]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleClick = (folderPath: string) => {
    onSwitchFolder(folderPath);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className={`transition-transform duration-200 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40 }}
    >
      <ResizablePanel
        containerRef={containerRef}
        defaultRatio={0.35}
        minRatio={0.15}
        maxRatio={0.9}
      >
        {/* Title bar */}
        <div
          className={cn(
            'flex shrink-0 items-center justify-between',
            'border-b border-[var(--lanismd-sidebar-border)] px-3 py-1.5',
          )}
        >
          <span className="text-xs font-medium text-[var(--lanismd-sidebar-text)]">
            最近打开的文件夹
          </span>
          <button
            onClick={onClose}
            className="rounded p-0.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            title="关闭"
          >
            <RiCloseLine size={14} className="text-[var(--lanismd-sidebar-text)] opacity-60" />
          </button>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-auto py-1">
          {recentFolders.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <span className="text-[10px] text-[var(--lanismd-sidebar-text)] opacity-50">
                暂无最近打开的文件夹
              </span>
            </div>
          ) : (
            recentFolders.map((folder) => {
              const isCurrent = folder.path === currentRootPath;
              return (
                <button
                  key={folder.path}
                  onClick={() => handleClick(folder.path)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5',
                    'truncate text-left text-xs transition-colors',
                    isCurrent
                      ? 'bg-[var(--lanismd-accent)]/10 text-[var(--lanismd-accent)]'
                      : 'text-[var(--lanismd-sidebar-text)] hover:bg-black/5 dark:hover:bg-white/10',
                  )}
                  title={folder.path}
                >
                  <RiFolderLine
                    size={14}
                    className={cn(
                      'shrink-0',
                      isCurrent ? 'text-[var(--lanismd-accent)]' : 'text-amber-500',
                    )}
                  />
                  <span className="truncate">{folder.name}</span>
                  {isCurrent && (
                    <span className="ml-auto shrink-0 text-[10px] opacity-60">当前</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </ResizablePanel>
    </div>
  );
}

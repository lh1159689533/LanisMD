import { useRef, useEffect, useState } from "react";
import { RiFolderLine, RiCloseLine } from "react-icons/ri";
import { useRecentFoldersStore } from "@/stores/recent-folders-store";
import { useFileTreeStore } from "@/stores/file-tree-store";
import { useSettingsStore } from "@/stores/settings-store";
import { ResizablePanel } from "@/components/common/ResizablePanel";

interface RecentFoldersPanelProps {
  /** Ref to the container (the file-tree root div) whose height is used for ratio calc */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Ref to the toggle button so outside-click ignores it */
  toggleBtnRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onSwitchFolder: (folderPath: string) => void;
}

export function RecentFoldersPanel({
  containerRef,
  toggleBtnRef,
  onClose,
  onSwitchFolder,
}: RecentFoldersPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const recentFolders = useRecentFoldersStore((s) => s.recentFolders);
  const currentRootPath = useFileTreeStore((s) => s.rootPath);
  const closeOnClickOutside = useSettingsStore(
    (s) => s.config.recentFolders?.closeOnClickOutside !== false
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
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeOnClickOutside, onClose, toggleBtnRef]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleClick = (folderPath: string) => {
    onSwitchFolder(folderPath);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className={`transition-transform duration-200 ease-out ${visible ? "translate-y-0" : "translate-y-full"
        }`}
      style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 40 }}
    >
      <ResizablePanel
        containerRef={containerRef}
        defaultRatio={0.35}
        minRatio={0.15}
        maxRatio={0.9}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--sidebar-border)] shrink-0">
          <span className="text-xs font-medium text-[var(--sidebar-text)]">
            最近打开的文件夹
          </span>
          <button
            onClick={onClose}
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            title="关闭"
          >
            <RiCloseLine size={14} className="text-[var(--sidebar-text)] opacity-60" />
          </button>
        </div>

        {/* Folder list */}
        <div className="flex-1 overflow-auto py-1">
          {recentFolders.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <span className="text-[10px] text-[var(--sidebar-text)] opacity-50">
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
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors truncate
                    ${isCurrent
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "text-[var(--sidebar-text)] hover:bg-black/5 dark:hover:bg-white/10"
                    }`}
                  title={folder.path}
                >
                  <RiFolderLine
                    size={14}
                    className={`shrink-0 ${isCurrent ? "text-[var(--accent)]" : "text-amber-500"}`}
                  />
                  <span className="truncate">{folder.name}</span>
                  {isCurrent && (
                    <span className="ml-auto shrink-0 text-[10px] opacity-60">
                      当前
                    </span>
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

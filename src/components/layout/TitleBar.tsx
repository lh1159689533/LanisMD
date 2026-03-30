import { useCallback, useEffect, useState } from 'react';
import {
  RiCloseLine,
  RiSubtractLine,
  RiFullscreenLine,
  RiFullscreenExitLine,
  RiCheckLine,
  RiLoader4Line,
} from 'react-icons/ri';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { useFileStore } from '@/stores/file-store';

interface TitleBarProps {
  onNewFile?: () => void;
  onOpenFile?: () => void;
}

export function TitleBar({ onNewFile, onOpenFile }: TitleBarProps) {
  const currentFile = useFileStore((s) => s.currentFile);
  const saveStatus = useFileStore((s) => s.saveStatus);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Detect platform
    try {
      const os = platform();
      setIsMac(os === 'macos');
    } catch {
      setIsMac(false);
    }

    // Listen for window resize to track maximized state
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      // Check initial state
      setIsMaximized(await appWindow.isMaximized());

      unlisten = await appWindow.onResized(async () => {
        setIsMaximized(await appWindow.isMaximized());
      });
    };

    setupListener();
    return () => {
      unlisten?.();
    };
  }, []);

  const handleMinimize = useCallback(async () => {
    await getCurrentWindow().minimize();
  }, []);

  const handleMaximize = useCallback(async () => {
    const appWindow = getCurrentWindow();
    if (await appWindow.isMaximized()) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  }, []);

  const handleClose = useCallback(async () => {
    await getCurrentWindow().close();
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const appWindow = getCurrentWindow();
    const isFullscreen = await appWindow.isFullscreen();
    await appWindow.setFullscreen(!isFullscreen);
  }, []);

  const handleDoubleClick = useCallback(async () => {
    if (isMac) {
      return;
    }
    await handleMaximize();
  }, [isMac, handleMaximize]);

  // Save status indicator
  const renderSaveStatus = () => {
    if (!currentFile) return null;

    switch (saveStatus) {
      case 'saving':
        return (
          <span className="ml-2 inline-block animate-spin text-slate-400" title="保存中...">
            <RiLoader4Line size={12} />
          </span>
        );
      case 'saved':
        return (
          <span className="ml-2 text-green-500" title="已保存">
            <RiCheckLine size={12} />
          </span>
        );
      case 'error':
        return (
          <span className="ml-2 text-[10px] text-red-500" title="保存失败">
            ✗
          </span>
        );
      default:
        // Show dirty indicator when idle and file has unsaved changes
        if (currentFile.isDirty) {
          return <span className="ml-1 text-amber-500">&#9679;</span>;
        }
        return null;
    }
  };

  return (
    <div
      className="flex h-9 shrink-0 select-none items-center border-b border-[var(--editor-border)] bg-[var(--titlebar-bg)] px-3 text-[var(--titlebar-text)]"
      data-tauri-drag-region
      onDoubleClick={handleDoubleClick}
    >
      {/* macOS: space for native traffic light buttons */}
      {isMac && <div className="mr-2 w-[68px] flex-shrink-0" data-tauri-drag-region />}

      {/* Non-macOS: custom window control buttons on the left */}
      {!isMac && (
        <div className="mr-3 flex flex-shrink-0 items-center gap-0.5">
          <button
            onClick={handleClose}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-md transition-colors hover:bg-red-500/20 hover:text-red-500"
            title="关闭"
          >
            <RiCloseLine size={16} />
          </button>
          <button
            onClick={handleMinimize}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-md transition-colors hover:bg-black/10 dark:hover:bg-white/10"
            title="最小化"
          >
            <RiSubtractLine size={14} />
          </button>
          <button
            onClick={handleMaximize}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-md transition-colors hover:bg-black/10 dark:hover:bg-white/10"
            title={isMaximized ? '还原' : '最大化'}
          >
            {isMaximized ? <RiFullscreenExitLine size={13} /> : <RiFullscreenLine size={13} />}
          </button>
        </div>
      )}

      {/* File title + save status */}
      <div
        className="flex flex-1 items-center justify-center truncate text-sm font-medium"
        data-tauri-drag-region
      >
        <span className="truncate">{currentFile ? currentFile.fileName : 'LanisMD'}</span>
        {renderSaveStatus()}
      </div>

      {/* Right spacer for balance */}
      <div className="w-[30px] flex-shrink-0" />
    </div>
  );
}

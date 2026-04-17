import { useCallback, useEffect, useState } from 'react';
import {
  RiCheckLine,
  RiLoader4Line,
} from 'react-icons/ri';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { useFileStore } from '@/stores/file-store';
import { cn } from '@/utils/cn';

interface TitleBarProps {
  onNewFile?: () => void;
  onOpenFile?: () => void;
}

/**
 * Windows 原生风格窗口控制按钮图标（SVG 内联）
 * 参考 Windows 11 标题栏风格：细线条、无圆角
 */
function WinMinimizeIcon() {
  return (
    <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
      <rect width="10" height="1" />
    </svg>
  );
}

function WinMaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="0.5" y="0.5" width="9" height="9" />
    </svg>
  );
}

function WinRestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="0.5" y="2.5" width="7" height="7" />
      <polyline points="2.5,2.5 2.5,0.5 9.5,0.5 9.5,7.5 7.5,7.5" />
    </svg>
  );
}

function WinCloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
      <line x1="0" y1="0" x2="10" y2="10" />
      <line x1="10" y1="0" x2="0" y2="10" />
    </svg>
  );
}

export function TitleBar({ onNewFile, onOpenFile }: TitleBarProps) {
  const currentFile = useFileStore((s) => s.currentFile);
  const saveStatus = useFileStore((s) => s.saveStatus);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // 检测平台
    try {
      const os = platform();
      setIsMac(os === 'macos');
    } catch {
      setIsMac(false);
    }

    // 监听窗口大小变化以跟踪最大化状态
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
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

  const handleDoubleClick = useCallback(async () => {
    if (isMac) {
      return;
    }
    await handleMaximize();
  }, [isMac, handleMaximize]);

  // 保存状态指示器
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
            &#10007;
          </span>
        );
      default:
        // 文件有未保存更改时显示脏标记
        if (currentFile.isDirty) {
          return <span className="ml-1 text-amber-500">&#9679;</span>;
        }
        return null;
    }
  };

  // Windows/Linux 窗口控制按钮的通用样式
  const winBtnBase = cn(
    'flex h-full w-[46px] items-center justify-center',
    'transition-colors duration-100',
  );

  return (
    <div
      className={cn(
        'flex h-9 shrink-0 items-center',
        'select-none border-b border-[var(--lanismd-editor-border)]',
        'bg-[var(--lanismd-titlebar-bg)] text-[var(--lanismd-titlebar-text)]',
      )}
      data-tauri-drag-region
      onDoubleClick={handleDoubleClick}
    >
      {/* macOS: 为原生红绿灯按钮预留空间 */}
      {isMac && <div className="mr-2 w-[68px] flex-shrink-0 pl-3" data-tauri-drag-region />}

      {/* Windows/Linux: 左侧留空保持标题居中对称 */}
      {!isMac && <div className="w-[138px] flex-shrink-0 pl-3" data-tauri-drag-region />}

      {/* 文件标题 + 保存状态 */}
      <div
        className="flex flex-1 items-center justify-center truncate px-3 text-sm font-medium"
        data-tauri-drag-region
      >
        <span className="truncate">{currentFile ? currentFile.fileName : 'LanisMD'}</span>
        {renderSaveStatus()}
      </div>

      {/* macOS: 右侧留空保持对称 */}
      {isMac && <div className="w-[68px] flex-shrink-0" />}

      {/* Windows/Linux: 窗口控制按钮（右侧，原生风格顺序：最小化 | 最大化 | 关闭） */}
      {!isMac && (
        <div className="flex h-full flex-shrink-0 items-stretch">
          <button
            onClick={handleMinimize}
            className={cn(winBtnBase, 'hover:bg-black/10 dark:hover:bg-white/10')}
            title="最小化"
          >
            <WinMinimizeIcon />
          </button>
          <button
            onClick={handleMaximize}
            className={cn(winBtnBase, 'hover:bg-black/10 dark:hover:bg-white/10')}
            title={isMaximized ? '还原' : '最大化'}
          >
            {isMaximized ? <WinRestoreIcon /> : <WinMaximizeIcon />}
          </button>
          <button
            onClick={handleClose}
            className={cn(winBtnBase, 'hover:bg-[#e81123] hover:text-white')}
            title="关闭"
          >
            <WinCloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}

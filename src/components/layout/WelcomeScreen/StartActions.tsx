import type { ReactNode } from 'react';
import { RiFolderOpenLine, RiSettings3Line, RiCommandLine, RiHistoryLine } from 'react-icons/ri';
import { useFile } from '@/hooks/useFile';
import { useUIStore } from '@/stores/ui-store';

interface ActionItem {
  /** 展示图标 */
  icon: ReactNode;
  /** 操作标签 */
  label: string;
  /** 右侧快捷键提示 */
  shortcut: string;
  /** 点击回调 */
  onClick: () => void;
}

/**
 * Dashboard 左栏：常用操作入口
 */
export function StartActions() {
  const { openFileFromDisk } = useFile();
  const openSettings = useUIStore((s) => s.openSettings);
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);
  const openRecentFolders = useUIStore((s) => s.toggleRecentFolders);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const actions: ActionItem[] = [
    {
      icon: <RiFolderOpenLine size={16} />,
      label: '打开文件',
      shortcut: `${modKey}O`,
      onClick: () => {
        void openFileFromDisk();
      },
    },
    {
      icon: <RiCommandLine size={16} />,
      label: '命令面板',
      shortcut: `${modKey}K`,
      onClick: () => openCommandPalette(),
    },
    {
      icon: <RiSettings3Line size={16} />,
      label: '偏好设置',
      shortcut: `${modKey},`,
      onClick: () => openSettings(),
    },
    {
      icon: <RiHistoryLine size={16} />,
      label: '最近打开',
      shortcut: '',
      onClick: () => openRecentFolders(),
    },
  ];

  return (
    <div className="lanismd-welcome-start">
      <h3 className="lanismd-welcome-section-title">开始</h3>
      <ul className="lanismd-welcome-start-list">
        {actions.map((action) => (
          <li key={action.label}>
            <button type="button" className="lanismd-welcome-start-item" onClick={action.onClick}>
              <span className="lanismd-welcome-start-icon">{action.icon}</span>
              <span className="lanismd-welcome-start-label">{action.label}</span>
              <kbd className="lanismd-welcome-start-shortcut">{action.shortcut}</kbd>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

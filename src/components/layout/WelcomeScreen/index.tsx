import { useEffect, useRef, useState } from 'react';
import { useFileStore } from '@/stores/file-store';
import { useSettingsStore } from '@/stores/settings-store';
import { DashboardView } from './DashboardView';
import { MinimalView } from './MinimalView';
import '../../../styles/layout/welcome-screen.css';

/**
 * 空状态欢迎页入口。
 *
 * 分发规则：
 * - 每次 currentFile 从"非空"变为"空"时，重新读取 welcome.showOnStartup
 *   以决定本次空状态应显示 DashboardView 还是 MinimalView；
 * - 在当前空状态期间，即使用户在 Dashboard 中取消勾选，也不会立即切换；
 *   该改动会在下次进入空状态时生效。
 */
export function WelcomeScreen() {
  const currentFile = useFileStore((s) => s.currentFile);
  const prevFileRef = useRef(currentFile);
  const [showDashboard, setShowDashboard] = useState(
    () => useSettingsStore.getState().config.welcome.showOnStartup,
  );

  useEffect(() => {
    // 仅在 "有文件 → 无文件" 的切换时刷新偏好
    const wasOpen = prevFileRef.current !== null && prevFileRef.current !== undefined;
    const nowEmpty = currentFile === null || currentFile === undefined;
    if (wasOpen && nowEmpty) {
      setShowDashboard(useSettingsStore.getState().config.welcome.showOnStartup);
    }
    prevFileRef.current = currentFile;
  }, [currentFile]);

  return showDashboard ? <DashboardView /> : <MinimalView />;
}

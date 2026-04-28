import { useCallback, useEffect } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { MainLayout } from './components/layout/MainLayout';
import { BrowserLayout } from './components/layout/BrowserLayout';

import { SettingsDialog } from './components/settings/SettingsDialog';
import { QuickOpen } from './components/quick-open/QuickOpen';
import { ToastContainer } from './components/common/ToastContainer';
import { useUIStore } from './stores/ui-store';
import { useSearchStore } from './stores/search-store';
import { useEditorStore } from './stores/editor-store';
import { useAiStore } from './stores/ai-store';
import { useTheme } from './hooks/useTheme';
import { useFile } from './hooks/useFile';
import { useAutoSave } from './hooks/useAutoSave';
import { useShortcuts } from './hooks/useShortcuts';
import { useFileWatcher } from './hooks/useFileWatcher';
import { useBrowserFile } from './hooks/useBrowserFile';
import { cn } from './utils/cn';
import { isTauri } from './utils/platform';

// Check platform once at module level
const IS_TAURI = isTauri();

/**
 * Tauri desktop app mode
 */
function TauriApp() {
  const { settingsOpen } = useUIStore();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setSidebarPanel = useUIStore((s) => s.setSidebarPanel);
  const openSettings = useUIStore((s) => s.openSettings);
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);
  const { openFileFromDisk, newFile } = useFile();
  const { notifySelfWrite } = useFileWatcher();
  const { saveNow } = useAutoSave({ onAfterSave: notifySelfWrite });

  // 切换大纲面板：如果当前已在大纲面板则关闭侧边栏，否则打开大纲面板
  const toggleOutline = useCallback(() => {
    const state = useUIStore.getState();
    if (state.sidebarOpen && state.sidebarPanel === 'outline') {
      state.toggleSidebar();
    } else {
      setSidebarPanel('outline');
    }
  }, [setSidebarPanel]);

  const toggleSearch = useSearchStore((s) => s.toggleSearch);
  const toggleFocusMode = useEditorStore((s) => s.toggleFocusMode);
  const toggleTypewriterMode = useEditorStore((s) => s.toggleTypewriterMode);

  useShortcuts({
    onNewFile: newFile,
    onOpenFile: openFileFromDisk,
    onSaveFile: saveNow,
    onToggleSidebar: toggleSidebar,
    onToggleOutline: toggleOutline,
    onOpenSettings: () => openSettings('general'),
    onToggleSearch: toggleSearch,
    onQuickOpen: openCommandPalette,
    onToggleFocusMode: toggleFocusMode,
    onToggleTypewriterMode: toggleTypewriterMode,
  });

  // 启动时读取一次 AI 配置文件（同步默认服务商/模型到 settings）
  const refreshConfig = useAiStore((s) => s.refreshConfig);
  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  useEffect(() => {
    // 全局禁用 WebView 默认右键菜单（Reload / Inspect Element 等）
    // 应用内自定义右键菜单通过 React 事件处理器独立注册，不受影响
    const callback = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener('contextmenu', callback);

    return () => {
      window.removeEventListener('contextmenu', callback);
    };
  }, []);

  return (
    <>
      <TitleBar onNewFile={newFile} onOpenFile={openFileFromDisk} />
      <MainLayout />
      {settingsOpen && <SettingsDialog />}
      <QuickOpen />
      <ToastContainer />
    </>
  );
}

/**
 * Browser mode - simplified editor only
 */
function BrowserApp() {
  useBrowserFile();

  return <BrowserLayout />;
}

export default function App() {
  useTheme();

  return (
    <div
      className={cn(
        'flex h-screen flex-col overflow-hidden',
        'bg-white text-slate-900',
        'dark:bg-[#1a1b26] dark:text-slate-100',
      )}
    >
      {IS_TAURI ? <TauriApp /> : <BrowserApp />}
    </div>
  );
}

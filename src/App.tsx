import { useCallback, useEffect, useRef } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { MainLayout } from './components/layout/MainLayout';
import { BrowserLayout } from './components/layout/BrowserLayout';
import { FilePreview } from './components/preview/FilePreview';

import { SettingsDialog } from './components/settings/SettingsDialog';
import { QuickOpen } from './components/quick-open/QuickOpen';
import { ToastContainer } from './components/common/ToastContainer';
import { LinkConfirmDialog } from './components/common/LinkConfirmDialog';
import { DeleteConfirmDialog } from './components/common/DeleteConfirmDialog';
import { useUIStore } from './stores/ui-store';
import { useSearchStore } from './stores/search-store';
import { useEditorStore } from './stores/editor-store';
import { useAiStore } from './stores/ai-store';
import { useSyncStore } from './stores/sync-store';
import { useSettingsStore } from './stores/settings-store';
import { useSessionStore } from './stores/session-store';
import { useFileStore } from './stores/file-store';
import { useFileTreeStore } from './stores/file-tree-store';
import { fileService } from './services/tauri';
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

// 检测当前是否为预览窗口（通过 URL 路径判断）
const IS_PREVIEW_WINDOW = window.location.pathname === '/preview';

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
  const toggleTypewriterMode = useEditorStore((s) => s.toggleTypewriterMode);

  // 切换全局搜索：与大纲面板一致——已在搜索面板则关闭侧边栏，否则切到搜索面板
  const toggleGlobalSearch = useCallback(() => {
    const state = useUIStore.getState();
    if (state.sidebarOpen && state.sidebarPanel === 'search') {
      state.toggleSidebar();
    } else {
      setSidebarPanel('search');
    }
  }, [setSidebarPanel]);

  useShortcuts({
    onNewFile: newFile,
    onOpenFile: openFileFromDisk,
    onSaveFile: saveNow,
    onToggleSidebar: toggleSidebar,
    onToggleOutline: toggleOutline,
    onOpenSettings: () => openSettings('general'),
    onToggleSearch: toggleSearch,
    onToggleGlobalSearch: toggleGlobalSearch,
    onQuickOpen: openCommandPalette,
    onToggleTypewriterMode: toggleTypewriterMode,
  });

  // 启动时读取一次 AI 配置文件（同步默认服务商/模型到 settings）
  const refreshConfig = useAiStore((s) => s.refreshConfig);
  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  // 启动时初始化同步进度事件监听
  const listenProgress = useSyncStore((s) => s.listenProgress);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenProgress().then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [listenProgress]);

  // 启动时恢复上次会话（仅当 settings.restoreSession 为 true）
  // 使用 ref 守卫，确保 StrictMode/HMR 下也只执行一次
  const sessionRestoredRef = useRef(false);
  useEffect(() => {
    if (sessionRestoredRef.current) return;
    sessionRestoredRef.current = true;

    const { restoreSession } = useSettingsStore.getState().config;
    if (!restoreSession) return;

    const { lastFolderPath, lastFilePath } = useSessionStore.getState();

    void (async () => {
      // 恢复文件夹（失败则清空对应快照，避免下次启动继续报错）
      if (lastFolderPath) {
        try {
          await useFileTreeStore.getState().openFolder(lastFolderPath);
        } catch (err) {
          console.error('[restoreSession] failed to restore folder:', err);
          useSessionStore.getState().setLastFolder(null);
        }
      }

      // 恢复文件
      if (lastFilePath) {
        try {
          const result = await fileService.readFile({
            path: lastFilePath,
            encoding: 'utf-8',
          });
          const fileName =
            lastFilePath.split('/').pop() ?? lastFilePath.split('\\').pop() ?? 'Unknown';
          useFileStore
            .getState()
            .openFile(lastFilePath, result.content, result.encoding ?? 'utf-8', fileName);
        } catch (err) {
          console.error('[restoreSession] failed to restore file:', err);
          useSessionStore.getState().setLastFile(null);
        }
      }
    })();
  }, []);

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
      <LinkConfirmDialog />
      <DeleteConfirmDialog />
    </>
  );
}

/**
 * Browser mode - simplified editor only
 */
function BrowserApp() {
  useBrowserFile();

  return (
    <>
      <BrowserLayout />
      <LinkConfirmDialog />
      <DeleteConfirmDialog />
    </>
  );
}

export default function App() {
  useTheme();

  // 预览窗口：直接渲染 FilePreview 组件，不加载主应用
  if (IS_PREVIEW_WINDOW) {
    return <FilePreview />;
  }

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

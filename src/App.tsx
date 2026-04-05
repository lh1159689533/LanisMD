import { TitleBar } from './components/layout/TitleBar';
import { MainLayout } from './components/layout/MainLayout';
import { BrowserLayout } from './components/layout/BrowserLayout';

import { SettingsDialog } from './components/settings/SettingsDialog';
import { ToastContainer } from './components/common/ToastContainer';
import { useUIStore } from './stores/ui-store';
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
  const openSettings = useUIStore((s) => s.openSettings);
  const { openFileFromDisk, newFile } = useFile();
  const { notifySelfWrite } = useFileWatcher();
  const { saveNow } = useAutoSave({ onAfterSave: notifySelfWrite });

  useShortcuts({
    onNewFile: newFile,
    onOpenFile: openFileFromDisk,
    onSaveFile: saveNow,
    onToggleSidebar: toggleSidebar,
    onOpenSettings: () => openSettings('general'),
  });

  return (
    <>
      <TitleBar onNewFile={newFile} onOpenFile={openFileFromDisk} />
      <MainLayout />
      {settingsOpen && <SettingsDialog />}
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

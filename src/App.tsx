import { TitleBar } from "./components/layout/TitleBar";
import { MainLayout } from "./components/layout/MainLayout";

import { SettingsDialog } from "./components/settings/SettingsDialog";
import { ToastContainer } from "./components/common/ToastContainer";
import { useUIStore } from "./stores/ui-store";
import { useTheme } from "./hooks/useTheme";
import { useFile } from "./hooks/useFile";
import { useAutoSave } from "./hooks/useAutoSave";
import { useShortcuts } from "./hooks/useShortcuts";
import { useFileWatcher } from "./hooks/useFileWatcher";

export default function App() {
  const { settingsOpen } = useUIStore();
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const openSettings = useUIStore((s) => s.openSettings);
  const { openFileFromDisk, newFile } = useFile();
  const { notifySelfWrite } = useFileWatcher();
  const { saveNow } = useAutoSave({ onAfterSave: notifySelfWrite });
  useTheme();

  useShortcuts({
    onNewFile: newFile,
    onOpenFile: openFileFromDisk,
    onSaveFile: saveNow,
    onToggleSidebar: toggleSidebar,
    onOpenSettings: () => openSettings("general"),
  });

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-[#1a1b26] text-slate-900 dark:text-slate-100 overflow-hidden">
      <TitleBar onNewFile={newFile} onOpenFile={openFileFromDisk} />
      <MainLayout />
      {settingsOpen && <SettingsDialog />}
      <ToastContainer />
    </div>
  );
}

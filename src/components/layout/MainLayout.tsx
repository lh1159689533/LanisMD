import { cn } from '@/utils/cn';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { AiHistoryPanel } from './AiHistoryPanel';
import { EditorCore } from '@/editor/components/EditorCore';
import { useFileStore } from '@/stores/file-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useEditorStore } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';

export function MainLayout() {
  const currentFile = useFileStore((s) => s.currentFile);
  const sidebarPosition = useSettingsStore((s) => s.config.sidebar.position);
  const typewriterMode = useEditorStore((s) => s.typewriterMode);
  const aiHistoryOpen = useUIStore((s) => s.aiHistoryOpen);

  return (
    <div className={cn('flex min-h-0 flex-1', sidebarPosition === 'right' && 'flex-row-reverse')}>
      <Sidebar />
      <div className="editor-container relative flex min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1">
          <div className={cn(
            'editor-content min-h-0 flex-1 overflow-auto bg-[var(--lanismd-editor-bg)]',
            typewriterMode && 'lanismd-typewriter-active',
          )}>
            {currentFile ? (
              <EditorCore />
            ) : (
              <div
                className={cn(
                  'flex h-full select-none items-center justify-center',
                  'text-sm text-[var(--lanismd-sidebar-text)] opacity-40',
                )}
              >
                没有打开的文件
              </div>
            )}
          </div>
          {aiHistoryOpen && <AiHistoryPanel />}
        </div>
        <StatusBar />
      </div>
    </div>
  );
}

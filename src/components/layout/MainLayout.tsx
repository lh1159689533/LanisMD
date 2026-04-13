import { cn } from '@/utils/cn';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { EditorCore } from '@/editor/components/EditorCore';
import { useFileStore } from '@/stores/file-store';

export function MainLayout() {
  const currentFile = useFileStore((s) => s.currentFile);

  return (
    <div className="flex min-h-0 flex-1">
      <Sidebar />
      <div className="editor-container flex min-w-0 flex-1 flex-col">
        <div className="editor-content relative min-h-0 flex-1 overflow-auto bg-[var(--lanismd-editor-bg)]">
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
        <StatusBar />
      </div>
    </div>
  );
}

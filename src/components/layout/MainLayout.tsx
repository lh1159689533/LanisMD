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
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--editor-bg)]">
          {currentFile ? (
            <EditorCore />
          ) : (
            <div
              className={cn(
                'flex h-full select-none items-center justify-center',
                'text-sm text-[var(--sidebar-text)] opacity-40',
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

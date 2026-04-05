import { cn } from '@/utils/cn';
import { EditorCore } from '@/editor/components/EditorCore';
import { useFileStore } from '@/stores/file-store';

/**
 * Simplified layout for browser mode
 * - No sidebar
 * - No title bar
 * - No status bar
 * - Just the editor
 */
export function BrowserLayout() {
  const currentFile = useFileStore((s) => s.currentFile);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="editor-container flex min-w-0 flex-1 flex-col">
        <div className="editor-content min-h-0 flex-1 overflow-auto bg-[var(--editor-bg)]">
          {currentFile ? (
            <EditorCore />
          ) : (
            <div
              className={cn(
                'flex h-full select-none items-center justify-center',
                'text-sm text-slate-500 dark:text-slate-400',
              )}
            >
              正在加载...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

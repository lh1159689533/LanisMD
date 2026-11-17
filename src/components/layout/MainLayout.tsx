import { cn } from '@/utils/cn';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { AiHistoryPanel } from './AiHistoryPanel';
import { WelcomeScreen } from './WelcomeScreen';
import { EditorCore } from '@/editor/components/EditorCore';
import { GitDiffPanel } from '@/components/git/GitDiffPanel';
import { CommitDialog } from '@/components/git/CommitDialog';
import { CloneDialog } from '@/components/git/CloneDialog';
import { useFileStore } from '@/stores/file-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useEditorStore } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { useGitStore } from '@/stores/git-store';

export function MainLayout() {
  const currentFile = useFileStore((s) => s.currentFile);
  const sidebarPosition = useSettingsStore((s) => s.config.sidebar.position);
  const typewriterMode = useEditorStore((s) => s.typewriterMode);
  const aiHistoryOpen = useUIStore((s) => s.aiHistoryOpen);
  // 查看 Git diff 时覆盖编辑区；编辑器保持挂载以保留滚动位置与撤销历史
  const showDiff = useGitStore((s) => s.diffTarget !== null);

  return (
    <div className={cn('flex min-h-0 flex-1', sidebarPosition === 'right' && 'flex-row-reverse')}>
      <Sidebar />
      <div className="editor-container relative flex min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1">
          <div
            className={cn(
              'editor-content min-h-0 flex-1 overflow-auto bg-[var(--lanismd-editor-bg)]',
              typewriterMode && 'lanismd-typewriter-active',
              showDiff && 'hidden',
            )}
          >
            {currentFile ? <EditorCore /> : <WelcomeScreen />}
          </div>
          {showDiff && <GitDiffPanel />}
          {aiHistoryOpen && <AiHistoryPanel />}
        </div>
        <StatusBar />
      </div>
      <CommitDialog />
      <CloneDialog />
    </div>
  );
}

import { RiFileTextLine, RiSunLine, RiMoonLine, RiCodeSSlashLine, RiEyeLine } from 'react-icons/ri';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useFileStore } from '@/stores/file-store';
import type { ThemeMode } from '@/types';
import { cn } from '@/utils/cn';

export function StatusBar() {
  const { wordCount, charCount, lineCount, cursorLine, cursorColumn, mode, setMode } =
    useEditorStore();
  const { config, setConfig } = useSettingsStore();
  const currentFile = useFileStore((s) => s.currentFile);

  const toggleTheme = () => {
    const next: ThemeMode =
      config.theme === 'light' ? 'dark' : config.theme === 'dark' ? 'system' : 'light';
    setConfig('theme', next);
  };

  const toggleMode = () => {
    setMode(mode === 'wysiwyg' ? 'source' : 'wysiwyg');
  };

  const themeIcon =
    config.theme === 'dark' ? (
      <RiMoonLine size={13} />
    ) : config.theme === 'light' ? (
      <RiSunLine size={13} />
    ) : (
      <span className="text-[10px]">系统</span>
    );

  return (
    <div
      className={cn(
        'flex h-6 shrink-0 select-none items-center justify-between',
        'border-t border-[var(--lanismd-editor-border)]',
        'bg-[var(--lanismd-titlebar-bg)] px-3 text-[11px] text-[var(--lanismd-sidebar-text)]',
      )}
    >
      <div className="flex items-center gap-3">
        {currentFile && (
          <>
            <span>
              行 {cursorLine}, 列 {cursorColumn}
            </span>
            <span>{lineCount} 行</span>
            <span>{charCount} 字符</span>
            <span>{wordCount} 字</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        {currentFile && (
          <>
            <button
              onClick={toggleMode}
              className={cn(
                'flex items-center gap-1 transition-colors hover:text-[var(--lanismd-accent)]',
              )}
              title={mode === 'wysiwyg' ? '切换到源码模式' : '切换到预览模式'}
            >
              {mode === 'wysiwyg' ? (
                <>
                  <RiEyeLine size={13} />
                  <span>预览</span>
                </>
              ) : (
                <>
                  <RiCodeSSlashLine size={13} />
                  <span>源码</span>
                </>
              )}
            </button>
            <span className="flex items-center gap-1">
              <RiFileTextLine size={12} />
              {currentFile.encoding.toUpperCase()}
            </span>
          </>
        )}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1 transition-colors hover:text-[var(--lanismd-accent)]"
          title={`Theme: ${config.theme}`}
        >
          {themeIcon}
        </button>
      </div>
    </div>
  );
}

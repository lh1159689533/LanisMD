import { useState, useRef, useEffect } from 'react';
import {
  RiFileTextLine,
  RiSunLine,
  RiMoonLine,
  RiComputerLine,
  RiCodeSSlashLine,
  RiEyeLine,
  RiPaletteLine,
} from 'react-icons/ri';
import { TbLeaf, TbSnowflake } from 'react-icons/tb';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useFileStore } from '@/stores/file-store';
import { BUILTIN_THEME_LIST, isCustomTheme, getCustomThemeId, type BuiltinTheme } from '@/types/config';
import type { ThemeMode } from '@/types';
import { cn } from '@/utils/cn';

// 内置主题图标映射
const BUILTIN_THEME_ICONS: Record<BuiltinTheme | 'system', React.ReactNode> = {
  system: <RiComputerLine size={13} />,
  light: <RiSunLine size={13} />,
  dark: <RiMoonLine size={13} />,
  sepia: <TbLeaf size={13} />,
  nord: <TbSnowflake size={13} />,
};

/**
 * 获取当前主题的图标
 */
function getThemeIcon(theme: ThemeMode): React.ReactNode {
  if (isCustomTheme(theme)) {
    return <RiPaletteLine size={13} />;
  }
  return BUILTIN_THEME_ICONS[theme as BuiltinTheme | 'system'];
}

export function StatusBar() {
  const { wordCount, charCount, lineCount, cursorLine, cursorColumn, mode, setMode } =
    useEditorStore();
  const { config, setConfig } = useSettingsStore();
  const currentFile = useFileStore((s) => s.currentFile);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!showThemeMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        themeButtonRef.current &&
        !themeButtonRef.current.contains(e.target as Node)
      ) {
        setShowThemeMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showThemeMenu]);

  const toggleMode = () => {
    setMode(mode === 'wysiwyg' ? 'source' : 'wysiwyg');
  };

  const handleThemeSelect = (theme: ThemeMode) => {
    setConfig('theme', theme);
  };

  // 获取当前主题的描述
  const getCurrentThemeDescription = () => {
    if (isCustomTheme(config.theme)) {
      const themeId = getCustomThemeId(config.theme);
      return `自定义主题: ${themeId}`;
    }
    const themeInfo = BUILTIN_THEME_LIST.find((t) => t.id === config.theme);
    return themeInfo?.description;
  };

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
        <div className="relative">
          <button
            ref={themeButtonRef}
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            className="flex items-center gap-1 transition-colors hover:text-[var(--lanismd-accent)]"
            title={getCurrentThemeDescription()}
          >
            {getThemeIcon(config.theme)}
          </button>

          {/* 主题选择菜单 */}
          {showThemeMenu && (
            <div
              ref={menuRef}
              className={cn(
                'absolute bottom-full right-0 mb-1 min-w-[120px]',
                'rounded-md border border-[var(--lanismd-editor-border)]',
                'bg-[var(--lanismd-editor-bg)] py-1 shadow-lg',
              )}
            >
              {BUILTIN_THEME_LIST.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelect(theme.id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px]',
                    'transition-colors hover:bg-[var(--lanismd-sidebar-hover)]',
                    config.theme === theme.id && 'bg-[var(--lanismd-sidebar-active)]',
                  )}
                  title={theme.description}
                >
                  {BUILTIN_THEME_ICONS[theme.id as BuiltinTheme | 'system']}
                  <span>{theme.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

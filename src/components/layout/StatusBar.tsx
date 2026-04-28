import { useState, useRef, useEffect, useCallback } from 'react';
import {
  RiFileTextLine,
  RiSunLine,
  RiMoonLine,
  RiComputerLine,
  RiCodeSSlashLine,
  RiEyeLine,
  RiPaletteLine,
  RiArrowRightSLine,
  RiSparklingLine,
} from 'react-icons/ri';
import { TbLeaf, TbSnowflake, TbFlower } from 'react-icons/tb';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useFileStore } from '@/stores/file-store';
import { useUIStore } from '@/stores/ui-store';
import { useAiStore } from '@/stores/ai-store';
import { themeLoader, type ThemeMetadata } from '@/services';
import {
  BUILTIN_THEME_LIST,
  isCustomTheme,
  getCustomThemeId,
  type BuiltinTheme,
} from '@/types/config';
import type { ThemeMode, ThemeInfo } from '@/types';
import { cn } from '@/utils/cn';

// 内置主题图标映射
const BUILTIN_THEME_ICONS: Record<BuiltinTheme | 'system', React.ReactNode> = {
  system: <RiComputerLine size={13} />,
  light: <RiSunLine size={13} />,
  dark: <RiMoonLine size={13} />,
  sepia: <TbLeaf size={13} />,
  nord: <TbSnowflake size={13} />,
  // Bloom 系列 - 浅色
  'bloom-petal': <TbFlower size={13} />,
  'bloom-spring': <TbFlower size={13} />,
  'bloom-amber': <TbFlower size={13} />,
  'bloom-ink': <TbFlower size={13} />,
  'bloom-mist': <TbFlower size={13} />,
  'bloom-ripple': <TbFlower size={13} />,
  'bloom-stone': <TbFlower size={13} />,
  'bloom-verdant': <TbFlower size={13} />,
  // Bloom 系列 - 深色
  'bloom-petal-dark': <TbFlower size={13} />,
  'bloom-spring-dark': <TbFlower size={13} />,
  'bloom-amber-dark': <TbFlower size={13} />,
  'bloom-ink-dark': <TbFlower size={13} />,
  'bloom-mist-dark': <TbFlower size={13} />,
  'bloom-ripple-dark': <TbFlower size={13} />,
  'bloom-stone-dark': <TbFlower size={13} />,
  'bloom-verdant-dark': <TbFlower size={13} />,
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

// 主题分组
const BASE_THEMES = BUILTIN_THEME_LIST.filter((t) => !t.id.startsWith('bloom-'));
const BLOOM_LIGHT_THEMES = BUILTIN_THEME_LIST.filter(
  (t) => t.id.startsWith('bloom-') && !t.id.endsWith('-dark'),
);
const BLOOM_DARK_THEMES = BUILTIN_THEME_LIST.filter(
  (t) => t.id.startsWith('bloom-') && t.id.endsWith('-dark'),
);

// Bloom 子菜单组件
interface BloomSubmenuProps {
  lightThemes: ThemeInfo[];
  darkThemes: ThemeInfo[];
  currentTheme: ThemeMode;
  onSelect: (theme: ThemeMode) => void;
  parentRef: React.RefObject<HTMLDivElement | null>;
}

function BloomSubmenu({
  lightThemes,
  darkThemes,
  currentTheme,
  onSelect,
  parentRef,
}: BloomSubmenuProps) {
  const submenuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'left' | 'right'>('left');

  // 自动检测展开方向
  useEffect(() => {
    if (!parentRef.current || !submenuRef.current) return;

    const parentRect = parentRef.current.getBoundingClientRect();
    const submenuWidth = submenuRef.current.offsetWidth;
    const windowWidth = window.innerWidth;

    // 如果右侧空间足够，向右展开；否则向左
    if (parentRect.right + submenuWidth + 8 < windowWidth) {
      setPosition('right');
    } else {
      setPosition('left');
    }
  }, [parentRef]);

  return (
    <div
      ref={submenuRef}
      className={cn(
        'absolute bottom-0 min-w-[140px]',
        'max-h-[60vh] overflow-y-auto',
        'rounded-md border border-[var(--lanismd-editor-border)]',
        'bg-[var(--lanismd-editor-bg)] py-1 shadow-lg',
        position === 'left' ? 'right-full mr-1' : 'left-full ml-1',
      )}
    >
      {/* 浅色主题 */}
      {lightThemes.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onSelect(theme.id)}
          className={cn(
            'flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-[11px]',
            'transition-colors hover:bg-[var(--lanismd-sidebar-hover)]',
            currentTheme === theme.id && 'bg-[var(--lanismd-sidebar-active)]',
          )}
          title={theme.description}
        >
          {BUILTIN_THEME_ICONS[theme.id as BuiltinTheme]}
          <span>{theme.name.replace('Bloom ', '')}</span>
        </button>
      ))}

      {/* 分隔线 */}
      <div className="my-1 border-t border-[var(--lanismd-editor-border)]" />

      {/* 深色主题 */}
      {darkThemes.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onSelect(theme.id)}
          className={cn(
            'flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-[11px]',
            'transition-colors hover:bg-[var(--lanismd-sidebar-hover)]',
            currentTheme === theme.id && 'bg-[var(--lanismd-sidebar-active)]',
          )}
          title={theme.description}
        >
          {BUILTIN_THEME_ICONS[theme.id as BuiltinTheme]}
          <span>{theme.name.replace('Bloom ', '')}</span>
        </button>
      ))}
    </div>
  );
}

// 自定义主题子菜单组件
interface CustomThemeSubmenuProps {
  themes: ThemeMetadata[];
  currentTheme: ThemeMode;
  onSelect: (theme: ThemeMode) => void;
  parentRef: React.RefObject<HTMLDivElement | null>;
}

function CustomThemeSubmenu({
  themes,
  currentTheme,
  onSelect,
  parentRef,
}: CustomThemeSubmenuProps) {
  const submenuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'left' | 'right'>('left');

  // 自动检测展开方向
  useEffect(() => {
    if (!parentRef.current || !submenuRef.current) return;

    const parentRect = parentRef.current.getBoundingClientRect();
    const submenuWidth = submenuRef.current.offsetWidth;
    const windowWidth = window.innerWidth;

    if (parentRect.right + submenuWidth + 8 < windowWidth) {
      setPosition('right');
    } else {
      setPosition('left');
    }
  }, [parentRef]);

  const isCustomThemeSelected = (themeId: string) =>
    isCustomTheme(currentTheme) && currentTheme === `custom:${themeId}`;

  return (
    <div
      ref={submenuRef}
      className={cn(
        'absolute bottom-0 min-w-[140px]',
        'max-h-[60vh] overflow-y-auto',
        'rounded-md border border-[var(--lanismd-editor-border)]',
        'bg-[var(--lanismd-editor-bg)] py-1 shadow-lg',
        position === 'left' ? 'right-full mr-1' : 'left-full ml-1',
      )}
    >
      {themes.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onSelect(`custom:${theme.id}`)}
          className={cn(
            'flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-[11px]',
            'transition-colors hover:bg-[var(--lanismd-sidebar-hover)]',
            isCustomThemeSelected(theme.id) && 'bg-[var(--lanismd-sidebar-active)]',
          )}
          title={`用户主题: ${theme.name}`}
        >
          <RiPaletteLine size={13} />
          <span>{theme.name}</span>
        </button>
      ))}
    </div>
  );
}

export function StatusBar() {
  const { wordCount, charCount, lineCount, cursorLine, cursorColumn, mode, setMode } =
    useEditorStore();
  const { config, setConfig } = useSettingsStore();
  const currentFile = useFileStore((s) => s.currentFile);
  const toggleAiHistory = useUIStore((s) => s.toggleAiHistory);
  const aiHistoryOpen = useUIStore((s) => s.aiHistoryOpen);
  const historyCount = useAiStore((s) => s.history.length);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showBloomSubmenu, setShowBloomSubmenu] = useState(false);
  const [showCustomSubmenu, setShowCustomSubmenu] = useState(false);
  const [userThemes, setUserThemes] = useState<ThemeMetadata[]>([]);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bloomItemRef = useRef<HTMLDivElement>(null);
  const customItemRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aiOn = config.ai?.enabled !== false;

  // 加载用户自定义主题列表
  useEffect(() => {
    themeLoader.listUserThemes().then(setUserThemes);
  }, []);

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
        setShowBloomSubmenu(false);
        setShowCustomSubmenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showThemeMenu]);

  // 清理 hover timeout
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Bloom 菜单项悬停处理
  const handleBloomMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setShowBloomSubmenu(true);
    setShowCustomSubmenu(false);
  }, []);

  const handleBloomMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setShowBloomSubmenu(false);
    }, 150);
  }, []);

  // 自定义主题菜单项悬停处理
  const handleCustomMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setShowCustomSubmenu(true);
    setShowBloomSubmenu(false);
  }, []);

  const handleCustomMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setShowCustomSubmenu(false);
    }, 150);
  }, []);

  // 其他菜单项悬停时关闭所有子菜单
  const handleOtherItemMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setShowBloomSubmenu(false);
    setShowCustomSubmenu(false);
  }, []);

  const toggleMode = () => {
    setMode(mode === 'wysiwyg' ? 'source' : 'wysiwyg');
  };

  const handleThemeSelect = (theme: ThemeMode) => {
    setConfig('theme', theme);
    setShowThemeMenu(false);
    setShowBloomSubmenu(false);
    setShowCustomSubmenu(false);
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
        {aiOn && (
          <div className="relative">
            <button
              onClick={toggleAiHistory}
              className={cn(
                'flex items-center gap-1 transition-colors hover:text-[var(--lanismd-accent)]',
                aiHistoryOpen && 'text-[var(--lanismd-accent)]',
              )}
              title="AI 历史记录"
            >
              <RiSparklingLine size={13} />
              {historyCount > 0 && <span className="text-[10px] opacity-70">{historyCount}</span>}
            </button>
          </div>
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
                'absolute bottom-full right-0 mb-1 min-w-[140px]',
                'rounded-md border border-[var(--lanismd-editor-border)]',
                'z-10 bg-[var(--lanismd-editor-bg)] py-1 shadow-lg',
              )}
            >
              {/* 基础主题 */}
              {BASE_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelect(theme.id)}
                  onMouseEnter={handleOtherItemMouseEnter}
                  className={cn(
                    'flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-[11px]',
                    'transition-colors hover:bg-[var(--lanismd-sidebar-hover)]',
                    config.theme === theme.id && 'bg-[var(--lanismd-sidebar-active)]',
                  )}
                  title={theme.description}
                >
                  {BUILTIN_THEME_ICONS[theme.id as BuiltinTheme | 'system']}
                  <span>{theme.name}</span>
                </button>
              ))}

              {/* 分隔线 */}
              <div className="my-1 border-t border-[var(--lanismd-editor-border)]" />

              {/* Bloom 系列入口 */}
              <div
                ref={bloomItemRef}
                className="relative"
                onMouseEnter={handleBloomMouseEnter}
                onMouseLeave={handleBloomMouseLeave}
              >
                <div
                  className={cn(
                    'flex w-full cursor-default items-center justify-between gap-2 px-3 py-1.5 text-left text-[11px]',
                    'transition-colors hover:bg-[var(--lanismd-sidebar-hover)]',
                    config.theme.startsWith('bloom-') && 'bg-[var(--lanismd-sidebar-active)]',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <TbFlower size={13} />
                    <span>Bloom 系列</span>
                  </span>
                  <RiArrowRightSLine size={14} className="opacity-60" />
                </div>

                {/* Bloom 子菜单 */}
                {showBloomSubmenu && (
                  <BloomSubmenu
                    lightThemes={BLOOM_LIGHT_THEMES}
                    darkThemes={BLOOM_DARK_THEMES}
                    currentTheme={config.theme}
                    onSelect={handleThemeSelect}
                    parentRef={bloomItemRef}
                  />
                )}
              </div>

              {/* 自定义主题入口（仅当有自定义主题时显示） */}
              {userThemes.length > 0 && (
                <div
                  ref={customItemRef}
                  className="relative"
                  onMouseEnter={handleCustomMouseEnter}
                  onMouseLeave={handleCustomMouseLeave}
                >
                  <div
                    className={cn(
                      'flex w-full cursor-default items-center justify-between gap-2 px-3 py-1.5 text-left text-[11px]',
                      'transition-colors hover:bg-[var(--lanismd-sidebar-hover)]',
                      isCustomTheme(config.theme) && 'bg-[var(--lanismd-sidebar-active)]',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <RiPaletteLine size={13} />
                      <span>自定义主题</span>
                    </span>
                    <RiArrowRightSLine size={14} className="opacity-60" />
                  </div>

                  {/* 自定义主题子菜单 */}
                  {showCustomSubmenu && (
                    <CustomThemeSubmenu
                      themes={userThemes}
                      currentTheme={config.theme}
                      onSelect={handleThemeSelect}
                      parentRef={customItemRef}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

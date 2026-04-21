import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { themeLoader } from '@/services';
import { isCustomTheme, getCustomThemeId, type BuiltinTheme } from '@/types/config';

// 内置主题与 CSS class 的映射
const BUILTIN_THEME_CLASS_MAP: Record<BuiltinTheme, string[]> = {
  light: ['theme-light'],
  dark: ['theme-dark', 'dark'], // 保留 dark class 兼容 Tailwind
  sepia: ['theme-sepia'],
  nord: ['theme-nord', 'dark'], // Nord 是深色主题，需要 dark class
  // Bloom 系列 - 浅色
  'bloom-petal': ['theme-bloom-petal'],
  'bloom-spring': ['theme-bloom-spring'],
  'bloom-amber': ['theme-bloom-amber'],
  'bloom-ink': ['theme-bloom-ink'],
  'bloom-mist': ['theme-bloom-mist'],
  'bloom-ripple': ['theme-bloom-ripple'],
  'bloom-stone': ['theme-bloom-stone'],
  'bloom-verdant': ['theme-bloom-verdant'],
  // Bloom 系列 - 深色（需要 dark class 兼容 Tailwind）
  'bloom-petal-dark': ['theme-bloom-petal-dark', 'dark'],
  'bloom-spring-dark': ['theme-bloom-spring-dark', 'dark'],
  'bloom-amber-dark': ['theme-bloom-amber-dark', 'dark'],
  'bloom-ink-dark': ['theme-bloom-ink-dark', 'dark'],
  'bloom-mist-dark': ['theme-bloom-mist-dark', 'dark'],
  'bloom-ripple-dark': ['theme-bloom-ripple-dark', 'dark'],
  'bloom-stone-dark': ['theme-bloom-stone-dark', 'dark'],
  'bloom-verdant-dark': ['theme-bloom-verdant-dark', 'dark'],
};

// 所有可能的主题 class（用于清理）
const ALL_THEME_CLASSES = [
  'light',
  'dark',
  'theme-light',
  'theme-dark',
  'theme-sepia',
  'theme-nord',
  'theme-custom',
  // Bloom 系列
  'theme-bloom-petal',
  'theme-bloom-spring',
  'theme-bloom-amber',
  'theme-bloom-ink',
  'theme-bloom-mist',
  'theme-bloom-ripple',
  'theme-bloom-stone',
  'theme-bloom-verdant',
  'theme-bloom-petal-dark',
  'theme-bloom-spring-dark',
  'theme-bloom-amber-dark',
  'theme-bloom-ink-dark',
  'theme-bloom-mist-dark',
  'theme-bloom-ripple-dark',
  'theme-bloom-stone-dark',
  'theme-bloom-verdant-dark',
];

export function useTheme() {
  const { config } = useSettingsStore();

  useEffect(() => {
    /**
     * 应用内置主题
     */
    const applyBuiltinTheme = async (theme: BuiltinTheme) => {
      const root = document.documentElement;

      // 移除所有主题类
      ALL_THEME_CLASSES.forEach((cls) => root.classList.remove(cls));

      // 移除之前的自定义主题
      themeLoader.removeCustomTheme();

      // 添加内置主题类
      const classes = BUILTIN_THEME_CLASS_MAP[theme];
      classes.forEach((cls) => root.classList.add(cls));

      // 加载用户自定义 CSS 覆盖（Typora 风格）
      try {
        await themeLoader.loadUserCSS(theme);
      } catch (err) {
        console.error('[useTheme] Failed to load user CSS:', err);
      }
    };

    /**
     * 应用用户自定义主题
     */
    const applyCustomTheme = async (themeId: string) => {
      const root = document.documentElement;

      // 移除所有主题类
      ALL_THEME_CLASSES.forEach((cls) => root.classList.remove(cls));

      // 加载用户自定义主题
      try {
        const theme = await themeLoader.loadUserTheme(themeId);
        if (theme) {
          // 添加自定义主题标识类
          root.classList.add('theme-custom');
          root.classList.add(`theme-${themeId}`);

          // 应用主题 CSS
          themeLoader.applyCustomTheme(theme);

          // 加载用户自定义 CSS 覆盖
          await themeLoader.loadUserCSS(themeId);
        } else {
          console.error(
            `[useTheme] Failed to load custom theme: ${themeId}, falling back to light`,
          );
          applyBuiltinTheme('light');
        }
      } catch (err) {
        console.error('[useTheme] Failed to apply custom theme:', err);
        applyBuiltinTheme('light');
      }
    };

    // 根据当前主题配置决定应用哪种主题
    const currentTheme = config.theme;

    if (currentTheme === 'system') {
      // 跟随系统
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyBuiltinTheme(isDark ? 'dark' : 'light');

      const handler = (e: MediaQueryListEvent) => {
        applyBuiltinTheme(e.matches ? 'dark' : 'light');
      };
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else if (isCustomTheme(currentTheme)) {
      // 用户自定义主题
      const themeId = getCustomThemeId(currentTheme);
      if (themeId) {
        applyCustomTheme(themeId);
      }
    } else {
      // 内置主题
      applyBuiltinTheme(currentTheme);
    }
  }, [config.theme]);

  // 编辑器配置 -> CSS 变量同步
  useEffect(() => {
    const root = document.documentElement;

    // 最大宽度（修正变量名为 --lanismd-editor-max-width）
    root.style.setProperty('--lanismd-editor-max-width', `${config.editor.maxWidth}px`);

    // 字体大小
    root.style.setProperty('--lanismd-editor-font-size', `${config.editor.fontSize}px`);

    // 行高
    root.style.setProperty('--lanismd-editor-line-height', `${config.editor.lineHeight}`);

    // 字体映射
    const fontFamilyMap: Record<string, string> = {
      system: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      serif: '"Georgia", "Times New Roman", "Songti SC", serif',
      'sans-serif': 'system-ui, -apple-system, "Segoe UI", "PingFang SC", sans-serif',
      monospace: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
    };
    const resolvedFont = fontFamilyMap[config.editor.fontFamily] || fontFamilyMap.system;
    root.style.setProperty('--lanismd-editor-font-family', resolvedFont);

    // 自动换行
    // soft: 按容器宽度自动换行（CSS默认行为）
    // hard: 插入实际换行符（编辑器层面处理，CSS 层面与 soft 相同）
    // off: 不换行，显示水平滚动条
    const wordWrapValue = config.editor.wordWrap === 'off' ? 'nowrap' : 'normal';
    const overflowXValue = config.editor.wordWrap === 'off' ? 'auto' : 'hidden';
    root.style.setProperty('--lanismd-editor-word-wrap', wordWrapValue);
    root.style.setProperty('--lanismd-editor-overflow-x', overflowXValue);
  }, [
    config.editor.maxWidth,
    config.editor.fontSize,
    config.editor.lineHeight,
    config.editor.fontFamily,
    config.editor.wordWrap,
  ]);
}

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
          console.error(`[useTheme] Failed to load custom theme: ${themeId}, falling back to light`);
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

  useEffect(() => {
    document.documentElement.style.setProperty('--editor-max-width', `${config.editor.maxWidth}px`);
  }, [config.editor.maxWidth]);
}

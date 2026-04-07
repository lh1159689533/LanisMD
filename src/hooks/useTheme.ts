import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import type { ThemeMode } from '@/types';

// 主题与 CSS class 的映射
const THEME_CLASS_MAP: Record<Exclude<ThemeMode, 'system'>, string[]> = {
  light: ['theme-light'],
  dark: ['theme-dark', 'dark'],      // 保留 dark class 兼容 Tailwind
  sepia: ['theme-sepia'],
  nord: ['theme-nord', 'dark'],      // Nord 是深色主题，需要 dark class
};

// 所有可能的主题 class
const ALL_THEME_CLASSES = ['light', 'dark', 'theme-light', 'theme-dark', 'theme-sepia', 'theme-nord'];

export function useTheme() {
  const { config } = useSettingsStore();

  useEffect(() => {
    const applyTheme = (theme: Exclude<ThemeMode, 'system'>) => {
      const root = document.documentElement;
      
      // 移除所有主题类
      ALL_THEME_CLASSES.forEach(cls => root.classList.remove(cls));
      
      // 添加新主题类
      const classes = THEME_CLASS_MAP[theme];
      classes.forEach(cls => root.classList.add(cls));
    };

    if (config.theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(isDark ? 'dark' : 'light');

      const handler = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      applyTheme(config.theme);
    }
  }, [config.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--editor-max-width', `${config.editor.maxWidth}px`);
  }, [config.editor.maxWidth]);
}

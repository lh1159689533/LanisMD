/**
 * 预览窗口主题同步 Hook
 *
 * 负责：
 * 1. 初始化时从 URL 参数读取主题并应用
 * 2. 监听主应用广播的 theme-changed 事件，实时同步主题
 * 3. 返回当前主题是否为深色，供 FileViewer 的 theme prop 使用
 */

import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';

import { themeLoader } from '@/services';
import {
  isCustomTheme,
  getCustomThemeId,
  BUILTIN_THEME_LIST,
  type BuiltinTheme,
  type ThemeMode,
} from '@/types/config';
import { ALL_THEME_CLASSES, BUILTIN_THEME_CLASS_MAP } from '@/hooks/useTheme';

/**
 * 主题变更事件的 payload 类型
 */
interface ThemeChangedPayload {
  theme: string;
}

/**
 * 判断主题是否为深色（用于 FileViewer theme prop）
 */
function isThemeDark(theme: string): boolean {
  // 内置主题：查 BUILTIN_THEME_LIST 的 isDark 字段
  const builtinInfo = BUILTIN_THEME_LIST.find((t) => t.id === theme);
  if (builtinInfo) {
    return builtinInfo.isDark;
  }

  // 自定义主题：名称包含 dark 的视为深色，否则默认浅色
  if (theme.includes('dark')) {
    return true;
  }

  // system 模式下跟随系统（不过实际收到的广播是解析后的 light/dark）
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  return false;
}

/**
 * 从 URL 参数中读取初始主题
 */
function getInitialTheme(): ThemeMode {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get('theme');
  return (theme as ThemeMode) || 'system';
}

export function usePreviewTheme() {
  const [isDark, setIsDark] = useState(() => {
    const initial = getInitialTheme();
    return isThemeDark(initial);
  });

  /**
   * 应用内置主题到 DOM（精简版，不包含编辑器样式同步）
   */
  const applyBuiltinTheme = useCallback((theme: BuiltinTheme) => {
    const root = document.documentElement;

    // 移除所有主题类
    ALL_THEME_CLASSES.forEach((cls) => root.classList.remove(cls));

    // 移除之前的自定义主题
    themeLoader.removeCustomTheme();

    // 添加内置主题类
    const classes = BUILTIN_THEME_CLASS_MAP[theme];
    if (classes) {
      classes.forEach((cls) => root.classList.add(cls));
    }

    // 更新深浅状态
    setIsDark(isThemeDark(theme));
  }, []);

  /**
   * 应用用户自定义主题到 DOM
   */
  const applyCustomTheme = useCallback(async (themeId: string) => {
    const root = document.documentElement;

    // 移除所有主题类
    ALL_THEME_CLASSES.forEach((cls) => root.classList.remove(cls));

    try {
      const theme = await themeLoader.loadUserTheme(themeId);
      if (theme) {
        root.classList.add('theme-custom');
        root.classList.add(`theme-${themeId}`);
        themeLoader.applyCustomTheme(theme);

        // 自定义主题的深浅判断
        setIsDark(isThemeDark(themeId));
      } else {
        // 加载失败，降级到 light
        applyBuiltinTheme('light');
      }
    } catch (err) {
      console.error('[usePreviewTheme] Failed to apply custom theme:', err);
      applyBuiltinTheme('light');
    }
  }, [applyBuiltinTheme]);

  /**
   * 根据主题字符串决定应用方式
   */
  const applyTheme = useCallback((theme: string) => {
    if (theme === 'system') {
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyBuiltinTheme(systemIsDark ? 'dark' : 'light');
    } else if (isCustomTheme(theme as ThemeMode)) {
      const themeId = getCustomThemeId(theme as ThemeMode);
      if (themeId) {
        applyCustomTheme(themeId);
      }
    } else {
      applyBuiltinTheme(theme as BuiltinTheme);
    }
  }, [applyBuiltinTheme, applyCustomTheme]);

  useEffect(() => {
    // 1. 初始化：从 URL 参数读取主题并应用
    const initialTheme = getInitialTheme();
    applyTheme(initialTheme);

    // 2. 监听主应用广播的主题变更事件
    let unlisten: (() => void) | undefined;

    listen<ThemeChangedPayload>('theme-changed', (event) => {
      const { theme } = event.payload;
      applyTheme(theme);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [applyTheme]);

  return { isDark };
}

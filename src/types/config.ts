// 内置主题类型
export type BuiltinTheme = 'light' | 'dark' | 'sepia' | 'nord';

// 主题模式：内置主题 | 'system' | 用户自定义主题（以 'custom:' 前缀标识）
export type ThemeMode = BuiltinTheme | 'system' | `custom:${string}`;

// 主题元数据（用于 UI 展示）
export interface ThemeInfo {
  id: ThemeMode;
  name: string;
  description: string;
  isDark: boolean;
}

// 内置主题列表
export const BUILTIN_THEME_LIST: ThemeInfo[] = [
  { id: 'light', name: 'Light', description: '清爽浅色主题', isDark: false },
  { id: 'dark', name: 'Dark', description: 'Tokyo Night 深色主题', isDark: true },
  { id: 'sepia', name: 'Sepia', description: '护眼复古主题', isDark: false },
  { id: 'nord', name: 'Nord', description: 'Nord 极地风格', isDark: true },
  { id: 'system', name: 'System', description: '跟随系统设置', isDark: false },
];

/** @deprecated 使用 BUILTIN_THEME_LIST 代替 */
export const THEME_LIST = BUILTIN_THEME_LIST;

/**
 * 判断主题是否为用户自定义主题
 */
export function isCustomTheme(theme: ThemeMode): theme is `custom:${string}` {
  return theme.startsWith('custom:');
}

/**
 * 从 ThemeMode 中提取用户自定义主题 ID
 */
export function getCustomThemeId(theme: ThemeMode): string | null {
  if (isCustomTheme(theme)) {
    return theme.slice(7); // 移除 'custom:' 前缀
  }
  return null;
}

export interface AppConfig {
  theme: ThemeMode;
  language: 'system' | 'zh-CN' | 'en';
  editor: {
    fontSize: number;
    fontFamily: string;
    maxWidth: number;
    lineHeight: number;
    wordWrap: 'soft' | 'hard' | 'off';
    showLineNumbers: boolean;
    codeBlock: {
      showLineNumbers: boolean;
    };
  };
  recentFiles: {
    maxCount: number;
  };
  restoreSession: boolean;
  sidebar: {
    position: 'left' | 'right';
    width: number;
  };
  recentFolders: {
    /** Whether clicking outside the recent-folders panel closes it */
    closeOnClickOutside: boolean;
  };
  keyBindings?: Record<string, string>;
  image: {
    insertAction: 'copy-to-assets' | 'relative-path' | 'absolute-path';
    assetsFolderName: string;
  };
}

export type ErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'IO_ERROR'
  | 'ENCODING_ERROR'
  | 'INVALID_PATH'
  | 'WRITE_FAILED'
  | 'CONFIG_ERROR'
  | 'EXPORT_FAILED';

export interface AppError {
  code: ErrorCode;
  message: string;
}

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
}

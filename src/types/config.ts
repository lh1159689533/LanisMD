// 内置主题类型
export type BuiltinTheme = 
  | 'light' 
  | 'dark' 
  | 'sepia' 
  | 'nord'
  // Bloom 系列 - 浅色
  | 'bloom-petal'
  | 'bloom-spring'
  | 'bloom-amber'
  | 'bloom-ink'
  | 'bloom-mist'
  | 'bloom-ripple'
  | 'bloom-stone'
  | 'bloom-verdant'
  // Bloom 系列 - 深色
  | 'bloom-petal-dark'
  | 'bloom-spring-dark'
  | 'bloom-amber-dark'
  | 'bloom-ink-dark'
  | 'bloom-mist-dark'
  | 'bloom-ripple-dark'
  | 'bloom-stone-dark'
  | 'bloom-verdant-dark';

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
  // 原有主题
  { id: 'light', name: 'Light', description: '清爽浅色主题', isDark: false },
  { id: 'dark', name: 'Dark', description: 'Tokyo Night 深色主题', isDark: true },
  { id: 'sepia', name: 'Sepia', description: '护眼复古主题', isDark: false },
  { id: 'nord', name: 'Nord', description: 'Nord 极地风格', isDark: true },
  
  // Bloom 系列 - 浅色
  { id: 'bloom-petal', name: 'Bloom Petal', description: '莫兰迪玫瑰粉', isDark: false },
  { id: 'bloom-spring', name: 'Bloom Spring', description: '莫兰迪薰衣草紫', isDark: false },
  { id: 'bloom-amber', name: 'Bloom Amber', description: '莫兰迪琥珀黄', isDark: false },
  { id: 'bloom-ink', name: 'Bloom Ink', description: '莫兰迪朱砂墨', isDark: false },
  { id: 'bloom-mist', name: 'Bloom Mist', description: '莫兰迪雾蓝', isDark: false },
  { id: 'bloom-ripple', name: 'Bloom Ripple', description: '莫兰迪青绿', isDark: false },
  { id: 'bloom-stone', name: 'Bloom Stone', description: '莫兰迪石褐', isDark: false },
  { id: 'bloom-verdant', name: 'Bloom Verdant', description: '莫兰迪翠绿', isDark: false },
  
  // Bloom 系列 - 深色
  { id: 'bloom-petal-dark', name: 'Bloom Petal Dark', description: '莫兰迪玫瑰粉（深色）', isDark: true },
  { id: 'bloom-spring-dark', name: 'Bloom Spring Dark', description: '莫兰迪薰衣草紫（深色）', isDark: true },
  { id: 'bloom-amber-dark', name: 'Bloom Amber Dark', description: '莫兰迪琥珀黄（深色）', isDark: true },
  { id: 'bloom-ink-dark', name: 'Bloom Ink Dark', description: '莫兰迪朱砂墨（深色）', isDark: true },
  { id: 'bloom-mist-dark', name: 'Bloom Mist Dark', description: '莫兰迪雾蓝（深色）', isDark: true },
  { id: 'bloom-ripple-dark', name: 'Bloom Ripple Dark', description: '莫兰迪青绿（深色）', isDark: true },
  { id: 'bloom-stone-dark', name: 'Bloom Stone Dark', description: '莫兰迪石褐（深色）', isDark: true },
  { id: 'bloom-verdant-dark', name: 'Bloom Verdant Dark', description: '莫兰迪翠绿（深色）', isDark: true },
  
  // 系统主题
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

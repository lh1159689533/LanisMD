// 扩展主题类型
export type ThemeMode = 'light' | 'dark' | 'sepia' | 'nord' | 'system';

// 主题元数据（用于 UI 展示）
export interface ThemeInfo {
  id: ThemeMode;
  name: string;
  description: string;
  isDark: boolean;
}

export const THEME_LIST: ThemeInfo[] = [
  { id: 'light', name: 'Light', description: '清爽浅色主题', isDark: false },
  { id: 'dark', name: 'Dark', description: 'Tokyo Night 深色主题', isDark: true },
  { id: 'sepia', name: 'Sepia', description: '护眼复古主题', isDark: false },
  { id: 'nord', name: 'Nord', description: 'Nord 极地风格', isDark: true },
  { id: 'system', name: 'System', description: '跟随系统设置', isDark: false },
];

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

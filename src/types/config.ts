export type ThemeMode = "light" | "dark" | "system";

export interface AppConfig {
  theme: ThemeMode;
  language: "system" | "zh-CN" | "en";
  editor: {
    fontSize: number;
    fontFamily: string;
    maxWidth: number;
    lineHeight: number;
    wordWrap: "soft" | "hard" | "off";
    showLineNumbers: boolean;
  };
  recentFiles: {
    maxCount: number;
  };
  restoreSession: boolean;
  sidebar: {
    position: "left" | "right";
    width: number;
  };
  recentFolders: {
    /** Whether clicking outside the recent-folders panel closes it */
    closeOnClickOutside: boolean;
  };
  keyBindings?: Record<string, string>;
  image: {
    insertAction: "copy-to-assets" | "relative-path" | "absolute-path";
    assetsFolderName: string;
  };
}

export type ErrorCode =
  | "FILE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "IO_ERROR"
  | "ENCODING_ERROR"
  | "INVALID_PATH"
  | "WRITE_FAILED"
  | "CONFIG_ERROR"
  | "EXPORT_FAILED";

export interface AppError {
  code: ErrorCode;
  message: string;
}

export interface Toast {
  id: string;
  type: "info" | "success" | "warning" | "error";
  message: string;
  duration?: number;
}

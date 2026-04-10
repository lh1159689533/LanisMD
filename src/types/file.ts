export interface FileMetadata {
  path: string;
  fileName: string;
  sizeBytes: number;
  modifiedTime: number | null;
  createdTime: number | null;
  isReadonly: boolean;
  encoding?: string;
}

export interface EditorTab {
  id: string;
  filePath: string | null;
  fileName: string;
  content: string;
  lastSavedContent: string;
  encoding: string;
  isDirty: boolean;
  cursorPosition: { line: number; column: number };
  scrollPosition: number;
  editorMode: 'wysiwyg' | 'source';
  isReadOnly: boolean;
  createdAt: number;
}

/** 自动保存指示器的保存状态 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface RecentFile {
  path: string;
  fileName: string;
  lastOpenedAt: number;
  exists?: boolean;
}

export interface ReadFileParams {
  path: string;
  encoding?: string;
}

export interface WriteFileParams {
  path: string;
  content: string;
  encoding?: string;
  createParents?: boolean;
}

export interface FileContent {
  content: string;
  encoding: string;
  metadata: FileMetadata;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileTreeNode[];
  /** 文件修改时间，Unix 时间戳（毫秒），目录为 undefined */
  modifiedTime?: number | null;
}

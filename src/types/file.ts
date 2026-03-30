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

/** Save status for the auto-save indicator */
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
  /** File modified time as Unix timestamp in milliseconds (undefined for directories) */
  modifiedTime?: number | null;
}

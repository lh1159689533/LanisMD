import { invoke } from '@tauri-apps/api/core';
import type {
  ReadFileParams,
  WriteFileParams,
  FileContent,
  FileMetadata,
  RecentFile,
  AppError,
  FileTreeNode,
} from '@/types';

class FileService {
  async readFile(params: ReadFileParams): Promise<FileContent> {
    return invoke<FileContent>('read_file', { params });
  }

  async writeFile(params: WriteFileParams): Promise<FileMetadata> {
    return invoke<FileMetadata>('write_file', { params });
  }

  async readFileMeta(path: string): Promise<FileMetadata> {
    return invoke<FileMetadata>('read_file_meta', { path });
  }

  async deleteFile(path: string, trash = true): Promise<void> {
    return invoke<void>('delete_file', { path, trash });
  }

  async listDirectory(path: string): Promise<FileTreeNode[]> {
    return invoke<FileTreeNode[]>('list_directory', { path });
  }

  async createEntry(params: {
    parentDir: string;
    baseName: string;
    isDir: boolean;
  }): Promise<{ path: string; name: string }> {
    return invoke<{ path: string; name: string }>('create_entry', { params });
  }

  async renameEntry(oldPath: string, newName: string): Promise<string> {
    return invoke<string>('rename_entry', { params: { oldPath, newName } });
  }

  async duplicateFile(path: string): Promise<string> {
    return invoke<string>('duplicate_file', { path });
  }

  async moveToTrash(path: string): Promise<void> {
    return invoke<void>('move_to_trash', { path });
  }

  async revealInFinder(path: string): Promise<void> {
    return invoke<void>('reveal_in_finder', { path });
  }

  /**
   * Copy a local image file into the `assets` folder next to the document.
   * Returns the relative path (e.g. `./assets/image.png`) for Markdown usage.
   */
  async copyImageToAssets(imagePath: string, docPath: string): Promise<string> {
    return invoke<string>('copy_image_to_assets', { imagePath, docPath });
  }

}

class ConfigService {
  async getConfig(): Promise<unknown> {
    return invoke<unknown>('get_config', { key: null });
  }

  async getConfigValue(key: string): Promise<unknown> {
    return invoke<unknown>('get_config', { key });
  }

  async setConfig(key: string, value: unknown): Promise<void> {
    return invoke<void>('set_config', { key, value });
  }

  async getRecentFiles(limit?: number): Promise<RecentFile[]> {
    return invoke<RecentFile[]>('get_recent_files', {
      limit: limit ?? null,
    });
  }

  async addRecentFile(path: string): Promise<void> {
    return invoke<void>('add_recent_file', { path });
  }
}

function handleError(error: unknown): AppError {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return error as AppError;
  }
  return {
    code: 'IO_ERROR',
    message: String(error),
  };
}

export const fileService = new FileService();
export const configService = new ConfigService();
export { handleError };

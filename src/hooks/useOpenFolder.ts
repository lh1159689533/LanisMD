/**
 * 打开文件夹的统一入口：本地文件夹（系统选择框）与远程仓库（克隆对话框）
 *
 * 从 FileTree 中抽取，供文件树头部、空状态、欢迎页、Sidebar 最近打开等处复用。
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                               |
 * | v1.0.0 | 初始实现：抽取打开文件夹逻辑并支持远程 | REQ: Git 改造 TECH: 打开远程仓库方案A |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback } from 'react';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { fileService } from '@/services/tauri';
import { useFileStore } from '@/stores/file-store';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useGitStore } from '@/stores/git-store';
import { useRecentFoldersStore } from '@/stores/recent-folders-store';

/** 切换文件夹前处理未保存的更改：有路径则静默保存，未命名文件弹出另存为 */
export async function saveBeforeSwitchFolder(): Promise<void> {
  const current = useFileStore.getState().currentFile;
  if (!current?.isDirty) return;

  if (current.filePath) {
    try {
      await fileService.writeFile({
        path: current.filePath,
        content: current.content,
        encoding: current.encoding,
      });
      useFileStore.getState().markSaved();
    } catch (err) {
      console.error('Failed to auto-save before switching folder:', err);
    }
    return;
  }

  const savePath = await tauriSave({
    defaultPath: `${current.fileName}.md`,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  });
  if (!savePath) return;
  try {
    await fileService.writeFile({
      path: savePath,
      content: current.content,
      encoding: current.encoding,
    });
  } catch (err) {
    console.error('Failed to save untitled file:', err);
  }
}

/** 打开指定路径的文件夹（保存当前文件 -> 打开 -> 记录最近打开） */
export async function openFolderPath(folderPath: string, closeCurrentFile = false): Promise<void> {
  await saveBeforeSwitchFolder();
  await useFileTreeStore.getState().openFolder(folderPath);
  useRecentFoldersStore.getState().addRecentFolder(folderPath);
  if (closeCurrentFile) {
    useFileStore.getState().closeFile();
  }
}

export function useOpenFolder() {
  /** 打开本地文件夹 */
  const openLocalFolder = useCallback(async () => {
    const selected = await tauriOpen({ multiple: false, directory: true, title: '打开本地文件夹' });
    if (!selected) return;
    const folderPath =
      typeof selected === 'string'
        ? selected
        : typeof selected === 'object' && 'path' in selected
          ? (selected as { path: string }).path
          : null;
    if (folderPath) await openFolderPath(folderPath);
  }, []);

  /** 打开远程仓库（Git）：弹出克隆对话框 */
  const openRemoteFolder = useCallback(() => {
    useGitStore.getState().setCloneDialogOpen(true);
  }, []);

  return { openLocalFolder, openRemoteFolder };
}

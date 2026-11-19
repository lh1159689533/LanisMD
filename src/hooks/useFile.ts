/**
 * 文件操作入口：对话框打开、新建与按路径打开
 *
 * @changelog
 * | 版本   | 变更说明                             | 关联                                |
 * | v1.0.0 | 初始实现：打开与新建                 | REQ: 文件编辑                       |
 * | v1.1.0 | 抽取按绝对路径打开文档的公共入口     | REQ: 系统集成-文件关联 TECH: 逻辑复用 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback } from 'react';
import { open as tauriOpen, save as tauriSave } from '@tauri-apps/plugin-dialog';
import { useFileStore } from '@/stores/file-store';
import { useUIStore } from '@/stores/ui-store';
import { fileService, configService } from '@/services/tauri';
import { saveBeforeSwitchFolder } from './useOpenFolder';

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/**
 * 按绝对路径打开文档（文件关联、MCP、系统事件共用）。
 * 切换前保存未保存内容，成功后写入最近打开记录，返回是否打开成功。
 */
export async function openDocumentByPath(path: string): Promise<boolean> {
  try {
    await saveBeforeSwitchFolder();
    const result = await fileService.readFile({ path });
    useFileStore
      .getState()
      .openFile(path, result.content, result.encoding ?? 'utf-8', baseName(path));
    await configService.addRecentFile(path);
    return true;
  } catch (err) {
    console.error('[openDocumentByPath] 打开文档失败:', err);
    useUIStore.getState().addToast({
      type: 'error',
      message: `无法打开 ${baseName(path)}`,
    });
    return false;
  }
}

export function useFile() {
  const { openFile, createUntitledFile, getCurrentFile } = useFileStore();

  /**
   * 从磁盘打开文件（单文件模式）
   * - 如果当前文件有路径且未保存 → 先自动保存，再切换
   * - 如果当前文件是未命名且未保存 → 切换前提示"另存为"
   */
  const openFileFromDisk = useCallback(async () => {
    const current = getCurrentFile();

    // 打开新文件前处理未保存的更改
    if (current?.isDirty) {
      if (current.filePath) {
        // 有路径 → 静默自动保存
        try {
          await fileService.writeFile({
            path: current.filePath,
            content: current.content,
            encoding: current.encoding,
          });
          useFileStore.getState().markSaved();
        } catch (err) {
          console.error('Failed to auto-save before opening:', err);
        }
      } else {
        // 未命名文件有更改 → 提示另存为
        const savePath = await tauriSave({
          defaultPath: `${current.fileName}.md`,
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        });

        if (savePath) {
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
        // 如果用户取消另存为，仍继续打开新文件
      }
    }

    // 现在打开文件对话框（仅单文件）
    const selected = await tauriOpen({
      multiple: false,
      filters: [
        {
          name: 'Markdown',
          extensions: ['md', 'markdown', 'mdx', 'txt'],
        },
        {
          name: '所有文件',
          extensions: ['*'],
        },
      ],
    });

    if (!selected) return;

    // 从选择中提取路径
    let filePath: string | null = null;
    if (typeof selected === 'string') {
      filePath = selected;
    } else if (selected && typeof selected === 'object' && 'path' in selected) {
      filePath = (selected as { path: string }).path;
    }

    if (!filePath) return;

    try {
      const result = await fileService.readFile({ path: filePath, encoding: 'utf-8' });
      const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'Unknown';
      openFile(filePath, result.content, result.encoding ?? 'utf-8', fileName);
      await configService.addRecentFile(filePath);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, [openFile, getCurrentFile]);

  const newFile = useCallback(async () => {
    const current = getCurrentFile();

    // 创建新文件前处理未保存的更改
    if (current?.isDirty) {
      if (current.filePath) {
        // 有路径 → 静默自动保存
        try {
          await fileService.writeFile({
            path: current.filePath,
            content: current.content,
            encoding: current.encoding,
          });
          useFileStore.getState().markSaved();
        } catch (err) {
          console.error('Failed to auto-save before new file:', err);
        }
      } else if (current.content !== '') {
        // 未命名文件有内容 → 提示另存为
        const savePath = await tauriSave({
          defaultPath: `${current.fileName}.md`,
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        });

        if (savePath) {
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
      }
    }

    createUntitledFile();
  }, [createUntitledFile, getCurrentFile]);

  return { openFileFromDisk, newFile };
}

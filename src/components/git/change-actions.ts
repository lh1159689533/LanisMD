/**
 * 更改视图 / diff 面板共用的文件操作
 *
 * @author hhhuilli
 */

import { fileService } from '@/services/tauri';
import { showConfirmDialog } from '@/services/tauri/dialog-service';
import { useFileStore } from '@/stores/file-store';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useGitStore } from '@/stores/git-store';
import { useUIStore } from '@/stores/ui-store';
import { splitPath } from '@/utils/git';
import type { ChangedFile } from '@/types/git';

/** 在编辑器中打开变更文件（会关闭 diff 面板） */
export async function openChangedFile(file: ChangedFile): Promise<void> {
  const abs = useGitStore.getState().absPath(file.path);
  try {
    await flushIfDirty();
    const result = await fileService.readFile({ path: abs, encoding: 'utf-8' });
    useFileTreeStore.getState().selectFile(abs);
    useFileStore
      .getState()
      .openFile(abs, result.content, result.encoding ?? 'utf-8', splitPath(file.path).name);
  } catch (error) {
    useUIStore.getState().addToast({ type: 'error', message: `打开文件失败：${String(error)}` });
  }
}

/** 切换文件前静默保存当前文件（与自动保存行为一致） */
async function flushIfDirty(): Promise<void> {
  const current = useFileStore.getState().currentFile;
  if (!current?.isDirty || !current.filePath) return;
  await fileService.writeFile({
    path: current.filePath,
    content: current.content,
    encoding: current.encoding,
  });
  useFileStore.getState().markSaved();
}

/** 在文件树中定位 */
export function revealChangedFile(file: ChangedFile): void {
  const abs = useGitStore.getState().absPath(file.path);
  useUIStore.getState().setSidebarPanel('files');
  useFileTreeStore.getState().revealFile(abs);
}

/** 二次确认后放弃更改；新文件会移入回收站 */
export async function confirmDiscard(files: ChangedFile[]): Promise<void> {
  if (files.length === 0) return;
  const hasNew = files.some((f) => f.status === 'untracked' || f.status === 'added');
  const target =
    files.length === 1 ? `「${splitPath(files[0].path).name}」` : `${files.length} 个文件`;
  const ok = await showConfirmDialog(
    '放弃更改',
    `确定放弃${target}的更改吗？此操作无法撤销。${hasNew ? '\n新增的文件将被移入回收站。' : ''}`,
  );
  if (ok) await useGitStore.getState().discard(files);
}

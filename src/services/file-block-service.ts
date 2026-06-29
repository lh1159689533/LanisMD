/**
 * 附件插件前端服务层
 *
 * 封装与 Rust 侧 file_block_commands 的 Tauri IPC 调用。
 */

import { invoke } from '@tauri-apps/api/core';

/** 复制文件到附件目录，返回目标文件完整路径 */
export async function copyFileToAttachments(
  filePath: string,
  storageDir: string,
): Promise<string> {
  return invoke('copy_file_to_attachments', { filePath, storageDir });
}

/** 获取格式化的文件大小（如 "2.4 MB"） */
export async function getFileSize(path: string): Promise<string> {
  return invoke('get_file_size_formatted', { path });
}

/** 永久删除文件（不进回收站） */
export async function deleteFilePermanent(path: string): Promise<void> {
  return invoke('delete_file_permanent', { path });
}

/** 用系统默认程序打开文件 */
export async function openFileWithSystem(path: string): Promise<void> {
  return invoke('open_file_with_system', { path });
}

/** 检查文件是否存在 */
export async function checkFileExists(path: string): Promise<boolean> {
  return invoke('check_file_exists', { path });
}

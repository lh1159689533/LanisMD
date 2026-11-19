/**
 * MCP 联动：把 App 状态同步给 `lanismd mcp`，并响应外部 AI 的文档变更与打开请求
 *
 * 状态同步：当前文件夹、编辑中文档的未保存标记、最近文件夹，任一变化即推送；
 * MCP 据此决定工作区、在用户有未保存修改时拒绝写入。
 * 事件响应：文件夹内的变化已由 useFileWatcher 负责刷新树与重载，这里只补充
 * 文件夹外文档的重载、移动/删除后的路径修正，以及打开文档。
 *
 * @changelog
 * | 版本   | 变更说明                         | 关联                                |
 * | v1.0.0 | 初始实现：状态同步与 MCP 事件响应 | REQ: MCP 界面联动 TECH: 本地 TCP 桥接 |
 * | v1.1.0 | 打开文档复用公共入口，消除重复逻辑 | REQ: 系统集成-文件关联 TECH: 逻辑复用 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect } from 'react';
import { fileService } from '@/services/tauri';
import {
  mcpService,
  type McpDocumentsChanged,
  type McpSyncState,
} from '@/services/tauri/mcp-service';
import { useFileStore } from '@/stores/file-store';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useRecentFoldersStore } from '@/stores/recent-folders-store';
import { useUIStore } from '@/stores/ui-store';
import { openDocumentByPath } from './useFile';

const KIND_LABELS: Record<McpDocumentsChanged['kind'], string> = {
  created: '创建了',
  modified: '修改了',
  moved: '移动了',
  trashed: '删除了',
};

function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isSamePath(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && normalize(a) === normalize(b);
}

/** 路径是否位于当前打开的文件夹内（这部分变化由文件监听负责） */
function isInsideRoot(path: string): boolean {
  const root = useFileTreeStore.getState().rootPath;
  if (!root) return false;
  return normalize(path).startsWith(`${normalize(root)}/`);
}

function buildSnapshot(): McpSyncState {
  const file = useFileStore.getState().currentFile;
  return {
    currentFolder: useFileTreeStore.getState().rootPath,
    openDocument: file?.filePath ? { path: file.filePath, dirty: file.isDirty } : null,
    recentFolders: useRecentFoldersStore.getState().recentFolders,
  };
}

async function reloadCurrentFile(path: string): Promise<void> {
  try {
    const result = await fileService.readFile({ path });
    const current = useFileStore.getState().currentFile;
    if (isSamePath(current?.filePath, path) && !current?.isDirty) {
      useFileStore.getState().reloadContent(result.content);
    }
  } catch (err) {
    console.error('[useMcpBridge] 重新加载文档失败:', err);
  }
}

async function handleDocumentsChanged(change: McpDocumentsChanged): Promise<void> {
  const fileStore = useFileStore.getState();
  const current = fileStore.currentFile;

  if (change.kind === 'moved' && isSamePath(current?.filePath, change.from)) {
    fileStore.updateFilePath(change.path, baseName(change.path));
  } else if (change.kind === 'trashed' && isSamePath(current?.filePath, change.path)) {
    if (!current?.isDirty) fileStore.closeFile();
  } else if (
    change.kind === 'modified' &&
    isSamePath(current?.filePath, change.path) &&
    !current?.isDirty &&
    !isInsideRoot(change.path)
  ) {
    await reloadCurrentFile(change.path);
  }

  useUIStore.getState().addToast({
    type: 'info',
    message: `外部 AI ${KIND_LABELS[change.kind] ?? '更新了'} ${baseName(change.path)}`,
    duration: 2500,
  });
}

async function handleOpenDocument(path: string): Promise<void> {
  // 读取、未保存保护、最近记录与失败提示统一由公共入口处理
  const opened = await openDocumentByPath(path);
  if (opened && isInsideRoot(path)) useFileTreeStore.getState().revealFile(path);
}

export function useMcpBridge() {
  // 状态同步：只在快照内容变化时推送（编辑内容变化不会触发）
  useEffect(() => {
    let lastKey = '';
    const push = () => {
      const snapshot = buildSnapshot();
      const key = JSON.stringify(snapshot);
      if (key === lastKey) return;
      lastKey = key;
      mcpService.syncState(snapshot).catch((err) => {
        console.error('[useMcpBridge] 同步状态失败:', err);
      });
    };
    push();
    const unsubscribers = [
      useFileStore.subscribe(push),
      useFileTreeStore.subscribe(push),
      useRecentFoldersStore.subscribe(push),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  // 事件响应
  useEffect(() => {
    const pending = [
      mcpService.onDocumentsChanged((change) => void handleDocumentsChanged(change)),
      mcpService.onOpenDocument((path) => void handleOpenDocument(path)),
    ];
    return () => {
      pending.forEach((p) => p.then((unlisten) => unlisten()).catch(() => undefined));
    };
  }, []);
}

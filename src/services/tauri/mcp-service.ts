/**
 * MCP 联动服务层：对 src-tauri/src/commands/mcp_commands.rs 与桥接事件的薄封装
 *
 * @changelog
 * | 版本   | 变更说明                         | 关联                                |
 * | v1.0.0 | 初始实现：状态同步与 MCP 事件监听 | REQ: MCP 界面联动 TECH: 本地 TCP 桥接 |
 * | v1.1.0 | 新增 getServerInfo                | REQ: 设置页复制 MCP 配置               |
 * /@changelog
 *
 * @author hhhuilli
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** 最近打开的文件夹（与 recent-folders-store 字段一致） */
export interface McpRecentFolder {
  path: string;
  name: string;
  timestamp: number;
}

/** 推送给 Rust 的 App 状态快照 */
export interface McpSyncState {
  currentFolder: string | null;
  openDocument: { path: string; dirty: boolean } | null;
  recentFolders: McpRecentFolder[];
}

/** 外部 AI 通过 MCP 修改文档后的通知 */
export interface McpDocumentsChanged {
  kind: 'created' | 'modified' | 'moved' | 'trashed';
  /** 变更后的路径（moved 时为新路径） */
  path: string;
  /** moved 时的原路径 */
  from?: string;
}

/** MCP 客户端配置所需的启动信息 */
export interface McpServerInfo {
  /** 当前 App 可执行文件的绝对路径 */
  executable: string;
  /** 是否为开发构建 */
  devBuild: boolean;
  /** 路径不稳定时的提示 */
  warning: string | null;
}

class McpService {
  /** 获取 MCP Server 启动信息（可执行文件路径等） */
  async getServerInfo(): Promise<McpServerInfo> {
    return invoke<McpServerInfo>('mcp_server_info');
  }

  /** 同步当前文件夹、编辑中文档与最近文件夹，供 `lanismd mcp` 读取 */
  async syncState(state: McpSyncState): Promise<void> {
    return invoke<void>('mcp_sync_state', { params: state });
  }

  onDocumentsChanged(handler: (change: McpDocumentsChanged) => void): Promise<UnlistenFn> {
    return listen<McpDocumentsChanged>('mcp:documents-changed', (e) => handler(e.payload));
  }

  onOpenDocument(handler: (path: string) => void): Promise<UnlistenFn> {
    return listen<{ path: string }>('mcp:open-document', (e) => handler(e.payload.path));
  }
}

export const mcpService = new McpService();

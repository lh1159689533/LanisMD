/**
 * 系统集成前端接线：外部文件打开、原生菜单动作与启动自动检查更新
 *
 * 文件打开有两条通道（冷启动命令队列、运行中事件广播），同一路径可能在两条通道
 * 各出现一次，因此在短时间窗口内去重；超时后允许再次通过「打开方式」打开同一文件。
 *
 * @changelog
 * | 版本   | 变更说明                                 | 关联                                  |
 * | v1.0.0 | 初始实现：文件关联、菜单动作、自动更新检查 | REQ: 系统集成 TECH: Tauri 命令/事件通道 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useRef } from 'react';
import {
  MENU_ACTION,
  onMenuAction,
  onOpenFiles,
  takePendingOpenFiles,
} from '@/services/tauri/system-service';
import { useSystemStore } from '@/stores/system-store';
import { openDocumentByPath } from './useFile';

/** 由主窗口注入的界面动作，与键盘快捷键共用同一批实现 */
export interface SystemActions {
  onNewFile: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onSaveFile: () => void;
  onQuickOpen: () => void;
  onOpenSettings: () => void;
  onToggleSearch: () => void;
  onToggleGlobalSearch: () => void;
  onToggleSidebar: () => void;
  onToggleOutline: () => void;
  onToggleTypewriterMode: () => void;
  onToggleImmersive: () => void;
}

/** 同一路径在 3 秒内的重复投递视为一次，避免冷启动队列与事件广播重复打开 */
const DEDUPE_WINDOW_MS = 3000;

export function useSystemIntegration(actions: SystemActions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // 文件关联：冷启动取队列 + 运行中监听系统事件
  useEffect(() => {
    const recent = new Map<string, number>();
    const handlePaths = async (paths: string[]) => {
      for (const path of paths) {
        const now = Date.now();
        const last = recent.get(path);
        if (!path || (last !== undefined && now - last < DEDUPE_WINDOW_MS)) continue;
        recent.set(path, now);
        // 串行打开，避免多个文件并发写入同一编辑器状态
        await openDocumentByPath(path);
      }
    };

    void takePendingOpenFiles()
      .then(handlePaths)
      .catch((err) => {
        console.error('[useSystemIntegration] 读取待打开文件失败:', err);
      });

    const pending = onOpenFiles((paths) => void handlePaths(paths));
    return () => {
      pending.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, []);

  // 原生菜单动作分发
  useEffect(() => {
    const pending = onMenuAction((action) => {
      const handlers = actionsRef.current;
      switch (action) {
        case MENU_ACTION.NEW_FILE:
          handlers.onNewFile();
          break;
        case MENU_ACTION.OPEN_FILE:
          handlers.onOpenFile();
          break;
        case MENU_ACTION.OPEN_FOLDER:
          handlers.onOpenFolder();
          break;
        case MENU_ACTION.SAVE_FILE:
          handlers.onSaveFile();
          break;
        case MENU_ACTION.QUICK_OPEN:
          handlers.onQuickOpen();
          break;
        case MENU_ACTION.FIND:
          handlers.onToggleSearch();
          break;
        case MENU_ACTION.GLOBAL_SEARCH:
          handlers.onToggleGlobalSearch();
          break;
        case MENU_ACTION.TOGGLE_SIDEBAR:
          handlers.onToggleSidebar();
          break;
        case MENU_ACTION.TOGGLE_OUTLINE:
          handlers.onToggleOutline();
          break;
        case MENU_ACTION.TOGGLE_TYPEWRITER:
          handlers.onToggleTypewriterMode();
          break;
        case MENU_ACTION.TOGGLE_IMMERSIVE:
          handlers.onToggleImmersive();
          break;
        case MENU_ACTION.PREFERENCES:
          handlers.onOpenSettings();
          break;
        case MENU_ACTION.CHECK_UPDATE:
          void useSystemStore.getState().checkForUpdate(false);
          break;
        default:
          break;
      }
    });
    return () => {
      pending.then((unlisten) => unlisten()).catch(() => undefined);
    };
  }, []);

  // 启动后延迟静默检查更新；开发构建跳过，避免干扰本地调试（菜单仍可手动检查）
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const timer = window.setTimeout(() => {
      void useSystemStore.getState().checkForUpdate(true);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);
}

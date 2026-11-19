/**
 * 系统集成服务层：文件关联打开与原生菜单动作
 *
 * 对应 Rust 侧 `services/file_open_service.rs`、`services/app_menu.rs` 与
 * `commands/system_commands.rs`，事件名与动作 ID 必须两端严格一致。
 *
 * @changelog
 * | 版本   | 变更说明                                 | 关联                                  |
 * | v1.0.0 | 初始实现：冷启动队列、文件事件与菜单事件 | REQ: 系统集成 TECH: Tauri 命令/事件通道 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** Rust 侧广播的事件名 */
export const SYSTEM_EVENTS = {
  OPEN_FILES: 'system:open-files',
  MENU_ACTION: 'system:menu-action',
} as const;

/** 原生菜单自定义动作 ID（与 Rust app_menu::action 保持一致） */
export const MENU_ACTION = {
  NEW_FILE: 'new-file',
  OPEN_FILE: 'open-file',
  OPEN_FOLDER: 'open-folder',
  SAVE_FILE: 'save-file',
  QUICK_OPEN: 'quick-open',
  FIND: 'find',
  GLOBAL_SEARCH: 'global-search',
  TOGGLE_SIDEBAR: 'toggle-sidebar',
  TOGGLE_OUTLINE: 'toggle-outline',
  TOGGLE_TYPEWRITER: 'toggle-typewriter',
  TOGGLE_IMMERSIVE: 'toggle-immersive',
  PREFERENCES: 'preferences',
  CHECK_UPDATE: 'check-update',
  ABOUT: 'about',
} as const;

export type MenuAction = (typeof MENU_ACTION)[keyof typeof MENU_ACTION];

const KNOWN_ACTIONS: string[] = Object.values(MENU_ACTION);

/** 取出并清空冷启动阶段由系统投递的文件路径 */
export function takePendingOpenFiles(): Promise<string[]> {
  return invoke<string[]>('take_pending_open_files');
}

/** 读取应用版本号 */
export function getAppVersion(): Promise<string> {
  return invoke<string>('get_app_version');
}

/** 监听运行中系统投递的「打开文件」请求 */
export function onOpenFiles(handler: (paths: string[]) => void): Promise<UnlistenFn> {
  return listen<string[]>(SYSTEM_EVENTS.OPEN_FILES, (event) => {
    if (Array.isArray(event.payload)) handler(event.payload);
  });
}

/** 监听原生菜单点击，过滤掉未知动作 ID */
export function onMenuAction(handler: (action: MenuAction) => void): Promise<UnlistenFn> {
  return listen<string>(SYSTEM_EVENTS.MENU_ACTION, (event) => {
    if (KNOWN_ACTIONS.includes(event.payload)) {
      handler(event.payload as MenuAction);
    }
  });
}

/**
 * 系统集成 UI 状态：自动更新流程与「关于」弹窗
 *
 * 检查 / 安装 / 重启的具体实现在 update-service，本 store 只负责状态流转、
 * 弹窗开关与轻量的 Toast 反馈，供菜单事件和对话框共同驱动。
 *
 * @changelog
 * | 版本   | 变更说明                                 | 关联                                |
 * | v1.0.0 | 初始实现：更新状态机、关于弹窗与反馈     | REQ: 系统集成-自动更新 TECH: Zustand |
 * /@changelog
 *
 * @author hhhuilli
 */

import { create } from 'zustand';
import type { UpdateInfo, UpdateStatus } from '@/types';
import { checkForUpdate, downloadAndInstall, relaunchApp } from '@/services/tauri/update-service';
import { useUIStore } from './ui-store';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface SystemState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  /** 下载进度 0~1 */
  progress: number;
  error: string | null;
  updateDialogOpen: boolean;
  aboutDialogOpen: boolean;

  /** silent 为 true 时失败不弹提示，仅记录日志（启动自动检查） */
  checkForUpdate: (silent?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  relaunch: () => Promise<void>;
  dismissUpdate: () => void;
  openAbout: () => void;
  closeAbout: () => void;
}

export const useSystemStore = create<SystemState>()((set, get) => ({
  status: 'idle',
  info: null,
  progress: 0,
  error: null,
  updateDialogOpen: false,
  aboutDialogOpen: false,

  checkForUpdate: async (silent = false) => {
    set({ status: 'checking', error: null });
    try {
      const info = await checkForUpdate();
      if (info) {
        set({ status: 'available', info, progress: 0, updateDialogOpen: true });
        return;
      }
      set({ status: 'idle', info: null });
      if (!silent) {
        useUIStore.getState().addToast({
          type: 'success',
          message: '当前已是最新版本',
          duration: 2500,
        });
      }
    } catch (err) {
      const message = errorMessage(err);
      set({ status: 'error', error: message });
      if (silent) {
        console.warn('[auto-update] 自动检查更新失败:', err);
      } else {
        // 用 info 而非 error，避免检查失败在网络未就绪时常驻一条无法自动消失的提示
        useUIStore.getState().addToast({
          type: 'info',
          message: `检查更新失败：${message}`,
          duration: 4000,
        });
      }
    }
  },

  installUpdate: async () => {
    if (get().status !== 'available') return;
    set({ status: 'downloading', progress: 0, error: null });
    try {
      await downloadAndInstall((ratio) => set({ progress: ratio }));
      set({ status: 'ready', progress: 1 });
    } catch (err) {
      const message = errorMessage(err);
      set({ status: 'error', error: message });
      useUIStore.getState().addToast({
        type: 'error',
        message: `更新安装失败：${message}`,
      });
    }
  },

  relaunch: async () => {
    await relaunchApp();
  },

  dismissUpdate: () => set({ updateDialogOpen: false }),
  openAbout: () => set({ aboutDialogOpen: true }),
  closeAbout: () => set({ aboutDialogOpen: false }),
}));

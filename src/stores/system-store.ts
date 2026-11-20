/**
 * 系统集成 UI 状态：自动更新流程与右下角更新通知
 *
 * 检查 / 安装 / 重启的具体实现在 update-service，本 store 只负责状态流转与
 * 通知面板的显隐，供菜单事件和通知面板共同驱动。
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                                  |
 * | v1.0.0 | 初始实现：更新状态机、关于弹窗与反馈           | REQ: 系统集成-自动更新 TECH: Zustand   |
 * | v1.1.0 | 更新改为右下角通知面板，移除关于弹窗状态       | REQ: 系统集成-更新通知 TECH: Zustand   |
 * /@changelog
 *
 * @author hhhuilli
 */

import { create } from 'zustand';
import type { UpdateInfo, UpdateStatus } from '@/types';
import { checkForUpdate, downloadAndInstall, relaunchApp } from '@/services/tauri/update-service';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface SystemState {
  status: UpdateStatus;
  info: UpdateInfo | null;
  /** 下载进度 0~1 */
  progress: number;
  error: string | null;
  /** 右下角更新通知面板是否可见 */
  noticeOpen: boolean;

  /** silent 为 true 时只在发现新版本时弹出通知，检查中 / 最新 / 失败均不打扰（启动自动检查） */
  checkForUpdate: (silent?: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;
  relaunch: () => Promise<void>;
  /** 收起通知面板；下载中收起不会中断下载，完成后会再次弹出 */
  dismissUpdate: () => void;
}

export const useSystemStore = create<SystemState>()((set, get) => ({
  status: 'idle',
  info: null,
  progress: 0,
  error: null,
  noticeOpen: false,

  checkForUpdate: async (silent = false) => {
    const { status } = get();
    // 下载 / 已安装待重启阶段再次检查会释放更新句柄，直接把面板重新展示出来即可
    if (status === 'downloading' || status === 'ready') {
      if (!silent) set({ noticeOpen: true });
      return;
    }
    if (status === 'checking') {
      if (!silent) set({ noticeOpen: true });
      return;
    }

    set({ status: 'checking', error: null, ...(silent ? {} : { noticeOpen: true }) });
    try {
      const info = await checkForUpdate();
      if (info) {
        set({ status: 'available', info, progress: 0, noticeOpen: true });
        return;
      }
      set({ status: silent ? 'idle' : 'up-to-date', info: null });
    } catch (err) {
      const message = errorMessage(err);
      if (silent) {
        set({ status: 'idle', error: null });
        console.warn('[auto-update] 自动检查更新失败:', err);
        return;
      }
      set({ status: 'error', error: message });
    }
  },

  installUpdate: async () => {
    if (get().status !== 'available') return;
    set({ status: 'downloading', progress: 0, error: null });
    try {
      await downloadAndInstall((ratio) => set({ progress: ratio }));
      // 下载期间用户可能收起了面板，安装完成后重新弹出提示重启
      set({ status: 'ready', progress: 1, noticeOpen: true });
    } catch (err) {
      set({ status: 'error', error: `更新安装失败：${errorMessage(err)}`, noticeOpen: true });
    }
  },

  relaunch: async () => {
    try {
      await relaunchApp();
    } catch (err) {
      set({ status: 'error', error: `重启失败：${errorMessage(err)}`, noticeOpen: true });
    }
  },

  dismissUpdate: () => {
    const { status } = get();
    // 一次性结果（最新 / 失败）收起后回到空闲，避免下次展示残留旧结果
    const settled = status === 'up-to-date' || status === 'error';
    set({ noticeOpen: false, ...(settled ? { status: 'idle', error: null } : {}) });
  },
}));

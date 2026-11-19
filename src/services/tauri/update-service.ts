/**
 * 自动更新服务层：封装 @tauri-apps/plugin-updater 与 plugin-process
 *
 * 插件只在 Tauri 桌面环境下按需动态加载，浏览器模式不会触发任何原生调用。
 *
 * @changelog
 * | 版本   | 变更说明                                 | 关联                                |
 * | v1.0.0 | 初始实现：检查、下载安装进度与应用重启   | REQ: 系统集成-自动更新 TECH: 插件封装 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { Update } from '@tauri-apps/plugin-updater';
import type { UpdateInfo } from '@/types';
import { isTauri } from '@/utils/platform';

/** 最近一次检查得到的更新句柄，安装阶段复用（持有 Rust 侧资源） */
let pendingUpdate: Update | null = null;

/** 检查更新服务器；没有新版本时返回 null */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null;
  const { check } = await import('@tauri-apps/plugin-updater');

  // 重新检查前释放上一轮句柄，避免 Rust 侧资源累积
  if (pendingUpdate) {
    await pendingUpdate.close().catch(() => undefined);
    pendingUpdate = null;
  }

  const update = await check();
  if (!update) return null;

  pendingUpdate = update;
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    body: update.body,
    date: update.date,
  };
}

/** 下载并安装更新；ratio 为 0~1 的下载进度（服务端未给出总长度时保持 0） */
export async function downloadAndInstall(onProgress: (ratio: number) => void): Promise<void> {
  if (!pendingUpdate) {
    throw new Error('没有待安装的更新，请重新检查更新');
  }

  let downloaded = 0;
  let total = 0;
  await pendingUpdate.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? 0;
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        if (total > 0) onProgress(Math.min(downloaded / total, 1));
        break;
      case 'Finished':
        onProgress(1);
        break;
      default:
        break;
    }
  });
  pendingUpdate = null;
}

/** 重启应用以启用新版本（macOS / Linux 安装后需要） */
export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

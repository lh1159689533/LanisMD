/**
 * Board Block - 全屏窗口控制器（主窗口侧）
 *
 * 负责为单个画板块打开一个独立的全屏 Tauri 窗口，并在两个窗口之间架设事件桥：
 * - 子窗口 `ready` -> 定向下发 `init`（画板数据不走 URL，避免长度限制）
 * - 子窗口 `change` -> 回调宿主写回 ProseMirror attrs
 * - 子窗口 `state` / `closed` -> 回调宿主同步状态与解除锁定
 *
 * 一个画板块同时至多存在一个全屏窗口；重复触发时聚焦既有窗口。
 *
 * @changelog
 * | 版本   | 变更说明                             | 关联                                                   |
 * | v1.0.0 | 初始实现：全屏窗口创建与跨窗口事件桥接   | REQ: 20261026-board-fullscreen TECH: 画板全屏窗口方案 §三 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event';

import type { BoardBlockState } from '../types';
import {
  BOARD_FS_EVENT,
  buildFullscreenUrl,
  createFullscreenLabel,
  type BoardFsChangePayload,
  type BoardFsClosedPayload,
  type BoardFsInitPayload,
  type BoardFsReadyPayload,
  type BoardFsStatePayload,
} from './protocol';

/** 宿主（NodeView）需要提供的能力 */
export interface BoardFullscreenHost {
  /** 取当前画板数据（base64(JSON)），在子窗口握手时下发 */
  getData: () => string;
  /** 全屏窗口的初始状态，继承自主窗口 */
  initialState: BoardBlockState;
  /** 窗口标题 */
  title?: string;
  /** 当前主题标识，供子窗口同步外观 */
  theme: string;
  /** 子窗口回传的画板数据（已防抖） */
  onData: (data: string) => void;
  /** 子窗口的编辑/预览态变更 */
  onState: (state: BoardBlockState) => void;
  /** 子窗口关闭，附带最终数据与状态 */
  onClosed: (payload: { data: string; state: BoardBlockState }) => void;
}

/** 已打开的全屏窗口会话句柄 */
export interface BoardFullscreenSession {
  /** 窗口 label */
  readonly label: string;
  /**
   * 聚焦全屏窗口。
   *
   * @returns 窗口是否仍然存在；返回 false 时宿主应自行解除锁定
   */
  focus: () => Promise<boolean>;
  /** 主动关闭全屏窗口（宿主销毁时调用，避免留下孤立窗口） */
  close: () => Promise<void>;
  /** 仅解除事件监听，不关闭窗口 */
  dispose: () => void;
}

/**
 * 打开画板全屏窗口。
 *
 * @returns 会话句柄；创建失败时返回 null（调用方不应进入锁定态）
 */
export async function openBoardFullscreen(
  host: BoardFullscreenHost,
): Promise<BoardFullscreenSession | null> {
  const label = createFullscreenLabel();
  const unlistens: UnlistenFn[] = [];
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    unlistens.forEach((fn) => fn());
    unlistens.length = 0;
  };

  try {
    // 先注册监听再建窗，避免子窗口的 ready 先于监听到达
    unlistens.push(
      await listen<BoardFsReadyPayload>(BOARD_FS_EVENT.ready, (event) => {
        if (event.payload.label !== label) return;
        void emitTo(label, BOARD_FS_EVENT.init, {
          label,
          data: host.getData(),
        } satisfies BoardFsInitPayload).catch((err) => {
          console.error('[board-fullscreen] 下发初始数据失败:', err);
        });
      }),
    );

    unlistens.push(
      await listen<BoardFsChangePayload>(BOARD_FS_EVENT.change, (event) => {
        if (event.payload.label !== label) return;
        host.onData(event.payload.data);
      }),
    );

    unlistens.push(
      await listen<BoardFsStatePayload>(BOARD_FS_EVENT.state, (event) => {
        if (event.payload.label !== label) return;
        host.onState(event.payload.state);
      }),
    );

    unlistens.push(
      await listen<BoardFsClosedPayload>(BOARD_FS_EVENT.closed, (event) => {
        if (event.payload.label !== label) return;
        const { data, state } = event.payload;
        dispose();
        host.onClosed({ data, state });
      }),
    );

    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const win = new WebviewWindow(label, {
      url: buildFullscreenUrl({ label, state: host.initialState, theme: host.theme }),
      title: host.title ?? '画板',
      // 创建即真全屏；去掉系统装饰，退出完全交由应用内「还原」按钮与 Esc
      fullscreen: true,
      decorations: false,
    });

    win.once('tauri://error', (e) => {
      console.error('[board-fullscreen] 窗口创建失败:', e);
      dispose();
      // 创建失败等价于「窗口已关闭」，让宿主回到未锁定状态
      host.onClosed({ data: host.getData(), state: host.initialState });
    });

    // 兜底：部分平台上无装饰窗口的 fullscreen 创建选项可能不生效，
    // 窗口就绪后再显式设置一次。
    win.once('tauri://created', () => {
      void win.setFullscreen(true).catch((err) => {
        console.error('[board-fullscreen] 设置全屏失败:', err);
      });
    });

    return {
      label,
      focus: async () => {
        const existing = await WebviewWindow.getByLabel(label);
        if (!existing) return false;
        await existing.setFocus();
        return true;
      },
      close: async () => {
        dispose();
        try {
          const existing = await WebviewWindow.getByLabel(label);
          await existing?.close();
        } catch (err) {
          console.error('[board-fullscreen] 关闭窗口失败:', err);
        }
      },
      dispose,
    };
  } catch (err) {
    console.error('[board-fullscreen] 打开全屏窗口失败:', err);
    dispose();
    return null;
  }
}

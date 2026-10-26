/**
 * Board Block - 全屏窗口挂载（子窗口侧）
 *
 * 在独立的全屏 Tauri 窗口中挂载一份 Plait 画板，复用主窗口 NodeView 的同一套
 * 组件（BoardReact / toolbar / style-toolbar），保证两侧交互一致。
 *
 * 与主窗口 NodeView 的差异：
 * - 没有 ProseMirror 上下文，数据来源与回写全部走 Tauri 事件。
 * - 工具栏仅「还原 + 编辑/完成」，不提供删除与高度拖拽（高度由窗口决定）。
 * - Esc 为层级式：编辑态先退出编辑，预览态再按则关闭窗口。
 *
 * 数据流：
 *   挂载 -> emit(ready) -> 主窗口 emitTo(init) -> 渲染画板
 *   编辑 -> 防抖 500ms -> emit(change) -> 主窗口写回 attrs
 *   关窗 -> flush 一次 change -> emit(closed) -> 主窗口解除锁定并恢复状态
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                                                   |
 * | v1.0.0 | 初始实现：全屏子窗口画板挂载与事件桥接 | REQ: 20261026-board-fullscreen TECH: 画板全屏窗口方案 §四 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { PlaitBoard, PlaitElement, Viewport } from '@plait/core';

import { BoardReact } from '../board-react';
import {
  createToolbar,
  updateToolbarState,
  type ToolbarCallbacks,
} from '../toolbar';
import { createStyleToolbar } from '../style-toolbar';
import type { StyleToolbarController } from '../style-toolbar/types';
import { decode, encode } from '../codec';
import { CSS_PREFIX, WRITE_BACK_DEBOUNCE_MS } from '../constants';
import type { BoardBlockState } from '../types';
import {
  BOARD_FS_EVENT,
  parseFullscreenUrl,
  type BoardFsChangePayload,
  type BoardFsClosedPayload,
  type BoardFsInitPayload,
  type BoardFsReadyPayload,
  type BoardFsStatePayload,
} from './protocol';

/** 全屏窗口根容器的 CSS 类名 */
export const FULLSCREEN_CSS_CLASS = `${CSS_PREFIX}--fullscreen`;

/**
 * 在给定容器中挂载全屏画板。
 *
 * @param container 宿主容器（由 React 组件提供的 div）
 * @returns 清理函数，卸载 React root 并解除所有监听
 */
export function mountBoardFullscreen(container: HTMLElement): () => void {
  const session = new FullscreenBoardSession(container);
  void session.start();
  return () => session.dispose();
}

/**
 * 全屏画板会话。
 *
 * 以类封装可变状态（board 实例、防抖计时器、监听器句柄），避免闭包散落。
 */
class FullscreenBoardSession {
  /** 窗口 label，作为事件路由标识 */
  private readonly label: string;

  /** 当前显示状态，初始继承自主窗口（URL 参数） */
  private state: BoardBlockState;

  private readonly root: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly host: HTMLElement;
  private readonly placeholder: HTMLElement;
  private readonly styleToolbar: StyleToolbarController;

  private reactRoot: Root | null = null;
  private board: PlaitBoard | null = null;

  private elements: PlaitElement[] = [];
  private viewport?: Viewport;

  /** 是否已收到主窗口下发的初始数据 */
  private initialized = false;

  private changeTimer: ReturnType<typeof setTimeout> | null = null;
  private unlistens: UnlistenFn[] = [];
  private disposed = false;

  constructor(container: HTMLElement) {
    const { label, state } = parseFullscreenUrl();
    this.label = label;
    this.state = state;

    // 根容器必须带 CSS_PREFIX：Plait 的基础样式已移植进
    // styles/editor/board-block.css 且作用域限定在 .lanismd-board-block 下，
    // 缺失该类名会导致画板样式整体失效。
    this.root = container;
    this.root.classList.add(CSS_PREFIX, FULLSCREEN_CSS_CLASS);
    this.root.classList.add(state === 'editing' ? 'is-editing' : 'is-preview');

    const callbacks: ToolbarCallbacks = {
      onToggleEdit: () => this.toggleEdit(),
      onFullscreen: () => void this.closeWindow(),
    };
    this.toolbar = createToolbar(callbacks, { fullscreenMode: 'restore' });
    // 全屏窗口的工具栏常驻可见（无 hover 收起逻辑）
    this.toolbar.classList.add('is-visible');
    updateToolbarState(this.toolbar, state);
    this.root.appendChild(this.toolbar);

    this.host = document.createElement('div');
    this.host.className = `${CSS_PREFIX}__host`;
    this.root.appendChild(this.host);

    // 等待主窗口下发数据期间的占位提示
    this.placeholder = document.createElement('div');
    this.placeholder.className = `${CSS_PREFIX}__fullscreen-placeholder`;
    this.placeholder.textContent = '正在加载画板…';
    this.root.appendChild(this.placeholder);

    this.styleToolbar = createStyleToolbar();
    this.root.appendChild(this.styleToolbar.dom);
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  /** 注册监听、绑定事件并向主窗口发起握手 */
  async start(): Promise<void> {
    if (!this.label) {
      this.placeholder.textContent = '缺少窗口标识，无法加载画板';
      return;
    }

    this.bindKeyboard();

    const unlistenInit = await listen<BoardFsInitPayload>(BOARD_FS_EVENT.init, (event) => {
      if (event.payload.label !== this.label) return;
      this.applyInitialData(event.payload.data);
    });
    if (!this.registerUnlisten(unlistenInit)) return;

    // 关闭前兜底：冲刷未提交的变更并通知主窗口解除锁定。
    //
    // 不要 preventDefault：Tauri 的 onCloseRequested 内部会 `await handler(evt)`，
    // 待本回调的 Promise 完成后，若未 preventDefault 才调用 destroy()。
    // 因此 await emit 即可保证 closed 事件先于窗口销毁送达，无需手动 close()
    // （手动 close 会再次触发 CloseRequested，形成递归）。
    const unlistenClose = await getCurrentWindow().onCloseRequested(async () => {
      try {
        this.flushChange();
        await emit(BOARD_FS_EVENT.closed, {
          label: this.label,
          data: encode(this.elements, this.viewport),
          state: this.state,
        } satisfies BoardFsClosedPayload);
      } catch (err) {
        console.error('[board-fullscreen] 关闭前回传数据失败:', err);
      }
    });
    if (!this.registerUnlisten(unlistenClose)) return;

    // 监听器就绪后再握手，避免 init 先于 listen 到达
    await emit(BOARD_FS_EVENT.ready, { label: this.label } satisfies BoardFsReadyPayload);
  }

  /**
   * 登记一个待解除的监听句柄。
   *
   * `listen` 是异步的，await 期间会话可能已被 dispose（StrictMode 的
   * mount -> cleanup -> remount 即会触发）。此时直接登记会造成监听泄漏，
   * 故改为立即解除并返回 false，让调用方中止后续握手。
   *
   * @returns 会话是否仍然存活
   */
  private registerUnlisten(unlisten: UnlistenFn): boolean {
    if (this.disposed) {
      unlisten();
      return false;
    }
    this.unlistens.push(unlisten);
    return true;
  }

  /** 卸载 React root、解除监听并移除自建 DOM */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.changeTimer) clearTimeout(this.changeTimer);
    this.unlistens.forEach((fn) => fn());
    this.unlistens = [];
    this.styleToolbar.destroy();

    // 会话可重入（StrictMode 的 mount -> cleanup -> remount），必须把构造时
    // 注入容器的 DOM 与类名全部还原，否则下一个会话会叠加出重复的工具栏与画板。
    this.toolbar.remove();
    this.host.remove();
    this.placeholder.remove();
    this.root.classList.remove(CSS_PREFIX, FULLSCREEN_CSS_CLASS, 'is-editing', 'is-preview');

    const root = this.reactRoot;
    this.reactRoot = null;
    if (root) queueMicrotask(() => root.unmount());
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  /** 收到主窗口下发的数据后首次渲染画板 */
  private applyInitialData(data: string): void {
    if (this.initialized || this.disposed) return;
    this.initialized = true;

    const decoded = decode(data);
    this.elements = decoded.elements;
    this.viewport = decoded.viewport;

    this.placeholder.remove();
    this.reactRoot = createRoot(this.host);
    this.renderReact();
  }

  private renderReact(): void {
    this.reactRoot?.render(
      createElement(BoardReact, {
        initialElements: this.elements,
        initialViewport: this.viewport,
        readonly: this.state === 'preview',
        onChange: (elements: PlaitElement[], viewport?: Viewport) => {
          this.elements = elements;
          this.viewport = viewport;
          this.scheduleChange();
        },
        onBoardReady: (board) => {
          this.board = board;
          if (this.state === 'editing') {
            this.styleToolbar.attach(board);
          }
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // 状态切换
  // -------------------------------------------------------------------------

  private toggleEdit(): void {
    if (this.state === 'preview') {
      this.enterEdit();
    } else {
      this.exitEdit();
    }
  }

  private enterEdit(): void {
    if (this.state === 'editing') return;
    this.state = 'editing';
    this.root.classList.remove('is-preview');
    this.root.classList.add('is-editing');
    updateToolbarState(this.toolbar, 'editing');
    this.renderReact();
    if (this.board) this.styleToolbar.attach(this.board);
    this.emitState();
  }

  private exitEdit(): void {
    if (this.state === 'preview') return;
    this.state = 'preview';
    this.root.classList.remove('is-editing');
    this.root.classList.add('is-preview');
    updateToolbarState(this.toolbar, 'preview');
    this.styleToolbar.detach();
    this.renderReact();
    this.flushChange();
    this.emitState();
  }

  // -------------------------------------------------------------------------
  // 键盘：Esc 层级式退出
  // -------------------------------------------------------------------------

  private bindKeyboard(): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      // 编辑态下第一次 Esc 仅退出编辑，再按一次才关闭窗口
      if (this.state === 'editing') {
        this.exitEdit();
      } else {
        void this.closeWindow();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    this.unlistens.push(() => window.removeEventListener('keydown', onKeyDown, true));
  }

  /** 关闭全屏窗口（closed 事件由 onCloseRequested 统一发出） */
  private async closeWindow(): Promise<void> {
    try {
      await getCurrentWindow().close();
    } catch (err) {
      console.error('[board-fullscreen] 关闭窗口失败:', err);
    }
  }

  // -------------------------------------------------------------------------
  // 数据回传
  // -------------------------------------------------------------------------

  /** 防抖回传画板数据，节奏与主窗口 attrs 回写保持一致 */
  private scheduleChange(): void {
    if (this.changeTimer) clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => {
      this.changeTimer = null;
      this.emitChange();
    }, WRITE_BACK_DEBOUNCE_MS);
  }

  /** 立即回传并取消待执行的防抖任务 */
  private flushChange(): void {
    if (this.changeTimer) {
      clearTimeout(this.changeTimer);
      this.changeTimer = null;
    }
    this.emitChange();
  }

  private emitChange(): void {
    if (!this.initialized) return;
    void emit(BOARD_FS_EVENT.change, {
      label: this.label,
      data: encode(this.elements, this.viewport),
    } satisfies BoardFsChangePayload);
  }

  private emitState(): void {
    void emit(BOARD_FS_EVENT.state, {
      label: this.label,
      state: this.state,
    } satisfies BoardFsStatePayload);
  }
}

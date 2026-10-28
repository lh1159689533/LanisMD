/**
 * Board Block - 全屏窗口挂载（子窗口侧）
 *
 * 在独立的最大化 Tauri 窗口中挂载一份 Plait 画板，复用主窗口 NodeView 的同一套
 * 组件（BoardReact / canvas-toolbar / style-toolbar），保证两侧交互一致。
 *
 * 与主窗口 NodeView 的差异：
 * - 没有 ProseMirror 上下文，数据来源与回写全部走 Tauri 事件。
 * - 不渲染节点外的竖排块工具栏：窗口有系统标题栏承担关窗，高度由窗口决定，
 *   删除整块不在此处提供。唯一的「编辑/完成」入口并入画布工具栏的操作卡，
 *   与缩放/主题等按钮同排且样式统一。
 * - 主题切换在此真实生效（写入 board 并随 change 事件回传主窗口）。
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
 * | v1.1.0 | 块工具栏替换为画布工具栏 + 编辑操作卡  | REQ: 20261026-board-fullscreen-maximize |
 * | v1.2.0 | 支持画板形态：透传 mode 并按形态挂载创建工具条 | REQ: 20261027-board-whiteboard-draw §3.4 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { BoardTransforms } from '@plait/core';
import type { PlaitBoard, PlaitElement, ThemeColorMode, Viewport } from '@plait/core';

import { BoardReact } from '../board-react';
import { createCanvasToolbar } from '../canvas-toolbar';
import type { CanvasToolbarController } from '../canvas-toolbar';
import { createStyleToolbar } from '../style-toolbar';
import type { StyleToolbarController } from '../style-toolbar/types';
import { createDrawToolbar } from '../draw-toolbar';
import type { DrawToolbarController } from '../draw-toolbar';
import { decode, encode } from '../codec';
import { CSS_PREFIX, WRITE_BACK_DEBOUNCE_MS } from '../constants';
import type { BoardBlockState, BoardMode } from '../types';
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
  private readonly host: HTMLElement;
  private readonly placeholder: HTMLElement;
  private readonly canvasToolbar: CanvasToolbarController;
  private readonly styleToolbar: StyleToolbarController;

  /**
   * 画板创建工具条（仅画板块创建）。
   *
   * 与主窗口 NodeView 的差异：形态在构造时还不可知（要等主窗口下发数据后
   * 解码才知道），故延迟到 `applyInitialData` 中按 mode 决定是否创建。
   */
  private drawToolbar: DrawToolbarController | null = null;

  private reactRoot: Root | null = null;
  private board: PlaitBoard | null = null;

  private elements: PlaitElement[] = [];
  private viewport?: Viewport;
  /**
   * 画板主题。
   *
   * 由画布工具栏的主题卡切换，并参与「接收 → 渲染 → 回传」的完整往返，
   * 否则主窗口打开全屏再关闭就会把主题覆盖成默认值。
   */
  private theme?: ThemeColorMode;

  /**
   * 画板形态，由主窗口下发数据解码得出。
   *
   * 初始数据到达前保持 `'mindmap'`：此时画板尚未挂载，该值不参与任何渲染，
   * 且 `emitChange` 以 `initialized` 为前置守卫，不会以错误形态回传。
   */
  private mode: BoardMode = 'mindmap';

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

    this.host = document.createElement('div');
    this.host.className = `${CSS_PREFIX}__host`;
    this.root.appendChild(this.host);

    // 等待主窗口下发数据期间的占位提示
    this.placeholder = document.createElement('div');
    this.placeholder.className = `${CSS_PREFIX}__fullscreen-placeholder`;
    this.placeholder.textContent = '正在加载画板…';
    this.root.appendChild(this.placeholder);

    // 画布级工具栏：编辑操作卡 + 视图/主题/折叠三卡，常驻于画板右上角。
    // 全屏窗口不渲染块工具栏，编辑入口即此处的操作卡。
    this.canvasToolbar = createCanvasToolbar({
      onThemeChange: (mode) => this.applyTheme(mode),
      onToggleEdit: () => this.toggleEdit(),
      onPointerModeChange: (mode) => {
        // 打标供 CSS 切换光标：Plait 自身不处理 hand 模式的光标样式
        this.root.setAttribute('data-canvas-pointer', mode);
      },
    });
    this.canvasToolbar.setBlockState(state);
    this.root.appendChild(this.canvasToolbar.dom);

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
          data: this.encodeCurrent(),
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
    this.canvasToolbar.destroy();
    this.drawToolbar?.destroy();
    this.drawToolbar = null;

    // 会话可重入（StrictMode 的 mount -> cleanup -> remount），必须把构造时
    // 注入容器的 DOM 与类名全部还原，否则下一个会话会叠加出重复的工具栏与画板。
    this.host.remove();
    this.placeholder.remove();
    this.root.removeAttribute('data-canvas-pointer');
    this.root.removeAttribute('data-draw-pointer');
    this.root.removeAttribute('data-board-mode');
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
    this.theme = decoded.theme;
    this.mode = decoded.mode;
    this.root.setAttribute('data-board-mode', this.mode);

    // 样式工具栏在构造时按默认形态（导图）装配，此刻形态才真正可知，
    // 需补一次 setMode 以装配画板能力组（同形态时内部直接 return）
    this.styleToolbar.setMode(this.mode);

    // 画板形态才创建左侧创建工具条，并继承当前显示状态
    if (this.mode === 'board') {
      this.drawToolbar = createDrawToolbar({
        onPointerChange: (pointer) => {
          this.root.setAttribute('data-draw-pointer', pointer);
        },
      });
      this.drawToolbar.setBlockState(this.state);
      this.root.appendChild(this.drawToolbar.dom);
    }

    this.placeholder.remove();
    this.reactRoot = createRoot(this.host);
    this.renderReact();
  }

  private renderReact(): void {
    this.reactRoot?.render(
      createElement(BoardReact, {
        initialElements: this.elements,
        initialViewport: this.viewport,
        initialTheme: this.theme,
        mode: this.mode,
        readonly: this.state === 'preview',
        onChange: (elements: PlaitElement[], viewport?: Viewport) => {
          this.elements = elements;
          this.viewport = viewport;
          this.scheduleChange();
        },
        onThemeChange: (mode: ThemeColorMode) => {
          this.theme = mode;
          this.scheduleChange();
        },
        onBoardReady: (board) => {
          this.board = board;
          this.canvasToolbar.attach(board);
          this.drawToolbar?.attach(board);
          if (this.state === 'editing') {
            this.styleToolbar.attach(board);
          }
        },
        // readonly 跳变时 BoardReact 会强制重设 board.pointer 且不触发
        // board.onChange，需显式刷新两条工具栏的高亮
        onPointerReset: () => {
          this.canvasToolbar.sync();
          this.drawToolbar?.sync();
        },
      }),
    );
  }

  /**
   * 应用画布工具栏选中的主题。
   *
   * 与主窗口 NodeView.applyTheme 同构：工具栏不直接写 board，由宿主调用
   * `updateThemeColor`。Plait 把 set_theme 排除在「真实元素变更」之外，
   * 故主题必须经 BoardReact 的 onThemeChange 才能进入回传链路。
   */
  private applyTheme(mode: ThemeColorMode): void {
    if (!this.board) return;
    if (this.theme === mode && this.board.theme?.themeColorMode === mode) return;
    BoardTransforms.updateThemeColor(this.board, mode);
    this.canvasToolbar.sync();
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
    this.canvasToolbar.setBlockState('editing');
    this.drawToolbar?.setBlockState('editing');
    this.renderReact();
    if (this.board) this.styleToolbar.attach(this.board);
    this.emitState();
  }

  private exitEdit(): void {
    if (this.state === 'preview') return;
    this.state = 'preview';
    this.root.classList.remove('is-editing');
    this.root.classList.add('is-preview');
    this.canvasToolbar.setBlockState('preview');
    this.drawToolbar?.setBlockState('preview');
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
      data: this.encodeCurrent(),
    } satisfies BoardFsChangePayload);
  }

  /** 编码当前画板状态；`mode` 必须显式带上，否则画板会被主窗口解码成导图 */
  private encodeCurrent(): string {
    return encode(this.elements, {
      viewport: this.viewport,
      theme: this.theme,
      mode: this.mode,
    });
  }

  private emitState(): void {
    void emit(BOARD_FS_EVENT.state, {
      label: this.label,
      state: this.state,
    } satisfies BoardFsStatePayload);
  }
}

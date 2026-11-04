/**
 * Board Block - NodeView 核心
 *
 * ProseMirror 自定义 NodeView，管理块级画板（思维导图）的挂载与预览/编辑切换。
 *
 * 与 math/mermaid 的区别：board_block 是块级 atom，内部完全交给 Plait/React 子树，
 * 没有 contentDOM。数据以 base64(JSON) 存于 node.attrs.data，通过 codec 边界转换。
 *
 * 生命周期与事件隔离：
 * - 挂载时创建唯一的 React root（createRoot），预览态用只读挂载 Plait。
 * - 双击 / 点击「编辑」→ 只读态切换为可编辑（不重挂 React root，仅切 readonly prop）。
 * - 编辑态下 stopEvent 全量返回 true，让 Plait/Slate 独占输入（保证 IME 正常）。
 * - Plait onValueChange → 防抖 500ms 回写 attrs.data（setNodeMarkup），并标记 selfUpdating
 *   以避免回写触发的 update 又把画板重置。
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                                                 |
 * | v1.0.0 | 初始实现：atom NodeView + React 挂载 + 只读态切换 | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * | v1.1.0 | 编辑态挂载节点样式工具栏 + selection 联动         | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次1 |
 * | v1.2.0 | 支持全屏窗口：最大化按钮 + 锁定态 + 跨窗口数据同步 | REQ: 20261026-board-fullscreen TECH: 画板全屏窗口方案 §四 |
 * | v1.3.0 | 挂载画布级工具栏（缩放/适应画布/手型/主题）+ 主题块级持久化 | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §三 |
 * | v1.4.0 | 块工具栏改为节点外右侧竖排，与画布工具栏解除横排容器耦合 | REQ: 20261026-board-toolbar-vertical |
 * | v1.4.1 | 修复：节点处于 NodeSelection 时画板内按下触发浏览器原生 drag | REQ: 20261026-board-native-drag-fix |
 * | v1.5.0 | 按 mode 分流：白板块额外挂载左侧创建工具条，编码带上 mode | REQ: 20261027-board-whiteboard-draw §3.1 / §3.4 |
 * | v1.5.1 | 修复：编辑态删除画布内元素误删整个画板块（焦点未入画板宿主） | REQ: 20261027-board-whiteboard-draw |
 * | v1.6.0 | 集成右键菜单（画板/导图 × 元素/空白四场景 + 预览态画布菜单） | REQ: 20261028-board-context-menu TECH: 画板右键菜单方案 |
 * | v1.6.1 | 「添加图形」改为右键位置直接插入默认矩形并选中 | REQ: 20261028-board-context-menu |
 * /@changelog
 *
 * @author hhhuilli
 */

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Node } from '@milkdown/kit/prose/model';
import { NodeSelection } from '@milkdown/kit/prose/state';
import type { EditorView, NodeView, ViewMutationRecord } from '@milkdown/kit/prose/view';
import { BoardTransforms, PlaitPointerType, Transforms } from '@plait/core';
import type { PlaitBoard, PlaitElement, ThemeColorMode, Viewport } from '@plait/core';
import { BoardCreationMode, setCreationMode } from '@plait/common';
import { BasicShapes, DrawTransforms } from '@plait/draw';

import { useSettingsStore } from '@/stores/settings-store';

import { BoardReact } from './board-react';
import {
  createToolbar,
  updateToolbarFullscreenMode,
  updateToolbarState,
  type ToolbarCallbacks,
} from './toolbar';
import { createStyleToolbar } from './style-toolbar';
import type { StyleToolbarController } from './style-toolbar/types';
import { createCanvasToolbar } from './canvas-toolbar';
import type { CanvasToolbarController } from './canvas-toolbar';
import { createDrawToolbar } from './draw-toolbar';
import type { DrawToolbarController } from './draw-toolbar';
import { createBoardContextMenu } from './context-menu';
import type { BoardContextMenuController } from './context-menu/types';
import { openBoardFullscreen, type BoardFullscreenSession } from './fullscreen';
import { decode, encode } from './codec';
import {
  CSS_PREFIX,
  DEFAULT_HEIGHT,
  MAX_HEIGHT,
  MIN_HEIGHT,
  WRITE_BACK_DEBOUNCE_MS,
} from './constants';
import type { BoardBlockState, BoardMode } from './types';

/**
 * 右键菜单「添加图形」默认插入的矩形边长。
 *
 * 对齐 `@plait/draw` 的 `DefaultBasicShapeProperty`（100 × 100），
 * 使右键直插的矩形与其它入口创建出的默认矩形尺寸一致。
 */
const DEFAULT_INSERT_SHAPE_SIZE = 100;

// ---------------------------------------------------------------------------
// BoardBlockNodeView
// ---------------------------------------------------------------------------

export class BoardBlockNodeView implements NodeView {
  /** 外层容器 DOM */
  dom: HTMLElement;

  /** 当前状态 */
  private state: BoardBlockState = 'preview';

  /** 工具栏 DOM */
  private toolbar: HTMLElement;

  /** 节点样式工具栏控制器（编辑态浮现，联动 selection） */
  private styleToolbar: StyleToolbarController;

  /** 画布级工具栏控制器（预览/编辑态常驻，与块工具栏同排右对齐） */
  private canvasToolbar: CanvasToolbarController;

  /**
   * 画板创建工具条控制器（画布左侧竖排）。
   *
   * 仅画板块创建；导图块恒为 `null`（而非创建后隐藏），避免无谓 DOM 与监听。
   */
  private drawToolbar: DrawToolbarController | null = null;

  /** 右键菜单控制器（画布内 contextmenu 时弹出） */
  private contextMenu: BoardContextMenuController;

  /**
   * 画板形态，挂载时由 `decode` 一次性确定，块生命周期内不可变。
   *
   * 不可变的依据：Plait 的 `Wrapper` 只在挂载时读取 `plugins`，形态切换等价于
   * 换一套插件，必须重建 board。本期按「分块类型」决策（见 PRD Q1），用户换
   * 形态的方式是删块重插，而非原地切换。
   */
  private mode: BoardMode;

  /** Plait board 实例（afterInit 后可用） */
  private board: PlaitBoard | null = null;

  /** React 挂载宿主（Plait 画板渲染在此） */
  private reactHost: HTMLElement;

  /** 高度拖拽手柄 */
  private resizeHandle: HTMLElement;

  /** React root（整个生命周期内唯一，不重挂） */
  private reactRoot: Root;

  /** 当前画板元素树（编辑过程中的最新值） */
  private elements: PlaitElement[];

  /** 当前视口 */
  private viewport?: Viewport;

  /** 当前画板主题（块级，随文档持久化） */
  private theme: ThemeColorMode;

  /** 当前视口高度（px） */
  private height: number;

  /** 数据回写防抖计时器 */
  private writeBackTimer: ReturnType<typeof setTimeout> | null = null;

  /** 标记：由自身回写触发的 dispatch，update 时应跳过重渲染 */
  private selfUpdating = false;

  /** 高度拖拽的清理函数 */
  private resizeCleanup: (() => void) | null = null;

  /** 全屏窗口会话；非 null 表示该画板已在全屏窗口中打开 */
  private fullscreenSession: BoardFullscreenSession | null = null;

  /** 锁定遮罩 DOM（仅在全屏窗口打开期间挂载） */
  private lockOverlay: HTMLElement | null = null;

  /** 是否正在打开全屏窗口（防止连点重复建窗） */
  private openingFullscreen = false;

  /**
   * React 子树重建计数。
   *
   * BoardReact 会冻结 initialElements（画板自持状态，避免被父级重渲染重置），
   * 因此外部数据替换时必须换 key 强制 React 卸载重建，否则画板仍显示旧内容。
   */
  private renderKey = 0;

  private view: EditorView;
  private getPos: () => number | undefined;
  private node: Node;

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    // 解码初始数据
    const decoded = decode(node.attrs.data as string);
    this.elements = decoded.elements;
    this.viewport = decoded.viewport;
    this.theme = decoded.theme;
    this.mode = decoded.mode;
    this.height = this.normalizeHeight(node.attrs.height);

    // 外层容器
    this.dom = document.createElement('div');
    this.dom.className = `${CSS_PREFIX} is-preview`;
    this.dom.setAttribute('data-type', 'board-block');
    // 形态打标供 CSS 分流（左侧工具条留白、draw 元素光标等）
    this.dom.setAttribute('data-board-mode', this.mode);

    // 块级工具栏：贴在节点外右侧竖排，默认隐藏、hover 浮现
    const callbacks: ToolbarCallbacks = {
      onToggleEdit: () => this.toggleEdit(),
      onDelete: () => this.deleteBlock(),
      onFullscreen: () => void this.handleFullscreenClick(),
    };
    this.toolbar = createToolbar(callbacks, { layout: 'vertical' });
    this.dom.appendChild(this.toolbar);

    // 画布级工具栏（预览/编辑态常驻，独立定位于节点内右上角）
    this.canvasToolbar = createCanvasToolbar({
      onThemeChange: (mode) => this.applyTheme(mode),
      onPointerModeChange: (mode) => {
        // 打标供 CSS 切换光标：Plait 自身不处理 hand 模式的光标样式
        this.dom.setAttribute('data-canvas-pointer', mode);
      },
    });
    this.dom.appendChild(this.canvasToolbar.dom);

    // 画板创建工具条（画布左侧竖排，仅画板块创建）。
    // 必须与 canvasToolbar / styleToolbar 一样挂到 this.dom 而非 reactHost：
    // reactHost 由 React 托管，reconcile 会移除其内部一切非托管 DOM。
    if (this.mode === 'board') {
      this.drawToolbar = createDrawToolbar({
        onPointerChange: (pointer) => {
          // 打标供 CSS 切换画布光标：Plait 只在创建 board 时按 pointer 给容器
          // 打类，运行时改写 board.pointer 不会重新计算该类名
          this.dom.setAttribute('data-draw-pointer', pointer);
        },
      });
      this.dom.appendChild(this.drawToolbar.dom);
    }

    // 右键菜单控制器：画布内 contextmenu 时弹出（编辑态元素/空白菜单，预览态画布菜单）
    this.contextMenu = createBoardContextMenu({
      mode: this.mode,
      onEnterCreation: (pointer) => this.enterCreation(pointer),
      onInsertShape: (point) => this.insertShape(point),
    });

    // React 挂载宿主
    // tabIndex = -1：使宿主可聚焦但不进 Tab 序。编辑态下焦点须落在画板 DOM 内，
    // 否则 Delete/Backspace 会被 PM 按其 NodeSelection 处理而误删整个块（见 bindEvents）
    this.reactHost = document.createElement('div');
    this.reactHost.className = `${CSS_PREFIX}__host`;
    this.reactHost.tabIndex = -1;
    this.reactHost.style.height = `${this.height}px`;
    this.dom.appendChild(this.reactHost);

    // 节点样式工具栏（浮于画板视口顶部居中，编辑态选中节点时显现）
    // 注意：必须挂到外层 this.dom，不能挂到 reactHost——reactHost 是 React root
    // 容器（下方 createRoot(this.reactHost)），React reconcile 会移除其内部一切
    // 非托管 DOM，导致工具栏节点被剥离（isConnected=false）。this.dom 为
    // position: relative，可作为工具栏 absolute 定位基准。
    // 形态在构造时即确定，直接传入以装配对应的能力组（导图/画板互斥）。
    this.styleToolbar = createStyleToolbar(this.mode);
    this.dom.appendChild(this.styleToolbar.dom);

    // 高度拖拽手柄
    this.resizeHandle = document.createElement('div');
    this.resizeHandle.className = `${CSS_PREFIX}__resize-handle`;
    this.resizeHandle.title = '拖拽调整高度';
    this.dom.appendChild(this.resizeHandle);

    // 创建 React root 并首次渲染（预览态）
    this.reactRoot = createRoot(this.reactHost);
    this.renderReact();

    this.bindEvents();

    // 新插入时自动进入编辑态
    if (node.attrs.autoEdit) {
      requestAnimationFrame(() => {
        this.clearAutoEdit();
        this.enterEdit();
      });
    }
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  /** 渲染（或重渲染）React 子树；始终复用同一 React root */
  private renderReact(): void {
    this.reactRoot.render(
      createElement(BoardReact, {
        // key 变化时 React 卸载重建 BoardReact，用于外部数据替换场景
        key: this.renderKey,
        initialElements: this.elements,
        initialViewport: this.viewport,
        initialTheme: this.theme,
        mode: this.mode,
        readonly: this.state === 'preview',
        onChange: (elements: PlaitElement[], viewport?: Viewport) => {
          this.handleBoardChange(elements, viewport);
        },
        onThemeChange: (mode: ThemeColorMode) => {
          this.theme = mode;
          this.scheduleWriteBack();
        },
        onBoardReady: (board) => {
          this.board = board;
          // 画布工具栏在预览/编辑态均可用，board 一就绪即绑定
          this.canvasToolbar.attach(board);
          // 创建工具条同样一就绪即绑定（其可见性由 CSS 按块状态控制）
          this.drawToolbar?.attach(board);
          // 右键菜单同样一就绪即绑定
          this.contextMenu.attach(board);
          // 若已处于编辑态（如 autoEdit 首次挂载即编辑），立即联动工具栏
          if (this.state === 'editing') {
            this.styleToolbar.attach(board);
          }
        },
        // readonly 跳变时 BoardReact 会强制重设 board.pointer，该赋值不触发
        // board.onChange，两条工具栏都感知不到，需显式刷新高亮
        onPointerReset: () => {
          this.canvasToolbar.sync();
          this.drawToolbar?.sync();
        },
      }),
    );
  }

  /** 用新数据强制重建画板子树（外部数据替换时使用） */
  private rerenderWithNewData(data: string): void {
    const decoded = decode(data);
    this.elements = decoded.elements;
    this.viewport = decoded.viewport;
    this.theme = decoded.theme;
    // 刻意不采用 decoded.mode：形态决定注册哪套 Plait 插件，而工具条等宿主 DOM
    // 已按挂载时的形态装配完毕。正常链路下外部数据的 mode 必然与本块一致
    // （同一节点的 data 往返），故此处保持 this.mode 不变。
    this.renderKey += 1;
    // 旧 board 实例即将被 React 卸载，先解绑工具栏还原其 onChange 包装
    this.canvasToolbar.detach();
    this.drawToolbar?.detach();
    this.contextMenu.detach();
    this.board = null;
    this.renderReact();
  }

  /**
   * 应用画板主题（画布工具栏发起）。
   *
   * 这里只负责写入 board，持久化由 BoardReact 的 onThemeChange 回调驱动：
   * `updateThemeColor` 会产生一个 `set_theme` op，而 Wrapper 的 onValueChange
   * 把 set_theme 排除在「真实元素变更」之外（见 board-react.tsx 的说明），
   * 因此主题必须走 onThemeChange 才能落盘。
   *
   * 不在此处直接 flushWriteBack：若画板内存在「带自定义配色的根节点」，
   * `updateThemeColor` 还会额外产生 set_node op 从而同时触发 onValueChange，
   * 两条路径各自回写会产生两条撤销记录。交给两者共用的 scheduleWriteBack
   * 防抖合并，最终只落一次。
   *
   * 已知副作用：`updateThemeColor` 会清空根节点上用户手动设过的
   * fill / strokeColor / branchColor（@plait/mind 的 board.applyTheme 既定行为，
   * 符合「换主题」语义），子节点的自定义配色不受影响。
   */
  private applyTheme(mode: ThemeColorMode): void {
    if (!this.board) return;
    if (this.theme === mode && this.board.theme?.themeColorMode === mode) return;
    BoardTransforms.updateThemeColor(this.board, mode);
    this.canvasToolbar.sync();
  }

  /** Plait 画板内容变更：暂存最新值并防抖回写 */
  private handleBoardChange(elements: PlaitElement[], viewport?: Viewport): void {
    this.elements = elements;
    this.viewport = viewport;
    this.scheduleWriteBack();
  }

  // -------------------------------------------------------------------------
  // 事件绑定
  // -------------------------------------------------------------------------

  private bindEvents(): void {
    // 编辑态下把焦点拉入画板宿主。
    //
    // 根因：Plait 的画布容器是不可聚焦的 div（无 tabindex），点击画布内元素后
    // DOM 焦点仍停留在 ProseMirror 编辑器根节点上。此时按 Delete/Backspace，
    // keydown 的 target 不在本块 DOM 内，prosemirror-view 的 eventBelongsToView
    // 不会调用本块的 stopEvent，PM 便按它自己的 NodeSelection（覆盖整个
    // board_block）执行删除——整块画布被误删。Plait 的删除元素逻辑（全局
    // keydown 监听，isFocus = !!board.selection）因事件先被 PM 消费而无从生效。
    // 因此必须在编辑态下主动把焦点移入画板宿主，让键盘事件归属画板。
    //
    // Plait 的 pointerdown 会 preventDefault，焦点不会随点击自动转移，
    // 故这里在 mousedown 冒泡到本块时显式 focus。
    this.dom.addEventListener('mousedown', (e) => {
      if (this.state !== 'editing') return;
      const target = e.target as Element | null;
      if (target && this.reactHost.contains(target)) {
        this.reactHost.focus();
      }
    });

    // 双击进入编辑
    this.reactHost.addEventListener('dblclick', (e) => {
      if (this.isLocked) return;
      if (this.state === 'preview') {
        e.preventDefault();
        e.stopPropagation();
        this.enterEdit();
      }
    });

    // hover 显示工具栏
    this.dom.addEventListener('mouseenter', () => {
      this.toolbar.classList.add('is-visible');
    });
    this.dom.addEventListener('mouseleave', () => {
      // 锁定态下工具栏常驻，保证「返回全屏」随时可点
      if (this.state === 'preview' && !this.isLocked) {
        this.toolbar.classList.remove('is-visible');
      }
    });

    // Esc 退出编辑
    this.dom.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state === 'editing') {
        e.preventDefault();
        e.stopPropagation();
        this.exitEdit();
      }
    });

    // 右键菜单：画布内 contextmenu 弹出画板专属菜单
    // 挂在 reactHost（画布区域）而非 this.dom：工具栏 / 拖拽手柄上的右键不弹菜单
    this.reactHost.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.contextMenu.show(e.clientX, e.clientY);
    });

    // 高度拖拽
    this.resizeHandle.addEventListener('mousedown', (e) => this.startResize(e));
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

  /** 进入编辑态：切 readonly prop（不重挂），Plait 接管输入 */
  private enterEdit(): void {
    if (this.state === 'editing') return;
    this.state = 'editing';
    this.dom.classList.remove('is-preview');
    this.dom.classList.add('is-editing');
    this.toolbar.classList.add('is-visible');
    updateToolbarState(this.toolbar, 'editing');
    this.canvasToolbar.setBlockState('editing');
    this.drawToolbar?.setBlockState('editing');
    this.contextMenu.setBlockState('editing');
    this.renderReact();
    // 焦点移入画板宿主：键盘事件必须归属画板（Delete 删元素而非删整个块），
    // 同时把焦点从 PM 编辑器上移走，避免编辑态残留 PM 的键位处理
    this.reactHost.focus();
    // 编辑态联动样式工具栏（board 就绪时才 attach，否则等 onBoardReady）
    if (this.board) {
      this.styleToolbar.attach(this.board);
    }
  }

  /** 退出编辑态：切回只读挂载，并立即回写一次数据 */
  private exitEdit(): void {
    if (this.state === 'preview') return;
    this.state = 'preview';
    this.dom.classList.remove('is-editing');
    this.dom.classList.add('is-preview');
    this.toolbar.classList.remove('is-visible');
    updateToolbarState(this.toolbar, 'preview');
    this.canvasToolbar.setBlockState('preview');
    this.drawToolbar?.setBlockState('preview');
    this.contextMenu.setBlockState('preview');
    // 退出编辑态：隐藏并解绑样式工具栏
    this.styleToolbar.detach();
    this.renderReact();
    this.flushWriteBack();
  }

  /**
   * 右键菜单「添加连线」：进入对应 pointer 的创建态。
   *
   * 与 draw-toolbar 的创建入口同路径：写 `board.pointer` + 设置 creation mode，
   * 二者必须成对（仅写 pointer 不设 creation mode 会导致拖拽画不出图形，
   * 见 draw-toolbar 的 handleSelect 说明）。随后同步工具条高亮。
   */
  private enterCreation(pointer: string): void {
    if (!this.board) return;
    BoardTransforms.updatePointerType(this.board, pointer);
    setCreationMode(this.board, BoardCreationMode.drawing);
    this.drawToolbar?.sync();
  }

  /**
   * 右键菜单「添加图形」：在右键位置直接插入默认矩形并选中。
   *
   * 与「进入创建态」不同，这里是一次性插入：`insertGeometry` 用默认边长在
   * 点击处落一个矩形，再把选区设为该矩形外接框，使其立即处于选中态（可拖动 /
   * 用样式工具栏改样式）。插入前强制 pointer 回到 selection——手型下
   * `isHandleSelection` 为 false，setSelection 不会写入选中缓存，图形会
   * 「插入成功但不可拖动」。选区比图形外框略微外扩，确保基于几何边界的
   * 矩形命中判定可靠命中（无填充矩形不做点命中判定）。
   */
  private insertShape(point: [number, number]): void {
    if (!this.board) return;
    const end: [number, number] = [
      point[0] + DEFAULT_INSERT_SHAPE_SIZE,
      point[1] + DEFAULT_INSERT_SHAPE_SIZE,
    ];
    DrawTransforms.insertGeometry(this.board, [point, end], BasicShapes.rectangle);
    BoardTransforms.updatePointerType(this.board, PlaitPointerType.selection);
    const pad = 2;
    Transforms.setSelection(this.board, {
      anchor: [point[0] - pad, point[1] - pad],
      focus: [end[0] + pad, end[1] + pad],
    });
    this.drawToolbar?.sync();
  }

  // -------------------------------------------------------------------------
  // 全屏窗口
  // -------------------------------------------------------------------------

  /** 工具栏全屏按钮点击：未打开则建窗，已打开则聚焦既有窗口 */
  private async handleFullscreenClick(): Promise<void> {
    if (this.fullscreenSession) {
      const alive = await this.fullscreenSession.focus();
      // 窗口已不存在（异常关闭未收到 closed 事件）：兜底解锁
      if (!alive) {
        this.fullscreenSession.dispose();
        this.fullscreenSession = null;
        this.unlock();
      }
      return;
    }

    if (this.openingFullscreen) return;
    this.openingFullscreen = true;
    try {
      await this.openFullscreen();
    } finally {
      this.openingFullscreen = false;
    }
  }

  /** 打开全屏窗口并进入锁定态 */
  private async openFullscreen(): Promise<void> {
    // 开窗前的状态即全屏窗口的初始状态；先退出本地编辑态并冲刷数据，
    // 确保下发给全屏窗口的是最新内容，且主窗口不残留可编辑实例。
    const initialState = this.state;
    if (this.state === 'editing') {
      this.exitEdit();
    } else {
      this.flushWriteBack();
    }

    const session = await openBoardFullscreen({
      getData: () => this.encodeCurrent(),
      initialState,
      title: this.mode === 'board' ? '画板' : '思维导图',
      theme: useSettingsStore.getState().config.theme || 'system',
      onData: (data) => this.applyFullscreenData(data),
      onState: () => {
        // 锁定期间主窗口不随动渲染，最终状态在 onClosed 统一恢复
      },
      onClosed: ({ data, state }) => this.handleFullscreenClosed(data, state),
    });

    if (!session) return;
    this.fullscreenSession = session;
    this.lock();
  }

  /** 接收全屏窗口回传的数据并写入文档 */
  private applyFullscreenData(data: string): void {
    const decoded = decode(data);
    this.elements = decoded.elements;
    this.viewport = decoded.viewport;
    this.theme = decoded.theme;
    this.commitAttrs({ data });
  }

  /** 全屏窗口关闭：写入最终数据、解除锁定并恢复状态 */
  private handleFullscreenClosed(data: string, state: BoardBlockState): void {
    this.fullscreenSession = null;
    this.commitAttrs({ data });
    this.unlock();
    // 用全屏窗口的最终数据强制重建画板，再按其最终状态恢复编辑/预览
    this.rerenderWithNewData(data);
    if (state === 'editing') {
      this.enterEdit();
    }
  }

  /** 进入锁定态：遮罩覆盖 + 工具栏仅留「返回全屏」 */
  private lock(): void {
    if (this.lockOverlay) return;
    this.dom.classList.add('is-fullscreen-locked');

    const overlay = document.createElement('div');
    overlay.className = `${CSS_PREFIX}__lock-overlay`;
    overlay.innerHTML = `<span class="${CSS_PREFIX}__lock-text">已在全屏窗口中打开</span>`;
    // 遮罩必须挂在 this.dom：reactHost 由 React 托管，reconcile 会移除其内部
    // 非托管 DOM（与 style-toolbar 同理）
    this.dom.appendChild(overlay);
    this.lockOverlay = overlay;

    this.toolbar.classList.add('is-visible');
    updateToolbarFullscreenMode(this.toolbar, 'focus');
  }

  /** 解除锁定态 */
  private unlock(): void {
    this.dom.classList.remove('is-fullscreen-locked');
    this.lockOverlay?.remove();
    this.lockOverlay = null;
    this.toolbar.classList.remove('is-visible');
    updateToolbarFullscreenMode(this.toolbar, 'maximize');
  }

  /** 是否处于锁定态 */
  private get isLocked(): boolean {
    return this.lockOverlay !== null;
  }

  // -------------------------------------------------------------------------
  // 删除
  // -------------------------------------------------------------------------

  private deleteBlock(): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    const tr = this.view.state.tr.delete(pos, pos + this.node.nodeSize);
    this.view.dispatch(tr);
  }

  // -------------------------------------------------------------------------
  // 数据回写
  // -------------------------------------------------------------------------

  /** 防抖回写画板数据到 attrs.data */
  private scheduleWriteBack(): void {
    if (this.writeBackTimer) clearTimeout(this.writeBackTimer);
    this.writeBackTimer = setTimeout(() => {
      this.writeBackTimer = null;
      this.commitAttrs({ data: this.encodeCurrent() });
    }, WRITE_BACK_DEBOUNCE_MS);
  }

  /** 立即回写（退出编辑时调用），清除待执行的防抖任务 */
  private flushWriteBack(): void {
    if (this.writeBackTimer) {
      clearTimeout(this.writeBackTimer);
      this.writeBackTimer = null;
    }
    this.commitAttrs({ data: this.encodeCurrent() });
  }

  /**
   * 编码当前画板状态。
   *
   * `mode` 必须显式带上：画板块缺失该字段时重开会被解码成导图块。
   */
  private encodeCurrent(): string {
    return encode(this.elements, {
      viewport: this.viewport,
      theme: this.theme,
      mode: this.mode,
    });
  }

  /**
   * 将属性变更写入 ProseMirror 节点。
   *
   * 标记 selfUpdating，使随后的 update() 跳过对 React 子树的重渲染，
   * 避免「回写 → update → 重挂 → 丢失编辑态/视口」的循环。
   */
  private commitAttrs(patch: Record<string, unknown>): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    try {
      this.selfUpdating = true;
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        ...patch,
      });
      this.view.dispatch(tr);
    } catch {
      // 忽略回写失败（位置失效等）
    } finally {
      this.selfUpdating = false;
    }
  }

  /** 清除 autoEdit 标记，避免文档重载时再次自动进入编辑 */
  private clearAutoEdit(): void {
    if (!this.node.attrs.autoEdit) return;
    this.commitAttrs({ autoEdit: false });
  }

  // -------------------------------------------------------------------------
  // 高度拖拽
  // -------------------------------------------------------------------------

  private normalizeHeight(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_HEIGHT;
    return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(n)));
  }

  private startResize(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = this.height;
    this.dom.classList.add('is-resizing');

    const onMove = (ev: MouseEvent) => {
      const next = this.normalizeHeight(startHeight + (ev.clientY - startY));
      this.height = next;
      this.reactHost.style.height = `${next}px`;
    };
    const onUp = () => {
      this.dom.classList.remove('is-resizing');
      this.commitAttrs({ height: this.height });
      this.cleanupResize();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    this.resizeCleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      this.resizeCleanup = null;
    };
  }

  private cleanupResize(): void {
    if (this.resizeCleanup) this.resizeCleanup();
  }

  // -------------------------------------------------------------------------
  // ProseMirror NodeView 接口
  // -------------------------------------------------------------------------

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    const prev = this.node;
    this.node = node;

    // 自身回写触发的更新：仅同步引用，不重渲染画板
    if (this.selfUpdating) return true;

    // 锁定态（全屏窗口打开中）：主窗口被遮罩覆盖，无需重渲染，
    // 最终内容在全屏窗口关闭时统一恢复
    if (this.isLocked) return true;

    // 外部数据变更（如 undo/redo）：预览态时用新数据重渲染；编辑态不打断用户
    if (this.state === 'preview' && node.attrs.data !== prev.attrs.data) {
      this.rerenderWithNewData(node.attrs.data as string);
    }

    // 高度外部变更同步
    const nextHeight = this.normalizeHeight(node.attrs.height);
    if (nextHeight !== this.height) {
      this.height = nextHeight;
      this.reactHost.style.height = `${nextHeight}px`;
    }

    return true;
  }

  selectNode(): void {
    this.dom.classList.add('is-selected');
  }

  deselectNode(): void {
    this.dom.classList.remove('is-selected');
    if (this.state === 'editing') {
      this.exitEdit();
    }
  }

  /** 事件隔离：编辑态让 Plait/Slate 独占，预览态放行 PM 的选择/拖拽 */
  stopEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null;

    // 工具栏（块级 + 画布级 + 创建工具条）与拖拽手柄事件由各自监听处理
    if (
      target &&
      (this.toolbar.contains(target) ||
        this.canvasToolbar.dom.contains(target) ||
        this.drawToolbar?.dom.contains(target) ||
        target === this.resizeHandle)
    ) {
      return true;
    }

    // 锁定态：画板已移交全屏窗口，吞掉块内一切交互
    if (this.isLocked) {
      return true;
    }

    // 编辑态：全量交给 Plait，保证 IME/选择/拖拽/热键正常
    if (this.state === 'editing') {
      return true;
    }

    // 预览态且本节点已处于 NodeSelection：必须拦掉画板内部的 mousedown。
    //
    // 原因：prosemirror-view 的 MouseDown 构造函数里，判定「本次按下可能是在拖
    // 动节点」的条件是（见 prosemirror-view/src/input.ts）：
    //
    //   (button == 0 && spec.draggable && spec.selectable !== false)
    //   || (selection instanceof NodeSelection && from <= targetPos && to > targetPos)
    //
    // 按运算符优先级这是 `(A && B && C) || D`，schema 里的 `draggable: false`
    // 只能否决前半段，**后半段只看 NodeSelection**。一旦命中，PM 会执行
    // `this.target.draggable = true` 把 NodeView 根 DOM 临时置为原生可拖拽，
    // 于是在画板内按下并移动就会触发浏览器原生 HTML5 drag：既出现整窗拖影，
    // 又因原生 drag 吞掉 mouseup 而使 Plait 的手型平移状态机无法收尾
    // （松手后画布仍跟随指针）。
    //
    // 该状态在「退出编辑态」「切换画板主题」后会稳定残留（节点保持选中），
    // 这正是此问题表现为偶现的原因。整块拖动排序由 block-handle 抓手负责，
    // 画板内部本就不需要 PM 的节点拖拽，故此处直接隔离。
    //
    // 只拦 mousedown，不影响 dblclick 进入编辑；也只在已选中时拦，
    // 首次点击仍可正常建立 NodeSelection。
    if (event.type === 'mousedown' && this.isNodeSelected) {
      return true;
    }

    // 预览态：不拦截，允许 ProseMirror 选中/拖拽整个 atom 节点
    return false;
  }

  /** 本节点当前是否处于覆盖自身的 NodeSelection */
  private get isNodeSelected(): boolean {
    const pos = this.getPos();
    if (pos === undefined) return false;
    const { selection } = this.view.state;
    return selection instanceof NodeSelection && selection.from <= pos && selection.to > pos;
  }

  /** DOM 内部由 React/Plait 全权管理，PM 一律忽略变更 */
  ignoreMutation(_record: ViewMutationRecord): boolean {
    return true;
  }

  destroy(): void {
    if (this.writeBackTimer) clearTimeout(this.writeBackTimer);
    this.cleanupResize();
    this.styleToolbar.destroy();
    this.canvasToolbar.destroy();
    this.drawToolbar?.destroy();
    this.contextMenu.destroy();
    // 节点销毁时若全屏窗口仍存活，一并关闭，避免留下无宿主的孤立窗口
    if (this.fullscreenSession) {
      const session = this.fullscreenSession;
      this.fullscreenSession = null;
      void session.close();
    }
    // 异步卸载 React root，规避「在 render 过程中同步卸载」的告警
    const root = this.reactRoot;
    queueMicrotask(() => root.unmount());
  }
}

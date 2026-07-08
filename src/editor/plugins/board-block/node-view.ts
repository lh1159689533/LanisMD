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
 * /@changelog
 *
 * @author hhhuilli
 */

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView, ViewMutationRecord } from '@milkdown/kit/prose/view';
import type { PlaitElement, Viewport } from '@plait/core';

import { BoardReact } from './board-react';
import { createToolbar, updateToolbarState, type ToolbarCallbacks } from './toolbar';
import { decode, encode } from './codec';
import {
  CSS_PREFIX,
  DEFAULT_HEIGHT,
  MAX_HEIGHT,
  MIN_HEIGHT,
  WRITE_BACK_DEBOUNCE_MS,
} from './constants';
import type { BoardBlockState } from './types';

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

  /** 当前视口高度（px） */
  private height: number;

  /** 数据回写防抖计时器 */
  private writeBackTimer: ReturnType<typeof setTimeout> | null = null;

  /** 标记：由自身回写触发的 dispatch，update 时应跳过重渲染 */
  private selfUpdating = false;

  /** 高度拖拽的清理函数 */
  private resizeCleanup: (() => void) | null = null;

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
    this.height = this.normalizeHeight(node.attrs.height);

    // 外层容器
    this.dom = document.createElement('div');
    this.dom.className = `${CSS_PREFIX} is-preview`;
    this.dom.setAttribute('data-type', 'board-block');

    // 工具栏
    const callbacks: ToolbarCallbacks = {
      onToggleEdit: () => this.toggleEdit(),
      onDelete: () => this.deleteBlock(),
    };
    this.toolbar = createToolbar(callbacks);
    this.dom.appendChild(this.toolbar);

    // React 挂载宿主
    this.reactHost = document.createElement('div');
    this.reactHost.className = `${CSS_PREFIX}__host`;
    this.reactHost.style.height = `${this.height}px`;
    this.dom.appendChild(this.reactHost);

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
        initialElements: this.elements,
        initialViewport: this.viewport,
        readonly: this.state === 'preview',
        onChange: (elements: PlaitElement[], viewport?: Viewport) => {
          this.handleBoardChange(elements, viewport);
        },
      }),
    );
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
    // 双击进入编辑
    this.reactHost.addEventListener('dblclick', (e) => {
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
      if (this.state === 'preview') {
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
    this.renderReact();
  }

  /** 退出编辑态：切回只读挂载，并立即回写一次数据 */
  private exitEdit(): void {
    if (this.state === 'preview') return;
    this.state = 'preview';
    this.dom.classList.remove('is-editing');
    this.dom.classList.add('is-preview');
    this.toolbar.classList.remove('is-visible');
    updateToolbarState(this.toolbar, 'preview');
    this.renderReact();
    this.flushWriteBack();
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
      this.commitAttrs({ data: encode(this.elements, this.viewport) });
    }, WRITE_BACK_DEBOUNCE_MS);
  }

  /** 立即回写（退出编辑时调用），清除待执行的防抖任务 */
  private flushWriteBack(): void {
    if (this.writeBackTimer) {
      clearTimeout(this.writeBackTimer);
      this.writeBackTimer = null;
    }
    this.commitAttrs({ data: encode(this.elements, this.viewport) });
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

    // 外部数据变更（如 undo/redo）：预览态时用新数据重渲染；编辑态不打断用户
    if (this.state === 'preview' && node.attrs.data !== prev.attrs.data) {
      const decoded = decode(node.attrs.data as string);
      this.elements = decoded.elements;
      this.viewport = decoded.viewport;
      this.renderReact();
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

    // 工具栏与拖拽手柄事件由各自监听处理
    if (target && (this.toolbar.contains(target) || target === this.resizeHandle)) {
      return true;
    }

    // 编辑态：全量交给 Plait，保证 IME/选择/拖拽/热键正常
    if (this.state === 'editing') {
      return true;
    }

    // 预览态：不拦截，允许 ProseMirror 选中/拖拽整个 atom 节点
    return false;
  }

  /** DOM 内部由 React/Plait 全权管理，PM 一律忽略变更 */
  ignoreMutation(_record: ViewMutationRecord): boolean {
    return true;
  }

  destroy(): void {
    if (this.writeBackTimer) clearTimeout(this.writeBackTimer);
    this.cleanupResize();
    // 异步卸载 React root，规避「在 render 过程中同步卸载」的告警
    const root = this.reactRoot;
    queueMicrotask(() => root.unmount());
  }
}

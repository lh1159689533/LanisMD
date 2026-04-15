/**
 * Mermaid Block - NodeView 核心
 *
 * ProseMirror 自定义 NodeView，管理 Mermaid 图表的编辑和预览状态：
 * - 预览状态：显示渲染后的 SVG 图表 + 悬浮工具栏
 * - 编辑状态：上方代码区 + 下方实时预览（Typora 风格，边写边看）
 *
 * 事件处理：
 * - 双击图表 / 点击编辑按钮：进入编辑模式
 * - 焦点离开 / 点击预览按钮：退出编辑模式
 * - Esc：取消编辑，恢复上次成功的图表
 * - 输入代码：防抖实时渲染下方预览
 */

import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView, ViewMutationRecord } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { renderMermaid } from './renderer';
import { createToolbar, updateToolbarState, type ToolbarCallbacks } from './toolbar';
import { exportAsPng, exportAsSvg } from './export';
import { onThemeChange } from './theme';
import { CSS_PREFIX, ICONS, RENDER_DEBOUNCE_MS, type MermaidBlockState } from './types';

// ---------------------------------------------------------------------------
// MermaidNodeView
// ---------------------------------------------------------------------------

export class MermaidNodeView implements NodeView {
  /** 外层容器 DOM */
  dom: HTMLElement;

  /** ProseMirror 内容 DOM（代码编辑区） */
  contentDOM: HTMLElement | undefined;

  /** 当前状态 */
  private state: MermaidBlockState = 'preview';

  /** 工具栏 DOM */
  private toolbar: HTMLElement;

  /** 预览容器 */
  private previewContainer: HTMLElement;

  /** 编辑容器（包含代码编辑区） */
  private editorContainer: HTMLElement;

  /** 编辑模式下的实时预览区域 */
  private livePreview: HTMLElement;

  /** 上次成功渲染的 SVG */
  private lastSuccessfulSvg: string | null = null;

  /** 上次成功渲染时的代码 */
  private lastSuccessfulCode: string | null = null;

  /** 防抖计时器 */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** 主题变化取消监听函数 */
  private unsubTheme: (() => void) | null = null;

  /** 状态切换保护（防止 deselectNode 闪回） */
  private switchingState = false;

  /** ProseMirror EditorView */
  private view: EditorView;

  /** 获取节点位置 */
  private getPos: () => number | undefined;

  /** 当前节点 */
  private node: Node;

  constructor(node: Node, view: EditorView, getPos: () => number | undefined, autoEdit = false) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    // 创建外层容器
    this.dom = document.createElement('div');
    this.dom.className = `${CSS_PREFIX}-block is-preview`;
    this.dom.setAttribute('data-type', 'mermaid-block');

    // 创建工具栏
    const callbacks: ToolbarCallbacks = {
      onToggleEdit: () => this.toggleEdit(),
      onExportPng: () => this.handleExportPng(),
      onExportSvg: () => this.handleExportSvg(),
      onDelete: () => this.deleteBlock(),
    };
    this.toolbar = createToolbar(callbacks);
    this.dom.appendChild(this.toolbar);

    // 创建预览容器
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = `${CSS_PREFIX}-preview`;
    this.dom.appendChild(this.previewContainer);

    // 创建编辑容器
    this.editorContainer = document.createElement('div');
    this.editorContainer.className = `${CSS_PREFIX}-editor`;
    this.editorContainer.style.display = 'none';

    // 编辑区标题
    const editorHeader = document.createElement('div');
    editorHeader.className = `${CSS_PREFIX}-editor-header`;
    editorHeader.textContent = 'mermaid';
    this.editorContainer.appendChild(editorHeader);

    // ProseMirror 内容区（代码编辑）
    const codeWrapper = document.createElement('div');
    codeWrapper.className = `${CSS_PREFIX}-code-wrapper`;

    // contentDOM 是 ProseMirror 管理的可编辑区域
    this.contentDOM = document.createElement('pre');
    this.contentDOM.className = `${CSS_PREFIX}-code`;
    this.contentDOM.setAttribute('spellcheck', 'false');
    codeWrapper.appendChild(this.contentDOM);

    this.editorContainer.appendChild(codeWrapper);

    // 实时预览区域（编辑时显示在代码下方）
    this.livePreview = document.createElement('div');
    this.livePreview.className = `${CSS_PREFIX}-live-preview`;
    this.editorContainer.appendChild(this.livePreview);

    this.dom.appendChild(this.editorContainer);

    // 事件绑定
    this.bindEvents();

    // 监听主题变化
    this.unsubTheme = onThemeChange(() => {
      this.rerender();
    });

    // 初始渲染
    this.initialRender();

    // 自动进入编辑模式（通过斜杠菜单创建时触发）
    if (autoEdit) {
      requestAnimationFrame(() => {
        this.enterEdit();
      });
    }
  }

  // -------------------------------------------------------------------------
  // 事件绑定
  // -------------------------------------------------------------------------

  private bindEvents(): void {
    // 双击进入编辑
    this.previewContainer.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.enterEdit();
    });

    // hover 显示/隐藏工具栏（仅预览状态）
    this.dom.addEventListener('mouseenter', () => {
      this.toolbar.classList.add('is-visible');
    });
    this.dom.addEventListener('mouseleave', () => {
      if (this.state === 'preview') {
        this.toolbar.classList.remove('is-visible');
      }
    });

    // 键盘事件（Esc 取消编辑）
    this.dom.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state === 'editing') {
        e.preventDefault();
        e.stopPropagation();
        this.cancelEdit();
      }
    });
  }

  // -------------------------------------------------------------------------
  // 状态切换
  // -------------------------------------------------------------------------

  /** 切换编辑/预览 */
  private toggleEdit(): void {
    if (this.state === 'preview') {
      this.enterEdit();
    } else {
      this.exitEdit();
    }
  }

  /** 进入编辑模式 */
  private enterEdit(): void {
    if (this.state === 'editing') return;

    // 设置保护标志，防止 ProseMirror 在切换过程中触发 deselectNode 导致闪回
    this.switchingState = true;
    this.state = 'editing';

    this.dom.classList.remove('is-preview');
    this.dom.classList.add('is-editing');

    // 隐藏纯预览，显示编辑区
    this.previewContainer.style.display = 'none';
    this.editorContainer.style.display = '';

    // 工具栏始终可见
    this.toolbar.classList.add('is-visible');
    updateToolbarState(this.toolbar, 'editing');

    // 初始化实时预览
    const code = this.getCode();
    this.updateLivePreview(code);

    // 聚焦到代码编辑区域
    requestAnimationFrame(() => {
      // 释放保护标志
      this.switchingState = false;

      if (this.contentDOM) {
        // 先尝试通过 ProseMirror 移动光标
        const pos = this.getPos();
        if (pos !== undefined) {
          try {
            const resolvedPos = this.view.state.doc.resolve(pos + 1);
            const selection = TextSelection.near(resolvedPos);
            this.view.dispatch(this.view.state.tr.setSelection(selection));
            this.view.focus();
            return;
          } catch (err) {
            console.warn(`[MermaidBlock: enterEdit rAF: PM focus failed, fallback`, err);
          }
        }

        // 后备方案：直接聚焦 contentDOM
        this.contentDOM.focus();
      }
    });
  }

  /** 退出编辑模式（尝试渲染） */
  private exitEdit(): void {
    if (this.state === 'preview') return;

    const code = this.getCode();

    this.state = 'preview';
    this.dom.classList.remove('is-editing');
    this.dom.classList.add('is-preview');

    // 显示预览，隐藏编辑区
    this.previewContainer.style.display = '';
    this.editorContainer.style.display = 'none';

    // 更新工具栏
    this.toolbar.classList.remove('is-visible');
    updateToolbarState(this.toolbar, 'preview');

    // 渲染最终结果
    this.renderToPreview(code);
  }

  /** 取消编辑（Esc），恢复上次成功的图表 */
  private cancelEdit(): void {
    this.state = 'preview';
    this.dom.classList.remove('is-editing');
    this.dom.classList.add('is-preview');

    // 显示预览，隐藏编辑区
    this.previewContainer.style.display = '';
    this.editorContainer.style.display = 'none';

    // 恢复上次成功的 SVG
    if (this.lastSuccessfulSvg) {
      this.previewContainer.innerHTML = this.lastSuccessfulSvg;
    }

    // 如果有上次成功的代码，恢复节点内容
    if (this.lastSuccessfulCode !== null) {
      const pos = this.getPos();
      if (pos !== undefined) {
        try {
          const tr = this.view.state.tr;
          const nodeStart = pos + 1;
          const nodeEnd = pos + this.node.nodeSize - 1;
          const textNode = this.view.state.schema.text(this.lastSuccessfulCode);
          tr.replaceWith(nodeStart, nodeEnd, textNode);
          this.view.dispatch(tr);
        } catch {
          // 忽略恢复错误
        }
      }
    }

    // 更新工具栏
    this.toolbar.classList.remove('is-visible');
    updateToolbarState(this.toolbar, 'preview');
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  /** 获取当前代码内容 */
  private getCode(): string {
    return this.node.textContent || '';
  }

  /** 初始渲染 */
  private async initialRender(): Promise<void> {
    const code = this.getCode();
    if (code.trim()) {
      await this.renderToPreview(code);
    } else {
      this.showEmptyState();
    }
  }

  /** 渲染到预览容器 */
  private async renderToPreview(code: string): Promise<void> {
    if (!code.trim()) {
      this.showEmptyState();
      return;
    }

    const result = await renderMermaid(code);
    if (result.success && result.svg) {
      this.previewContainer.innerHTML = result.svg;
      this.previewContainer.classList.remove('has-error');
      this.lastSuccessfulSvg = result.svg;
      this.lastSuccessfulCode = code;
    } else {
      this.showError(result.error || '渲染失败');
    }
  }

  /** 更新实时预览（编辑模式下） */
  private async updateLivePreview(code: string): Promise<void> {
    if (!code.trim()) {
      this.livePreview.innerHTML = `<div class="${CSS_PREFIX}-empty">输入 Mermaid 代码...</div>`;
      return;
    }

    const result = await renderMermaid(code);
    if (result.success && result.svg) {
      this.livePreview.innerHTML = result.svg;
      this.livePreview.classList.remove('has-error');
      this.lastSuccessfulSvg = result.svg;
      this.lastSuccessfulCode = code;
    } else {
      this.livePreview.innerHTML = `<div class="${CSS_PREFIX}-error-msg">${ICONS.error} <span>${result.error || '语法错误'}</span></div>`;
      this.livePreview.classList.add('has-error');
    }
  }

  /** 防抖渲染实时预览 */
  private debouncedUpdateLivePreview(code: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.updateLivePreview(code);
    }, RENDER_DEBOUNCE_MS);
  }

  /** 显示空状态 */
  private showEmptyState(): void {
    this.previewContainer.innerHTML = `<div class="${CSS_PREFIX}-empty">双击编辑 Mermaid 图表</div>`;
  }

  /** 显示渲染错误 */
  private showError(message: string): void {
    this.previewContainer.innerHTML = `<div class="${CSS_PREFIX}-error-msg">${ICONS.error} <span>${message}</span></div>`;
    this.previewContainer.classList.add('has-error');
  }

  /** 主题变化后重新渲染 */
  private async rerender(): Promise<void> {
    const code = this.getCode();
    if (this.state === 'preview') {
      await this.renderToPreview(code);
    } else {
      await this.updateLivePreview(code);
    }
  }

  // -------------------------------------------------------------------------
  // 删除
  // -------------------------------------------------------------------------

  /** 删除整个块节点 */
  private deleteBlock(): void {
    const pos = this.getPos();
    if (pos === undefined) return;

    const tr = this.view.state.tr;
    tr.delete(pos, pos + this.node.nodeSize);
    this.view.dispatch(tr);
  }

  // -------------------------------------------------------------------------
  // 导出
  // -------------------------------------------------------------------------

  private async handleExportPng(): Promise<void> {
    const svg = this.lastSuccessfulSvg;
    if (!svg) {
      console.warn('没有可导出的图表');
      return;
    }
    await exportAsPng(svg, { format: 'png' });
  }

  private async handleExportSvg(): Promise<void> {
    const svg = this.lastSuccessfulSvg;
    if (!svg) {
      console.warn('没有可导出的图表');
      return;
    }
    await exportAsSvg(svg, { format: 'svg' });
  }

  // -------------------------------------------------------------------------
  // ProseMirror NodeView 接口
  // -------------------------------------------------------------------------

  /**
   * 当节点内容更新时调用
   * 在编辑模式下触发实时预览更新
   */
  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;

    // 检查 language 属性是否仍然是 mermaid
    if (node.attrs.language !== 'mermaid') return false;

    this.node = node;

    // 如果在编辑模式，更新实时预览
    if (this.state === 'editing') {
      const code = node.textContent || '';
      this.debouncedUpdateLivePreview(code);
    }

    return true;
  }

  /** 选中节点时 */
  selectNode(): void {
    this.dom.classList.add('is-selected');
  }

  /** 取消选中时 */
  deselectNode(): void {
    this.dom.classList.remove('is-selected');
    // 如果在编辑模式下取消选中（焦点离开），退出编辑
    // 但如果正在进行状态切换，不要闪回
    if (this.state === 'editing' && !this.switchingState) {
      this.exitEdit();
    }
  }

  /** 控制哪些事件由 ProseMirror 处理 */
  stopEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null;

    // 工具栏内的事件始终由我们自己处理，不交给 ProseMirror
    if (target && this.toolbar.contains(target)) {
      return true;
    }

    // 状态切换保护期间，拦截所有事件
    if (this.switchingState) {
      return true;
    }

    // 编辑模式
    if (this.state === 'editing') {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        return true; // 我们自己处理 Esc
      }
      return false; // 其他事件交给 ProseMirror（支持代码编辑）
    }

    // 预览模式：拦截鼠标事件，防止 ProseMirror 选中节点内部文本
    if (event.type === 'mousedown') {
      return true;
    }

    return false;
  }

  /** 是否忽略 DOM 变更 */
  ignoreMutation(record: ViewMutationRecord): boolean {
    // selection 类型的变更不需要我们处理，交给 ProseMirror
    if (record.type === 'selection') {
      return false;
    }
    // 只有 contentDOM 内部的文本/子节点变化才交给 ProseMirror 处理
    // 其余所有 DOM 变化（外层容器 class/style、预览区、工具栏、编辑容器等）
    // 都由我们自己管理，必须忽略，否则 ProseMirror 会销毁并重建 NodeView
    if (this.contentDOM && this.contentDOM.contains(record.target)) {
      return false; // contentDOM 内部的变化交给 ProseMirror
    }
    return true; // 其余一律忽略
  }

  /** 销毁 */
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.unsubTheme) {
      this.unsubTheme();
    }
  }
}

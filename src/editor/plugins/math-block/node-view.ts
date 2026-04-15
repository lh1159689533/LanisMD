/**
 * Math Block - NodeView 核心
 *
 * ProseMirror 自定义 NodeView，管理块级数学公式的编辑和预览状态：
 * - 预览状态：显示 KaTeX 渲染后的公式 + 悬浮工具栏
 * - 编辑状态：上方代码区 + 下方实时预览（参考 Mermaid Block 交互）
 *
 * 事件处理：
 * - 双击公式：进入编辑模式
 * - 点击编辑按钮：进入编辑模式
 * - 焦点离开 / 点击预览按钮：退出编辑模式
 * - Esc：取消编辑
 * - 输入代码：防抖实时渲染下方预览
 */

import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView, ViewMutationRecord } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { renderBlockMath } from '../math-inline/renderer';
import { createToolbar, updateToolbarState, type ToolbarCallbacks } from './toolbar';
import { CSS_PREFIX, ICONS, RENDER_DEBOUNCE_MS, type MathBlockState } from './types';

// ---------------------------------------------------------------------------
// MathBlockNodeView
// ---------------------------------------------------------------------------

export class MathBlockNodeView implements NodeView {
  /** 外层容器 DOM */
  dom: HTMLElement;

  /** ProseMirror 内容 DOM（代码编辑区） */
  contentDOM: HTMLElement | undefined;

  /** 当前状态 */
  private state: MathBlockState = 'preview';

  /** 工具栏 DOM */
  private toolbar: HTMLElement;

  /** 预览容器 */
  private previewContainer: HTMLElement;

  /** 编辑容器 */
  private editorContainer: HTMLElement;

  /** 编辑模式下的实时预览区域 */
  private livePreview: HTMLElement;

  /** 上次成功渲染的 HTML */
  private lastSuccessfulHtml: string | null = null;

  /** 上次成功渲染时的代码 */
  private lastSuccessfulCode: string | null = null;

  /** 防抖计时器 */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** 状态切换保护 */
  private switchingState = false;

  /** ProseMirror EditorView */
  private view: EditorView;

  /** 获取节点位置 */
  private getPos: () => number | undefined;

  /** 当前节点 */
  private node: Node;

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    // 创建外层容器
    this.dom = document.createElement('div');
    this.dom.className = `${CSS_PREFIX} is-preview`;
    this.dom.setAttribute('data-type', 'math-block');

    // 创建工具栏
    const callbacks: ToolbarCallbacks = {
      onToggleEdit: () => this.toggleEdit(),
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
    editorHeader.textContent = 'LaTeX';
    this.editorContainer.appendChild(editorHeader);

    // ProseMirror 内容区（代码编辑）
    const codeWrapper = document.createElement('div');
    codeWrapper.className = `${CSS_PREFIX}-code-wrapper`;

    this.contentDOM = document.createElement('pre');
    this.contentDOM.className = `${CSS_PREFIX}-code`;
    this.contentDOM.setAttribute('spellcheck', 'false');
    codeWrapper.appendChild(this.contentDOM);

    this.editorContainer.appendChild(codeWrapper);

    // 实时预览区域
    this.livePreview = document.createElement('div');
    this.livePreview.className = `${CSS_PREFIX}-live-preview`;
    this.editorContainer.appendChild(this.livePreview);

    this.dom.appendChild(this.editorContainer);

    // 事件绑定
    this.bindEvents();

    // 初始渲染
    this.renderToPreview(this.getCode());

    // 自动进入编辑模式（通过斜杠菜单或 $$ + Enter 创建时触发）
    if (node.attrs.autoEdit) {
      // 清除 autoEdit 标记，避免文档重新加载时再次触发
      requestAnimationFrame(() => {
        const pos = this.getPos();
        if (pos !== undefined) {
          try {
            const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
              ...this.node.attrs,
              autoEdit: false,
            });
            this.view.dispatch(tr);
          } catch {
            // 忽略清除标记失败
          }
        }
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

    // hover 显示/隐藏工具栏
    this.dom.addEventListener('mouseenter', () => {
      this.toolbar.classList.add('is-visible');
    });
    this.dom.addEventListener('mouseleave', () => {
      if (this.state === 'preview') {
        this.toolbar.classList.remove('is-visible');
      }
    });

    // Esc 取消编辑
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

    this.switchingState = true;
    this.state = 'editing';

    this.dom.classList.remove('is-preview');
    this.dom.classList.add('is-editing');

    this.previewContainer.style.display = 'none';
    this.editorContainer.style.display = '';

    this.toolbar.classList.add('is-visible');
    updateToolbarState(this.toolbar, 'editing');

    // 初始化实时预览
    const code = this.getCode();
    this.updateLivePreview(code);

    // 聚焦到代码编辑区域
    requestAnimationFrame(() => {
      this.switchingState = false;

      if (this.contentDOM) {
        const pos = this.getPos();
        if (pos !== undefined) {
          try {
            const resolvedPos = this.view.state.doc.resolve(pos + 1);
            const selection = TextSelection.near(resolvedPos);
            this.view.dispatch(this.view.state.tr.setSelection(selection));
            this.view.focus();
            return;
          } catch (err) {
            console.warn('[MathBlock] enterEdit: PM focus failed, fallback', err);
          }
        }
        this.contentDOM.focus();
      }
    });
  }

  /** 退出编辑模式 */
  private exitEdit(): void {
    if (this.state === 'preview') return;

    const code = this.getCode();
    this.state = 'preview';
    this.dom.classList.remove('is-editing');
    this.dom.classList.add('is-preview');

    this.previewContainer.style.display = '';
    this.editorContainer.style.display = 'none';

    this.toolbar.classList.remove('is-visible');
    updateToolbarState(this.toolbar, 'preview');

    this.renderToPreview(code);
  }

  /** 取消编辑（Esc） */
  private cancelEdit(): void {
    this.state = 'preview';
    this.dom.classList.remove('is-editing');
    this.dom.classList.add('is-preview');

    this.previewContainer.style.display = '';
    this.editorContainer.style.display = 'none';

    // 恢复上次成功的渲染
    if (this.lastSuccessfulHtml) {
      this.previewContainer.innerHTML = this.lastSuccessfulHtml;
    }

    // 恢复节点内容
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

    this.toolbar.classList.remove('is-visible');
    updateToolbarState(this.toolbar, 'preview');
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
  // 渲染
  // -------------------------------------------------------------------------

  /** 获取当前代码内容 */
  private getCode(): string {
    return this.node.textContent || '';
  }

  /** 渲染到预览容器 */
  private renderToPreview(code: string): void {
    if (!code.trim()) {
      this.showEmptyState();
      return;
    }

    const result = renderBlockMath(code);
    this.previewContainer.innerHTML = result.html;
    if (result.error) {
      this.previewContainer.classList.add('has-error');
    } else {
      this.previewContainer.classList.remove('has-error');
      this.lastSuccessfulHtml = result.html;
      this.lastSuccessfulCode = code;
    }
  }

  /** 更新实时预览 */
  private updateLivePreview(code: string): void {
    if (!code.trim()) {
      this.livePreview.innerHTML = `<div class="${CSS_PREFIX}-empty">输入 LaTeX 公式...</div>`;
      return;
    }

    const result = renderBlockMath(code);
    this.livePreview.innerHTML = result.html;
    if (result.error) {
      this.livePreview.innerHTML = `<div class="${CSS_PREFIX}-error-msg">${ICONS.error} <span>${result.error}</span></div>`;
      this.livePreview.classList.add('has-error');
    } else {
      this.livePreview.classList.remove('has-error');
      this.lastSuccessfulHtml = result.html;
      this.lastSuccessfulCode = code;
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
    this.previewContainer.innerHTML = `<div class="${CSS_PREFIX}-empty">双击编辑数学公式</div>`;
  }

  // -------------------------------------------------------------------------
  // ProseMirror NodeView 接口
  // -------------------------------------------------------------------------

  /** 节点内容更新 */
  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;

    if (this.state === 'editing') {
      const code = node.textContent || '';
      this.debouncedUpdateLivePreview(code);
    }

    return true;
  }

  /** 选中节点 */
  selectNode(): void {
    this.dom.classList.add('is-selected');
  }

  /** 取消选中 */
  deselectNode(): void {
    this.dom.classList.remove('is-selected');
    if (this.state === 'editing' && !this.switchingState) {
      this.exitEdit();
    }
  }

  /** 控制事件处理 */
  stopEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null;

    // 工具栏事件
    if (target && this.toolbar.contains(target)) {
      return true;
    }

    // 状态切换保护
    if (this.switchingState) {
      return true;
    }

    // 编辑模式
    if (this.state === 'editing') {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        return true;
      }
      return false;
    }

    // 预览模式：拦截鼠标事件
    if (event.type === 'mousedown') {
      return true;
    }

    return false;
  }

  /** 忽略 DOM 变更 */
  ignoreMutation(record: ViewMutationRecord): boolean {
    if (record.type === 'selection') {
      return false;
    }
    if (this.contentDOM && this.contentDOM.contains(record.target)) {
      return false;
    }
    return true;
  }

  /** 销毁 */
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }
}

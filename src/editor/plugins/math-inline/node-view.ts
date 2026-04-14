/**
 * Math Inline - NodeView（atom: true 架构）
 *
 * 内联数学公式的自定义 NodeView，实现 Typora 风格的编辑交互：
 * - 预览态：显示 KaTeX 渲染后的公式
 * - 编辑态：显示 $ 定界符 + <input> 输入框 + 下方实时预览气泡
 * - 点击公式进入编辑态
 * - 光标离开自动退出编辑态（通过 deselectNode + selection plugin 兜底）
 * - 退出编辑时空公式自动删除
 *
 * 关键架构：
 * - atom: true，无 contentDOM，NodeView 自己用 <input> 管理编辑
 * - 通过 setNodeMarkup 更新 attrs.value 同步到 ProseMirror 文档
 * - selectNode/deselectNode 被正确调用以进入/退出编辑态
 */

import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { TextSelection, NodeSelection } from '@milkdown/kit/prose/state';
import { renderInlineMath } from './renderer';
import { CSS_PREFIX, RENDER_DEBOUNCE_MS } from './types';

export class MathInlineNodeView implements NodeView {
  /** 外层容器 DOM（inline 元素） */
  dom: HTMLElement;

  /** 明确无 contentDOM —— atom: true 架构 */
  contentDOM: undefined;

  /** LaTeX 源码编辑 input 元素 */
  private inputEl: HTMLInputElement;

  /** 渲染后的公式容器（预览态） */
  private renderContainer: HTMLElement;

  /** 编辑态容器（包含 input + 预览气泡） */
  private editContainer: HTMLElement;

  /** 编辑态下的实时预览气泡 */
  private previewBubble: HTMLElement;

  /** 当前是否处于编辑态 */
  editing = false;

  /** 防抖计时器 */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

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

    // 创建外层 inline 容器
    this.dom = document.createElement('span');
    this.dom.className = CSS_PREFIX;
    this.dom.setAttribute('data-type', 'math-inline');

    // 将 NodeView 实例挂载到 DOM 上，供 selection-plugin 查找
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.dom as any)._mathInlineView = this;

    // 创建渲染容器（预览态）
    this.renderContainer = document.createElement('span');
    this.renderContainer.className = `${CSS_PREFIX}-render`;
    this.dom.appendChild(this.renderContainer);

    // 创建编辑容器
    this.editContainer = document.createElement('span');
    this.editContainer.className = `${CSS_PREFIX}-edit`;
    this.editContainer.style.display = 'none';

    // 左定界符 $
    const leftDelim = document.createElement('span');
    leftDelim.className = `${CSS_PREFIX}-delimiter`;
    leftDelim.textContent = '$';
    this.editContainer.appendChild(leftDelim);

    // <input> 编辑区 —— 替代原来的 contentDOM
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = `${CSS_PREFIX}-input`;
    this.inputEl.spellcheck = false;
    this.inputEl.value = node.attrs.value;
    this.inputEl.placeholder = 'LaTeX';
    this.editContainer.appendChild(this.inputEl);

    // 右定界符 $
    const rightDelim = document.createElement('span');
    rightDelim.className = `${CSS_PREFIX}-delimiter`;
    rightDelim.textContent = '$';
    this.editContainer.appendChild(rightDelim);

    // 实时预览气泡
    this.previewBubble = document.createElement('span');
    this.previewBubble.className = `${CSS_PREFIX}-preview-bubble`;
    this.editContainer.appendChild(this.previewBubble);

    this.dom.appendChild(this.editContainer);

    // 事件绑定
    this.bindEvents();

    // 初始渲染
    this.renderPreview();
  }

  // -------------------------------------------------------------------------
  // 事件绑定
  // -------------------------------------------------------------------------

  private bindEvents(): void {
    // 点击预览区域进入编辑
    this.renderContainer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.enterEditViaClick();
    });

    // 监听 input 事件，同步值到 ProseMirror
    this.inputEl.addEventListener('input', () => this.onInputChange());

    // 监听键盘事件
    this.inputEl.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  // -------------------------------------------------------------------------
  // 输入处理
  // -------------------------------------------------------------------------

  /** 输入变化时同步到 ProseMirror 文档 */
  private onInputChange(): void {
    const pos = this.getPos();
    if (pos === undefined) return;

    const value = this.inputEl.value;

    // 通过 setNodeMarkup 更新 attrs.value，同时恢复 NodeSelection
    // 关键：setNodeMarkup 会导致 selection 变为 TextSelection，
    // 必须将其重新设为 NodeSelection，否则 selection-plugin 会误判光标离开节点
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
      ...this.node.attrs,
      value,
    });
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    this.view.dispatch(tr);

    // 调整 input 宽度
    this.adjustInputWidth();

    // 更新预览气泡（防抖）
    this.debouncedUpdatePreview();
  }

  /** 键盘事件处理 */
  private onKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.exitEdit();
        this.moveCursorAfterNode();
        break;

      case 'ArrowRight':
        // 光标在 input 末尾时，移到节点后方
        if (
          this.inputEl.selectionStart === this.inputEl.value.length &&
          this.inputEl.selectionEnd === this.inputEl.value.length
        ) {
          e.preventDefault();
          this.exitEdit();
          this.moveCursorAfterNode();
        }
        break;

      case 'ArrowLeft':
        // 光标在 input 开头时，移到节点前方
        if (this.inputEl.selectionStart === 0 && this.inputEl.selectionEnd === 0) {
          e.preventDefault();
          this.exitEdit();
          this.moveCursorBeforeNode();
        }
        break;

      case 'Enter':
        // Enter 退出编辑，等同于 Esc
        e.preventDefault();
        this.exitEdit();
        this.moveCursorAfterNode();
        break;

      case 'Backspace':
        // input 为空时按 Backspace，保持编辑态（不删除、不退出）
        // 用户需要通过 Esc/方向键/Enter 主动退出编辑，退出时空公式自动删除
        if (this.inputEl.value === '') {
          e.preventDefault();
        }
        break;

      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // 状态切换
  // -------------------------------------------------------------------------

  /** 进入编辑模式 */
  enterEdit(): void {
    if (this.editing) return;
    this.editing = true;
    this.dom.classList.add('is-editing');

    // 隐藏渲染，显示编辑
    this.renderContainer.style.display = 'none';
    this.editContainer.style.display = '';

    // 同步值到 input
    this.inputEl.value = this.node.attrs.value;
    this.adjustInputWidth();
    this.updatePreviewBubble();

    // 聚焦 input，光标放到末尾
    requestAnimationFrame(() => {
      this.inputEl.focus();
      this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
    });
  }

  /** 通过点击进入编辑模式（需要手动设置 NodeSelection） */
  private enterEditViaClick(): void {
    const pos = this.getPos();
    if (pos === undefined) return;

    // 设置 NodeSelection 触发 selectNode
    const { tr } = this.view.state;
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    this.view.dispatch(tr);
    this.view.focus();
  }

  /** 退出编辑模式 */
  exitEdit(): void {
    if (!this.editing) return;
    this.editing = false;
    this.dom.classList.remove('is-editing');

    // 显示渲染，隐藏编辑
    this.renderContainer.style.display = '';
    this.editContainer.style.display = 'none';

    // 重新渲染预览
    this.renderPreview();

    // 空公式自动删除
    if (!this.node.attrs.value.trim()) {
      this.deleteNode();
    }
  }

  /** 删除当前节点 */
  private deleteNode(): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    const tr = this.view.state.tr.delete(pos, pos + this.node.nodeSize);
    this.view.dispatch(tr);
  }

  /** 将光标移到节点后方 */
  private moveCursorAfterNode(): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    const afterPos = pos + this.node.nodeSize;
    try {
      const $pos = this.view.state.doc.resolve(afterPos);
      const sel = TextSelection.near($pos, 1);
      this.view.dispatch(this.view.state.tr.setSelection(sel));
      this.view.focus();
    } catch {
      // 忽略
    }
  }

  /** 将光标移到节点前方 */
  private moveCursorBeforeNode(): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    try {
      const $pos = this.view.state.doc.resolve(pos);
      const sel = TextSelection.near($pos, -1);
      this.view.dispatch(this.view.state.tr.setSelection(sel));
      this.view.focus();
    } catch {
      // 忽略
    }
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  /** 渲染到预览容器 */
  private renderPreview(): void {
    const latex = this.node.attrs.value || '';
    if (!latex.trim()) {
      // 空公式不需要显示占位符 —— 退出编辑时会自动删除
      this.renderContainer.innerHTML = '';
      return;
    }

    const result = renderInlineMath(latex);
    this.renderContainer.innerHTML = result.html;
    if (result.error) {
      this.renderContainer.classList.add('has-error');
    } else {
      this.renderContainer.classList.remove('has-error');
    }
  }

  /** 更新实时预览气泡 */
  private updatePreviewBubble(): void {
    const latex = this.node.attrs.value || '';
    if (!latex.trim()) {
      this.previewBubble.innerHTML = '';
      this.previewBubble.style.display = 'none';
      return;
    }

    const result = renderInlineMath(latex);
    this.previewBubble.innerHTML = result.html;
    this.previewBubble.style.display = '';
  }

  /** 防抖更新预览气泡 */
  private debouncedUpdatePreview(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.updatePreviewBubble();
    }, RENDER_DEBOUNCE_MS);
  }

  /** 调整 input 宽度以适应内容 */
  private adjustInputWidth(): void {
    const len = this.inputEl.value.length || this.inputEl.placeholder.length || 1;
    // 使用 ch 单位：1ch = 当前字体中 '0' 的宽度，对等宽字体非常精确
    // +1 留出光标余量
    this.inputEl.style.width = `${len}ch`;
  }

  // -------------------------------------------------------------------------
  // ProseMirror NodeView 接口
  // -------------------------------------------------------------------------

  /** 节点更新 */
  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;

    if (this.editing) {
      // 避免循环更新：只有值不同时才更新 input
      if (this.inputEl.value !== node.attrs.value) {
        this.inputEl.value = node.attrs.value;
        this.adjustInputWidth();
      }
      this.debouncedUpdatePreview();
    } else {
      this.renderPreview();
    }

    return true;
  }

  /** 选中节点（atom:true 时会被调用） */
  selectNode(): void {
    this.dom.classList.add('is-selected');
    this.enterEdit();
  }

  /** 取消选中（atom:true 时会被调用） */
  deselectNode(): void {
    this.dom.classList.remove('is-selected');
    this.exitEdit();
  }

  /** 拦截事件 —— 编辑态下拦截键盘和输入事件，由 input 自己处理 */
  stopEvent(event: Event): boolean {
    if (this.editing) {
      if (event instanceof KeyboardEvent || event instanceof InputEvent) {
        return true;
      }
    }
    // 预览态拦截鼠标事件（由 click handler 处理进入编辑）
    if (event.type === 'mousedown') {
      return true;
    }
    return false;
  }

  /** 忽略 DOM 变更 —— atom:true，所有 DOM 变更由我们自己管理 */
  ignoreMutation(): boolean {
    return true;
  }

  /** 销毁 */
  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    // 清理 DOM 上的引用
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.dom as any)._mathInlineView = null;
  }
}

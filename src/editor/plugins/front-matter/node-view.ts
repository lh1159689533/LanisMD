/**
 * Front Matter - NodeView 核心
 *
 * ProseMirror 自定义 NodeView，管理 YAML Front Matter 的折叠/展开和编辑状态：
 * - 折叠状态：显示一行提示 "--- Front Matter ---"，点击可展开
 * - 展开状态：显示 YAML 源码编辑区，可直接编辑
 *
 * 事件处理：
 * - 单击折叠栏：展开/折叠
 * - 双击展开区域：聚焦编辑
 * - Esc：折叠
 */

import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView, ViewMutationRecord } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { CSS_PREFIX, ICONS, type FrontMatterState } from './types';

// ---------------------------------------------------------------------------
// FrontMatterNodeView
// ---------------------------------------------------------------------------

export class FrontMatterNodeView implements NodeView {
  /** 外层容器 DOM */
  dom: HTMLElement;

  /** ProseMirror 内容 DOM（代码编辑区） */
  contentDOM: HTMLElement | undefined;

  /** 当前状态 */
  private state: FrontMatterState;

  /** 折叠时的标题栏 */
  private headerBar: HTMLElement;

  /** 展开时的编辑容器 */
  private editorContainer: HTMLElement;

  /** 操作按钮区域 */
  private actions: HTMLElement;

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
    this.state = node.attrs.collapsed ? 'collapsed' : 'expanded';

    // 创建外层容器
    this.dom = document.createElement('div');
    this.dom.className = `${CSS_PREFIX}`;
    this.dom.setAttribute('data-type', 'front-matter');
    if (this.state === 'collapsed') {
      this.dom.classList.add('is-collapsed');
    } else {
      this.dom.classList.add('is-expanded');
    }

    // 创建标题栏（始终显示）
    this.headerBar = document.createElement('div');
    this.headerBar.className = `${CSS_PREFIX}-header`;
    this.headerBar.innerHTML = this.buildHeaderHtml();
    this.dom.appendChild(this.headerBar);

    // 创建操作按钮区域
    this.actions = document.createElement('div');
    this.actions.className = `${CSS_PREFIX}-actions`;
    this.actions.innerHTML = this.buildActionsHtml();
    this.headerBar.appendChild(this.actions);

    // 创建编辑容器
    this.editorContainer = document.createElement('div');
    this.editorContainer.className = `${CSS_PREFIX}-editor`;
    if (this.state === 'collapsed') {
      this.editorContainer.style.display = 'none';
    }

    // ProseMirror 内容区（YAML 代码编辑）
    this.contentDOM = document.createElement('pre');
    this.contentDOM.className = `${CSS_PREFIX}-code`;
    this.contentDOM.setAttribute('spellcheck', 'false');
    this.editorContainer.appendChild(this.contentDOM);

    this.dom.appendChild(this.editorContainer);

    // 事件绑定
    this.bindEvents();
  }

  // -------------------------------------------------------------------------
  // DOM 构建
  // -------------------------------------------------------------------------

  /** 构建标题栏 HTML */
  private buildHeaderHtml(): string {
    const icon = this.state === 'collapsed' ? ICONS.collapse : ICONS.expand;
    return `<span class="${CSS_PREFIX}-header-icon">${icon}</span><span class="${CSS_PREFIX}-header-label">Front Matter</span>`;
  }

  /** 构建操作按钮 HTML */
  private buildActionsHtml(): string {
    return `<button class="${CSS_PREFIX}-action-btn ${CSS_PREFIX}-action-delete" type="button" title="删除 Front Matter"><span class="${CSS_PREFIX}-action-icon">${ICONS.delete}</span></button>`;
  }

  // -------------------------------------------------------------------------
  // 事件绑定
  // -------------------------------------------------------------------------

  private bindEvents(): void {
    // 点击标题栏切换折叠/展开
    this.headerBar.addEventListener('mousedown', (e) => {
      // 如果点击的是操作按钮，不切换
      if ((e.target as HTMLElement).closest(`.${CSS_PREFIX}-action-btn`)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.toggleCollapse();
    });

    // 删除按钮
    this.actions.addEventListener('mousedown', (e) => {
      const btn = (e.target as HTMLElement).closest(`.${CSS_PREFIX}-action-delete`);
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        this.deleteBlock();
      }
    });

    // Esc 折叠
    this.dom.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state === 'expanded') {
        e.preventDefault();
        e.stopPropagation();
        this.collapse();
      }
    });
  }

  // -------------------------------------------------------------------------
  // 状态切换
  // -------------------------------------------------------------------------

  /** 切换折叠/展开 */
  private toggleCollapse(): void {
    if (this.state === 'collapsed') {
      this.expand();
    } else {
      this.collapse();
    }
  }

  /** 折叠 */
  private collapse(): void {
    if (this.state === 'collapsed') return;

    this.switchingState = true;
    this.state = 'collapsed';

    this.dom.classList.remove('is-expanded');
    this.dom.classList.add('is-collapsed');

    this.editorContainer.style.display = 'none';

    // 更新标题栏图标
    this.updateHeaderIcon();

    // 更新节点属性
    this.updateCollapsedAttr(true);

    requestAnimationFrame(() => {
      this.switchingState = false;
    });
  }

  /** 展开 */
  private expand(): void {
    if (this.state === 'expanded') return;

    this.switchingState = true;
    this.state = 'expanded';

    this.dom.classList.remove('is-collapsed');
    this.dom.classList.add('is-expanded');

    this.editorContainer.style.display = '';

    // 更新标题栏图标
    this.updateHeaderIcon();

    // 更新节点属性
    this.updateCollapsedAttr(false);

    // 聚焦到编辑区域
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
            console.warn('[FrontMatter] expand: PM focus failed, fallback', err);
          }
        }
        this.contentDOM.focus();
      }
    });
  }

  /** 更新标题栏图标 */
  private updateHeaderIcon(): void {
    const iconEl = this.headerBar.querySelector(`.${CSS_PREFIX}-header-icon`);
    if (iconEl) {
      iconEl.innerHTML = this.state === 'collapsed' ? ICONS.collapse : ICONS.expand;
    }
  }

  /** 更新节点的 collapsed 属性 */
  private updateCollapsedAttr(collapsed: boolean): void {
    const pos = this.getPos();
    if (pos === undefined) return;

    try {
      const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...this.node.attrs,
        collapsed,
      });
      this.view.dispatch(tr);
    } catch {
      // 忽略更新失败
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
  // ProseMirror NodeView 接口
  // -------------------------------------------------------------------------

  /** 节点内容更新 */
  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    return true;
  }

  /** 选中节点 */
  selectNode(): void {
    this.dom.classList.add('is-selected');
  }

  /** 取消选中 */
  deselectNode(): void {
    this.dom.classList.remove('is-selected');
  }

  /** 控制事件处理 */
  stopEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null;

    // 标题栏和操作按钮的事件由我们自己处理
    if (target && (this.headerBar.contains(target) || this.actions.contains(target))) {
      return true;
    }

    // 状态切换保护
    if (this.switchingState) {
      return true;
    }

    // 展开状态下，编辑区的键盘事件
    if (this.state === 'expanded') {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        return true;
      }
      // 其他事件交给 ProseMirror（支持代码编辑）
      return false;
    }

    // 折叠状态：拦截鼠标事件
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
    // 无需特殊清理
  }
}

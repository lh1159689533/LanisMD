/**
 * TOC Block - NodeView 核心
 *
 * ProseMirror 自定义 NodeView，渲染只读的文档目录列表：
 * - 从 ProseMirror 文档中实时提取 heading 节点
 * - 渲染为嵌套的目录列表
 * - 点击目录项平滑跳转到对应标题
 * - atom 节点，不可编辑内容，只能整体选中/删除
 *
 * 更新机制：
 * - 维护一个全局的活跃实例集合
 * - tocUpdatePlugin 监听文档变化后调用 refreshAll() 通知所有实例刷新
 * - 避免通过 dispatch 触发更新导致的无限循环问题
 */

import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import { CSS_PREFIX, ICONS } from './types';

// ---------------------------------------------------------------------------
// 内部类型
// ---------------------------------------------------------------------------

/** 扁平化的标题信息 */
interface FlatHeading {
  level: number;
  text: string;
  index: number;
}

/** 折叠状态 CSS 类名 */
const COLLAPSED_CLASS = `${CSS_PREFIX}-collapsed`;

// ---------------------------------------------------------------------------
// 全局实例管理
// ---------------------------------------------------------------------------

/** 所有活跃的 TocNodeView 实例 */
const activeInstances = new Set<TocNodeView>();

/**
 * 刷新所有活跃的 TOC NodeView 实例
 * 由 tocUpdatePlugin 在文档变化时调用
 */
export function refreshAllTocViews(): void {
  for (const instance of activeInstances) {
    instance.renderToc();
  }
}

// ---------------------------------------------------------------------------
// TocNodeView
// ---------------------------------------------------------------------------

export class TocNodeView implements NodeView {
  /** 外层容器 DOM */
  dom: HTMLElement;

  /** atom 节点不需要 contentDOM */
  contentDOM: undefined;

  /** ProseMirror EditorView */
  private view: EditorView;

  /** 获取节点位置 */
  private getPos: () => number | undefined;

  /** 当前节点 */
  private node: Node;

  /** 标题栏 DOM */
  private headerBar: HTMLElement;

  /** 操作按钮区域 */
  private actions: HTMLElement;

  /** 目录列表容器 */
  private tocList: HTMLElement;

  /** 是否处于折叠状态 */
  private collapsed = false;

  /** 上次渲染的 headings JSON（用于判断是否需要更新） */
  private lastHeadingsJson = '';

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    // 注册到全局实例集合
    activeInstances.add(this);

    // 创建外层容器
    this.dom = document.createElement('div');
    this.dom.className = CSS_PREFIX;
    this.dom.setAttribute('data-type', 'toc-block');
    this.dom.setAttribute('contenteditable', 'false');

    // 创建标题栏
    this.headerBar = document.createElement('div');
    this.headerBar.className = `${CSS_PREFIX}-header ${CSS_PREFIX}-header-clickable`;
    this.headerBar.innerHTML = `<span class="${CSS_PREFIX}-header-icon">${ICONS.toc}</span><span class="${CSS_PREFIX}-header-label">Table of Contents</span>`;

    // 创建操作按钮区域
    this.actions = document.createElement('div');
    this.actions.className = `${CSS_PREFIX}-actions`;
    this.actions.innerHTML = `<button class="${CSS_PREFIX}-action-btn ${CSS_PREFIX}-action-delete" type="button" title="删除目录"><span class="${CSS_PREFIX}-action-icon">${ICONS.delete}</span></button>`;
    this.headerBar.appendChild(this.actions);

    this.dom.appendChild(this.headerBar);

    // 创建目录列表容器
    this.tocList = document.createElement('div');
    this.tocList.className = `${CSS_PREFIX}-list`;
    this.dom.appendChild(this.tocList);

    // 绑定事件
    this.bindEvents();

    // 初始渲染
    this.renderToc();
  }

  // -------------------------------------------------------------------------
  // 事件绑定
  // -------------------------------------------------------------------------

  private bindEvents(): void {
    // 标题栏点击：折叠/展开目录列表
    this.headerBar.addEventListener('mousedown', (e) => {
      // 如果点击的是删除按钮区域，不触发折叠
      const btn = (e.target as HTMLElement).closest(`.${CSS_PREFIX}-action-btn`);
      if (btn) return;

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

    // 目录项点击跳转
    this.tocList.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const tocItem = target.closest(`.${CSS_PREFIX}-item`) as HTMLElement | null;
      if (!tocItem) return;

      e.preventDefault();
      e.stopPropagation();

      const headingIndex = tocItem.dataset.headingIndex;
      if (headingIndex != null) {
        this.scrollToHeading(Number(headingIndex));
      }
    });
  }

  // -------------------------------------------------------------------------
  // 目录渲染
  // -------------------------------------------------------------------------

  /** 从文档中提取所有 heading 节点 */
  private extractHeadings(): FlatHeading[] {
    const headings: FlatHeading[] = [];
    let headingIndex = 0;

    this.view.state.doc.descendants((node) => {
      if (node.type.name === 'heading') {
        const level = node.attrs.level as number;
        const text = node.textContent.trim();
        if (text) {
          headings.push({ level, text, index: headingIndex });
          headingIndex++;
        }
      }
    });

    return headings;
  }

  /** 渲染目录列表（公开方法，供 refreshAllTocViews 调用） */
  renderToc(): void {
    const headings = this.extractHeadings();
    const json = JSON.stringify(headings);

    // 未变化则跳过
    if (json === this.lastHeadingsJson) return;
    this.lastHeadingsJson = json;

    if (headings.length === 0) {
      this.tocList.innerHTML = `<div class="${CSS_PREFIX}-empty">暂无标题</div>`;
      return;
    }

    // 计算最小层级，用于缩进归一化
    const minLevel = Math.min(...headings.map((h) => h.level));

    const fragment = document.createDocumentFragment();

    for (const heading of headings) {
      const item = document.createElement('div');
      item.className = `${CSS_PREFIX}-item`;
      item.dataset.headingIndex = String(heading.index);
      item.dataset.level = String(heading.level);

      // 缩进：相对于最小层级
      const indent = heading.level - minLevel;
      item.style.paddingLeft = `${indent * 20 + 12}px`;

      // 层级标记圆点
      const dot = document.createElement('span');
      dot.className = `${CSS_PREFIX}-item-dot`;
      item.appendChild(dot);

      // 标题文本
      const text = document.createElement('span');
      text.className = `${CSS_PREFIX}-item-text`;
      text.textContent = heading.text;
      item.appendChild(text);

      fragment.appendChild(item);
    }

    this.tocList.innerHTML = '';
    this.tocList.appendChild(fragment);
  }

  // -------------------------------------------------------------------------
  // 折叠/展开
  // -------------------------------------------------------------------------

  /** 切换折叠/展开状态 */
  private toggleCollapse(): void {
    this.collapsed = !this.collapsed;

    if (this.collapsed) {
      // 折叠：先设置当前高度，然后过渡到 0
      const currentHeight = this.tocList.scrollHeight;
      this.tocList.style.height = `${currentHeight}px`;
      // 强制重排，确保浏览器记录初始高度
      this.tocList.offsetHeight; // eslint-disable-line @typescript-eslint/no-unused-expressions
      this.tocList.style.height = '0';
      this.dom.classList.add(COLLAPSED_CLASS);
    } else {
      // 展开：从 0 过渡到实际高度
      const targetHeight = this.tocList.scrollHeight;
      this.tocList.style.height = `${targetHeight}px`;
      this.dom.classList.remove(COLLAPSED_CLASS);

      // 动画结束后移除固定高度，让内容自适应
      const onEnd = () => {
        this.tocList.style.height = '';
        this.tocList.removeEventListener('transitionend', onEnd);
      };
      this.tocList.addEventListener('transitionend', onEnd);
    }
  }

  // -------------------------------------------------------------------------
  // 跳转
  // -------------------------------------------------------------------------

  /** 滚动到指定索引的标题 */
  private scrollToHeading(index: number): void {
    const editorRoot = this.view.dom;
    if (!editorRoot) return;

    const headings = editorRoot.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const target = headings[index];

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  /** 节点更新时重新渲染目录 */
  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.renderToc();
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

  /**
   * 控制事件处理
   * atom 节点拦截大部分事件，只有删除按钮和目录项点击由我们自己处理
   */
  stopEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null;

    // 操作按钮的事件由我们自己处理
    if (target && (this.headerBar.contains(target) || this.actions.contains(target))) {
      return true;
    }

    // 目录列表内的点击事件由我们处理
    if (target && this.tocList.contains(target) && event.type === 'click') {
      return true;
    }

    // 拦截鼠标事件防止进入节点内部编辑
    if (event.type === 'mousedown') {
      return true;
    }

    return false;
  }

  /** 忽略所有 DOM 变更（atom 节点由我们自己管理 DOM） */
  ignoreMutation(): boolean {
    return true;
  }

  /** 销毁 */
  destroy(): void {
    // 从全局实例集合中移除
    activeInstances.delete(this);
  }
}

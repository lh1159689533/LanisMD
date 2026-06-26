/**
 * Code Block Lazy Loading NodeView
 *
 * 解决代码块 CodeMirror 实例同步创建导致文档切换卡顿的性能问题。
 *
 * 策略：
 * - 初始渲染时不创建 CodeMirror 实例，只用纯 <pre><code> 显示代码文本
 * - 当代码块进入视口（IntersectionObserver）或被用户点击时，才创建真正的 CodeMirror NodeView
 * - 升级为完整 NodeView 后，完全委托给原始 codeBlockView 工厂函数
 *
 * 性能收益：
 * - 24 个代码块 × ~75ms/个 = ~1800ms → 仅视口内 2-3 个 × ~75ms = ~225ms
 * - updateState 耗时从 ~1800ms 降至 ~200-300ms
 */

import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { NodeView, Decoration } from '@milkdown/kit/prose/view';
import { wrapWithFold } from './code-block-fold';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 原始 NodeView 工厂函数类型 */
type NodeViewFactory = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
  decorations: readonly Decoration[],
  innerDecorations: any,
) => NodeView;

// ---------------------------------------------------------------------------
// 全局 IntersectionObserver（所有懒加载代码块共享）
// ---------------------------------------------------------------------------

/** 存储观察目标到升级回调的映射 */
const observerCallbacks = new Map<Element, () => void>();

/** 全局共享的 IntersectionObserver 实例 */
let sharedObserver: IntersectionObserver | null = null;

/**
 * 获取（或创建）全局共享的 IntersectionObserver
 * rootMargin 设为 200px，提前 200px 开始加载，确保滚动流畅
 */
function getSharedObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const callback = observerCallbacks.get(entry.target);
            if (callback) {
              // 先取消观察，再执行回调（避免重复触发）
              sharedObserver!.unobserve(entry.target);
              observerCallbacks.delete(entry.target);
              callback();
            }
          }
        }
      },
      {
        // 提前 200px 加载，让用户滚动时感知不到延迟
        rootMargin: '200px 0px',
      },
    );
  }
  return sharedObserver;
}

// ---------------------------------------------------------------------------
// Lazy Code Block NodeView
// ---------------------------------------------------------------------------

/**
 * 创建懒加载代码块 NodeView
 *
 * @param node 代码块节点
 * @param view ProseMirror EditorView
 * @param getPos 获取节点位置的函数
 * @param decorations 装饰集
 * @param innerDecorations 内部装饰
 * @param originalFactory 原始的 codeBlockView 工厂函数（CodeMirror 版本）
 * @returns NodeView
 */
export function createLazyCodeBlockNodeView(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
  decorations: readonly Decoration[],
  innerDecorations: any,
  originalFactory: NodeViewFactory,
): NodeView {
  // ---------------------------------------------------------------------------
  // 状态
  // ---------------------------------------------------------------------------

  let isUpgraded = false;
  let upgradedNodeView: NodeView | null = null;
  let currentNode = node;
  let currentDecorations = decorations;
  let currentInnerDecorations = innerDecorations;

  // ---------------------------------------------------------------------------
  // 构建占位 DOM
  // ---------------------------------------------------------------------------

  // 外层容器（模拟 Milkdown code-block 的 DOM 结构）
  const container = document.createElement('div');
  container.className = 'code-block-lazy-placeholder';
  container.setAttribute('data-language', node.attrs.language || '');

  // 工具栏（简化版，保持视觉一致性）
  const toolbar = document.createElement('div');
  toolbar.className = 'tools';

  const langLabel = document.createElement('span');
  langLabel.className = 'language-label';
  langLabel.textContent = node.attrs.language || 'text';
  toolbar.appendChild(langLabel);

  // 代码内容区域
  const preElement = document.createElement('pre');
  preElement.className = 'code-block-lazy-pre';

  const codeElement = document.createElement('code');
  codeElement.textContent = node.textContent || '';
  preElement.appendChild(codeElement);

  container.appendChild(toolbar);
  container.appendChild(preElement);

  // ---------------------------------------------------------------------------
  // 升级逻辑：创建真正的 CodeMirror NodeView
  // ---------------------------------------------------------------------------

  function upgrade(): void {
    if (isUpgraded) return;
    isUpgraded = true;

    // 取消 IntersectionObserver 监听
    const observer = getSharedObserver();
    observer.unobserve(container);
    observerCallbacks.delete(container);

    // 调用原始工厂创建完整的 CodeMirror NodeView
    const fullNodeView = originalFactory(
      currentNode,
      view,
      getPos,
      currentDecorations,
      currentInnerDecorations,
    );

    // 用 wrapWithFold 包装（保持折叠功能）
    upgradedNodeView = wrapWithFold(fullNodeView, currentNode);

    // 就地升级策略：
    // ProseMirror 缓存了 nodeView.dom 引用（即 container），不能替换它。
    // 方案：清空 container 的占位内容，将完整 NodeView 的 DOM 作为唯一子节点嵌入。
    // container 变为透明包装层，仅起到保持 ProseMirror dom 引用的作用。
    const fullDom = upgradedNodeView.dom as HTMLElement;

    // 清空占位 DOM（toolbar + pre）
    container.innerHTML = '';
    // 移除占位态 class，设为透明容器
    container.className = 'code-block-lazy-upgraded';
    container.removeAttribute('data-language');
    // 将完整 NodeView DOM 作为子节点挂入
    container.appendChild(fullDom);

    // 更新 contentDOM 引用（ProseMirror 需要通过 contentDOM 管理内容编辑）
    lazyNodeView.contentDOM = upgradedNodeView.contentDOM;
  }

  // ---------------------------------------------------------------------------
  // 注册 IntersectionObserver
  // ---------------------------------------------------------------------------

  const observer = getSharedObserver();
  observerCallbacks.set(container, upgrade);
  // 延迟注册观察（确保 DOM 已插入文档流后再观察）
  requestAnimationFrame(() => {
    if (!isUpgraded) {
      observer.observe(container);
    }
  });

  // ---------------------------------------------------------------------------
  // 点击升级（用户点击代码块时立即升级）
  // ---------------------------------------------------------------------------

  function handleClick(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    container.removeEventListener('click', handleClick);
    upgrade();
    // 升级后聚焦到代码块
    if (upgradedNodeView) {
      const cmEditor = (upgradedNodeView.dom as HTMLElement).querySelector('.cm-editor');
      if (cmEditor) {
        (cmEditor as HTMLElement).focus();
      }
    }
  }

  container.addEventListener('click', handleClick);

  // ---------------------------------------------------------------------------
  // NodeView 接口实现
  // ---------------------------------------------------------------------------

  const lazyNodeView: NodeView & {
    dom: HTMLElement | Node;
    contentDOM?: HTMLElement | Node | null;
  } = {
    dom: container,
    contentDOM: undefined, // 占位状态下无 contentDOM，ProseMirror 不会尝试管理子节点

    update(
      updatedNode: Node,
      newDecorations: readonly Decoration[],
      newInnerDecorations: any,
    ): boolean {
      // 如果已升级，委托给真正的 NodeView
      if (isUpgraded && upgradedNodeView) {
        return (
          upgradedNodeView.update?.(updatedNode, newDecorations, newInnerDecorations as never) ??
          false
        );
      }

      // 类型检查：只接受 code_block 节点
      if (updatedNode.type.name !== currentNode.type.name) {
        return false;
      }

      // 更新缓存
      currentNode = updatedNode;
      currentDecorations = newDecorations;
      currentInnerDecorations = newInnerDecorations;

      // 更新占位 DOM
      codeElement.textContent = updatedNode.textContent || '';
      langLabel.textContent = updatedNode.attrs.language || 'text';
      container.setAttribute('data-language', updatedNode.attrs.language || '');

      return true;
    },

    selectNode(): void {
      if (isUpgraded && upgradedNodeView) {
        upgradedNodeView.selectNode?.();
        return;
      }
      // 选中时升级
      upgrade();
    },

    deselectNode(): void {
      if (isUpgraded && upgradedNodeView) {
        upgradedNodeView.deselectNode?.();
      }
    },

    destroy(): void {
      // 清理
      container.removeEventListener('click', handleClick);
      const obs = getSharedObserver();
      obs.unobserve(container);
      observerCallbacks.delete(container);

      if (isUpgraded && upgradedNodeView) {
        upgradedNodeView.destroy?.();
      }
    },

    stopEvent(event: Event): boolean {
      if (isUpgraded && upgradedNodeView) {
        return upgradedNodeView.stopEvent?.(event) ?? false;
      }
      // 占位状态下，阻止所有事件（避免 ProseMirror 默认处理）
      return true;
    },

    ignoreMutation(_record: unknown): boolean {
      if (isUpgraded && upgradedNodeView) {
        return upgradedNodeView.ignoreMutation?.(_record as never) ?? true;
      }
      // 占位状态下忽略所有 mutation
      return true;
    },
  };

  return lazyNodeView;
}

/**
 * Code Block Fold Plugin
 *
 * 代码块折叠功能：
 * - 将 macOS 风格黄色圆点作为折叠/展开按钮（hover 显示横线图标）
 * - 折叠后隐藏 CodeMirror 代码区，在工具栏中显示行数
 * - 语言选择器调整到复制按钮前面
 * - 折叠状态在当前会话内保留（关闭应用后重置）
 *
 * 实现方式：
 * 包装 codeBlockView 原始工厂返回的 NodeView，
 * 在其 DOM 上注入折叠圆点、行数标签，并调整工具栏布局，不侵入原有 NodeView 逻辑。
 */

import type { Node } from '@milkdown/kit/prose/model';
import type { NodeView, Decoration } from '@milkdown/kit/prose/view';

// ---------------------------------------------------------------------------
// 会话级折叠状态管理
// ---------------------------------------------------------------------------

/**
 * 折叠状态存储
 * key = 代码块在文档中的初始位置（作为标识符）
 * 注意：位置可能因编辑而变化，所以我们用 nodeId 作为稳定标识
 */
const foldStateMap = new Map<string, boolean>();

/** 全局自增 ID，用于为每个代码块 NodeView 分配唯一标识 */
let nextFoldId = 0;

/** 生成唯一的折叠 ID */
function generateFoldId(): string {
  return `cb-fold-${++nextFoldId}`;
}

/** 获取折叠状态 */
function isFolded(id: string): boolean {
  return foldStateMap.get(id) ?? false;
}

/** 设置折叠状态 */
function setFolded(id: string, folded: boolean): void {
  foldStateMap.set(id, folded);
}

// ---------------------------------------------------------------------------
// 动画常量
// ---------------------------------------------------------------------------

/** 折叠/展开动画时长（毫秒），与 CSS transition 保持一致 */
const FOLD_ANIMATION_DURATION = 250;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 计算代码行数 */
function countLines(node: Node): number {
  const text = node.textContent || '';
  if (!text) return 0;
  return text.split('\n').length;
}

/** 生成行数文本 */
function getLinesText(node: Node): string {
  const lines = countLines(node);
  return lines === 1 ? '1 line' : `${lines} lines`;
}

/**
 * 创建折叠内容包装容器
 * 将 .codemirror-host 和 .preview-panel 包裹在一个 div 中，用于统一控制动画
 */
function createFoldContentWrapper(originalDom: HTMLElement): HTMLElement | null {
  const codemirrorHost = originalDom.querySelector('.codemirror-host');
  if (!codemirrorHost) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'lanismd-fold-content';

  // 将 codemirror-host 包裹到 wrapper 中
  codemirrorHost.parentNode?.insertBefore(wrapper, codemirrorHost);
  wrapper.appendChild(codemirrorHost);

  // 如果有 preview-panel，也移入 wrapper
  const previewPanel = originalDom.querySelector('.preview-panel');
  if (previewPanel) {
    wrapper.appendChild(previewPanel);
  }

  return wrapper;
}

/**
 * 折叠动画：高度收缩
 * 1. 设置 max-height 为当前实际高度（让浏览器有起始值）
 * 2. 下一帧添加 is-collapsing 类（max-height: 0, opacity: 0）触发过渡
 * 3. 过渡结束后设为 is-collapsed 静态状态
 */
function animateCollapse(wrapper: HTMLElement, callback?: () => void): void {
  // 获取当前实际高度
  const currentHeight = wrapper.scrollHeight;
  // 先设置明确的 max-height 起始值
  wrapper.style.maxHeight = `${currentHeight}px`;
  // 移除可能存在的展开状态类
  wrapper.classList.remove('is-expanding', 'is-collapsed');

  // 强制重排，确保浏览器记录了起始 max-height
  void wrapper.offsetHeight;

  // 下一帧：触发收缩动画
  requestAnimationFrame(() => {
    wrapper.classList.add('is-collapsing');
    wrapper.style.maxHeight = '0px';

    // 动画结束后切换到静态折叠状态
    const onEnd = () => {
      wrapper.removeEventListener('transitionend', onEnd);
      wrapper.classList.remove('is-collapsing');
      wrapper.classList.add('is-collapsed');
      wrapper.style.maxHeight = '';
      callback?.();
    };

    wrapper.addEventListener('transitionend', onEnd, { once: false });
    // 保险超时，防止 transitionend 不触发
    setTimeout(() => {
      if (wrapper.classList.contains('is-collapsing')) {
        wrapper.classList.remove('is-collapsing');
        wrapper.classList.add('is-collapsed');
        wrapper.style.maxHeight = '';
        callback?.();
      }
    }, FOLD_ANIMATION_DURATION + 50);
  });
}

/**
 * 展开动画：高度展开
 * 1. 移除 is-collapsed，设置 max-height 为目标高度
 * 2. 添加 is-expanding 触发过渡
 * 3. 过渡结束后清除内联样式，恢复自适应
 */
function animateExpand(wrapper: HTMLElement, callback?: () => void): void {
  // 先移除折叠态，获取目标高度
  wrapper.classList.remove('is-collapsed', 'is-collapsing');
  wrapper.style.maxHeight = '0px';
  wrapper.style.opacity = '0';
  wrapper.classList.add('is-expanding');

  // 强制重排
  void wrapper.offsetHeight;

  // 获取目标高度
  const targetHeight = wrapper.scrollHeight;

  // 触发展开动画
  requestAnimationFrame(() => {
    wrapper.style.maxHeight = `${targetHeight}px`;
    wrapper.style.opacity = '1';

    const onEnd = () => {
      wrapper.removeEventListener('transitionend', onEnd);
      wrapper.classList.remove('is-expanding');
      wrapper.style.maxHeight = '';
      wrapper.style.opacity = '';
      callback?.();
    };

    wrapper.addEventListener('transitionend', onEnd, { once: false });
    // 保险超时
    setTimeout(() => {
      if (wrapper.classList.contains('is-expanding')) {
        wrapper.classList.remove('is-expanding');
        wrapper.style.maxHeight = '';
        wrapper.style.opacity = '';
        callback?.();
      }
    }, FOLD_ANIMATION_DURATION + 50);
  });
}

// ---------------------------------------------------------------------------
// 包装 NodeView
// ---------------------------------------------------------------------------

/**
 * 包装原始 CodeMirror NodeView，添加折叠功能
 *
 * @param originalNodeView 原始 codeBlockView 工厂返回的 NodeView
 * @param node 当前节点
 * @returns 包装后的 NodeView
 */
export function wrapWithFold(
  originalNodeView: NodeView,
  node: Node,
): NodeView {
  const foldId = generateFoldId();
  const folded = isFolded(foldId);

  // 获取原始 DOM
  const originalDom = originalNodeView.dom as HTMLElement;

  // --- 创建 macOS 风格窗口装饰圆点容器 ---
  // 替代原有 CSS ::before 伪元素，让黄色圆点可交互
  const dotsContainer = document.createElement('div');
  dotsContainer.className = 'lanismd-window-dots';

  // 红色圆点（纯装饰）
  const redDot = document.createElement('span');
  redDot.className = 'lanismd-dot lanismd-dot-red';

  // 黄色圆点（折叠按钮）
  const yellowDot = document.createElement('button');
  yellowDot.className = 'lanismd-dot lanismd-dot-yellow';
  yellowDot.type = 'button';
  yellowDot.title = folded ? '展开代码块' : '折叠代码块';

  // 绿色圆点（纯装饰）
  const greenDot = document.createElement('span');
  greenDot.className = 'lanismd-dot lanismd-dot-green';

  dotsContainer.appendChild(redDot);
  dotsContainer.appendChild(yellowDot);
  dotsContainer.appendChild(greenDot);

  // --- 创建折叠行数标签（显示在工具栏中，圆点之后） ---
  const linesLabel = document.createElement('span');
  linesLabel.className = `lanismd-fold-lines ${folded ? 'is-visible' : 'is-hidden'}`;
  linesLabel.textContent = getLinesText(node);

  // --- 查找并注入到工具栏 ---

  // 使用 MutationObserver 等待 .tools 元素出现（因为 code-block 组件是异步渲染的）
  function injectElements(): void {
    const tools = originalDom.querySelector('.tools');
    if (!tools) {
      // 使用 MutationObserver 等待
      const observer = new MutationObserver(() => {
        const toolsEl = originalDom.querySelector('.tools');
        if (toolsEl) {
          observer.disconnect();
          doInject(toolsEl);
        }
      });
      observer.observe(originalDom, { childList: true, subtree: true });
      // 超时保护：5 秒后停止观察
      setTimeout(() => observer.disconnect(), 5000);
      return;
    }
    doInject(tools);
  }

  function doInject(tools: Element): void {
    // 标记工具栏，用于 CSS 隐藏原有的 ::before 伪元素装饰
    tools.setAttribute('data-fold-injected', 'true');

    // 1. 将圆点容器插入到工具栏最前面
    tools.insertBefore(dotsContainer, tools.firstChild);

    // 2. 将行数标签插入到圆点容器之后
    dotsContainer.after(linesLabel);

    // 3. 调整布局：将语言选择器移到复制按钮前面（右侧区域）
    const languageButton = tools.querySelector('.language-button');
    const buttonGroup = tools.querySelector('.tools-button-group');
    if (languageButton && buttonGroup) {
      // 将语言按钮移到 button-group 的最前面（复制按钮之前）
      buttonGroup.insertBefore(languageButton, buttonGroup.firstChild);
    }
  }

  // --- 折叠/展开逻辑 ---

  /** 折叠内容包装容器（延迟创建） */
  let foldContentWrapper: HTMLElement | null = null;
  /** 动画是否正在进行中 */
  let isAnimating = false;

  /**
   * 确保 wrapper 已创建
   * 在首次折叠时惰性创建，避免注入时机过早
   */
  function ensureWrapper(): HTMLElement | null {
    if (!foldContentWrapper) {
      foldContentWrapper = createFoldContentWrapper(originalDom);
    }
    return foldContentWrapper;
  }

  function applyFoldState(shouldFold: boolean, animate = true): void {
    if (isAnimating) return; // 防止动画期间重复触发

    setFolded(foldId, shouldFold);
    yellowDot.title = shouldFold ? '展开代码块' : '折叠代码块';

    const wrapper = ensureWrapper();

    if (shouldFold) {
      // ---- 折叠 ----
      originalDom.classList.add('is-folded');

      // 行数标签淡入
      if (wrappedNodeView._currentNode) {
        linesLabel.textContent = getLinesText(wrappedNodeView._currentNode);
      }
      linesLabel.classList.remove('is-hidden');
      linesLabel.classList.add('is-visible');

      if (wrapper && animate) {
        isAnimating = true;
        animateCollapse(wrapper, () => {
          isAnimating = false;
        });
      } else if (wrapper) {
        // 无动画直接折叠（初始化恢复状态时）
        wrapper.classList.add('is-collapsed');
      }
    } else {
      // ---- 展开 ----

      // 行数标签淡出
      linesLabel.classList.remove('is-visible');
      linesLabel.classList.add('is-hidden');

      if (wrapper && animate) {
        isAnimating = true;
        animateExpand(wrapper, () => {
          isAnimating = false;
          originalDom.classList.remove('is-folded');
        });
      } else if (wrapper) {
        // 无动画直接展开
        wrapper.classList.remove('is-collapsed');
        originalDom.classList.remove('is-folded');
      } else {
        originalDom.classList.remove('is-folded');
      }
    }
  }

  // 黄色圆点点击事件
  yellowDot.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    applyFoldState(!isFolded(foldId));
  });

  // 延迟注入（等待 code-block 组件渲染）
  requestAnimationFrame(() => {
    injectElements();
    // 如果初始就是折叠状态，立即应用（无动画）
    if (folded) {
      applyFoldState(true, false);
    }
  });

  // --- 构造包装后的 NodeView ---

  const wrappedNodeView: NodeView & { _currentNode: Node } = {
    _currentNode: node,
    dom: originalNodeView.dom,
    contentDOM: originalNodeView.contentDOM,

    update(updatedNode: Node, decorations: readonly Decoration[], innerDecorations: unknown): boolean {
      const result = originalNodeView.update?.(updatedNode, decorations, innerDecorations as never);
      if (result) {
        wrappedNodeView._currentNode = updatedNode;
        // 更新行数文本
        if (isFolded(foldId)) {
          linesLabel.textContent = getLinesText(updatedNode);
        }
      }
      return result ?? false;
    },

    selectNode(): void {
      originalNodeView.selectNode?.();
    },

    deselectNode(): void {
      originalNodeView.deselectNode?.();
    },

    destroy(): void {
      // 清理注入的元素
      dotsContainer.remove();
      linesLabel.remove();
      // 如果有 wrapper，将子元素还原到原位后移除 wrapper
      if (foldContentWrapper && foldContentWrapper.parentNode) {
        while (foldContentWrapper.firstChild) {
          foldContentWrapper.parentNode.insertBefore(
            foldContentWrapper.firstChild,
            foldContentWrapper,
          );
        }
        foldContentWrapper.remove();
      }
      originalNodeView.destroy?.();
    },

    stopEvent(event: Event): boolean {
      // 折叠按钮和圆点区域的事件由我们处理
      const target = event.target as HTMLElement | null;
      if (target && (dotsContainer.contains(target) || linesLabel.contains(target))) {
        return true;
      }
      return originalNodeView.stopEvent?.(event) ?? false;
    },

    ignoreMutation(record: unknown): boolean {
      return originalNodeView.ignoreMutation?.(record as never) ?? true;
    },
  };

  return wrappedNodeView;
}

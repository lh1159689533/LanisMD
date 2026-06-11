/**
 * AI 生成过程中的占位浮层
 *
 * 占位节点不再挂载到 ProseMirror 管理的 contenteditable DOM 内部，
 * 而是作为绝对定位元素挂载到编辑器容器外层，用 CSS 覆盖在目标位置上。
 *
 * 这样做的原因：
 * - ProseMirror 的 MutationObserver 只监听 contenteditable 内部的 DOM 变化
 * - 占位节点在外层，其中的光标字符不会被吸入文档模型
 * - 取消或完成时直接移除 DOM 即可，无需担心文档污染
 */

import type { EditorView } from '@milkdown/kit/prose/view';

export interface PlaceholderHandle {
  /** 占位浮层根节点（挂载在 contenteditable 外部） */
  root: HTMLElement;
  /** 流式文本追加区域 */
  textEl: HTMLElement;
  /** 设置显示状态 */
  setStatus: (status: 'pending' | 'streaming' | 'done' | 'error') => void;
  /** 绑定取消按钮的回调 */
  setCancelHandler: (handler: () => void) => void;
  /** 绑定重试按钮的回调 */
  setRetryHandler: (handler: () => void) => void;
  /** 绑定写入（确认）按钮的回调 */
  setCommitHandler: (handler: () => void) => void;
  /** 销毁占位浮层（从 DOM 移除） */
  destroy: () => void;
}

/**
 * 创建并挂载占位浮层
 *
 * @param view - ProseMirror EditorView
 * @param pos - 文档中的锚定位置（用于计算浮层坐标）
 */
export function createPlaceholder(view: EditorView, pos: number): PlaceholderHandle {
  const root = document.createElement('div');
  root.className = 'lanismd-ai-inline';
  root.dataset.status = 'pending';

  // 文本区域
  const textEl = document.createElement('span');
  textEl.className = 'lanismd-ai-inline-text';

  // 闪烁光标
  const caret = document.createElement('span');
  caret.className = 'lanismd-ai-inline-caret';
  caret.textContent = '\u258D'; // ▍

  // 取消按钮
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'lanismd-ai-inline-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.title = '取消 AI 生成';
  cancelBtn.type = 'button';

  // 操作按钮容器（完成/出错后显示重试和写入按钮）
  const actionBar = document.createElement('div');
  actionBar.className = 'lanismd-ai-inline-actions';

  const retryBtn = document.createElement('button');
  retryBtn.className = 'lanismd-ai-inline-action-btn lanismd-ai-inline-retry';
  retryBtn.textContent = '重试';
  retryBtn.title = '使用相同参数重新生成';
  retryBtn.type = 'button';

  const commitBtn = document.createElement('button');
  commitBtn.className = 'lanismd-ai-inline-action-btn lanismd-ai-inline-commit';
  commitBtn.textContent = '写入';
  commitBtn.title = '将结果写入文档';
  commitBtn.type = 'button';

  const discardBtn = document.createElement('button');
  discardBtn.className = 'lanismd-ai-inline-action-btn lanismd-ai-inline-discard';
  discardBtn.textContent = '丢弃';
  discardBtn.title = '放弃本次生成结果';
  discardBtn.type = 'button';

  actionBar.appendChild(retryBtn);
  actionBar.appendChild(commitBtn);
  actionBar.appendChild(discardBtn);

  root.appendChild(textEl);
  root.appendChild(caret);
  root.appendChild(cancelBtn);
  root.appendChild(actionBar);

  // 挂载到编辑器 contenteditable 之外的容器上
  const container = findOverlayContainer(view);
  container.appendChild(root);

  // 初始定位
  updatePosition(view, root, pos);

  // 丢弃按钮默认行为：销毁浮层
  const handle: PlaceholderHandle = {
    root,
    textEl,
    setStatus: (status) => {
      root.dataset.status = status;
    },
    setCancelHandler: (handler) => {
      cancelBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler();
      });
    },
    setRetryHandler: (handler) => {
      retryBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler();
      });
    },
    setCommitHandler: (handler) => {
      commitBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler();
      });
    },
    destroy: () => {
      if (root.parentElement) {
        root.parentElement.removeChild(root);
      }
    },
  };

  // 丢弃按钮直接销毁浮层
  discardBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handle.destroy();
  });

  return handle;
}

/**
 * 更新占位浮层的位置（跟随文档锚点）
 */
export function updatePlaceholderPosition(
  view: EditorView,
  handle: PlaceholderHandle,
  pos: number,
): void {
  updatePosition(view, handle.root, pos);
}

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/**
 * 查找或创建 overlay 容器。
 * overlay 容器是 ProseMirror contenteditable 的兄弟节点，
 * 设置 position: relative 以支持子元素绝对定位。
 */
function findOverlayContainer(view: EditorView): HTMLElement {
  const editorDom = view.dom;
  const parent = editorDom.parentElement;
  if (!parent) {
    // 极端退化：直接挂到 body
    return document.body;
  }

  // 查找已有的 overlay 容器
  let overlay = parent.querySelector('.lanismd-ai-overlay') as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'lanismd-ai-overlay';
    parent.appendChild(overlay);
  }
  return overlay;
}

/**
 * 根据文档位置计算占位浮层在 viewport 中的坐标并设置 style
 */
function updatePosition(view: EditorView, el: HTMLElement, pos: number): void {
  try {
    const coords = view.coordsAtPos(pos);
    const container = el.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    el.style.position = 'absolute';
    el.style.left = `${coords.left - containerRect.left}px`;
    el.style.top = `${coords.top - containerRect.top}px`;
  } catch {
    // 位置计算失败时不 crash，浮层可能不显示但不影响功能
  }
}

/**
 * 润色专用浮动弹窗
 *
 * 定位在选区下方，和编辑区等宽。
 * 显示润色状态（润色中... / 已完成 / 出错），完成后显示接受/拒绝按钮。
 * 与 inline-diff 配合使用：diff 在编辑器内展示，弹窗控制操作。
 */

import type { EditorView } from '@milkdown/kit/prose/view';

export interface PolishPopupOptions {
  view: EditorView;
  /** 选区起始位置 */
  from: number;
  /** 选区结束位置 */
  to: number;
  /** 接受回调 */
  onAccept: () => void;
  /** 拒绝回调 */
  onReject: () => void;
}

export interface PolishPopupHandle {
  /** 设为流式生成中状态 */
  setStreaming: () => void;
  /** 设为完成状态（显示接受/拒绝按钮） */
  setDone: () => void;
  /** 设为错误状态 */
  setError: (message: string) => void;
  /** 销毁弹窗 */
  destroy: () => void;
}

/**
 * 创建润色弹窗。
 */
export function createPolishPopup(options: PolishPopupOptions): PolishPopupHandle {
  const { view, onAccept, onReject } = options;

  // 全屏透明遮罩（阻止编辑器交互）
  const overlay = document.createElement('div');
  overlay.className = 'lanismd-polish-popup-overlay';

  // 弹窗容器
  const popup = document.createElement('div');
  popup.className = 'lanismd-polish-popup';
  popup.dataset.status = 'pending';

  // 状态指示行
  const statusRow = document.createElement('div');
  statusRow.className = 'lanismd-polish-popup-status';

  const statusText = document.createElement('span');
  statusText.className = 'lanismd-polish-popup-status-text';
  statusText.textContent = '润色中...';

  // 加载动画指示器
  const spinner = document.createElement('span');
  spinner.className = 'lanismd-polish-popup-spinner';

  statusRow.appendChild(spinner);
  statusRow.appendChild(statusText);

  // 操作按钮区
  const actionsEl = document.createElement('div');
  actionsEl.className = 'lanismd-polish-popup-actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'lanismd-polish-popup-btn lanismd-polish-popup-btn-accept';
  acceptBtn.textContent = '接受';
  acceptBtn.type = 'button';

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'lanismd-polish-popup-btn lanismd-polish-popup-btn-reject';
  rejectBtn.textContent = '拒绝';
  rejectBtn.type = 'button';

  actionsEl.appendChild(acceptBtn);
  actionsEl.appendChild(rejectBtn);

  popup.appendChild(statusRow);
  popup.appendChild(actionsEl);
  overlay.appendChild(popup);

  // 按钮事件
  acceptBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    destroy();
    onAccept();
  });

  rejectBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    destroy();
    onReject();
  });

  // 点击遮罩不关闭（润色进行中不允许随意关闭）
  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Esc 键拒绝
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      destroy();
      onReject();
    }
  }
  document.addEventListener('keydown', handleKeydown, true);

  // 挂载到 body
  document.body.appendChild(overlay);

  // 定位弹窗：和编辑区等宽，在选区下方
  positionPopup(view, popup, options.from, options.to);

  // 销毁函数
  function destroy() {
    document.removeEventListener('keydown', handleKeydown, true);
    if (overlay.parentElement) {
      overlay.parentElement.removeChild(overlay);
    }
  }

  const handle: PolishPopupHandle = {
    setStreaming: () => {
      popup.dataset.status = 'streaming';
      statusText.textContent = '润色中...';
    },
    setDone: () => {
      popup.dataset.status = 'done';
      statusText.textContent = '润色完成';
    },
    setError: (message: string) => {
      popup.dataset.status = 'error';
      statusText.textContent = message;
    },
    destroy,
  };

  return handle;
}

// ---------------------------------------------------------------------------
// 定位工具
// ---------------------------------------------------------------------------

/**
 * 将弹窗定位到选区下方，和编辑区内容区等宽
 */
function positionPopup(
  view: EditorView,
  popup: HTMLElement,
  from: number,
  to: number,
) {
  try {
    const endCoords = view.coordsAtPos(to);
    const editorDom = view.dom;
    const editorRect = editorDom.getBoundingClientRect();

    // 弹窗和编辑区内容区等宽
    popup.style.position = 'fixed';
    popup.style.left = `${editorRect.left}px`;
    popup.style.width = `${editorRect.width}px`;
    popup.style.top = `${endCoords.bottom + 8}px`;

    // 延迟调整确保弹窗在视口内
    requestAnimationFrame(() => {
      const rect = popup.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // 下方超出：改为在选区上方显示
      if (rect.bottom > viewportHeight - 16) {
        const startCoords = view.coordsAtPos(from);
        const aboveY = startCoords.top - rect.height - 8;
        popup.style.top = `${Math.max(16, aboveY)}px`;
      }
    });
  } catch {
    // 定位失败时使用编辑器底部
    const editorDom = view.dom;
    const editorRect = editorDom.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.left = `${editorRect.left}px`;
    popup.style.width = `${editorRect.width}px`;
    popup.style.bottom = '16px';
  }
}

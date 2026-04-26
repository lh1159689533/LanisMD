/**
 * 转图表/转公式专用弹窗
 *
 * 两阶段交互：
 * - 阶段 1：参数输入（文本域 + 开始按钮）
 * - 阶段 2：结果展示（输入始终可编辑 + 可编辑结果文本域 + 接受/拒绝/重新生成按钮）
 *
 * 输入区域始终可编辑，用户可随时修改输入后点击"重新生成"发起新一轮生成。
 * 弹窗风格与 ai-popup.ts 保持一致（全屏遮罩 + 卡片弹窗）。
 */

import type { EditorView } from '@milkdown/kit/prose/view';

/** 弹窗类型 */
export type GeneratorPopupType = 'mermaid' | 'latex';

/** 占位提示映射 */
const PLACEHOLDER_MAP: Record<GeneratorPopupType, string> = {
  mermaid: '描述图表内容，例如：用户登录流程',
  latex: '描述公式，例如：二次方程求根公式',
};

/** 标题映射 */
const TITLE_MAP: Record<GeneratorPopupType, string> = {
  mermaid: '转图表',
  latex: '转公式',
};

export interface GeneratorPopupOptions {
  view: EditorView;
  /** 光标位置（用于定位弹窗） */
  pos: number;
  /** 弹窗类型 */
  type: GeneratorPopupType;
  /** 点击"开始"后回调，返回用户输入的描述 */
  onStart: (arg: string) => void;
  /** 点击"接受"后回调，返回最终结果文本（可能被用户编辑过） */
  onAccept: (result: string) => void;
  /** 点击"拒绝"后回调 */
  onReject: () => void;
  /** 点击"重新生成"后回调，返回当前输入框的值 */
  onRetry: (arg: string) => void;
  /** 关闭回调（Esc / 点击遮罩） */
  onClose: () => void;
}

export interface GeneratorPopupHandle {
  /** 追加流式内容到结果文本域 */
  appendContent: (delta: string) => void;
  /** 设为完成状态（显示接受/拒绝/重新生成按钮） */
  setDone: () => void;
  /** 设为错误状态 */
  setError: (message: string) => void;
  /** 重置结果区（重新生成时使用） */
  resetContent: () => void;
  /** 切换到阶段 2（隐藏开始按钮，显示结果区） */
  switchToResult: () => void;
  /** 销毁弹窗 */
  destroy: () => void;
}

/**
 * 创建并显示转图表/转公式弹窗。
 */
export function createGeneratorPopup(options: GeneratorPopupOptions): GeneratorPopupHandle {
  const { view, pos, type, onStart, onAccept, onReject, onRetry, onClose } = options;

  /** 用户在阶段 1 输入的描述文本 */
  let userInput = '';

  // -----------------------------------------------------------------------
  // DOM 结构
  // -----------------------------------------------------------------------

  // 全屏透明遮罩（复用 ai-popup 样式）
  const overlay = document.createElement('div');
  overlay.className = 'lanismd-ai-popup-overlay';

  // 弹窗容器
  const popup = document.createElement('div');
  popup.className = 'lanismd-ai-popup lanismd-generator-popup';

  // --- header ---
  const header = document.createElement('div');
  header.className = 'lanismd-ai-popup-header';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'lanismd-ai-popup-title';
  titleSpan.textContent = TITLE_MAP[type];
  header.appendChild(titleSpan);
  popup.appendChild(header);

  // --- 阶段 1：输入区域 ---
  const inputArea = document.createElement('div');
  inputArea.className = 'lanismd-generator-popup-input-area';

  const inputTextarea = document.createElement('textarea');
  inputTextarea.className = 'lanismd-generator-popup-textarea';
  inputTextarea.placeholder = PLACEHOLDER_MAP[type];
  inputTextarea.rows = 3;
  inputArea.appendChild(inputTextarea);
  popup.appendChild(inputArea);

  // --- 阶段 1：开始按钮区域 ---
  const startArea = document.createElement('div');
  startArea.className = 'lanismd-generator-popup-start-area';

  const startBtn = document.createElement('button');
  startBtn.className = 'lanismd-ai-popup-btn lanismd-ai-popup-btn-primary';
  startBtn.textContent = '开始生成';
  startBtn.type = 'button';
  startArea.appendChild(startBtn);
  popup.appendChild(startArea);

  // --- 阶段 2：结果区域（初始隐藏） ---
  const resultArea = document.createElement('div');
  resultArea.className = 'lanismd-generator-popup-result-area';
  resultArea.style.display = 'none';

  const statusEl = document.createElement('div');
  statusEl.className = 'lanismd-generator-popup-status';
  statusEl.textContent = '生成中...';
  resultArea.appendChild(statusEl);

  const resultTextarea = document.createElement('textarea');
  resultTextarea.className = 'lanismd-generator-popup-textarea lanismd-generator-popup-textarea-result';
  resultTextarea.rows = 6;
  resultTextarea.placeholder = '等待 AI 生成结果...';
  resultArea.appendChild(resultTextarea);
  popup.appendChild(resultArea);

  // --- 阶段 2：操作按钮区（初始隐藏） ---
  const actionsArea = document.createElement('div');
  actionsArea.className = 'lanismd-generator-popup-actions';
  actionsArea.style.display = 'none';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'lanismd-ai-popup-btn lanismd-ai-popup-btn-primary';
  acceptBtn.textContent = '接受';
  acceptBtn.type = 'button';

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'lanismd-ai-popup-btn';
  rejectBtn.textContent = '拒绝';
  rejectBtn.type = 'button';

  const retryBtn = document.createElement('button');
  retryBtn.className = 'lanismd-ai-popup-btn';
  retryBtn.textContent = '重新生成';
  retryBtn.type = 'button';

  actionsArea.appendChild(acceptBtn);
  actionsArea.appendChild(rejectBtn);
  actionsArea.appendChild(retryBtn);
  popup.appendChild(actionsArea);

  overlay.appendChild(popup);

  // -----------------------------------------------------------------------
  // 事件绑定
  // -----------------------------------------------------------------------

  // 开始按钮
  startBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const value = inputTextarea.value.trim();
    if (!value) return;
    userInput = value;
    onStart(value);
  });

  // 输入框 Enter 快捷键（Ctrl+Enter 或 Meta+Enter 提交）
  inputTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const value = inputTextarea.value.trim();
      if (!value) return;
      userInput = value;
      onStart(value);
    }
  });

  // 接受按钮
  acceptBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const result = resultTextarea.value;
    destroy();
    onAccept(result);
  });

  // 拒绝按钮
  rejectBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    destroy();
    onReject();
  });

  // 重新生成按钮：重置结果区，用当前输入重新触发生成
  retryBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const currentInput = inputTextarea.value.trim();
    if (!currentInput) return;
    handle.resetContent();
    onRetry(currentInput);
  });

  // 点击遮罩关闭
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) {
      e.preventDefault();
      destroy();
      onClose();
    }
  });

  // Esc 关闭
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      destroy();
      onClose();
    }
  }
  document.addEventListener('keydown', handleKeydown, true);

  // -----------------------------------------------------------------------
  // 挂载 & 定位
  // -----------------------------------------------------------------------

  document.body.appendChild(overlay);
  positionPopup(view, popup, pos);

  // 延迟聚焦输入框
  requestAnimationFrame(() => {
    inputTextarea.focus();
  });

  // -----------------------------------------------------------------------
  // handle 实现
  // -----------------------------------------------------------------------

  function destroy() {
    document.removeEventListener('keydown', handleKeydown, true);
    if (overlay.parentElement) {
      overlay.parentElement.removeChild(overlay);
    }
  }

  const handle: GeneratorPopupHandle = {
    appendContent: (delta: string) => {
      resultTextarea.value += delta;
      // 自动滚动到底部
      resultTextarea.scrollTop = resultTextarea.scrollHeight;
      // 首次收到内容时隐藏加载状态
      if (statusEl.style.display !== 'none') {
        statusEl.style.display = 'none';
      }
    },

    setDone: () => {
      statusEl.style.display = 'none';
      // 显示操作按钮
      actionsArea.style.display = '';
    },

    setError: (message: string) => {
      statusEl.textContent = message;
      statusEl.style.display = '';
      statusEl.classList.add('lanismd-generator-popup-status-error');
      // 显示操作按钮（仅重试和拒绝有意义）
      actionsArea.style.display = '';
      acceptBtn.style.display = 'none';
    },

    resetContent: () => {
      resultTextarea.value = '';
      statusEl.textContent = '生成中...';
      statusEl.style.display = '';
      statusEl.classList.remove('lanismd-generator-popup-status-error');
      actionsArea.style.display = 'none';
      acceptBtn.style.display = '';
    },

    switchToResult: () => {
      // 隐藏开始按钮
      startArea.style.display = 'none';
      // 显示结果区（输入区保持可编辑）
      resultArea.style.display = '';
      // 结果区展开后弹窗高度变化，重新定位避免被截断
      positionPopup(view, popup, pos);
    },

    destroy,
  };

  return handle;
}

// ---------------------------------------------------------------------------
// 定位工具
// ---------------------------------------------------------------------------

/**
 * 将弹窗定位到光标行附近，和编辑区内容区等宽。
 *
 * 三段式定位策略：
 * 1. 优先向下展开（光标下方空间足够）
 * 2. 下方不够则翻转到光标上方
 * 3. 上下都不够则垂直居中显示
 */
function positionPopup(
  view: EditorView,
  popup: HTMLElement,
  pos: number,
) {
  const GAP = 8;       // 弹窗与光标之间的间距
  const MARGIN = 16;   // 弹窗距视口边缘的最小间距

  try {
    const coords = view.coordsAtPos(pos);
    const editorDom = view.dom;
    const editorRect = editorDom.getBoundingClientRect();

    // 弹窗和编辑区内容区等宽
    popup.style.position = 'fixed';
    popup.style.left = `${editorRect.left}px`;
    popup.style.width = `${editorRect.width}px`;
    // 先放到下方以便测量实际高度
    popup.style.top = `${coords.bottom + GAP}px`;

    // 延迟一帧获取真实高度后做三段式调整
    requestAnimationFrame(() => {
      const popupHeight = popup.offsetHeight;
      const viewportHeight = window.innerHeight;
      const bottomSpace = viewportHeight - coords.bottom - GAP - MARGIN;
      const topSpace = coords.top - GAP - MARGIN;

      if (popupHeight <= bottomSpace) {
        // 情况 1：下方空间充足，保持当前位置
        popup.style.top = `${coords.bottom + GAP}px`;
      } else if (popupHeight <= topSpace) {
        // 情况 2：上方空间充足，翻转到光标上方
        popup.style.top = `${coords.top - popupHeight - GAP}px`;
      } else {
        // 情况 3：上下都不够，垂直居中
        const centeredTop = Math.max(MARGIN, (viewportHeight - popupHeight) / 2);
        popup.style.top = `${centeredTop}px`;
      }
    });
  } catch {
    // 定位失败时居中显示
    const editorDom = view.dom;
    const editorRect = editorDom.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.left = `${editorRect.left}px`;
    popup.style.width = `${editorRect.width}px`;
    popup.style.top = '50%';
    popup.style.transform = 'translateY(-50%)';
  }
}

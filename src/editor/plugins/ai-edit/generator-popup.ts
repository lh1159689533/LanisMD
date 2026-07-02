/**
 * AI 助手简洁弹窗
 *
 * 布局：icon + 下拉选择（图表/公式）+ 输入框 + 操作按钮 + 关闭按钮
 *
 * 五个交互状态：
 * 1. 初始：空输入框，显示 placeholder
 * 2. 输入中：显示回车+发送按钮
 * 3. 多行输入：最大高度 300px，超出滚动
 * 4. 生成中：显示"正在生成 .."，ESC停止按钮
 * 5. 生成完成：结果展示区（自适应方向），输入框保留原问题可编辑
 */

import type { EditorView } from '@milkdown/kit/prose/view';

/** 弹窗类型（保留兼容旧接口） */
export type GeneratorPopupType = 'mermaid' | 'latex';

/** 指令选项 */
export interface GeneratorCommandOption {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  label: string;
  /** 输入框占位文本 */
  placeholder: string;
}

/** 占位提示映射 */
const PLACEHOLDER_MAP: Record<GeneratorPopupType, string> = {
  mermaid: '描述图表内容，例如：用户登录流程',
  latex: '描述公式，例如：二次方程求根公式',
};

/** 标题映射（向后兼容） */
const TITLE_MAP: Record<GeneratorPopupType, string> = {
  mermaid: '转图表',
  latex: '转公式',
};

export interface GeneratorPopupOptions {
  view: EditorView;
  /** 光标位置（用于定位弹窗） */
  pos: number;
  /** 弹窗类型（向后兼容单类型模式） */
  type: GeneratorPopupType;
  /** 点击"开始"后回调，返回用户输入的描述 */
  onStart: (arg: string) => void;
  /** 点击"接受"后回调，返回最终结果文本 */
  onAccept: (result: string) => void;
  /** 点击"拒绝"后回调 */
  onReject: () => void;
  /** 点击"重新生成"后回调，返回当前输入框的值 */
  onRetry: (arg: string) => void;
  /** 关闭回调（Esc / 点击遮罩） */
  onClose: () => void;
}

/** 统一弹窗选项（多指令模式） */
export interface UnifiedGeneratorPopupOptions {
  view: EditorView;
  /** 光标位置（用于定位弹窗） */
  pos: number;
  /** 可选的指令列表 */
  commands: GeneratorCommandOption[];
  /** 默认选中的指令 id */
  defaultCommandId?: string;
  /** 点击"开始"后回调，返回选中的指令 id 和用户输入 */
  onStart: (commandId: string, arg: string) => void;
  /** 点击"接受"后回调，返回选中的指令 id 和最终结果文本 */
  onAccept: (commandId: string, result: string) => void;
  /** 点击"拒绝"后回调 */
  onReject: () => void;
  /** 点击"重新生成"后回调，返回选中的指令 id 和当前输入 */
  onRetry: (commandId: string, arg: string) => void;
  /** 关闭回调（Esc / 点击遮罩） */
  onClose: () => void;
}

export interface GeneratorPopupHandle {
  /** 追加流式内容到结果区域 */
  appendContent: (delta: string) => void;
  /** 设为完成状态 */
  setDone: () => void;
  /** 设为错误状态 */
  setError: (message: string) => void;
  /** 重置结果区 */
  resetContent: () => void;
  /** 切换到生成中状态 */
  switchToResult: () => void;
  /** 销毁弹窗 */
  destroy: () => void;
}

/**
 * 创建向后兼容的单类型弹窗
 */
export function createGeneratorPopup(options: GeneratorPopupOptions): GeneratorPopupHandle {
  const { view, pos, type, onStart, onAccept, onReject, onRetry, onClose } = options;

  return createUnifiedGeneratorPopup({
    view,
    pos,
    commands: [{ id: type, label: TITLE_MAP[type], placeholder: PLACEHOLDER_MAP[type] }],
    defaultCommandId: type,
    onStart: (_cmdId, arg) => onStart(arg),
    onAccept: (_cmdId, result) => onAccept(result),
    onReject,
    onRetry: (_cmdId, arg) => onRetry(arg),
    onClose,
  });
}

// AI icon（用于弹窗左侧装饰）
const AI_ICON_SVG =
  '<svg width="1em" height="1em" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="evenodd"><path d="M2.623 20.781a.568.568 0 0 1 .42-.685c2.353-.565 4.324-1.619 5.922-3.164 1.189-1.15 2.077-2.355 2.668-3.617a.568.568 0 1 1 1.029.481c-.652 1.393-1.622 2.71-2.907 3.953-1.748 1.69-3.9 2.84-6.447 3.452a.568.568 0 0 1-.685-.42Z" fill="currentColor" fill-rule="nonzero"/><path d="m12.035 13.96-4.359-.64a.44.44 0 0 1-.265-.728L10.339 9.3a.44.44 0 0 0 .105-.367L9.706 4.59a.44.44 0 0 1 .61-.478l4.036 1.767a.44.44 0 0 0 .381-.013l3.903-2.044a.44.44 0 0 1 .643.433l-.434 4.385a.44.44 0 0 0 .13.358l3.15 3.08a.44.44 0 0 1-.213.745l-4.303.943a.44.44 0 0 0-.301.234l-1.956 3.948a.44.44 0 0 1-.775.027l-2.226-3.802a.44.44 0 0 0-.316-.213Z" fill="#C7F0DF"/><path d="M19.23 4.008a.44.44 0 0 1 .049.247l-.434 4.385a.44.44 0 0 0 .13.358l3.15 3.08a.44.44 0 0 1-.213.745l-4.303.943a.44.44 0 0 0-.301.234l-1.956 3.948a.44.44 0 0 1-.775.027l-2.226-3.802a.44.44 0 0 0-.316-.213l-4.359-.64a.44.44 0 0 1-.265-.728L10.339 9.3a.44.44 0 0 0 .105-.367L9.706 4.59a.44.44 0 0 1 .61-.478l4.036 1.767a.44.44 0 0 0 .381-.013l3.903-2.044a.44.44 0 0 1 .595.186Zm-1.209 1.418-2.76 1.447c-.424.222-.926.24-1.365.047l-2.854-1.25.522 3.073c.071.419-.03.847-.277 1.188l-.1.124-2.07 2.328 3.083.453c.421.062.797.29 1.045.63l.087.133 1.574 2.689 1.384-2.792c.189-.381.522-.668.922-.799l.153-.041 3.044-.668-2.228-2.177a1.577 1.577 0 0 1-.474-1.125l.007-.158.307-3.102Z" fill="#00B96B" fill-rule="nonzero"/><path d="m1.606 6.646-.757-.225a.173.173 0 0 1 0-.33l.757-.226A2.53 2.53 0 0 0 3.311 4.16l.225-.757a.173.173 0 0 1 .33 0l.226.757a2.53 2.53 0 0 0 1.704 1.705l.758.225a.173.173 0 0 1 0 .331l-.758.225a2.53 2.53 0 0 0-1.704 1.705l-.225.757a.173.173 0 0 1-.331 0l-.225-.757a2.53 2.53 0 0 0-1.705-1.705ZM17.545 19.729l-.977-.29a.173.173 0 0 1 0-.331l.977-.29a2.953 2.953 0 0 0 1.988-1.99l.29-.975a.173.173 0 0 1 .332 0l.29.976a2.953 2.953 0 0 0 1.988 1.988l.977.29a.173.173 0 0 1 0 .332l-.977.29a2.953 2.953 0 0 0-1.988 1.989l-.29.976a.173.173 0 0 1-.331 0l-.29-.976a2.953 2.953 0 0 0-1.99-1.989Z" fill="#F5DA80"/></g></svg>';

/**
 * 创建统一 AI 助手弹窗（双卡片模式）
 *
 * 布局：
 * - 输入卡片（始终显示）：AI icon + 下拉选择 + 输入框 + 操作按钮 + 关闭按钮
 * - 结果卡片（有结果时显示）：独立卡片，只显示最终结果 + 接受/拒绝按钮
 */
export function createUnifiedGeneratorPopup(
  options: UnifiedGeneratorPopupOptions,
): GeneratorPopupHandle {
  const { view, pos, commands, defaultCommandId, onStart, onAccept, onReject, onRetry, onClose } =
    options;

  /** 当前选中的指令 id */
  let activeCommandId = defaultCommandId ?? commands[0]?.id ?? '';
  /** 当前状态：idle / input / generating / done / error */
  let state: 'idle' | 'input' | 'generating' | 'done' | 'error' = 'idle';
  /** 累积的生成结果 */
  let resultText = '';

  // -----------------------------------------------------------------------
  // DOM 结构 - 双卡片布局
  // -----------------------------------------------------------------------

  // 编辑器区域透明遮罩（仅覆盖编辑器，不影响侧栏和顶部栏）
  const overlay = document.createElement('div');
  overlay.className = 'lanismd-gen-overlay';

  // 弹窗主容器（包裹两张卡片）
  const wrapper = document.createElement('div');
  wrapper.className = 'lanismd-gen-wrapper';
  wrapper.setAttribute('data-state', 'idle');

  // === 结果卡片（上方，初始隐藏） ===
  const resultCard = document.createElement('div');
  resultCard.className = 'lanismd-gen-card lanismd-gen-result-card';
  resultCard.style.display = 'none';

  // 结果卡片 - 结果内容区
  const resultContent = document.createElement('div');
  resultContent.className = 'lanismd-gen-result-content';
  resultContent.style.display = 'none';
  resultCard.appendChild(resultContent);

  // 结果卡片 - 操作按钮栏
  const resultActions = document.createElement('div');
  resultActions.className = 'lanismd-gen-result-actions';
  resultActions.style.display = 'none';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'lanismd-gen-result-btn lanismd-gen-result-btn-accept';
  acceptBtn.type = 'button';
  acceptBtn.textContent = '接受';

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'lanismd-gen-result-btn lanismd-gen-result-btn-reject';
  rejectBtn.type = 'button';
  rejectBtn.textContent = '拒绝';

  resultActions.appendChild(acceptBtn);
  resultActions.appendChild(rejectBtn);
  resultCard.appendChild(resultActions);

  wrapper.appendChild(resultCard);

  // === 输入卡片（下方，始终显示） ===
  const inputCard = document.createElement('div');
  inputCard.className = 'lanismd-gen-card lanismd-gen-input-card';

  const inputBar = document.createElement('div');
  inputBar.className = 'lanismd-gen-input-bar';

  // AI icon
  const iconEl = document.createElement('span');
  iconEl.className = 'lanismd-gen-icon';
  iconEl.innerHTML = AI_ICON_SVG;
  inputBar.appendChild(iconEl);

  // 下拉选择器
  const selectEl = document.createElement('select');
  selectEl.className = 'lanismd-gen-select';
  for (const cmd of commands) {
    const opt = document.createElement('option');
    opt.value = cmd.id;
    opt.textContent = cmd.label;
    if (cmd.id === activeCommandId) opt.selected = true;
    selectEl.appendChild(opt);
  }
  inputBar.appendChild(selectEl);

  // 输入框（textarea 支持多行）
  const inputEl = document.createElement('textarea');
  inputEl.className = 'lanismd-gen-input';
  inputEl.placeholder = getPlaceholder(activeCommandId);
  inputEl.rows = 1;
  inputBar.appendChild(inputEl);

  // 操作按钮区（根据状态切换内容）
  const actionsEl = document.createElement('div');
  actionsEl.className = 'lanismd-gen-actions';
  inputBar.appendChild(actionsEl);

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'lanismd-gen-close-btn';
  closeBtn.type = 'button';
  closeBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  inputBar.appendChild(closeBtn);

  // 输入卡片内的生成中状态栏（替代输入框和操作按钮）
  const inputGeneratingBar = document.createElement('div');
  inputGeneratingBar.className = 'lanismd-gen-input-generating';
  inputGeneratingBar.style.display = 'none';

  const inputGenText = document.createElement('span');
  inputGenText.className = 'lanismd-gen-generating-text';
  inputGenText.textContent = '正在生成';

  const inputGenDots = document.createElement('span');
  inputGenDots.className = 'lanismd-gen-generating-dots';
  inputGenDots.textContent = '..';

  const inputGenSpacer = document.createElement('span');
  inputGenSpacer.className = 'lanismd-gen-spacer';

  // 输入卡片内的 ESC 停止按钮
  const inputStopBtn = document.createElement('button');
  inputStopBtn.className = 'lanismd-gen-stop-btn';
  inputStopBtn.type = 'button';
  inputStopBtn.innerHTML = '<span class="lanismd-gen-stop-key">ESC</span><span>停止</span>';

  inputGeneratingBar.appendChild(inputGenText);
  inputGeneratingBar.appendChild(inputGenDots);
  inputGeneratingBar.appendChild(inputGenSpacer);
  inputGeneratingBar.appendChild(inputStopBtn);

  inputBar.appendChild(inputGeneratingBar);

  inputCard.appendChild(inputBar);
  wrapper.appendChild(inputCard);

  overlay.appendChild(wrapper);

  // -----------------------------------------------------------------------
  // 发送按钮（输入中状态显示）
  // -----------------------------------------------------------------------

  const sendBtn = document.createElement('button');
  sendBtn.className = 'lanismd-gen-send-btn';
  sendBtn.type = 'button';
  sendBtn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg><span>发送</span>';
  sendBtn.style.display = 'none';

  // -----------------------------------------------------------------------
  // 辅助函数
  // -----------------------------------------------------------------------

  function getPlaceholder(commandId: string): string {
    const cmd = commands.find((c) => c.id === commandId);
    return cmd?.placeholder ?? '向AI助手提问...';
  }

  function updateActionsForState() {
    actionsEl.innerHTML = '';
    if (state === 'input' || state === 'done') {
      actionsEl.appendChild(sendBtn);
      sendBtn.style.display = '';
    } else {
      sendBtn.style.display = 'none';
    }
  }

  /** 切换输入卡片内部的可见性：输入模式 vs 生成中模式 */
  function setInputCardMode(mode: 'editable' | 'generating') {
    if (mode === 'generating') {
      // 隐藏输入框、操作按钮、关闭按钮
      inputEl.style.display = 'none';
      actionsEl.style.display = 'none';
      closeBtn.style.display = 'none';
      // 显示生成中状态栏
      inputGeneratingBar.style.display = '';
      // 下拉框保留但禁用
      selectEl.disabled = true;
    } else {
      // 显示输入框、操作按钮、关闭按钮
      inputEl.style.display = '';
      actionsEl.style.display = '';
      closeBtn.style.display = '';
      // 隐藏生成中状态栏
      inputGeneratingBar.style.display = 'none';
      // 下拉框可用
      selectEl.disabled = false;
      inputEl.readOnly = false;
    }
  }

  function setState(newState: typeof state) {
    state = newState;
    wrapper.setAttribute('data-state', newState);

    switch (newState) {
      case 'idle':
        // 输入卡片可编辑，结果卡片隐藏
        resultCard.style.display = 'none';
        resultContent.style.display = 'none';
        resultActions.style.display = 'none';
        setInputCardMode('editable');
        updateActionsForState();
        break;
      case 'input':
        // 输入卡片可编辑，结果卡片隐藏
        resultCard.style.display = 'none';
        resultContent.style.display = 'none';
        resultActions.style.display = 'none';
        setInputCardMode('editable');
        updateActionsForState();
        break;
      case 'generating':
        // 输入卡片切换为"生成中"状态栏，结果卡片隐藏
        resultCard.style.display = 'none';
        resultContent.style.display = 'none';
        resultActions.style.display = 'none';
        setInputCardMode('generating');
        break;
      case 'done':
        // 结果卡片显示最终结果 + 操作按钮
        resultCard.style.display = '';
        resultContent.style.display = '';
        resultActions.style.display = '';
        setInputCardMode('editable');
        updateActionsForState();
        break;
      case 'error':
        // 结果卡片显示错误信息 + 操作按钮
        resultCard.style.display = '';
        resultContent.style.display = '';
        resultActions.style.display = '';
        setInputCardMode('editable');
        updateActionsForState();
        break;
    }
  }

  /** 自动调整输入框高度 */
  function autoResize() {
    inputEl.style.height = 'auto';
    const scrollHeight = inputEl.scrollHeight;
    // 最大高度 300px
    inputEl.style.height = `${Math.min(scrollHeight, 100)}px`;
    if (scrollHeight > 100) {
      inputEl.style.overflowY = 'auto';
    } else {
      inputEl.style.overflowY = 'hidden';
    }
  }

  /** 触发发送 */
  function doSend() {
    const value = inputEl.value.trim();
    if (!value) return;
    // 如果在 done/error 状态再次发送，先重置结果区
    if (state === 'done' || state === 'error') {
      handle.resetContent();
    }
    onStart(activeCommandId, value);
  }

  // -----------------------------------------------------------------------
  // 事件绑定
  // -----------------------------------------------------------------------

  // 下拉切换
  selectEl.addEventListener('change', () => {
    if (state === 'generating') return;
    activeCommandId = selectEl.value;
    inputEl.placeholder = getPlaceholder(activeCommandId);
    inputEl.focus();
  });

  // 输入框内容变化 -> 切换状态
  inputEl.addEventListener('input', () => {
    autoResize();
    const hasContent = inputEl.value.trim().length > 0;
    if (hasContent && state === 'idle') {
      setState('input');
    } else if (!hasContent && state === 'input') {
      setState('idle');
    }
  });

  // Enter 发送（Shift+Enter 换行）
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  });

  // 发送按钮
  sendBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    doSend();
  });

  // 关闭按钮
  closeBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    destroy();
    onClose();
  });

  // ESC 停止按钮（输入卡片内的） -> 取消生成，回到输入状态
  inputStopBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRetry(activeCommandId, inputEl.value.trim());
    setState('input');
    inputEl.focus();
  });

  // 接受按钮
  acceptBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    destroy();
    onAccept(activeCommandId, resultText);
  });

  // 拒绝按钮
  rejectBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    destroy();
    onReject();
  });

  // 点击遮罩关闭
  // 点击外部区域时不关闭，播放抖动动画提示用户
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) {
      e.preventDefault();
      // 移除再添加类名以支持连续点击时重新触发动画
      wrapper.classList.remove('lanismd-gen-shake');
      // 强制回流以重置动画
      void wrapper.offsetWidth;
      wrapper.classList.add('lanismd-gen-shake');
    }
  });

  // 全局 Esc 处理
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (state === 'generating') {
        // 生成中按 ESC -> 停止生成，回到输入状态
        onRetry(activeCommandId, inputEl.value.trim());
        setState('input');
        inputEl.focus();
      } else {
        destroy();
        onClose();
      }
    }
  }
  document.addEventListener('keydown', handleKeydown, true);

  // -----------------------------------------------------------------------
  // 挂载 & 定位
  // -----------------------------------------------------------------------

  // 遮罩挂载到编辑器容器（而非 document.body），只覆盖编辑器区域
  const editorContainer = view.dom.parentElement ?? document.body;
  // 确保编辑器容器具有定位上下文
  if (getComputedStyle(editorContainer).position === 'static') {
    editorContainer.style.position = 'relative';
  }
  editorContainer.appendChild(overlay);
  positionPopup(view, wrapper, pos);

  // 聚焦输入框
  requestAnimationFrame(() => {
    inputEl.focus();
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
      resultText += delta;
      resultContent.textContent = resultText;
      // 自动滚动到底
      resultContent.scrollTop = resultContent.scrollHeight;
    },

    setDone: () => {
      setState('done');
    },

    setError: (message: string) => {
      resultText = message;
      resultContent.textContent = message;
      resultContent.classList.add('lanismd-gen-result-error');
      setState('error');
    },

    resetContent: () => {
      resultText = '';
      resultContent.textContent = '';
      resultContent.classList.remove('lanismd-gen-result-error');
      resultCard.style.display = 'none';
      resultContent.style.display = 'none';
      resultActions.style.display = 'none';
    },

    switchToResult: () => {
      setState('generating');
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
 */
function positionPopup(view: EditorView, popup: HTMLElement, pos: number) {
  const GAP = 8;
  const MARGIN = 16;

  try {
    const coords = view.coordsAtPos(pos);
    const editorDom = view.dom;
    const editorRect = editorDom.getBoundingClientRect();

    popup.style.position = 'fixed';
    popup.style.left = `${editorRect.left}px`;
    popup.style.width = `${editorRect.width}px`;
    popup.style.top = `${coords.bottom + GAP}px`;

    // 延迟一帧做高度修正
    requestAnimationFrame(() => {
      const popupHeight = popup.offsetHeight;
      const viewportHeight = window.innerHeight;
      const bottomSpace = viewportHeight - coords.bottom - GAP - MARGIN;
      const topSpace = coords.top - GAP - MARGIN;

      if (popupHeight <= bottomSpace) {
        popup.style.top = `${coords.bottom + GAP}px`;
      } else if (popupHeight <= topSpace) {
        popup.style.top = `${coords.top - popupHeight - GAP}px`;
      } else {
        const centeredTop = Math.max(MARGIN, (viewportHeight - popupHeight) / 2);
        popup.style.top = `${centeredTop}px`;
      }
    });
  } catch {
    const editorDom = view.dom;
    const editorRect = editorDom.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.left = `${editorRect.left}px`;
    popup.style.width = `${editorRect.width}px`;
    popup.style.top = '50%';
    popup.style.transform = 'translateY(-50%)';
  }
}

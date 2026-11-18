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
 * 5. 生成完成：结果展示区（自适应方向），输入框变为「继续调整」，下一轮带上上次结果与新要求；
 *    结果卡片提供重新生成与快捷调整（更短 / 更正式 / 换种说法）
 *
 * 切换下拉中的指令后再发送，视为开始新的对话。
 *
 * 遮罩覆盖整个窗口：弹窗打开期间不允许操作其他区域，点击外部仅播放抖动提示。
 * 弹窗高度按可视区剩余空间锁定，结果卡片出现或输入多行时由结果区内部滚动。
 *
 * @changelog
 * | 版本   | 变更说明                                                 | 关联                  |
 * | v1.1.0 | 遮罩覆盖全窗口禁止点击其他区域；高度随可视区限定不再被遮挡 | REQ: AI 弹窗体验优化 |
 * | v2.0.0 | 多轮继续调整、快捷调整按钮、重新生成、自动修复状态与提示   | REQ: AI 体验短板-追问 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import { REWRITE_FOLLOW_UPS } from '@/services/ai/follow-ups';
import type { AiTokenUsage } from '@/services/ai/usage';

import { AI_ICON_SVG, playShake } from './ai-visual';
import { createQuickChips } from './follow-up-bar';
import { positionAnchoredPopup } from './popup-position';
import { createUsageLabel } from './usage-label';

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
  /** 结果是否适用「更短 / 更正式 / 换种说法」快捷调整（代码类输出不适用） */
  rewriteFollowUps?: boolean;
}

/** 继续调整时输入框的占位文本 */
const FOLLOW_UP_PLACEHOLDER = '继续调整，例如：再简洁一些（切换指令可重新开始）';
/** 默认的生成中提示 */
const GENERATING_TEXT = '正在生成';

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
  /** 基于上一轮结果继续调整 */
  onFollowUp?: (instruction: string) => void;
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
  /** 停止生成后回调，返回选中的指令 id 和当前输入 */
  onRetry: (commandId: string, arg: string) => void;
  /** 关闭回调（Esc / 点击遮罩） */
  onClose: () => void;
  /** 基于上一轮结果继续调整；不提供时每次发送都重新开始 */
  onFollowUp?: (commandId: string, instruction: string) => void;
}

export interface GeneratorPopupHandle {
  /** 追加流式内容到结果区域 */
  appendContent: (delta: string) => void;
  /** 推理模型思考阶段（尚未输出正文）时更新状态提示 */
  setThinking: () => void;
  /** 设为完成状态 */
  setDone: () => void;
  /** 设为错误状态 */
  setError: (message: string) => void;
  /** 重置结果区 */
  resetContent: () => void;
  /** 显示本次 token 用量（完成后调用） */
  setUsage: (usage: AiTokenUsage) => void;
  /** 切换到生成中状态 */
  switchToResult: () => void;
  /** 校验失败后自动修复中（清空结果并显示「自动修复中 n/max」） */
  setRepairing: (attempt: number, max: number) => void;
  /** 在结果卡片中显示提示（如校验仍未通过）；传空串清除 */
  setNotice: (message: string, tone?: 'info' | 'warning') => void;
  /** 以给定描述直接开始（调用方已带参数时跳过输入阶段） */
  startWithArg: (arg: string) => void;
  /** 销毁弹窗 */
  destroy: () => void;
}

/**
 * 创建向后兼容的单类型弹窗
 */
export function createGeneratorPopup(options: GeneratorPopupOptions): GeneratorPopupHandle {
  const { view, pos, type, onStart, onAccept, onReject, onRetry, onClose, onFollowUp } = options;

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
    onFollowUp: onFollowUp ? (_cmdId, instruction) => onFollowUp(instruction) : undefined,
  });
}

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
  const { onFollowUp } = options;

  /** 当前选中的指令 id */
  let activeCommandId = defaultCommandId ?? commands[0]?.id ?? '';
  /** 当前状态：idle / input / generating / done / error */
  let state: 'idle' | 'input' | 'generating' | 'done' | 'error' = 'idle';
  /** 累积的生成结果 */
  let resultText = '';
  /** 已有可继续调整结果的指令 id（null 表示尚无对话） */
  let conversationCommandId: string | null = null;
  /** 本次对话的首轮描述（重新生成时使用） */
  let originalArg = '';
  /** 生成中状态栏的提示文本 */
  let statusLabel = GENERATING_TEXT;

  // -----------------------------------------------------------------------
  // DOM 结构 - 双卡片布局
  // -----------------------------------------------------------------------

  // 全窗口透明遮罩（与润色弹窗一致，弹窗打开期间禁止操作其他区域）
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

  const regenerateBtn = document.createElement('button');
  regenerateBtn.className = 'lanismd-gen-result-btn lanismd-gen-result-btn-reject';
  regenerateBtn.type = 'button';
  regenerateBtn.textContent = '重新生成';

  resultActions.appendChild(acceptBtn);
  resultActions.appendChild(rejectBtn);
  resultActions.appendChild(regenerateBtn);

  // 快捷调整按钮（仅改写类指令显示）
  const chipsEl = createQuickChips(REWRITE_FOLLOW_UPS, (instruction) => sendFollowUp(instruction));
  chipsEl.style.display = 'none';
  resultActions.appendChild(chipsEl);

  // 结果提示（如校验未通过）
  const noticeEl = document.createElement('div');
  noticeEl.className = 'lanismd-gen-result-notice';
  noticeEl.style.display = 'none';
  resultCard.appendChild(noticeEl);

  // 用量标签（位于按钮行右侧）
  const usageLabel = createUsageLabel();
  resultActions.appendChild(usageLabel.el);
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

  /** 是否可以在上一轮结果基础上继续调整 */
  function canFollowUp(): boolean {
    return Boolean(onFollowUp) && conversationCommandId === activeCommandId;
  }

  /** 继续调整：带上上一轮结果与新要求 */
  function sendFollowUp(instruction: string) {
    if (!onFollowUp || state === 'generating') return;
    handle.resetContent();
    handle.switchToResult();
    onFollowUp(activeCommandId, instruction);
  }

  /** 开始新的对话 */
  function startFresh(value: string) {
    handle.resetContent();
    conversationCommandId = null;
    originalArg = value;
    onStart(activeCommandId, value);
  }

  /** 触发发送 */
  function doSend() {
    const value = inputEl.value.trim();
    if (!value) return;
    inputEl.value = '';
    autoResize();
    if (canFollowUp()) sendFollowUp(value);
    else startFresh(value);
  }

  /** 输入框占位文本：有可继续的对话时提示继续调整 */
  function refreshPlaceholder() {
    inputEl.placeholder = canFollowUp() ? FOLLOW_UP_PLACEHOLDER : getPlaceholder(activeCommandId);
  }

  // -----------------------------------------------------------------------
  // 事件绑定
  // -----------------------------------------------------------------------

  // 下拉切换
  selectEl.addEventListener('change', () => {
    if (state === 'generating') return;
    activeCommandId = selectEl.value;
    refreshPlaceholder();
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
    stopGenerating();
  });

  // 重新生成：以首轮描述开始新的对话
  regenerateBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (originalArg) startFresh(originalArg);
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

  // 点击外部区域不关闭，播放抖动动画提示用户
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) {
      e.preventDefault();
      playShake(wrapper);
    }
  });

  // 全局 Esc 处理
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (state === 'generating') {
        // 生成中按 ESC -> 停止生成，回到输入状态
        stopGenerating();
      } else {
        destroy();
        onClose();
      }
    }
  }
  document.addEventListener('keydown', handleKeydown, true);

  /** 停止生成：首轮被停止时把描述放回输入框，便于修改后重发 */
  function stopGenerating() {
    onRetry(activeCommandId, originalArg);
    if (!conversationCommandId && !inputEl.value) inputEl.value = originalArg;
    setState('input');
    refreshPlaceholder();
    autoResize();
    inputEl.focus();
  }

  // -----------------------------------------------------------------------
  // 挂载 & 定位
  // -----------------------------------------------------------------------

  // 遮罩挂载到 body，覆盖整个窗口
  document.body.appendChild(overlay);
  // 窗口尺寸变化时重新计算可用空间
  const reposition = () => positionPopup(view, wrapper, pos);
  reposition();
  window.addEventListener('resize', reposition);

  // 聚焦输入框
  requestAnimationFrame(() => {
    inputEl.focus();
  });

  // -----------------------------------------------------------------------
  // handle 实现
  // -----------------------------------------------------------------------

  function destroy() {
    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('resize', reposition);
    if (overlay.parentElement) {
      overlay.parentElement.removeChild(overlay);
    }
  }

  const handle: GeneratorPopupHandle = {
    appendContent: (delta: string) => {
      inputGenText.textContent = statusLabel;
      resultText += delta;
      resultContent.textContent = resultText;
      // 自动滚动到底
      resultContent.scrollTop = resultContent.scrollHeight;
    },

    setThinking: () => {
      if (!resultText && statusLabel === GENERATING_TEXT) inputGenText.textContent = '深度思考中';
    },

    setDone: () => {
      conversationCommandId = activeCommandId;
      const option = commands.find((c) => c.id === activeCommandId);
      chipsEl.style.display = option?.rewriteFollowUps && onFollowUp ? '' : 'none';
      regenerateBtn.style.display = originalArg ? '' : 'none';
      setState('done');
      refreshPlaceholder();
      inputEl.focus();
    },

    setError: (message: string) => {
      resultText = message;
      resultContent.textContent = message;
      resultContent.classList.add('lanismd-gen-result-error');
      setState('error');
    },

    setUsage: (usage) => usageLabel.set(usage),

    resetContent: () => {
      usageLabel.clear();
      resultText = '';
      resultContent.textContent = '';
      resultContent.classList.remove('lanismd-gen-result-error');
      noticeEl.textContent = '';
      noticeEl.style.display = 'none';
      resultCard.style.display = 'none';
      resultContent.style.display = 'none';
      resultActions.style.display = 'none';
    },

    switchToResult: () => {
      statusLabel = GENERATING_TEXT;
      inputGenText.textContent = statusLabel;
      setState('generating');
    },

    setRepairing: (attempt, max) => {
      handle.resetContent();
      statusLabel = `自动修复中 ${attempt}/${max}`;
      inputGenText.textContent = statusLabel;
      setState('generating');
    },

    setNotice: (message, tone = 'info') => {
      noticeEl.textContent = message;
      noticeEl.dataset.tone = tone;
      noticeEl.style.display = message ? '' : 'none';
    },

    startWithArg: (arg) => startFresh(arg),

    destroy,
  };

  return handle;
}

// ---------------------------------------------------------------------------
// 定位工具
// ---------------------------------------------------------------------------

/**
 * 弹窗完全展开时的最大高度：结果卡片（320）+ 卡片间距（8）+ 多行输入卡片（约 132）。
 * 按展开后高度选择展示侧，避免结果出现后才发现空间不足。
 */
const POPUP_MAX_HEIGHT = 460;
/** 单侧空间低于该值时不在该侧展示 */
const POPUP_MIN_HEIGHT = 200;

/** 将弹窗定位到光标行附近，和编辑区内容区等宽 */
function positionPopup(view: EditorView, popup: HTMLElement, pos: number) {
  positionAnchoredPopup(view, popup, {
    from: pos,
    to: pos,
    maxHeight: POPUP_MAX_HEIGHT,
    minHeight: POPUP_MIN_HEIGHT,
  });
}

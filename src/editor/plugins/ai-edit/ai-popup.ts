/**
 * AI 就地弹窗（翻译/解释共用）
 *
 * 定位在选区附近，展示 AI 生成结果。
 * 翻译模式：替换原文 / 插入原文之后 / 关闭 + 语言切换
 * 解释模式：仅关闭
 */

import type { EditorView } from '@milkdown/kit/prose/view';

/** 弹窗模式 */
export type PopupMode = 'translate' | 'explain';

/** 支持的翻译语言 */
export const TRANSLATE_LANGUAGES = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: '英语' },
  { id: 'ja', label: '日语' },
  { id: 'ko', label: '韩语' },
  { id: 'fr', label: '法语' },
  { id: 'de', label: '德语' },
  { id: 'es', label: '西班牙语' },
] as const;

export type TranslateLanguageId = (typeof TRANSLATE_LANGUAGES)[number]['id'];

export interface AiPopupOptions {
  view: EditorView;
  /** 选区起始位置 */
  from: number;
  /** 选区结束位置 */
  to: number;
  /** 弹窗模式 */
  mode: PopupMode;
  /** 初始内容 */
  initialContent?: string;
  /** 替换原文回调 */
  onReplace?: (text: string) => void;
  /** 插入原文之后回调 */
  onInsertAfter?: (text: string) => void;
  /** 关闭回调 */
  onClose?: () => void;
  /** 切换语言重新翻译回调 */
  onLanguageChange?: (langId: TranslateLanguageId) => void;
}

export interface AiPopupHandle {
  /** 追加流式内容 */
  appendContent: (delta: string) => void;
  /** 设为完成状态 */
  setDone: () => void;
  /** 设为错误状态 */
  setError: (message: string) => void;
  /** 清空内容（切换语言后重新翻译时使用） */
  resetContent: () => void;
  /** 销毁弹窗 */
  destroy: () => void;
}

/**
 * 创建并显示就地弹窗。
 */
export function createAiPopup(options: AiPopupOptions): AiPopupHandle {
  const { view, mode, onReplace, onInsertAfter, onClose, onLanguageChange } = options;

  let currentContent = options.initialContent ?? '';
  let isLoading = true;
  let currentLang: TranslateLanguageId = 'en';

  // 全屏透明遮罩
  const overlay = document.createElement('div');
  overlay.className = 'lanismd-ai-popup-overlay';

  // 弹窗容器
  const popup = document.createElement('div');
  popup.className = 'lanismd-ai-popup';
  popup.dataset.mode = mode;

  // 头部：标题 + 语言选择器（仅翻译模式）
  const header = document.createElement('div');
  header.className = 'lanismd-ai-popup-header';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'lanismd-ai-popup-title';
  titleSpan.textContent = mode === 'translate' ? '翻译' : '解释';
  header.appendChild(titleSpan);

  // 语言选择器（仅翻译模式）
  let langSelect: HTMLSelectElement | null = null;
  if (mode === 'translate') {
    langSelect = document.createElement('select');
    langSelect.className = 'lanismd-ai-popup-lang-select';
    for (const lang of TRANSLATE_LANGUAGES) {
      const opt = document.createElement('option');
      opt.value = lang.id;
      opt.textContent = lang.label;
      if (lang.id === currentLang) opt.selected = true;
      langSelect.appendChild(opt);
    }
    langSelect.addEventListener('change', () => {
      if (!langSelect) return;
      const newLang = langSelect.value as TranslateLanguageId;
      if (newLang === currentLang) return;
      currentLang = newLang;
      // 重置状态
      isLoading = true;
      currentContent = '';
      contentEl.textContent = '';
      statusEl.textContent = '翻译中...';
      statusEl.style.display = '';
      // 通知外部重新翻译
      onLanguageChange?.(newLang);
    });
    header.appendChild(langSelect);
  }

  popup.appendChild(header);

  // 状态指示
  const statusEl = document.createElement('div');
  statusEl.className = 'lanismd-ai-popup-status';
  statusEl.textContent = mode === 'translate' ? '翻译中...' : '分析中...';
  popup.appendChild(statusEl);

  // 内容区域
  const contentEl = document.createElement('div');
  contentEl.className = 'lanismd-ai-popup-content';
  if (currentContent) {
    contentEl.textContent = currentContent;
  }
  popup.appendChild(contentEl);

  // 按钮区域
  const actionsEl = document.createElement('div');
  actionsEl.className = 'lanismd-ai-popup-actions';

  if (mode === 'translate') {
    const replaceBtn = document.createElement('button');
    replaceBtn.className = 'lanismd-ai-popup-btn lanismd-ai-popup-btn-primary';
    replaceBtn.textContent = '替换原文';
    replaceBtn.type = 'button';
    replaceBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = contentEl.textContent ?? '';
      destroy();
      onReplace?.(text);
    });

    const insertBtn = document.createElement('button');
    insertBtn.className = 'lanismd-ai-popup-btn';
    insertBtn.textContent = '插入原文之后';
    insertBtn.type = 'button';
    insertBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = contentEl.textContent ?? '';
      destroy();
      onInsertAfter?.(text);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lanismd-ai-popup-btn';
    closeBtn.textContent = '关闭';
    closeBtn.type = 'button';
    closeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      destroy();
      onClose?.();
    });

    actionsEl.appendChild(replaceBtn);
    actionsEl.appendChild(insertBtn);
    actionsEl.appendChild(closeBtn);
  } else {
    // 解释模式：仅关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.className = 'lanismd-ai-popup-btn';
    closeBtn.textContent = '关闭';
    closeBtn.type = 'button';
    closeBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      destroy();
      onClose?.();
    });
    actionsEl.appendChild(closeBtn);
  }

  popup.appendChild(actionsEl);
  overlay.appendChild(popup);

  // 点击遮罩关闭
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) {
      e.preventDefault();
      destroy();
      onClose?.();
    }
  });

  // Esc 关闭
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      destroy();
      onClose?.();
    }
  }
  document.addEventListener('keydown', handleKeydown, true);

  // 挂载到 body
  document.body.appendChild(overlay);

  // 定位弹窗到选区附近
  positionPopup(view, popup, options.from, options.to);

  // handle 实现
  function destroy() {
    document.removeEventListener('keydown', handleKeydown, true);
    if (overlay.parentElement) {
      overlay.parentElement.removeChild(overlay);
    }
  }

  const handle: AiPopupHandle = {
    appendContent: (delta: string) => {
      currentContent += delta;
      contentEl.appendChild(document.createTextNode(delta));
      if (isLoading) {
        statusEl.style.display = 'none';
      }
    },
    setDone: () => {
      isLoading = false;
      statusEl.style.display = 'none';
    },
    setError: (message: string) => {
      isLoading = false;
      statusEl.textContent = message;
      statusEl.style.display = '';
      statusEl.classList.add('lanismd-ai-popup-status-error');
    },
    resetContent: () => {
      currentContent = '';
      contentEl.textContent = '';
      isLoading = true;
      statusEl.textContent = '翻译中...';
      statusEl.style.display = '';
      statusEl.classList.remove('lanismd-ai-popup-status-error');
    },
    destroy,
  };

  return handle;
}

// ---------------------------------------------------------------------------
// 定位工具
// ---------------------------------------------------------------------------

/** 将弹窗定位到选区下方，和编辑区内容区等宽 */
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

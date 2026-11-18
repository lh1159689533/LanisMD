/**
 * 润色专用浮动弹窗
 *
 * 定位在选区下方，和编辑区等宽。
 * 显示润色状态（润色中... / 已完成 / 出错），完成后显示接受/拒绝按钮。
 * 与 inline-diff 配合使用：diff 在编辑器内展示，弹窗控制操作。
 *
 * @changelog
 * | 版本   | 变更说明                                  | 关联                  |
 * | v1.1.0 | 状态行前显示 AI icon；点击外部区域播放抖动 | REQ: AI 弹窗体验优化 |
 * | v2.0.0 | 显示润色风格与逐处取舍统计；遮罩承载 diff   | REQ: AI 体验短板-润色 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView } from '@milkdown/kit/prose/view';

import type { AiTokenUsage } from '@/services/ai/usage';

import { createAiIcon, playShake } from './ai-visual';
import type { DiffSummary } from './inline-diff';
import { createUsageLabel } from './usage-label';

export interface PolishPopupOptions {
  view: EditorView;
  /** 选区起始位置 */
  from: number;
  /** 选区结束位置 */
  to: number;
  /** 风格名称（如 润色 / 精简 / 纠错），用于状态文案 */
  styleLabel?: string;
  /** 接受回调 */
  onAccept: () => void;
  /** 拒绝回调 */
  onReject: () => void;
}

export interface PolishPopupHandle {
  /** 设为流式生成中状态 */
  setStreaming: () => void;
  /** 推理模型思考阶段（尚未输出正文） */
  setThinking: () => void;
  /** 设为完成状态（显示接受/拒绝按钮）；传入改动处统计时显示在状态行 */
  setDone: (summary?: DiffSummary) => void;
  /** 逐处取舍变化时更新统计 */
  setSummary: (summary: DiffSummary) => void;
  /** 全屏遮罩层（行内 diff 挂载于此，才能在遮罩期间交互） */
  overlay: HTMLElement;
  /** 把弹窗移到指定元素下方（diff 比原文高时避免遮挡） */
  placeBelow: (el: HTMLElement) => void;
  /** 设为错误状态 */
  setError: (message: string) => void;
  /** 显示本次 token 用量（完成后调用） */
  setUsage: (usage: AiTokenUsage) => void;
  /** 销毁弹窗 */
  destroy: () => void;
}

/**
 * 创建润色弹窗。
 */
export function createPolishPopup(options: PolishPopupOptions): PolishPopupHandle {
  const { view, onAccept, onReject } = options;
  const styleLabel = options.styleLabel ?? '润色';

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
  statusText.textContent = `${styleLabel}中...`;

  // 加载动画指示器
  const spinner = document.createElement('span');
  spinner.className = 'lanismd-polish-popup-spinner';

  statusRow.appendChild(createAiIcon());
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

  // 用量标签：紧跟「润色完成」状态文字（右侧为接受 / 拒绝按钮）
  const usageLabel = createUsageLabel('inline');
  statusRow.appendChild(usageLabel.el);

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

  // 点击遮罩不关闭（润色进行中不允许随意关闭），播放抖动动画提示用户；
  // 遮罩内的 diff 需要正常响应点击与编辑，因此只拦截直接落在遮罩上的事件
  overlay.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    if (e.target === overlay) {
      e.preventDefault();
      playShake(popup);
    }
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

  /** 状态行显示改动处统计；有拒绝项时主按钮改为「应用所选」 */
  function applySummary({ total, accepted, rejected }: DiffSummary) {
    if (total === 0) {
      statusText.textContent = `${styleLabel}完成，没有需要修改的地方`;
      acceptBtn.textContent = '接受';
      return;
    }
    const decided =
      accepted + rejected > 0 ? `，已接受 ${accepted} 处、拒绝 ${rejected} 处` : '，可逐处取舍';
    statusText.textContent = `${styleLabel}完成：共 ${total} 处修改${decided}`;
    acceptBtn.textContent = rejected > 0 ? '应用所选' : '接受';
  }

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
      statusText.textContent = `${styleLabel}中...`;
    },
    setUsage: (usage) => usageLabel.set(usage),
    setThinking: () => {
      popup.dataset.status = 'streaming';
      statusText.textContent = '深度思考中...';
    },
    setDone: (summary) => {
      popup.dataset.status = 'done';
      if (summary) applySummary(summary);
      else statusText.textContent = `${styleLabel}完成`;
    },
    setSummary: (summary) => applySummary(summary),
    overlay,
    placeBelow: (el) => placePopupBelow(view, popup, el, options.from),
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
function positionPopup(view: EditorView, popup: HTMLElement, from: number, to: number) {
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

/**
 * 把弹窗移到元素下方；下方空间不足时放到选区上方。
 */
function placePopupBelow(view: EditorView, popup: HTMLElement, anchor: HTMLElement, from: number) {
  requestAnimationFrame(() => {
    const anchorRect = anchor.getBoundingClientRect();
    const rect = popup.getBoundingClientRect();
    const below = anchorRect.bottom + 8;
    if (below + rect.height <= window.innerHeight - 16) {
      popup.style.bottom = '';
      popup.style.top = `${below}px`;
      return;
    }
    try {
      const startTop = view.coordsAtPos(from).top;
      popup.style.top = `${Math.max(16, startTop - rect.height - 8)}px`;
    } catch {
      // 定位失败时保持原位置
    }
  });
}

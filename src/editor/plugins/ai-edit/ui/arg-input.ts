/**
 * AI 参数输入框
 *
 * 当指令标记为 `requireArg` 时，在光标位置弹出一个浮动输入框，
 * 收集用户输入后传给 AI 指令。
 *
 * 交互规则：
 * - Enter 确认输入
 * - Esc 取消
 * - 点击外部取消
 */

import type { EditorView } from '@milkdown/kit/prose/view';
import type { AiCommand } from '@/types/ai';

/** 占位提示映射 */
const PLACEHOLDER_MAP: Record<string, string> = {
  mermaid: '描述图表内容，例如：用户登录流程',
  latex: '描述公式，例如：二次方程求根公式',
};

/**
 * 显示参数输入框，返回用户输入的文本。
 * 返回 null 表示用户取消。
 */
export function showArgInput(view: EditorView, command: AiCommand): Promise<string | null> {
  return new Promise((resolve) => {
    // 获取光标位置
    const { state } = view;
    const pos = state.selection.from;
    let coords: { left: number; top: number; bottom: number };
    try {
      coords = view.coordsAtPos(pos);
    } catch {
      coords = { left: 100, top: 100, bottom: 120 };
    }

    // 创建 overlay
    const overlay = document.createElement('div');
    overlay.className = 'lanismd-ai-arg-overlay';

    // 创建输入框容器
    const container = document.createElement('div');
    container.className = 'lanismd-ai-arg-container';

    // 标题行
    const header = document.createElement('div');
    header.className = 'lanismd-ai-arg-header';
    header.innerHTML = `${command.icon}<span>${command.label}</span>`;

    // 输入框
    const input = document.createElement('input');
    input.className = 'lanismd-ai-arg-input';
    input.type = 'text';
    input.placeholder = PLACEHOLDER_MAP[command.id] ?? '输入参数...';

    // 底部提示
    const hint = document.createElement('div');
    hint.className = 'lanismd-ai-arg-hint';
    hint.textContent = 'Enter 确认 / Esc 取消';

    container.appendChild(header);
    container.appendChild(input);
    container.appendChild(hint);
    overlay.appendChild(container);

    let resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
      overlay.remove();
      view.focus();
    }

    function confirm() {
      const value = input.value.trim();
      if (!value) return;
      cleanup();
      resolve(value);
    }

    function cancel() {
      cleanup();
      resolve(null);
    }

    // 事件绑定
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        e.preventDefault();
        cancel();
      }
    });

    // 定位
    document.body.appendChild(overlay);

    // 将容器定位到光标附近
    const viewportWidth = window.innerWidth;
    const containerWidth = 320;
    let left = coords.left;
    if (left + containerWidth > viewportWidth - 16) {
      left = viewportWidth - containerWidth - 16;
    }
    left = Math.max(16, left);

    container.style.position = 'fixed';
    container.style.left = `${left}px`;
    container.style.top = `${coords.bottom + 4}px`;

    // 延迟聚焦，确保 DOM 已渲染
    requestAnimationFrame(() => {
      input.focus();
    });
  });
}

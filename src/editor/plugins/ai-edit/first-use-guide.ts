/**
 * AI 首次使用引导对话框
 *
 * 当用户首次触发 AI 指令但未配置 API Key 时弹出，
 * 引导用户前往设置页配置 Key。
 *
 * 使用纯 DOM 实现（与 arg-input 同模式），
 * 不依赖 React 渲染上下文。
 */

import { useUIStore } from '@/stores/ui-store';

/**
 * 显示 API Key 未配置的引导对话框
 *
 * @returns 用户点击"前往设置"时 resolve(true)，关闭时 resolve(false)
 */
export function showFirstUseGuide(): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;

    // 遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'lanismd-ai-guide-overlay';

    // 对话框容器
    const dialog = document.createElement('div');
    dialog.className = 'lanismd-ai-guide-dialog';

    // 图标区域
    const iconArea = document.createElement('div');
    iconArea.className = 'lanismd-ai-guide-icon';
    iconArea.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;

    // 标题
    const title = document.createElement('h3');
    title.className = 'lanismd-ai-guide-title';
    title.textContent = '配置 AI 助手';

    // 描述
    const desc = document.createElement('p');
    desc.className = 'lanismd-ai-guide-desc';
    desc.textContent = '使用 AI 功能需要先配置 API Key。请前往设置页面选择服务商并填入 Key，即可开始使用 AI 润色、翻译、续写等功能。';

    // 提示
    const hint = document.createElement('p');
    hint.className = 'lanismd-ai-guide-hint';
    hint.textContent = '推荐使用智谱 GLM-4-Flash（免费）快速体验。';

    // 按钮行
    const btnRow = document.createElement('div');
    btnRow.className = 'lanismd-ai-guide-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'lanismd-ai-guide-btn lanismd-ai-guide-btn-cancel';
    cancelBtn.textContent = '稍后再说';
    cancelBtn.type = 'button';

    const goBtn = document.createElement('button');
    goBtn.className = 'lanismd-ai-guide-btn lanismd-ai-guide-btn-go';
    goBtn.textContent = '前往设置';
    goBtn.type = 'button';

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(goBtn);

    dialog.appendChild(iconArea);
    dialog.appendChild(title);
    dialog.appendChild(desc);
    dialog.appendChild(hint);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);

    function cleanup() {
      if (resolved) return;
      resolved = true;
      overlay.remove();
    }

    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      cleanup();
      resolve(false);
    });

    goBtn.addEventListener('click', (e) => {
      e.preventDefault();
      cleanup();
      // 打开设置页的 AI 标签
      useUIStore.getState().openSettings('ai');
      resolve(true);
    });

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) {
        e.preventDefault();
        cleanup();
        resolve(false);
      }
    });

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
        resolve(false);
      }
    });

    document.body.appendChild(overlay);

    // 自动聚焦"前往设置"按钮
    requestAnimationFrame(() => {
      goBtn.focus();
    });
  });
}

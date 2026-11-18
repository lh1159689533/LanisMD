/**
 * AI 首次使用引导对话框
 *
 * 当用户首次触发 AI 指令但未配置 API Key 时弹出，
 * 引导用户前往设置页配置 Key。
 *
 * 使用纯 DOM 实现（与 arg-input 同模式），
 * 不依赖 React 渲染上下文。
 */

import { aiIconSvg } from '@/constants/ai-icon';
import { useUIStore } from '@/stores/ui-store';

/**
 * 显示 AI 不可用（未配置 Key / 无可用模型）的引导对话框
 *
 * @param reason - 不可用原因，决定提示文案
 * @returns 用户点击"前往设置"时 resolve(true)，关闭时 resolve(false)
 */
export function showFirstUseGuide(reason: 'no_key' | 'no_model' = 'no_key'): Promise<boolean> {
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
    iconArea.innerHTML = aiIconSvg(32);

    // 标题
    const title = document.createElement('h3');
    title.className = 'lanismd-ai-guide-title';
    title.textContent = reason === 'no_model' ? '添加 AI 模型' : '配置 API 密钥';

    // 描述
    const desc = document.createElement('p');
    desc.className = 'lanismd-ai-guide-desc';
    desc.textContent =
      reason === 'no_model'
        ? '还没有配置模型。请前往设置页面添加一个模型，支持 Ollama、LM Studio 本地模型，以及 OpenAI、Anthropic、Gemini、OpenRouter 等 API 模型。'
        : '当前模型的 API 密钥不可用。请前往设置页面保存密钥，或确认指定的环境变量已设置。';

    // 提示
    const hint = document.createElement('p');
    hint.className = 'lanismd-ai-guide-hint';
    hint.textContent = '没有 API 密钥？可以先用 Ollama 在本地运行开源模型。';

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

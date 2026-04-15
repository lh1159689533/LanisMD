/**
 * Math Block - 悬浮工具栏
 *
 * 在数学公式块上方显示操作按钮：
 * - 预览状态：编辑
 * - 编辑状态：预览
 */

import { ICONS, CSS_PREFIX, type MathBlockState } from './types';

// ---------------------------------------------------------------------------
// 工具栏创建
// ---------------------------------------------------------------------------

/** 工具栏回调 */
export interface ToolbarCallbacks {
  onToggleEdit: () => void;
  onDelete: () => void;
}

/**
 * 创建悬浮工具栏 DOM
 */
export function createToolbar(callbacks: ToolbarCallbacks): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = `${CSS_PREFIX}-toolbar`;

  // 编辑/预览按钮
  const toggleBtn = document.createElement('button');
  toggleBtn.className = `${CSS_PREFIX}-toolbar-btn ${CSS_PREFIX}-toolbar-btn-toggle`;
  toggleBtn.type = 'button';
  toggleBtn.innerHTML = `<span class="${CSS_PREFIX}-toolbar-icon">${ICONS.edit}</span><span class="${CSS_PREFIX}-toolbar-label">编辑</span>`;
  toggleBtn.title = '编辑 LaTeX 公式';
  toggleBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onToggleEdit();
  });

  // 删除按钮
  const deleteBtn = document.createElement('button');
  deleteBtn.className = `${CSS_PREFIX}-toolbar-btn ${CSS_PREFIX}-toolbar-btn-delete`;
  deleteBtn.type = 'button';
  deleteBtn.innerHTML = `<span class="${CSS_PREFIX}-toolbar-icon">${ICONS.delete}</span><span class="${CSS_PREFIX}-toolbar-label">删除</span>`;
  deleteBtn.title = '删除此块';
  deleteBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onDelete();
  });

  toolbar.appendChild(toggleBtn);
  toolbar.appendChild(deleteBtn);

  return toolbar;
}

/**
 * 更新工具栏状态
 */
export function updateToolbarState(toolbar: HTMLElement, state: MathBlockState): void {
  const toggleBtn = toolbar.querySelector(`.${CSS_PREFIX}-toolbar-btn-toggle`);
  if (!toggleBtn) return;

  if (state === 'editing') {
    toggleBtn.innerHTML = `<span class="${CSS_PREFIX}-toolbar-icon">${ICONS.preview}</span><span class="${CSS_PREFIX}-toolbar-label">预览</span>`;
    toggleBtn.setAttribute('title', '预览公式');
    toolbar.classList.add('is-editing');
  } else {
    toggleBtn.innerHTML = `<span class="${CSS_PREFIX}-toolbar-icon">${ICONS.edit}</span><span class="${CSS_PREFIX}-toolbar-label">编辑</span>`;
    toggleBtn.setAttribute('title', '编辑 LaTeX 公式');
    toolbar.classList.remove('is-editing');
  }
}

/**
 * Board Block - 悬浮工具栏
 *
 * 在画板块右上角显示操作按钮：编辑/完成（切换只读态）、删除。
 * 按钮统一用 mousedown + preventDefault + stopPropagation，避免抢走编辑器焦点
 * 或触发 ProseMirror 的节点选择。
 *
 * @changelog
 * | 版本   | 变更说明                   | 关联                                                 |
 * | v1.0.0 | 初始实现：编辑/完成/删除工具栏 | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { CSS_PREFIX, ICONS } from './constants';
import type { BoardBlockState } from './types';

/** 工具栏回调 */
export interface ToolbarCallbacks {
  /** 切换编辑/预览 */
  onToggleEdit: () => void;
  /** 删除整个画板块 */
  onDelete: () => void;
}

/**
 * 创建悬浮工具栏 DOM。
 */
export function createToolbar(callbacks: ToolbarCallbacks): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = `${CSS_PREFIX}__toolbar`;

  // 编辑 / 完成 切换按钮
  const toggleBtn = document.createElement('button');
  toggleBtn.className = `${CSS_PREFIX}__toolbar-btn ${CSS_PREFIX}__toolbar-btn--toggle`;
  toggleBtn.type = 'button';
  toggleBtn.innerHTML = `<span class="${CSS_PREFIX}__toolbar-icon">${ICONS.edit}</span><span class="${CSS_PREFIX}__toolbar-label">编辑</span>`;
  toggleBtn.title = '编辑思维导图';
  toggleBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onToggleEdit();
  });

  // 删除按钮
  const deleteBtn = document.createElement('button');
  deleteBtn.className = `${CSS_PREFIX}__toolbar-btn ${CSS_PREFIX}__toolbar-btn--delete`;
  deleteBtn.type = 'button';
  deleteBtn.innerHTML = `<span class="${CSS_PREFIX}__toolbar-icon">${ICONS.delete}</span><span class="${CSS_PREFIX}__toolbar-label">删除</span>`;
  deleteBtn.title = '删除此画板';
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
 * 依据当前状态更新工具栏文案与图标。
 */
export function updateToolbarState(toolbar: HTMLElement, state: BoardBlockState): void {
  const toggleBtn = toolbar.querySelector(`.${CSS_PREFIX}__toolbar-btn--toggle`);
  if (!toggleBtn) return;

  if (state === 'editing') {
    toggleBtn.innerHTML = `<span class="${CSS_PREFIX}__toolbar-icon">${ICONS.preview}</span><span class="${CSS_PREFIX}__toolbar-label">完成</span>`;
    toggleBtn.setAttribute('title', '完成编辑');
    toolbar.classList.add('is-editing');
  } else {
    toggleBtn.innerHTML = `<span class="${CSS_PREFIX}__toolbar-icon">${ICONS.edit}</span><span class="${CSS_PREFIX}__toolbar-label">编辑</span>`;
    toggleBtn.setAttribute('title', '编辑思维导图');
    toolbar.classList.remove('is-editing');
  }
}

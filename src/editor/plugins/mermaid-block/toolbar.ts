/**
 * Mermaid Block - 悬浮工具栏
 *
 * 在 Mermaid 块上方显示操作按钮：
 * - 预览状态：编辑 / PNG / SVG
 * - 编辑状态：预览 / PNG / SVG
 *
 * 预览状态下 hover 时显示，编辑状态下始终显示
 */

import { ICONS, CSS_PREFIX, type MermaidBlockState } from './types';

// ---------------------------------------------------------------------------
// 工具栏创建
// ---------------------------------------------------------------------------

/** 工具栏回调 */
export interface ToolbarCallbacks {
  onToggleEdit: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
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
  toggleBtn.title = '编辑 Mermaid 代码';
  toggleBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onToggleEdit();
  });

  // PNG 导出按钮
  const pngBtn = document.createElement('button');
  pngBtn.className = `${CSS_PREFIX}-toolbar-btn`;
  pngBtn.type = 'button';
  pngBtn.innerHTML = `<span class="${CSS_PREFIX}-toolbar-icon">${ICONS.png}</span><span class="${CSS_PREFIX}-toolbar-label">PNG</span>`;
  pngBtn.title = '导出为 PNG';
  pngBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onExportPng();
  });

  // SVG 导出按钮
  const svgBtn = document.createElement('button');
  svgBtn.className = `${CSS_PREFIX}-toolbar-btn`;
  svgBtn.type = 'button';
  svgBtn.innerHTML = `<span class="${CSS_PREFIX}-toolbar-icon">${ICONS.svg}</span><span class="${CSS_PREFIX}-toolbar-label">SVG</span>`;
  svgBtn.title = '导出为 SVG';
  svgBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onExportSvg();
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
  toolbar.appendChild(pngBtn);
  toolbar.appendChild(svgBtn);
  toolbar.appendChild(deleteBtn);

  return toolbar;
}

/**
 * 更新工具栏状态（编辑/预览按钮文字和图标）
 */
export function updateToolbarState(toolbar: HTMLElement, state: MermaidBlockState): void {
  const toggleBtn = toolbar.querySelector(`.${CSS_PREFIX}-toolbar-btn-toggle`);
  if (!toggleBtn) return;

  if (state === 'editing') {
    toggleBtn.innerHTML = `<span class="${CSS_PREFIX}-toolbar-icon">${ICONS.preview}</span><span class="${CSS_PREFIX}-toolbar-label">预览</span>`;
    toggleBtn.setAttribute('title', '预览图表');
    toolbar.classList.add('is-editing');
  } else {
    toggleBtn.innerHTML = `<span class="${CSS_PREFIX}-toolbar-icon">${ICONS.edit}</span><span class="${CSS_PREFIX}-toolbar-label">编辑</span>`;
    toggleBtn.setAttribute('title', '编辑 Mermaid 代码');
    toolbar.classList.remove('is-editing');
  }
}

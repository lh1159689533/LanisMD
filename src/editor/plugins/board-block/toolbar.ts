/**
 * Board Block - 悬浮工具栏
 *
 * 在画板块右上角显示操作按钮，按钮顺序为「最大化 / 编辑 / 删除」。
 * 按钮统一用 mousedown + preventDefault + stopPropagation，避免抢走编辑器焦点
 * 或触发 ProseMirror 的节点选择。
 *
 * 同一份工具栏同时服务于两种宿主：
 * - 主窗口 NodeView：三个按钮齐全，锁定态下仅露出「返回全屏」。
 * - 全屏子窗口：只渲染「还原 + 编辑」，不提供删除与高度调整。
 *
 * @changelog
 * | 版本   | 变更说明                   | 关联                                                 |
 * | v1.0.0 | 初始实现：编辑/完成/删除工具栏 | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * | v1.1.0 | 新增最大化按钮与按钮可选渲染   | REQ: 20261026-board-fullscreen TECH: 画板全屏窗口方案 §二 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { CSS_PREFIX, ICONS } from './constants';
import type { BoardBlockState } from './types';

/**
 * 全屏按钮的三种形态。
 *
 * - `maximize`：主窗口常态，点击打开全屏窗口
 * - `restore`：全屏子窗口内，点击关闭窗口回到主窗口
 * - `focus`：主窗口锁定态（全屏窗口已打开），点击聚焦既有全屏窗口
 */
export type ToolbarFullscreenMode = 'maximize' | 'restore' | 'focus';

/** 全屏按钮各形态的图标与文案 */
const FULLSCREEN_PRESET: Record<ToolbarFullscreenMode, { icon: string; label: string; title: string }> = {
  maximize: { icon: ICONS.maximize, label: '最大化', title: '在全屏窗口中打开' },
  restore: { icon: ICONS.restore, label: '还原', title: '退出全屏（Esc）' },
  focus: { icon: ICONS.maximize, label: '返回全屏', title: '切换到已打开的全屏窗口' },
};

/** 工具栏回调 */
export interface ToolbarCallbacks {
  /** 切换编辑/预览 */
  onToggleEdit: () => void;
  /** 删除整个画板块；不传则不渲染删除按钮 */
  onDelete?: () => void;
  /** 点击全屏按钮；不传则不渲染全屏按钮 */
  onFullscreen?: () => void;
}

/** 工具栏构造选项 */
export interface ToolbarOptions {
  /** 全屏按钮初始形态，默认 `maximize` */
  fullscreenMode?: ToolbarFullscreenMode;
}

/**
 * 创建悬浮工具栏 DOM。
 *
 * 按钮渲染与否完全由 `callbacks` 中对应回调是否传入决定。
 */
export function createToolbar(
  callbacks: ToolbarCallbacks,
  options: ToolbarOptions = {},
): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = `${CSS_PREFIX}__toolbar`;

  // 全屏（最大化 / 还原）按钮，位于最左侧
  if (callbacks.onFullscreen) {
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = `${CSS_PREFIX}__toolbar-btn ${CSS_PREFIX}__toolbar-btn--fullscreen`;
    fullscreenBtn.type = 'button';
    fullscreenBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onFullscreen?.();
    });
    toolbar.appendChild(fullscreenBtn);
    applyFullscreenMode(fullscreenBtn, options.fullscreenMode ?? 'maximize');
  }

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
  toolbar.appendChild(toggleBtn);

  // 删除按钮（全屏窗口不提供）
  if (callbacks.onDelete) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = `${CSS_PREFIX}__toolbar-btn ${CSS_PREFIX}__toolbar-btn--delete`;
    deleteBtn.type = 'button';
    deleteBtn.innerHTML = `<span class="${CSS_PREFIX}__toolbar-icon">${ICONS.delete}</span><span class="${CSS_PREFIX}__toolbar-label">删除</span>`;
    deleteBtn.title = '删除此画板';
    deleteBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onDelete?.();
    });
    toolbar.appendChild(deleteBtn);
  }

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

/**
 * 切换全屏按钮的形态。
 *
 * 同时在工具栏根节点打上 `is-locked` 标记：锁定态（`focus`）下由 CSS
 * 隐藏编辑与删除按钮，避免主窗口与全屏窗口出现两个可编辑实例。
 */
export function updateToolbarFullscreenMode(
  toolbar: HTMLElement,
  mode: ToolbarFullscreenMode,
): void {
  const btn = toolbar.querySelector(`.${CSS_PREFIX}__toolbar-btn--fullscreen`);
  if (btn) applyFullscreenMode(btn, mode);
  toolbar.classList.toggle('is-locked', mode === 'focus');
}

/** 把指定形态的图标与文案写入全屏按钮 */
function applyFullscreenMode(btn: Element, mode: ToolbarFullscreenMode): void {
  const preset = FULLSCREEN_PRESET[mode];
  btn.innerHTML = `<span class="${CSS_PREFIX}__toolbar-icon">${preset.icon}</span><span class="${CSS_PREFIX}__toolbar-label">${preset.label}</span>`;
  btn.setAttribute('title', preset.title);
}

/**
 * Board Canvas Toolbar - 主题选择面板
 *
 * 列出 Plait 全部画板主题（`ThemeColorMode`），每项带色彩预览：
 * 根节点填充色 + 前若干分支色。预览色全部从 `MindThemeColors` 按 mode 查表，
 * 不在本模块硬编码任何颜色，保证与 Plait 实际渲染结果一致。
 *
 * 面板作为工具栏根 DOM 的后代渲染（不 portal 到 body），从而继承工具栏根上的
 * `plait-board-attached` 类——否则点击面板的瞬间 Plait 的 globalPointerUp
 * 会清空选中态。
 *
 * @changelog
 * | 版本   | 变更说明                   | 关联                                                     |
 * | v1.0.0 | 初始实现：主题选择面板       | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §二 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { ThemeColorMode } from '@plait/core';
import { MindThemeColors } from '@plait/mind';

import { CANVAS_TOOLBAR_PREFIX, THEME_OPTIONS } from './constants';
import { CANVAS_ICONS } from './icons';

/** 单项预览中展示的分支色数量 */
const PREVIEW_BRANCH_COUNT = 4;

/** 主题面板控制器 */
export interface ThemePanelController {
  /** 面板根 DOM */
  readonly dom: HTMLElement;
  /** 面板是否展开 */
  readonly isOpen: boolean;
  /** 展开面板 */
  open(): void;
  /** 收起面板 */
  close(): void;
  /** 切换展开态 */
  toggle(): void;
  /** 回填当前生效主题的勾选态 */
  setActive(mode: ThemeColorMode): void;
  /** 销毁：移除监听与 DOM */
  destroy(): void;
}

/**
 * 按 mode 查 Mind 主题色。
 *
 * `MindThemeColors` 的 `mode` 字段类型为 `ThemeColorMode | string`，
 * 查不到时回落首项，避免预览区空白。
 */
function findThemeColor(mode: ThemeColorMode) {
  return MindThemeColors.find((item) => item.mode === mode) ?? MindThemeColors[0];
}

/**
 * 创建主题选择面板。
 *
 * @param onSelect 用户点选某个主题时回调（面板自身不写入 board）
 */
export function createThemePanel(
  onSelect: (mode: ThemeColorMode) => void,
): ThemePanelController {
  let open = false;
  /** mode -> 列表项 DOM，用于 setActive 回填勾选 */
  const itemMap = new Map<string, HTMLElement>();

  const dom = document.createElement('div');
  dom.className = `${CANVAS_TOOLBAR_PREFIX}__theme-panel`;
  dom.setAttribute('data-open', 'false');

  const title = document.createElement('div');
  title.className = `${CANVAS_TOOLBAR_PREFIX}__theme-panel-title`;
  title.textContent = '画板主题';
  dom.appendChild(title);

  const list = document.createElement('div');
  list.className = `${CANVAS_TOOLBAR_PREFIX}__theme-list`;
  dom.appendChild(list);

  for (const option of THEME_OPTIONS) {
    const color = findThemeColor(option.mode);
    const item = document.createElement('button');
    item.className = `${CANVAS_TOOLBAR_PREFIX}__theme-item`;
    item.type = 'button';
    item.title = option.label;
    item.setAttribute('data-mode', option.mode);

    // 预览区：画板背景作底，根节点色 + 分支色依次排开
    const preview = document.createElement('span');
    preview.className = `${CANVAS_TOOLBAR_PREFIX}__theme-preview`;
    if (color?.boardBackground) {
      preview.style.background = color.boardBackground;
    }

    const root = document.createElement('span');
    root.className = `${CANVAS_TOOLBAR_PREFIX}__theme-swatch is-root`;
    root.style.background = color?.rootFill ?? 'transparent';
    preview.appendChild(root);

    const branches = (color?.branchColors ?? []).slice(0, PREVIEW_BRANCH_COUNT);
    for (const branch of branches) {
      const dot = document.createElement('span');
      dot.className = `${CANVAS_TOOLBAR_PREFIX}__theme-swatch`;
      dot.style.background = branch;
      preview.appendChild(dot);
    }
    item.appendChild(preview);

    const label = document.createElement('span');
    label.className = `${CANVAS_TOOLBAR_PREFIX}__theme-label`;
    label.textContent = option.label;
    item.appendChild(label);

    const check = document.createElement('span');
    check.className = `${CANVAS_TOOLBAR_PREFIX}__theme-check`;
    check.innerHTML = CANVAS_ICONS.check;
    item.appendChild(check);

    // 与插件内其它工具栏保持一致：用 mousedown 并阻断默认行为与冒泡，
    // 避免抢走编辑器焦点或触发 ProseMirror 的节点选择。
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(option.mode);
      close();
    });

    itemMap.set(option.mode, item);
    list.appendChild(item);
  }

  /** 点击面板与触发按钮之外的区域时收起 */
  function handleOutsidePointerDown(event: MouseEvent): void {
    if (!open) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    // 面板自身，以及同一张工具栏卡片内的主题按钮，都不算「外部」
    if (dom.contains(target)) return;
    if (target.closest(`.${CANVAS_TOOLBAR_PREFIX}__btn--theme`)) return;
    close();
  }

  function setOpen(next: boolean): void {
    if (open === next) return;
    open = next;
    dom.setAttribute('data-open', next ? 'true' : 'false');
    if (next) {
      // 捕获阶段监听：确保在 Plait 的指针处理之前就能判定并收起
      document.addEventListener('mousedown', handleOutsidePointerDown, true);
    } else {
      document.removeEventListener('mousedown', handleOutsidePointerDown, true);
    }
  }

  function openPanel(): void {
    setOpen(true);
  }

  function close(): void {
    setOpen(false);
  }

  function toggle(): void {
    setOpen(!open);
  }

  function setActive(mode: ThemeColorMode): void {
    for (const [key, item] of itemMap) {
      item.classList.toggle('is-active', key === mode);
    }
  }

  function destroy(): void {
    document.removeEventListener('mousedown', handleOutsidePointerDown, true);
    itemMap.clear();
    dom.remove();
  }

  return {
    dom,
    get isOpen() {
      return open;
    },
    open: openPanel,
    close,
    toggle,
    setActive,
    destroy,
  };
}

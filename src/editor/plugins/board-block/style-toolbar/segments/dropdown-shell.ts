/**
 * Board Style Toolbar - 下拉外壳（白板分支专用）
 *
 * 把「工具栏按钮 + 其内部下拉面板 + 开合与外部点击收起」这套样板抽成公共件，
 * 供画板的填充 / 描边 / 不透明度三个能力组复用。
 *
 * **刻意不改造导图侧的 fill.ts / stroke.ts / text-style.ts**：
 * PRD §3.8 风险表把「样式工具栏重构触碰导图已交付逻辑」标为高风险，应对策略是
 * 「抽分流层 + 导图分支保持原实现不动」。因此本文件只被新增的 draw-* 能力组引用，
 * 既有导图能力组一行不改，彼此的回归面完全隔离。
 *
 * 关键约定（与既有能力组保持一致）：
 * - 下拉面板作为**按钮的子节点**渲染，从而继承工具栏根上的
 *   `plait-board-attached` 类；若 portal 到 body，点击面板的瞬间 Plait 的
 *   globalPointerUp 就会清空画板选中态，工具栏随即消失。
 * - 因此按钮自身的 click 必须排除来自面板内部的冒泡。
 * - 外部点击监听挂在捕获阶段，确保早于 Plait 的指针处理。
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                      |
 * | v1.0.0 | 初始实现：按钮 + 下拉的公共外壳 | REQ: 20261027-board-whiteboard-draw §3.8  |
 * /@changelog
 *
 * @author hhhuilli
 */

import { PREFIX } from '../constants';

/** 下拉外壳控制器 */
export interface DropdownShell {
  /** 工具栏按钮（下拉面板是其子节点） */
  readonly button: HTMLButtonElement;
  /** 下拉面板容器，调用方往里塞内容 */
  readonly dropdown: HTMLElement;
  /** 面板是否展开 */
  readonly isOpen: boolean;
  /** 展开 */
  open(): void;
  /** 收起 */
  close(): void;
  /** 切换展开态 */
  toggle(): void;
  /** 设置能力组显隐（隐藏时先收起面板，避免状态残留） */
  setVisible(visible: boolean): void;
  /** 销毁：移除监听与 DOM */
  destroy(): void;
}

/**
 * 创建一个「按钮 + 下拉」外壳。
 *
 * @param config.modifier BEM 修饰名，生成 `__btn--{modifier}` 与 `__{modifier}-dropdown`
 * @param config.title    按钮 tooltip
 * @param config.icon     按钮图标（SVG 字符串）
 */
export function createDropdownShell(config: {
  modifier: string;
  title: string;
  icon: string;
}): DropdownShell {
  let open = false;

  const button = document.createElement('button');
  button.className = `${PREFIX}__btn ${PREFIX}__btn--${config.modifier}`;
  button.type = 'button';
  button.title = config.title;
  button.innerHTML = config.icon;

  const dropdown = document.createElement('div');
  dropdown.className = `${PREFIX}__dropdown ${PREFIX}__${config.modifier}-dropdown`;
  button.appendChild(dropdown);

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // 面板内部的点击由各自的选项处理，不应再触发按钮的开合
    if ((e.target as HTMLElement).closest(`.${PREFIX}__dropdown`)) return;
    toggle();
  });

  function handleOutsideClick(e: MouseEvent): void {
    if (!button.contains(e.target as Node)) {
      close();
    }
  }

  function openPanel(): void {
    if (open) return;
    open = true;
    dropdown.classList.add('is-open');
    button.classList.add('is-dropdown-open');
    // 延后一帧注册，避免本次打开的 mousedown 立即被判为「外部点击」
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleOutsideClick, true);
    });
  }

  function close(): void {
    if (!open) return;
    open = false;
    dropdown.classList.remove('is-open');
    button.classList.remove('is-dropdown-open');
    document.removeEventListener('mousedown', handleOutsideClick, true);
  }

  function toggle(): void {
    if (open) {
      close();
    } else {
      openPanel();
    }
  }

  function setVisible(visible: boolean): void {
    if (!visible) close();
    button.style.display = visible ? '' : 'none';
  }

  function destroy(): void {
    close();
    button.remove();
  }

  return {
    button,
    dropdown,
    get isOpen() {
      return open;
    },
    open: openPanel,
    close,
    toggle,
    setVisible,
    destroy,
  };
}

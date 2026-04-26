/**
 * Slash Command Menu Plugin
 *
 * 输入 `/` 触发命令菜单，支持：
 * - 标题、列表、代码块、数学公式等原有指令（commands-basic.ts）
 * - AI 指令分组（commands-ai.ts，受 `ai.enabled && ai.showInSlash` 控制）
 * - 键盘导航（↑↓ 选择，Enter 执行，← → 进/出子菜单，Esc 关闭）
 * - 输入过滤（输入 /h 只显示标题相关项）
 */

import { SlashProvider, slashFactory } from '@milkdown/plugin-slash';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';

import { useSettingsStore } from '@/stores/settings-store';

import { basicSlashCommands } from './commands-basic';
import { createAiSlashCommand } from './commands-ai';
import type { SlashCommand } from './types';

// ---------------------------------------------------------------------------
// 合成当前菜单命令清单
// ---------------------------------------------------------------------------

/**
 * 根据 settings 中的 AI 配置，拼出当前 slash menu 的指令列表。
 *
 * - 当 `ai.enabled` 且 `ai.showInSlash` 为 true 时，在列表最前插入 "AI 助手" 分组。
 */
function getCurrentCommands(): SlashCommand[] {
  const { config } = useSettingsStore.getState();
  const aiOn = config.ai?.enabled !== false && config.ai?.showInSlash !== false;

  if (aiOn) {
    return [createAiSlashCommand(), ...basicSlashCommands];
  }
  return [...basicSlashCommands];
}

// ---------------------------------------------------------------------------
// Slash Menu View
// ---------------------------------------------------------------------------

class SlashMenuView {
  private container: HTMLElement;
  /** 内层滚动容器，菜单项挂载在这里 */
  private listContainer: HTMLElement;
  private items: HTMLElement[] = [];
  private activeIndex = 0;
  private allCommands: SlashCommand[] = getCurrentCommands();
  private filteredCommands: SlashCommand[] = [...this.allCommands];
  private view: EditorView | null = null;
  private provider: SlashProvider | null = null;

  /** 当前展开的子菜单容器 */
  private submenu: HTMLElement | null = null;
  /** 子菜单对应的父级索引 */
  private submenuParentIndex = -1;
  /** 子菜单中高亮的索引，-1 表示未进入子菜单 */
  private submenuActiveIndex = -1;
  /** 子菜单项 DOM 列表 */
  private submenuItems: HTMLElement[] = [];
  /** 是否正在子菜单中导航 */
  private inSubmenu = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'milkdown-slash';
    this.container.dataset.show = 'false';

    this.listContainer = document.createElement('div');
    this.listContainer.className = 'milkdown-slash-list';
    this.container.appendChild(this.listContainer);

    this.renderItems();
  }

  get element() {
    return this.container;
  }

  /** 每次打开菜单前刷新命令列表，让 AI 分组能随设置变化实时反映 */
  refreshCommands() {
    this.allCommands = getCurrentCommands();
    this.filteredCommands = [...this.allCommands];
  }

  private renderItems() {
    this.listContainer.innerHTML = '';
    this.items = [];
    this.hideSubmenu();

    this.filteredCommands.forEach((cmd, index) => {
      const item = document.createElement('div');
      item.className = 'milkdown-slash-item';
      if (cmd.extraClass) item.classList.add(cmd.extraClass);
      item.dataset.index = String(index);

      const iconSpan = document.createElement('span');
      iconSpan.className = 'milkdown-slash-icon';
      iconSpan.innerHTML = cmd.icon;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'milkdown-slash-label';
      labelSpan.textContent = cmd.label;

      item.appendChild(iconSpan);
      item.appendChild(labelSpan);

      if (cmd.children && cmd.children.length > 0) {
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'milkdown-slash-arrow';
        arrowSpan.innerHTML =
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
        item.appendChild(arrowSpan);
      } else if (cmd.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'milkdown-slash-shortcut';
        shortcutSpan.textContent = cmd.shortcut;
        item.appendChild(shortcutSpan);
      }

      item.addEventListener('mouseenter', () => {
        this.setActive(index);
        if (cmd.children && cmd.children.length > 0) {
          this.showSubmenu(index, item);
        } else {
          this.hideSubmenu();
        }
      });

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (cmd.children && cmd.children.length > 0) return;
        this.executeItem(index);
      });

      this.listContainer.appendChild(item);
      this.items.push(item);
    });

    this.setActive(0);
  }

  /** 展示右侧子菜单 */
  private showSubmenu(parentIndex: number, anchorEl: HTMLElement) {
    if (this.submenuParentIndex === parentIndex && this.submenu) return;

    this.hideSubmenu();

    const cmd = this.filteredCommands[parentIndex];
    if (!cmd?.children || cmd.children.length === 0) return;

    this.submenuParentIndex = parentIndex;
    this.submenuActiveIndex = -1;
    this.submenuItems = [];
    this.inSubmenu = false;

    const submenu = document.createElement('div');
    submenu.className = 'milkdown-slash-submenu';

    cmd.children.forEach((child, childIndex) => {
      // 分隔线条目
      if (child.label === '---') {
        const sep = document.createElement('div');
        sep.className = 'milkdown-slash-submenu-separator';
        submenu.appendChild(sep);
        // 占位但不可交互
        this.submenuItems.push(sep);
        return;
      }

      const item = document.createElement('div');
      item.className = 'milkdown-slash-item';
      if (child.extraClass) item.classList.add(child.extraClass);
      item.dataset.subindex = String(childIndex);

      const iconSpan = document.createElement('span');
      iconSpan.className = 'milkdown-slash-icon';
      iconSpan.innerHTML = child.icon;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'milkdown-slash-label';
      labelSpan.textContent = child.label;

      item.appendChild(iconSpan);
      item.appendChild(labelSpan);

      item.addEventListener('mouseenter', () => {
        this.setSubmenuActive(childIndex);
        this.inSubmenu = true;
      });

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.executeSubmenuItem(childIndex);
      });

      submenu.appendChild(item);
      this.submenuItems.push(item);
    });

    submenu.addEventListener('mouseleave', () => {
      this.inSubmenu = false;
      this.submenuActiveIndex = -1;
      this.submenuItems.forEach((el) => {
        el.dataset.active = 'false';
      });
    });

    this.container.appendChild(submenu);

    requestAnimationFrame(() => {
      const listRect = this.listContainer.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      const anchorRect = anchorEl.getBoundingClientRect();
      const submenuRect = submenu.getBoundingClientRect();

      let left = listRect.width - 4;
      let top = anchorRect.top - containerRect.top;

      const viewportWidth = window.innerWidth;
      if (listRect.right + submenuRect.width > viewportWidth) {
        left = -submenuRect.width + 4;
      }

      const viewportHeight = window.innerHeight;
      if (containerRect.top + top + submenuRect.height > viewportHeight) {
        top = Math.max(0, viewportHeight - containerRect.top - submenuRect.height - 8);
      }

      submenu.style.left = `${left}px`;
      submenu.style.top = `${top}px`;
    });

    this.submenu = submenu;
  }

  private hideSubmenu() {
    if (this.submenu) {
      this.submenu.remove();
      this.submenu = null;
    }
    this.submenuParentIndex = -1;
    this.submenuActiveIndex = -1;
    this.submenuItems = [];
    this.inSubmenu = false;
  }

  private setActive(index: number) {
    if (this.filteredCommands.length === 0) return;
    this.activeIndex = Math.max(0, Math.min(index, this.filteredCommands.length - 1));
    this.items.forEach((item, i) => {
      item.dataset.active = String(i === this.activeIndex);
    });

    const activeItem = this.items[this.activeIndex];
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  private setSubmenuActive(index: number) {
    if (this.submenuItems.length === 0) return;
    // 跳过分隔符条目
    let target = Math.max(0, Math.min(index, this.submenuItems.length - 1));
    const isSeparator = (i: number) =>
      this.submenuItems[i]?.classList.contains('milkdown-slash-submenu-separator');
    // 向前或向后搜索非分隔符条目
    if (isSeparator(target)) {
      const direction = target >= this.submenuActiveIndex ? 1 : -1;
      for (let i = 0; i < this.submenuItems.length; i++) {
        target = (target + direction + this.submenuItems.length) % this.submenuItems.length;
        if (!isSeparator(target)) break;
      }
    }
    this.submenuActiveIndex = target;
    this.submenuItems.forEach((item, i) => {
      item.dataset.active = String(i === this.submenuActiveIndex);
    });
  }

  private executeItem(index: number) {
    const cmd = this.filteredCommands[index];
    if (!cmd || !this.view) return;
    cmd.execute(this.view);
    this.hideSubmenu();
    this.provider?.hide();
  }

  private executeSubmenuItem(childIndex: number) {
    const parent = this.filteredCommands[this.submenuParentIndex];
    if (!parent?.children || !this.view) return;
    const child = parent.children[childIndex];
    if (!child || child.label === '---') return; // 跳过分隔符
    child.execute(this.view);
    this.hideSubmenu();
    this.provider?.hide();
  }

  /** 基于搜索文本过滤命令 */
  filter(query: string) {
    const q = query.toLowerCase().trim();
    if (!q) {
      this.filteredCommands = [...this.allCommands];
    } else {
      this.filteredCommands = this.allCommands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(q) ||
          cmd.keywords.some((k) => k.includes(q)) ||
          (cmd.children &&
            cmd.children.some(
              (child) =>
                child.label.toLowerCase().includes(q) || child.keywords.some((k) => k.includes(q)),
            )),
      );
    }
    this.renderItems();

    if (this.filteredCommands.length === 0) {
      this.listContainer.innerHTML = '<div class="milkdown-slash-empty">没有匹配的命令</div>';
    }
  }

  /** 处理键盘事件，返回 true 表示已处理 */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (this.filteredCommands.length === 0) {
      if (event.key === 'Escape') {
        this.provider?.hide();
        return true;
      }
      return false;
    }

    if (this.inSubmenu && this.submenuItems.length > 0) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.setSubmenuActive(
            this.submenuActiveIndex >= this.submenuItems.length - 1
              ? 0
              : this.submenuActiveIndex + 1,
          );
          return true;
        case 'ArrowUp':
          event.preventDefault();
          this.setSubmenuActive(
            this.submenuActiveIndex <= 0
              ? this.submenuItems.length - 1
              : this.submenuActiveIndex - 1,
          );
          return true;
        case 'Enter':
          event.preventDefault();
          if (this.submenuActiveIndex >= 0) {
            this.executeSubmenuItem(this.submenuActiveIndex);
          }
          return true;
        case 'ArrowLeft':
        case 'Escape':
          event.preventDefault();
          this.inSubmenu = false;
          this.submenuActiveIndex = -1;
          this.submenuItems.forEach((el) => {
            el.dataset.active = 'false';
          });
          return true;
        default:
          return false;
      }
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.setActive(
          this.activeIndex >= this.filteredCommands.length - 1 ? 0 : this.activeIndex + 1,
        );
        this.updateSubmenuForActiveItem();
        return true;
      case 'ArrowUp':
        event.preventDefault();
        this.setActive(
          this.activeIndex <= 0 ? this.filteredCommands.length - 1 : this.activeIndex - 1,
        );
        this.updateSubmenuForActiveItem();
        return true;
      case 'ArrowRight': {
        const activeCmd = this.filteredCommands[this.activeIndex];
        if (activeCmd?.children && activeCmd.children.length > 0) {
          event.preventDefault();
          const activeItem = this.items[this.activeIndex];
          if (activeItem) {
            this.showSubmenu(this.activeIndex, activeItem);
          }
          this.inSubmenu = true;
          this.setSubmenuActive(0);
          return true;
        }
        return false;
      }
      case 'Enter':
        event.preventDefault();
        {
          const cmd = this.filteredCommands[this.activeIndex];
          if (cmd?.children && cmd.children.length > 0) {
            const activeItem = this.items[this.activeIndex];
            if (activeItem) {
              this.showSubmenu(this.activeIndex, activeItem);
            }
            this.inSubmenu = true;
            this.setSubmenuActive(0);
          } else {
            this.executeItem(this.activeIndex);
          }
        }
        return true;
      case 'Escape':
        this.hideSubmenu();
        this.provider?.hide();
        return true;
      default:
        return false;
    }
  }

  private updateSubmenuForActiveItem() {
    const cmd = this.filteredCommands[this.activeIndex];
    if (cmd?.children && cmd.children.length > 0) {
      const activeItem = this.items[this.activeIndex];
      if (activeItem) {
        this.showSubmenu(this.activeIndex, activeItem);
      }
    } else {
      this.hideSubmenu();
    }
  }

  setView(view: EditorView) {
    this.view = view;
  }

  setProvider(provider: SlashProvider) {
    this.provider = provider;
  }
}

// ---------------------------------------------------------------------------
// Factory & exports
// ---------------------------------------------------------------------------

export const slash = slashFactory('slash');

export function configureSlash(ctx: Ctx) {
  const menuView = new SlashMenuView();

  ctx.set(slash.key, {
    view: (view: EditorView) => {
      menuView.setView(view);

      const provider = new SlashProvider({
        content: menuView.element,
        debounce: 50,
        shouldShow(view: EditorView) {
          const { state } = view;
          const { $from } = state.selection;
          if (state.selection.from !== state.selection.to) return false;

          const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
          const lastSlash = textBefore.lastIndexOf('/');
          if (lastSlash === -1) return false;

          if (lastSlash > 0 && textBefore[lastSlash - 1] !== ' ') return false;

          // 每次打开菜单前刷新 AI 分组（随设置动态变化）
          menuView.refreshCommands();

          const query = textBefore.slice(lastSlash + 1);
          menuView.filter(query);

          return true;
        },
      });

      menuView.setProvider(provider);

      return {
        update: (view: EditorView, prevState: EditorView['state']) => {
          menuView.setView(view);
          provider.update(view, prevState);
        },
        destroy: () => {
          provider.destroy();
          menuView.element.remove();
        },
      };
    },
    props: {
      handleKeyDown: (_view: EditorView, event: KeyboardEvent) => {
        if (menuView.element.dataset.show !== 'true') return false;
        return menuView.handleKeyDown(event);
      },
    },
  });
}

// 保留原有导出路径便于平滑迁移
export type { SlashCommand } from './types';

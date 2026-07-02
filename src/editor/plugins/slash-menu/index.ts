/**
 * Slash Command Menu Plugin
 *
 * 输入 `/` 触发命令菜单，支持：
 * - 标题、列表、代码块、数学公式等原有指令（commands-basic.ts）
 * - AI 指令分组（commands-ai.ts，受 `ai.enabled && ai.showInSlash` 控制）
 * - 键盘导航（上下选择，Enter 执行，左右进/出子菜单，Esc 关闭）
 * - 输入过滤（输入 /h 只显示标题相关项）
 * - 最近使用区域（显示最近使用的 3 个命令，搜索时隐藏）
 */

import { SlashProvider, slashFactory } from '@milkdown/plugin-slash';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';

import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';

import { getBasicSlashCommands, insertTableWithSize } from './commands-basic';
import { createAiSlashCommand } from './commands-ai';
import { onIconThemeChange } from './icons';
import { createTableGrid, type TableGridController } from './table-grid';
import type { SlashCommand } from './types';

// ---------------------------------------------------------------------------
// 最近使用记录管理
// ---------------------------------------------------------------------------

const RECENT_STORAGE_KEY = 'lanismd-slash-recent';
const MAX_RECENT_COUNT = 3;

/** 获取最近使用的命令 ID 列表 */
function getRecentCommandIds(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as string[];
  } catch {
    return [];
  }
}

/** 记录一次命令使用 */
function recordCommandUsage(commandId: string) {
  if (!commandId) return;
  const recent = getRecentCommandIds().filter((id) => id !== commandId);
  recent.unshift(commandId);
  if (recent.length > MAX_RECENT_COUNT) {
    recent.length = MAX_RECENT_COUNT;
  }
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent));
}

// ---------------------------------------------------------------------------
// 合成当前菜单命令清单
// ---------------------------------------------------------------------------

/**
 * 根据 settings 中的 AI 配置，拼出当前 slash menu 的指令列表。
 *
 * - 当 `ai.enabled` 且 `ai.showInSlash` 为 true 时，在列表最后插入 "AI 助手" 分组。
 */
function getCurrentCommands(): SlashCommand[] {
  const { config } = useSettingsStore.getState();
  const aiOn = config.ai?.enabled !== false && config.ai?.showInSlash !== false;
  const commands = getBasicSlashCommands();

  if (aiOn) {
    return [...commands, createAiSlashCommand()];
  }
  return [...commands];
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

  /** 当前是否有搜索文本（有搜索时隐藏最近使用） */
  private isSearching = false;

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

  /** 表格网格选择器控制器（仅表格命令使用） */
  private tableGrid: TableGridController | null = null;
  /** 网格面板对应的父级索引 */
  private tableGridParentIndex = -1;
  /** 是否正在网格面板中用键盘导航 */
  private inTableGrid = false;

  /** 取消主题变化订阅的句柄 */
  private themeUnsubscribe: (() => void) | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'milkdown-slash';
    this.container.dataset.show = 'false';

    this.listContainer = document.createElement('div');
    this.listContainer.className = 'milkdown-slash-list';
    this.container.appendChild(this.listContainer);

    this.renderItems();

    // 监听深浅主题切换：菜单打开着时切主题也能实时更新图标
    this.themeUnsubscribe = onIconThemeChange(() => this.refreshIcons());
  }

  get element() {
    return this.container;
  }

  /** 每次打开菜单前刷新命令列表，让 AI 分组能随设置变化实时反映 */
  refreshCommands() {
    this.allCommands = getCurrentCommands();
    this.filteredCommands = [...this.allCommands];
    this.isSearching = false;
  }

  /**
   * 主题切换时，只更新已渲染菜单项的图标，不影响高亮/搜索/子菜单等状态。
   *
   * 通过命令 id 匹配新主题下的图标字符串，既更新数据源（供下次渲染），
   * 也直接改写当前 DOM 的 innerHTML 实现实时切换。
   */
  private refreshIcons() {
    // 生成新主题对应的图标映射（getCurrentCommands 内部会按当前主题取图标）
    const iconById = new Map<string, string>();
    getCurrentCommands().forEach((cmd) => {
      if (cmd.id) iconById.set(cmd.id, cmd.icon);
    });

    // 更新命令对象的 icon（allCommands 与 filteredCommands 共享同一批对象引用）
    this.allCommands.forEach((cmd) => {
      if (cmd.id && iconById.has(cmd.id)) {
        cmd.icon = iconById.get(cmd.id)!;
      }
    });

    // 更新已渲染的主菜单图标 DOM
    this.filteredCommands.forEach((cmd, i) => {
      if (!cmd.id) return;
      const nextIcon = iconById.get(cmd.id);
      if (!nextIcon) return;
      const iconSpan = this.items[i]?.querySelector('.milkdown-slash-icon');
      if (iconSpan) iconSpan.innerHTML = nextIcon;
    });
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  private renderItems() {
    this.listContainer.innerHTML = '';
    this.items = [];
    this.hideSubmenu();

    // 渲染最近使用区域（仅在非搜索模式下）
    if (!this.isSearching) {
      this.renderRecentSection();
    }

    // 渲染命令列表
    this.filteredCommands.forEach((cmd, index) => {
      const item = this.createCommandItem(cmd, index);
      this.listContainer.appendChild(item);
      this.items.push(item);
    });

    this.setActive(0);
  }

  /** 渲染最近使用区域 */
  private renderRecentSection() {
    const recentIds = getRecentCommandIds();
    if (recentIds.length === 0) return;

    // 根据 ID 找到对应的命令
    const recentCommands = recentIds
      .map((id) => this.allCommands.find((cmd) => cmd.id === id))
      .filter((cmd): cmd is SlashCommand => !!cmd);

    if (recentCommands.length === 0) return;

    // 区域标题
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'milkdown-slash-section-header';
    sectionHeader.textContent = '最近使用';
    this.listContainer.appendChild(sectionHeader);

    // 胶囊标签容器
    const recentContainer = document.createElement('div');
    recentContainer.className = 'milkdown-slash-recent';
    this.listContainer.appendChild(recentContainer);

    recentCommands.forEach((cmd) => {
      const tag = document.createElement('div');
      tag.className = 'milkdown-slash-recent-tag';

      const labelSpan = document.createElement('span');
      labelSpan.className = 'milkdown-slash-recent-tag-label';
      labelSpan.textContent = cmd.label;
      tag.appendChild(labelSpan);

      tag.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (cmd.id) recordCommandUsage(cmd.id);
        cmd.execute(this.view!);
        this.provider?.hide();
      });

      recentContainer.appendChild(tag);
    });

    // 分隔线
    const separator = document.createElement('div');
    separator.className = 'milkdown-slash-separator';
    this.listContainer.appendChild(separator);
  }

  /** 创建单个命令列表项 */
  private createCommandItem(cmd: SlashCommand, index: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'milkdown-slash-item';
    if (cmd.extraClass) item.classList.add(cmd.extraClass);
    item.dataset.index = String(index);

    // 图标
    const iconSpan = document.createElement('span');
    iconSpan.className = 'milkdown-slash-icon';
    iconSpan.innerHTML = cmd.icon;
    item.appendChild(iconSpan);

    // 中间区域：名称 + 描述
    const infoWrap = document.createElement('div');
    infoWrap.className = 'milkdown-slash-info';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'milkdown-slash-label';
    labelSpan.textContent = cmd.label;
    infoWrap.appendChild(labelSpan);

    if (cmd.description) {
      const descSpan = document.createElement('span');
      descSpan.className = 'milkdown-slash-desc';
      descSpan.textContent = cmd.description;
      infoWrap.appendChild(descSpan);
    }

    item.appendChild(infoWrap);

    // 右侧：子菜单箭头 / markdown 语法
    if (cmd.children && cmd.children.length > 0) {
      const arrowSpan = document.createElement('span');
      arrowSpan.className = 'milkdown-slash-arrow';
      arrowSpan.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      item.appendChild(arrowSpan);
    } else if (cmd.markdown) {
      const markdownSpan = document.createElement('span');
      markdownSpan.className = 'milkdown-slash-markdown';
      markdownSpan.textContent = cmd.markdown;
      item.appendChild(markdownSpan);
    }

    // 事件
    item.addEventListener('mouseenter', () => {
      this.setActive(index);
      if (cmd.tableGrid) {
        this.showTableGrid(index, item);
      } else if (cmd.children && cmd.children.length > 0) {
        this.showSubmenu(index, item);
      } else {
        this.hideSubmenu();
      }
    });

    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // 有子菜单的项不能直接执行；表格项允许直接点击插入默认尺寸
      if (cmd.children && cmd.children.length > 0) return;
      this.executeItem(index);
    });

    return item;
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

    this.positionSubPanel(submenu, anchorEl);

    this.submenu = submenu;
  }

  /**
   * 将子面板（子菜单 / 表格网格）定位到锚点项右侧，空间不足时翻转到左侧、
   * 并在超出视口下边界时上移。
   */
  private positionSubPanel(panel: HTMLElement, anchorEl: HTMLElement) {
    requestAnimationFrame(() => {
      const listRect = this.listContainer.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      const anchorRect = anchorEl.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();

      let left = listRect.width - 4;
      let top = anchorRect.top - containerRect.top;

      const viewportWidth = window.innerWidth;
      if (listRect.right + panelRect.width > viewportWidth) {
        left = -panelRect.width + 4;
      }

      const viewportHeight = window.innerHeight;
      if (containerRect.top + top + panelRect.height > viewportHeight) {
        top = Math.max(0, viewportHeight - containerRect.top - panelRect.height - 8);
      }

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    });
  }

  /** 在表格命令右侧展示网格选择器 */
  private showTableGrid(parentIndex: number, anchorEl: HTMLElement) {
    if (this.tableGridParentIndex === parentIndex && this.tableGrid) return;

    // 清理其它子面板（hideSubmenu 会同时清理网格状态）
    this.hideSubmenu();

    this.tableGridParentIndex = parentIndex;
    this.inTableGrid = false;

    const controller = createTableGrid((rows, cols) => this.pickTableSize(rows, cols));
    this.container.appendChild(controller.element);
    this.positionSubPanel(controller.element, anchorEl);

    this.tableGrid = controller;
  }

  /** 按选中的行列插入表格并关闭菜单 */
  private pickTableSize(rows: number, cols: number) {
    if (!this.view) return;
    const cmd = this.filteredCommands[this.tableGridParentIndex];
    if (cmd?.id) recordCommandUsage(cmd.id);
    insertTableWithSize(this.view, Math.max(1, rows), Math.max(1, cols));
    this.hideSubmenu();
    this.provider?.hide();
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

    // 同时清理表格网格面板（子面板同一时刻只展示一个）
    if (this.tableGrid) {
      this.tableGrid.element.remove();
      this.tableGrid = null;
    }
    this.tableGridParentIndex = -1;
    this.inTableGrid = false;
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
    // 记录最近使用
    if (cmd.id) recordCommandUsage(cmd.id);
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
    this.isSearching = q.length > 0;

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

    // 表格网格键盘导航：方向键调整行列，Enter 插入，左/Esc 退出网格
    if (this.inTableGrid && this.tableGrid) {
      const { rows, cols } = this.tableGrid.getSelection();
      const r = rows || 1;
      const c = cols || 1;
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault();
          this.tableGrid.setSelection(r, c + 1);
          return true;
        case 'ArrowLeft':
          event.preventDefault();
          if (c <= 1) {
            // 列已到最小，退出网格回到列表
            this.inTableGrid = false;
            this.tableGrid.reset();
          } else {
            this.tableGrid.setSelection(r, c - 1);
          }
          return true;
        case 'ArrowDown':
          event.preventDefault();
          this.tableGrid.setSelection(r + 1, c);
          return true;
        case 'ArrowUp':
          event.preventDefault();
          this.tableGrid.setSelection(r - 1, c);
          return true;
        case 'Enter':
          event.preventDefault();
          this.pickTableSize(r, c);
          return true;
        case 'Escape':
          event.preventDefault();
          this.inTableGrid = false;
          this.tableGrid.reset();
          return true;
        default:
          return false;
      }
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
        if (activeCmd?.tableGrid) {
          event.preventDefault();
          const activeItem = this.items[this.activeIndex];
          if (activeItem) this.showTableGrid(this.activeIndex, activeItem);
          this.inTableGrid = true;
          // 进入网格时默认高亮 3x3（与默认插入尺寸一致）
          this.tableGrid?.setSelection(3, 3);
          return true;
        }
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
          if (cmd?.tableGrid) {
            // 直接回车按默认尺寸插入（与鼠标点击表格项一致）
            this.executeItem(this.activeIndex);
          } else if (cmd?.children && cmd.children.length > 0) {
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
    if (cmd?.tableGrid) {
      const activeItem = this.items[this.activeIndex];
      if (activeItem) {
        this.showTableGrid(this.activeIndex, activeItem);
      }
    } else if (cmd?.children && cmd.children.length > 0) {
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

  /** 释放资源：取消主题订阅 */
  destroy() {
    this.themeUnsubscribe?.();
    this.themeUnsubscribe = null;
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
          // 沉浸式阅读：完全禁用 slash menu
          if (useUIStore.getState().immersiveReading) return false;

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
          menuView.destroy();
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

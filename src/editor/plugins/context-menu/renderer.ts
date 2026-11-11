/**
 * 通用右键菜单渲染器
 *
 * 提供统一的菜单 DOM 构建、定位与关闭处理，供以下调用方复用，避免重复实现：
 * - ai-edit：编辑器默认右键菜单（剪切/复制/粘贴/全选 + AI 操作）
 * - image-block：图片专属右键菜单（编辑/对齐/删除）
 */

/** 菜单项定义 */
export interface ContextMenuItem {
  label: string;
  icon?: string;
  /** 分隔线标记 */
  separator?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否为当前激活项（如当前对齐方式，右侧显示勾选标记） */
  active?: boolean;
  /** 危险操作（如删除，红色显示） */
  danger?: boolean;
  /** 点击回调 */
  action?: () => void;
}

/** 当前显示的右键菜单（全局唯一） */
let activeMenu: HTMLElement | null = null;

/** 关闭当前活跃的右键菜单 */
export function closeActiveMenu(): void {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
}

/**
 * 在指定坐标显示右键菜单
 *
 * @param items 菜单项（含分隔线）；为空时不显示
 * @param x 视口横坐标（clientX）
 * @param y 视口纵坐标（clientY）
 */
export function showContextMenu(items: ContextMenuItem[], x: number, y: number): void {
  closeActiveMenu();
  if (items.length === 0) return;

  const menu = document.createElement('div');
  menu.className = 'lanismd-context-menu';

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'lanismd-context-menu-separator';
      menu.appendChild(sep);
      continue;
    }

    const btn = document.createElement('button');
    btn.className = 'lanismd-context-menu-item';
    if (item.disabled) {
      btn.classList.add('lanismd-context-menu-item-disabled');
      btn.disabled = true;
    }
    if (item.active) {
      btn.classList.add('lanismd-context-menu-item-active');
    }
    if (item.danger) {
      btn.classList.add('lanismd-context-menu-item-danger');
    }
    btn.type = 'button';

    if (item.icon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'lanismd-context-menu-icon';
      iconSpan.innerHTML = item.icon;
      btn.appendChild(iconSpan);
    }

    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label;
    btn.appendChild(labelSpan);

    if (!item.disabled && item.action) {
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        closeActiveMenu();
        item.action!();
      });
    }

    menu.appendChild(btn);
  }

  // 定位菜单（position: fixed 已在 CSS 中设置）
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  document.body.appendChild(menu);
  activeMenu = menu;

  // 延迟调整位置确保在视口内
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    }
    if (rect.bottom > window.innerHeight - 8) {
      menu.style.top = `${window.innerHeight - rect.height - 8}px`;
    }
  });

  // 点击其他位置关闭
  function handleOutsideClick(ev: MouseEvent) {
    if (!menu.contains(ev.target as Node)) {
      closeActiveMenu();
      document.removeEventListener('mousedown', handleOutsideClick, true);
      document.removeEventListener('keydown', handleEscape);
    }
  }

  // Escape 键关闭
  function handleEscape(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      closeActiveMenu();
      document.removeEventListener('mousedown', handleOutsideClick, true);
      document.removeEventListener('keydown', handleEscape);
    }
  }

  // 延迟绑定，避免当前事件立刻触发
  requestAnimationFrame(() => {
    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('keydown', handleEscape);
  });

  // 滚动时关闭
  function handleScroll() {
    closeActiveMenu();
    document.removeEventListener('scroll', handleScroll, true);
  }
  document.addEventListener('scroll', handleScroll, true);
}

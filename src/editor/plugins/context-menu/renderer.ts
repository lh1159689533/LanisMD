/**
 * 通用右键菜单渲染器
 *
 * 提供统一的菜单 DOM 构建、定位与关闭处理，供以下调用方复用，避免重复实现：
 * - ai-edit：编辑器默认右键菜单（剪切/复制/粘贴/全选 + AI 操作）
 * - image-block：图片专属右键菜单（编辑/对齐/删除）
 * - block-handle：块手柄菜单（在下方插入/转为/删除）
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                  |
 * | v1.0.0 | 初始实现：统一右键菜单渲染                 | REQ: 20261104-node-context-menu TECH: 节点右键菜单      |
 * | v1.1.0 | 新增：菜单项支持 hover 展开的子菜单         | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单    |
 * | v1.2.0 | 新增：斜杠命令风格子菜单；菜单内滚动不关闭  | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单    |
 * /@changelog
 *
 * @author hhhuilli
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
  /** 点击回调（存在 children 时不会执行） */
  action?: () => void;
  /** 子菜单项；存在时本项仅作为 hover 展开入口 */
  children?: ContextMenuItem[];
  /**
   * 子菜单渲染风格：
   * - default：紧凑列表（小图标 + 文字）
   * - slash：与斜杠命令菜单一致（彩色方块大图标 + 右侧 Markdown 语法提示）
   */
  submenuVariant?: 'default' | 'slash';
  /** 右侧 Markdown 语法提示，仅 slash 风格子菜单展示 */
  markdown?: string;
}

/** 当前显示的右键菜单（全局唯一） */
let activeMenu: HTMLElement | null = null;
/** 当前菜单注册的全局监听清理函数 */
let cleanupListeners: (() => void) | null = null;

/** 关闭当前活跃的右键菜单，并解除它注册的全局监听 */
export function closeActiveMenu(): void {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
  cleanupListeners?.();
  cleanupListeners = null;
}

/** 右侧展开箭头（与 board-block 菜单保持一致的字形） */
const SUBMENU_ARROW =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

/**
 * 构建斜杠命令风格的菜单项。
 *
 * 直接复用斜杠菜单的类名（milkdown-slash-*），图标尺寸、悬停底色、语法提示
 * 胶囊与斜杠菜单保持同一套样式来源，后续调整斜杠菜单时这里自动跟随。
 */
function createSlashStyleItem(item: ContextMenuItem): HTMLElement {
  if (item.separator) {
    const sep = document.createElement('div');
    sep.className = 'milkdown-slash-separator';
    return sep;
  }

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'milkdown-slash-item lanismd-context-menu-slash-item';

  const iconSpan = document.createElement('span');
  iconSpan.className = 'milkdown-slash-icon';
  iconSpan.innerHTML = item.icon ?? '';
  el.appendChild(iconSpan);

  const info = document.createElement('div');
  info.className = 'milkdown-slash-info';
  const labelSpan = document.createElement('span');
  labelSpan.className = 'milkdown-slash-label';
  labelSpan.textContent = item.label;
  info.appendChild(labelSpan);
  el.appendChild(info);

  if (item.markdown) {
    const markdownSpan = document.createElement('span');
    markdownSpan.className = 'milkdown-slash-markdown';
    markdownSpan.textContent = item.markdown;
    el.appendChild(markdownSpan);
  }

  if (item.action) {
    el.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeActiveMenu();
      item.action!();
    });
  }

  return el;
}

/**
 * 构建单个菜单项。
 *
 * 带子菜单的父项用 div 而非 button：button 内不允许嵌套可交互元素，
 * 否则子菜单里的按钮在部分浏览器下无法触发点击事件。
 */
function createMenuItem(item: ContextMenuItem): HTMLElement {
  if (item.separator) {
    const sep = document.createElement('div');
    sep.className = 'lanismd-context-menu-separator';
    return sep;
  }

  const hasChildren = !!item.children?.length;
  const el = document.createElement(hasChildren ? 'div' : 'button');
  el.className = 'lanismd-context-menu-item';
  if (item.disabled) {
    el.classList.add('lanismd-context-menu-item-disabled');
    if (el instanceof HTMLButtonElement) el.disabled = true;
  }
  if (item.active) {
    el.classList.add('lanismd-context-menu-item-active');
  }
  if (item.danger) {
    el.classList.add('lanismd-context-menu-item-danger');
  }
  if (!hasChildren && el instanceof HTMLButtonElement) {
    el.type = 'button';
  }

  if (item.icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'lanismd-context-menu-icon';
    iconSpan.innerHTML = item.icon;
    el.appendChild(iconSpan);
  }

  const labelSpan = document.createElement('span');
  labelSpan.textContent = item.label;
  el.appendChild(labelSpan);

  if (hasChildren) {
    el.classList.add('lanismd-context-menu-item--submenu');

    const arrow = document.createElement('span');
    arrow.className = 'lanismd-context-menu-arrow';
    arrow.innerHTML = SUBMENU_ARROW;
    el.appendChild(arrow);

    const submenu = document.createElement('div');
    submenu.className = 'lanismd-context-menu-submenu';
    const slashStyle = item.submenuVariant === 'slash';
    if (slashStyle) submenu.classList.add('lanismd-context-menu-submenu--slash');
    item.children!.forEach((child) =>
      submenu.appendChild(slashStyle ? createSlashStyleItem(child) : createMenuItem(child)),
    );
    el.appendChild(submenu);
  } else if (!item.disabled && item.action) {
    el.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeActiveMenu();
      item.action!();
    });
  }

  return el;
}

/**
 * 校正子菜单位置：右侧空间不足时翻到左侧，底部溢出时向上对齐。
 *
 * 子菜单默认 display:none，必须先临时显示才能量到尺寸。
 */
function adjustSubmenus(menu: HTMLElement): void {
  const submenus = menu.querySelectorAll<HTMLElement>('.lanismd-context-menu-submenu');
  submenus.forEach((submenu) => {
    const parent = submenu.parentElement;
    if (!parent) return;

    submenu.style.display = 'block';
    submenu.style.visibility = 'hidden';
    const width = submenu.offsetWidth;
    const height = submenu.offsetHeight;
    const parentRect = parent.getBoundingClientRect();

    if (parentRect.right + width > window.innerWidth - 8) {
      submenu.style.left = 'auto';
      submenu.style.right = '100%';
    }
    if (parentRect.top + height > window.innerHeight - 8) {
      submenu.style.top = 'auto';
      submenu.style.bottom = '-4px';
    }

    submenu.style.display = '';
    submenu.style.visibility = '';
  });
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
  items.forEach((item) => menu.appendChild(createMenuItem(item)));

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
      menu.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
    }
    adjustSubmenus(menu);
  });

  // 点击其他位置关闭
  function handleOutsideClick(ev: MouseEvent) {
    if (!menu.contains(ev.target as Node)) closeActiveMenu();
  }

  // Escape 键关闭
  function handleEscape(ev: KeyboardEvent) {
    if (ev.key === 'Escape') closeActiveMenu();
  }

  // 滚动时关闭（菜单自身的滚动除外，如可滚动的长子菜单）
  function handleScroll(ev: Event) {
    if (menu.contains(ev.target as Node)) return;
    closeActiveMenu();
  }

  function cleanup() {
    document.removeEventListener('mousedown', handleOutsideClick, true);
    document.removeEventListener('keydown', handleEscape);
    document.removeEventListener('scroll', handleScroll, true);
  }

  // 延迟绑定，避免当前事件立刻触发
  requestAnimationFrame(() => {
    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('scroll', handleScroll, true);
    cleanupListeners = cleanup;
  });
}

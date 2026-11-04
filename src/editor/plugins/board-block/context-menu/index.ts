/**
 * Board Context Menu - 控制器
 *
 * 画板右键菜单控制器：按需在 `document.body` 上弹出临时菜单，含子菜单支持。
 * 宿主（NodeView）在画布区域捕获 `contextmenu` 后调用 `show(x, y)`。
 *
 * 与画板其它工具栏一致，采用原生 DOM（不走 React），菜单项用 `mousedown` 触发
 * 以规避「点击抢走编辑器焦点 / 触发 ProseMirror 节点选择」的问题。
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                          |
 * | v1.0.0 | 初始实现：右键菜单控制器与 DOM 渲染 | REQ: 20261028-board-context-menu TECH: 画板右键菜单方案 |
 * | v1.6.1 | 修复：右键命中元素未选中时先建立选中；菜单项点击后未关闭（close 误引全局 window.close） | REQ: 20261028-board-context-menu |
 * /@changelog
 *
 * @author hhhuilli
 */

import { PlaitBoard, PlaitPointerType, Transforms, isSelectedElement } from '@plait/core';

import type { BoardBlockState } from '../types';
import { createActions } from './actions';
import { detectContextScene } from './hit-test';
import { buildMenu } from './menu-builder';
import type {
  BoardContextMenuController,
  BoardContextMenuOptions,
  ContextMenuActionContext,
  MenuItemDef,
} from './types';

/** 全局唯一活跃菜单（与编辑器全局菜单共用 document.body，避免同时存在两份） */
let activeMenu: HTMLElement | null = null;

/**
 * 创建画板右键菜单控制器。
 *
 * @param options 构造选项（画板形态 + 创建态回调）
 */
export function createBoardContextMenu(
  options: BoardContextMenuOptions,
): BoardContextMenuController {
  const { mode, onEnterCreation, onInsertShape } = options;
  let board: PlaitBoard | null = null;
  let blockState: BoardBlockState = 'preview';
  /** 关闭菜单时的清理函数（解绑全局监听） */
  let cleanup: (() => void) | null = null;

  const actions = createActions({ onEnterCreation, onInsertShape });

  // -------------------------------------------------------------------------
  // 菜单生命周期
  // -------------------------------------------------------------------------

  /** 关闭当前菜单并解绑全局监听 */
  function close(): void {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    if (activeMenu) {
      activeMenu.remove();
      activeMenu = null;
    }
  }

  /** 在指定屏幕坐标弹出菜单 */
  function show(clientX: number, clientY: number): void {
    if (!board) return;
    close();

    // 命中检测 + 场景路由
    const hit = detectContextScene(board, mode, blockState, clientX, clientY);

    // 右键即选中：命中元素且尚未选中时，先把折叠选区设到右键点。
    // Plait 的 deleteFragment / setFragment / 层级变换全部基于「选中集合」
    // （BOARD_TO_SELECTED_ELEMENT 缓存，仅由左键点击/框选建立，pointerUp 跳过
    // 非主键），右键原本不建立选中，直接删除会空转。此处走 Transforms.setSelection
    // 触发 Plait 的 onChange 选中管线（与左键点击完全同路径），自动选中命中元素；
    // 已选中的元素不重设，保留多选状态。仅在选择指针（非创建/手型）下生效，
    // 且交给 onChange 管线判定（isHandleSelection），不手工改选中缓存。
    if (
      hit.hitElement &&
      hit.viewBoxPoint &&
      PlaitBoard.isPointer(board, PlaitPointerType.selection) &&
      !isSelectedElement(board, hit.hitElement)
    ) {
      const point = hit.viewBoxPoint;
      Transforms.setSelection(board, { anchor: point, focus: point });
    }

    const ctx: ContextMenuActionContext = {
      board,
      hitElement: hit.hitElement,
      viewBoxPoint: hit.viewBoxPoint,
      scene: hit.scene,
      mode,
    };

    const items = buildMenu(ctx, actions);
    if (items.length === 0) return;

    const menu = renderMenu(items, ctx, close);
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;
    document.body.appendChild(menu);
    activeMenu = menu;

    // 视口内调整（渲染后读取实际尺寸）
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        menu.style.left = `${window.innerWidth - rect.width - 8}px`;
      }
      if (rect.bottom > window.innerHeight - 8) {
        menu.style.top = `${window.innerHeight - rect.height - 8}px`;
      }
    });

    bindCloseListeners(menu);
  }

  /** 绑定「外部点击 / Esc / 滚动」关闭 */
  function bindCloseListeners(menu: HTMLElement): void {
    const onMouseDown = (e: MouseEvent): void => {
      if (!menu.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    const onScroll = (): void => close();

    cleanup = () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
    };

    // 延迟绑定，避免触发本次 contextmenu 的后续事件立刻关闭
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', onMouseDown, true);
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('scroll', onScroll, true);
    });
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  function attach(next: PlaitBoard): void {
    if (board === next) return;
    close();
    board = next;
  }

  function detach(): void {
    close();
    board = null;
  }

  function setBlockState(state: BoardBlockState): void {
    blockState = state;
    close();
  }

  function destroy(): void {
    close();
    board = null;
  }

  return { attach, detach, setBlockState, show, close, destroy };
}

// ---------------------------------------------------------------------------
// DOM 渲染
// ---------------------------------------------------------------------------

/**
 * 渲染整个菜单。
 *
 * @param items 菜单项定义
 * @param ctx 动作上下文
 * @param onSelect 菜单项触发后的关闭回调（必须显式传入：renderMenuItem 是
 *   模块级函数，直接写 close() 会解析到全局 window.close——WKWebView 下的
 *   no-op——而非控制器闭包内的 close，导致菜单点击后不关闭）
 */
function renderMenu(
  items: MenuItemDef[],
  ctx: ContextMenuActionContext,
  onSelect: () => void,
): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'lanismd-context-menu';
  for (const item of items) {
    menu.appendChild(renderMenuItem(item, ctx, onSelect));
  }
  return menu;
}

/** 渲染单个菜单项（含子菜单递归） */
function renderMenuItem(
  item: MenuItemDef,
  ctx: ContextMenuActionContext,
  onSelect: () => void,
): HTMLElement {
  if (item.separator) {
    const sep = document.createElement('div');
    sep.className = 'lanismd-context-menu-separator';
    return sep;
  }

  const btn = document.createElement('button');
  btn.className = 'lanismd-context-menu-item';
  btn.type = 'button';

  const disabled = typeof item.disabled === 'function' ? item.disabled(ctx) : item.disabled;
  if (disabled) {
    btn.classList.add('lanismd-context-menu-item-disabled');
    btn.disabled = true;
  }

  if (item.icon) {
    const icon = document.createElement('span');
    icon.className = 'lanismd-context-menu-icon';
    icon.innerHTML = item.icon;
    btn.appendChild(icon);
  }

  const label = document.createElement('span');
  label.textContent = item.label;
  btn.appendChild(label);

  // 子菜单：hover 展开，右侧定位（CSS 驱动）
  if (item.children && item.children.length > 0) {
    btn.classList.add('lanismd-context-menu-item--submenu');
    const arrow = document.createElement('span');
    arrow.className = 'lanismd-context-menu-arrow';
    arrow.textContent = '›';
    btn.appendChild(arrow);

    const submenu = document.createElement('div');
    submenu.className = 'lanismd-context-menu-submenu';
    for (const child of item.children) {
      submenu.appendChild(renderMenuItem(child, ctx, onSelect));
    }
    btn.appendChild(submenu);
  } else if (!disabled && item.action) {
    // 用 mousedown 触发：避免抢走编辑器焦点或触发 PM 节点选择
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect();
      void item.action!(ctx);
    });
  }

  return btn;
}

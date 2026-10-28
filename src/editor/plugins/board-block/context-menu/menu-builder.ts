/**
 * Board Context Menu - 菜单构建
 *
 * 依据触发场景产出菜单项（纯数据），由 index.ts 负责渲染 DOM。
 * 菜单项支持「普通项 / 分隔线 / 子菜单」三种形态，子菜单用于「层级」「插入」。
 *
 * 动态禁用规则：
 * - 导图根节点：禁用「插入-同级」与「删除」（根节点不可加同级，删除根节点=删整个导图）
 * - 粘贴：系统剪贴板不可读时禁用（运行时能力，由 index.ts 传入或始终可用）
 *
 * @changelog
 * | 版本   | 变更说明             | 关联                                          |
 * | v1.0.0 | 初始实现：四场景菜单构建 | REQ: 20261028-board-context-menu TECH: 画板右键菜单方案 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { PlaitMind } from '@plait/mind';

import { ICONS } from '../constants';
import type { BoardContextActions } from './actions';
import type { ContextMenuActionContext, MenuItemDef } from './types';

// ---------------------------------------------------------------------------
// 图标
// ---------------------------------------------------------------------------

/** 菜单项图标集（14x14 线性风格，与现有工具栏图标保持一致） */
const MENU_ICONS = {
  cut: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  paste: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
  layer: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>',
  moveToTop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
  moveToBottom: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>',
  moveUp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
  moveDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  insertChild: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8 7 12 3 16"/><line x1="7" y1="4" x2="21" y2="4"/><line x1="7" y1="12" x2="21" y2="12"/><line x1="7" y1="20" x2="21" y2="20"/></svg>',
  insertSibling: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="5" y1="4" x2="3" y2="4"/><line x1="19" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="19" y1="20" x2="12" y2="20"/><line x1="8" y1="20" x2="3" y2="20"/><line x1="9" y1="2" x2="15" y2="6"/><line x1="9" y1="6" x2="15" y2="2"/></svg>',
  collapse: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14 9 9 14 4 9"/><line x1="20" y1="4" x2="20" y2="20"/></svg>',
  expand: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 9 9 14 14 9"/><line x1="20" y1="4" x2="20" y2="20"/></svg>',
  addShape: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
  addLine: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="4"/><polyline points="14 4 20 4 20 10"/></svg>',
  addMind: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4"/><path d="M5 17l4-7"/><path d="M19 17l-4-7"/></svg>',
  actualSize: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  fit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
} as const;

// ---------------------------------------------------------------------------
// 菜单构建
// ---------------------------------------------------------------------------

/** 分隔线 */
const SEP: MenuItemDef = { label: '', separator: true };

/**
 * 依据场景产出菜单项。
 *
 * @param ctx 动作上下文（场景 / 命中元素 / 坐标）
 * @param actions 动作集
 */
export function buildMenu(
  ctx: ContextMenuActionContext,
  actions: BoardContextActions,
): MenuItemDef[] {
  switch (ctx.scene) {
    case 'preview':
      return buildViewportOnlyMenu(actions);

    case 'board-element':
      return buildBoardElementMenu(actions);

    case 'board-blank':
      return buildBoardBlankMenu(actions);

    case 'mind-node':
      return buildMindNodeMenu(ctx, actions);

    case 'mind-blank':
      return buildMindBlankMenu(actions);
  }
}

/** 预览态：仅画布操作 */
function buildViewportOnlyMenu(actions: BoardContextActions): MenuItemDef[] {
  return [
    {
      label: '实际尺寸',
      icon: MENU_ICONS.actualSize,
      action: actions.resetZoom,
    },
    {
      label: '适应画布',
      icon: MENU_ICONS.fit,
      action: actions.fitViewport,
    },
  ];
}

/** 白板元素：剪切 / 复制 / 粘贴 / 层级 / 删除 */
function buildBoardElementMenu(actions: BoardContextActions): MenuItemDef[] {
  return [
    { label: '剪切', icon: MENU_ICONS.cut, action: actions.cut },
    { label: '复制', icon: MENU_ICONS.copy, action: actions.copy },
    { label: '粘贴', icon: MENU_ICONS.paste, action: actions.paste },
    SEP,
    {
      label: '层级',
      icon: MENU_ICONS.layer,
      children: [
        { label: '置顶', icon: MENU_ICONS.moveToTop, action: actions.moveToTop },
        { label: '置底', icon: MENU_ICONS.moveToBottom, action: actions.moveToBottom },
        { label: '上移一层', icon: MENU_ICONS.moveUp, action: actions.moveUp },
        { label: '下移一层', icon: MENU_ICONS.moveDown, action: actions.moveDown },
      ],
    },
    SEP,
    { label: '删除', icon: ICONS.delete, action: actions.delete },
  ];
}

/** 白板空白：添加图形 / 添加连线 / 粘贴 / 实际尺寸 / 适应画布 */
function buildBoardBlankMenu(actions: BoardContextActions): MenuItemDef[] {
  return [
    { label: '添加图形', icon: MENU_ICONS.addShape, action: actions.addShape },
    { label: '添加连线', icon: MENU_ICONS.addLine, action: actions.addLine },
    SEP,
    { label: '粘贴', icon: MENU_ICONS.paste, action: actions.paste },
    SEP,
    { label: '实际尺寸', icon: MENU_ICONS.actualSize, action: actions.resetZoom },
    { label: '适应画布', icon: MENU_ICONS.fit, action: actions.fitViewport },
  ];
}

/** 导图节点：插入（子级/同级）/ 折叠 / 剪切 / 复制 / 粘贴 / 删除 */
function buildMindNodeMenu(
  ctx: ContextMenuActionContext,
  actions: BoardContextActions,
): MenuItemDef[] {
  const element = ctx.hitElement;
  const isRoot = element ? PlaitMind.isMind(element as never) : false;
  const isCollapsed = Boolean((element as { isCollapsed?: boolean } | null)?.isCollapsed);

  return [
    {
      label: '插入',
      icon: MENU_ICONS.addShape,
      children: [
        { label: '子级', icon: MENU_ICONS.insertChild, action: actions.insertChild },
        {
          label: '同级',
          icon: MENU_ICONS.insertSibling,
          action: actions.insertSibling,
          disabled: isRoot,
        },
      ],
    },
    {
      label: isCollapsed ? '展开' : '折叠',
      icon: isCollapsed ? MENU_ICONS.expand : MENU_ICONS.collapse,
      action: actions.toggleCollapse,
    },
    SEP,
    { label: '剪切', icon: MENU_ICONS.cut, action: actions.cut },
    { label: '复制', icon: MENU_ICONS.copy, action: actions.copy },
    { label: '粘贴', icon: MENU_ICONS.paste, action: actions.paste },
    SEP,
    { label: '删除', icon: ICONS.delete, action: actions.delete, disabled: isRoot },
  ];
}

/** 导图空白：添加思维导图 / 粘贴 / 实际尺寸 / 适应画布 */
function buildMindBlankMenu(actions: BoardContextActions): MenuItemDef[] {
  return [
    { label: '添加思维导图', icon: MENU_ICONS.addMind, action: actions.addMind },
    SEP,
    { label: '粘贴', icon: MENU_ICONS.paste, action: actions.paste },
    SEP,
    { label: '实际尺寸', icon: MENU_ICONS.actualSize, action: actions.resetZoom },
    { label: '适应画布', icon: MENU_ICONS.fit, action: actions.fitViewport },
  ];
}

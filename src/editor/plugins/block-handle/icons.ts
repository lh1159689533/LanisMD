/**
 * 块手柄与块操作菜单使用的 SVG 图标
 *
 * 统一使用 currentColor，随主题与 hover 状态自动变色。
 *
 * @changelog
 * | 版本   | 变更说明                             | 关联                                               |
 * | v1.0.0 | 初始实现：手柄、加号与菜单图标       | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * | v1.1.0 | 移除复制/剪切/副本及转为子项图标     | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 加号：在下方插入块 */
export const ADD_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

/** 六点：拖拽抓手 */
export const DRAG_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/><circle cx="9" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/></svg>';

/** 在下方插入：加号加一条底线 */
export const INSERT_BELOW_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="4" x2="12" y2="14"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="4" y1="20" x2="20" y2="20"/></svg>';

/** 转为：换型箭头 */
export const CONVERT_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 8 8 4 12 8"/><path d="M8 4v10a4 4 0 0 0 4 4h8"/><polyline points="16 14 20 18 16 22"/></svg>';

/** 删除 */
export const DELETE_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

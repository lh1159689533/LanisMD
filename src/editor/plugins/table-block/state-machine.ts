/**
 * Table Block Plugin - State Machine
 *
 * 六状态机手柄交互的状态转换逻辑（纯函数）
 *
 * 状态流转图：
 * hidden ──focusCell──> bar
 * bar ──pointerEnterHandle──> hover
 * bar ──blurTable──> hidden
 * hover ──click──> selected
 * hover ──pointerLeaveHandle──> bar
 * hover ──dragStart──> dragging
 * hover ──blurTable──> hidden
 * selected ──clickOutside──> selected_no_menu
 * selected ──focusCell──> bar
 * selected ──dragStart──> dragging
 * selected ──blurTable──> hidden
 * selected_no_menu ──clickOutside──> hidden
 * selected_no_menu ──click/pointerEnterHandle──> selected
 * selected_no_menu ──focusCell──> bar
 * selected_no_menu ──blurTable──> hidden
 * dragging ──dragEnd──> selected_no_menu
 */

import type { HandleState } from './types';

// ---------------------------------------------------------------------------
// State Event Types
// ---------------------------------------------------------------------------

export type StateEvent =
  | 'focusCell'
  | 'pointerEnterHandle'
  | 'pointerLeaveHandle'
  | 'blurTable'
  | 'click'
  | 'clickOutside'
  | 'dragStart'
  | 'dragEnd';

// ---------------------------------------------------------------------------
// State Transition Function (Pure)
// ---------------------------------------------------------------------------

/**
 * 计算下一个状态
 * @param currentState 当前状态
 * @param event 触发的事件
 * @returns 下一个状态
 */
export function transitionState(currentState: HandleState, event: StateEvent): HandleState {
  switch (currentState) {
    case 'hidden':
      // 点击单元格后显示 bar 状态
      if (event === 'focusCell') return 'bar';
      return 'hidden';

    case 'bar':
      if (event === 'pointerEnterHandle') return 'hover';
      if (event === 'blurTable') return 'hidden';
      // 点击其他单元格时保持 bar 状态（会重新定位）
      if (event === 'focusCell') return 'bar';
      return 'bar';

    case 'hover':
      if (event === 'click') return 'selected';
      if (event === 'pointerLeaveHandle') return 'bar';
      if (event === 'dragStart') return 'dragging';
      if (event === 'blurTable') return 'hidden';
      return 'hover';

    case 'selected':
      if (event === 'clickOutside') return 'selected_no_menu';
      if (event === 'click') return 'selected';
      if (event === 'dragStart') return 'dragging';
      if (event === 'focusCell') return 'bar'; // 点击其他单元格，回到 bar 状态
      if (event === 'blurTable') return 'hidden';
      return 'selected';

    case 'selected_no_menu':
      if (event === 'clickOutside') return 'hidden';
      if (event === 'click') return 'selected';
      if (event === 'pointerEnterHandle') return 'selected';
      if (event === 'focusCell') return 'bar'; // 点击其他单元格，回到 bar 状态
      if (event === 'blurTable') return 'hidden';
      return 'selected_no_menu';

    case 'dragging':
      if (event === 'dragEnd') return 'selected_no_menu';
      return 'dragging';

    default:
      return 'hidden';
  }
}

// ---------------------------------------------------------------------------
// State Guards (用于判断当前状态是否允许某些操作)
// ---------------------------------------------------------------------------

/**
 * 是否处于可见状态
 */
export function isVisible(state: HandleState): boolean {
  return state !== 'hidden';
}

/**
 * 是否处于选中状态（包括 selected 和 selected_no_menu）
 */
export function isSelected(state: HandleState): boolean {
  return state === 'selected' || state === 'selected_no_menu';
}

/**
 * 是否显示菜单
 */
export function shouldShowMenu(state: HandleState): boolean {
  return state === 'selected';
}

/**
 * 是否处于拖拽状态
 */
export function isDragging(state: HandleState): boolean {
  return state === 'dragging';
}

/**
 * AI 弹窗定位：在选区附近展示，并按可视区剩余空间限定最大高度
 *
 * 流式输出、结果卡片出现、输入框多行增长都会让弹窗在创建后持续变高，
 * 因此不能依赖创建时的实际高度定位，而是一次性选定展示侧并锁定 max-height：
 * - 下方空间充足（或不小于上方）时放在选区下方，向下增长；
 * - 否则以底边锚定在选区上方，内容增多时向上增长；
 * - 两侧都放不下（选区几乎占满可视区）时贴可视区底部覆盖展示。
 * 超出部分由弹窗内部的可滚动区域承接，保证操作按钮始终可见。
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                  |
 * | v1.0.0 | 从 ai-popup 抽出，供翻译/解释与 AI 助手弹窗复用 | REQ: AI 弹窗体验优化 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView } from '@milkdown/kit/prose/view';

/** 弹窗与选区的间距 */
const GAP = 8;
/** 弹窗与可视区边缘的最小留白 */
const EDGE_MARGIN = 12;

export interface AnchoredPopupOptions {
  /** 锚定区间起点（ProseMirror 位置） */
  from: number;
  /** 锚定区间终点（ProseMirror 位置） */
  to: number;
  /** 弹窗内容完全展开时的最大高度 */
  maxHeight: number;
  /** 单侧空间低于该值时不在该侧展示，避免弹窗被压得过扁 */
  minHeight: number;
}

/**
 * 获取编辑区可视范围（纵向）。
 * 以最近的滚动容器为准，排除底部状态栏等区域；找不到时退化为整个窗口。
 */
function getVisibleBounds(view: EditorView): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight;
  let el = view.dom.parentElement;
  while (el && el !== document.body) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      const rect = el.getBoundingClientRect();
      top = Math.max(top, rect.top);
      bottom = Math.min(bottom, rect.bottom);
      break;
    }
    el = el.parentElement;
  }
  return { top: top + EDGE_MARGIN, bottom: bottom - EDGE_MARGIN };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 将弹窗定位到锚定区间附近，和编辑区内容区等宽，并锁定 max-height */
export function positionAnchoredPopup(
  view: EditorView,
  popup: HTMLElement,
  options: AnchoredPopupOptions,
): void {
  const { from, to, maxHeight, minHeight } = options;
  const editorRect = view.dom.getBoundingClientRect();
  const bounds = getVisibleBounds(view);

  popup.style.position = 'fixed';
  popup.style.left = `${editorRect.left}px`;
  popup.style.width = `${editorRect.width}px`;
  popup.style.top = '';
  popup.style.bottom = '';

  // 选区坐标限制在可视区内，处理选区部分滚出视口的情况
  let anchorTop = bounds.bottom;
  let anchorBottom = bounds.bottom;
  try {
    anchorTop = clamp(view.coordsAtPos(from).top, bounds.top, bounds.bottom);
    anchorBottom = clamp(view.coordsAtPos(to).bottom, bounds.top, bounds.bottom);
  } catch {
    // 坐标计算失败时走兜底：贴可视区底部
  }

  const spaceBelow = bounds.bottom - anchorBottom - GAP;
  const spaceAbove = anchorTop - GAP - bounds.top;
  const viewportHeight = window.innerHeight;

  if (spaceBelow >= maxHeight || (spaceBelow >= minHeight && spaceBelow >= spaceAbove)) {
    popup.style.top = `${anchorBottom + GAP}px`;
    popup.style.maxHeight = `${Math.min(maxHeight, spaceBelow)}px`;
  } else if (spaceAbove >= minHeight) {
    popup.style.bottom = `${viewportHeight - anchorTop + GAP}px`;
    popup.style.maxHeight = `${Math.min(maxHeight, spaceAbove)}px`;
  } else {
    popup.style.bottom = `${viewportHeight - bounds.bottom}px`;
    popup.style.maxHeight = `${Math.min(maxHeight, bounds.bottom - bounds.top)}px`;
  }
}

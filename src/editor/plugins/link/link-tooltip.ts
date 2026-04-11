/**
 * Link Hover Tooltip Plugin
 *
 * 鼠标 Hover 链接文字时，显示浮动操作面板：
 * - 访问链接（在默认浏览器中打开）
 * - 编辑链接（复用 LinkEditDialog）
 * - 复制链接
 * - 取消链接（移除 link mark，保留纯文本）
 *
 * 实现方式：纯 DOM 定位（不依赖 TooltipProvider，因为 hover 时选区不在链接上）
 */

import { tooltipFactory } from '@milkdown/kit/plugin/tooltip';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { EditorState } from '@milkdown/kit/prose/state';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { createLinkDialog } from '../tooltip-toolbar';

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const linkTooltipIcons = {
  open: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  copyDone:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  unlink:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 22v-2"/><path d="M9 15l6-6"/><path d="M11 6l.463-.536a5 5 0 0 1 7.071 7.072L18 13"/><path d="M13 18l-.397.534a5.068 5.068 0 0 1-7.127 0 4.972 4.972 0 0 1 0-7.071L6 11"/><path d="M7 2v2"/><path d="M2 7h2"/><path d="M22 17h-2"/></svg>',
};

// ---------------------------------------------------------------------------
// Link Tooltip View (manually positioned via DOM)
// ---------------------------------------------------------------------------

class LinkTooltipView {
  readonly container: HTMLElement;
  private view: EditorView | null = null;

  /** Current link position range & href */
  private linkFrom = 0;
  private linkTo = 0;
  private linkHref = '';
  private linkText = '';

  /** Visibility state */
  private visible = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'milkdown-link-tooltip';
    // 自己管理可见性 — 初始隐藏
    this.container.style.display = 'none';
    this.container.style.position = 'fixed';
    this.container.style.zIndex = '50';

    // 阻止 tooltip 抢占焦点/点击时关闭
    this.container.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Buttons
    this.addButton(linkTooltipIcons.open, '访问链接', () => this.handleOpen());
    this.addButton(linkTooltipIcons.edit, '编辑', () => this.handleEdit());
    this.addButton(linkTooltipIcons.copy, '复制', (btn) => this.handleCopy(btn));
    this.addButton(linkTooltipIcons.unlink, '取消链接', () => this.handleUnlink());

    // Append to body so it's not clipped by any overflow:hidden ancestor
    document.body.appendChild(this.container);
  }

  private addButton(
    icon: string,
    title: string,
    onClick: (btn: HTMLButtonElement) => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'milkdown-link-tooltip-btn';
    btn.innerHTML = icon;
    btn.setAttribute('aria-label', title);
    btn.setAttribute('title', title);
    btn.type = 'button';
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick(btn);
    });
    this.container.appendChild(btn);
    return btn;
  }

  // ---- Positioning ----

  /**
   * Show the tooltip positioned below the given link DOM rect.
   */
  show(linkRect: DOMRect) {
    this.visible = true;
    this.container.style.display = 'flex';

    // Position below the link with a small gap
    const gap = 4;
    const left = linkRect.left;
    const top = linkRect.bottom + gap;

    this.container.style.left = `${left}px`;
    this.container.style.top = `${top}px`;

    // After rendering, check if the tooltip overflows the viewport and adjust
    requestAnimationFrame(() => {
      const rect = this.container.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // If overflowing right, shift left
      if (rect.right > vw - 8) {
        this.container.style.left = `${Math.max(8, vw - rect.width - 8)}px`;
      }

      // If overflowing bottom, show above the link instead
      if (rect.bottom > vh - 8) {
        this.container.style.top = `${linkRect.top - rect.height - gap}px`;
      }
    });
  }

  hide() {
    this.visible = false;
    this.container.style.display = 'none';
  }

  get isVisible() {
    return this.visible;
  }

  // ---- Actions ----

  private handleOpen() {
    if (this.linkHref) {
      shellOpen(this.linkHref).catch((err) => {
        console.error('Failed to open link:', err);
      });
    }
  }

  private handleEdit() {
    if (!this.view) return;
    const view = this.view;

    // Hide the tooltip while dialog is open
    this.hide();

    const dialog = createLinkDialog(view, this.linkText, this.linkHref, (text, href) => {
      const linkType = view.state.schema.marks.link;
      if (!linkType) return;

      const { state, dispatch } = view;
      let tr = state.tr;

      // Remove existing link marks first
      tr = tr.removeMark(this.linkFrom, this.linkTo, linkType);

      // If the text changed, replace the text content
      const currentText = state.doc.textBetween(this.linkFrom, this.linkTo, ' ');
      if (text !== currentText) {
        tr = tr.insertText(text, this.linkFrom, this.linkTo);
        const newTo = this.linkFrom + text.length;
        tr = tr.addMark(this.linkFrom, newTo, linkType.create({ href }));
      } else {
        tr = tr.addMark(this.linkFrom, this.linkTo, linkType.create({ href }));
      }

      dispatch(tr);
      view.focus();
    });

    document.body.appendChild(dialog);
    setTimeout(() => {
      const firstInput = dialog.querySelector('input') as HTMLInputElement;
      if (firstInput) firstInput.focus();
    }, 50);
  }

  private handleCopy(btn: HTMLButtonElement) {
    if (!this.linkHref) return;

    navigator.clipboard
      .writeText(this.linkHref)
      .then(() => {
        // Show checkmark feedback
        const origIcon = btn.innerHTML;
        btn.innerHTML = linkTooltipIcons.copyDone;
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = origIcon;
          btn.classList.remove('copied');
        }, 1500);
      })
      .catch((err) => {
        console.error('Failed to copy link:', err);
      });
  }

  private handleUnlink() {
    if (!this.view) return;
    const { state, dispatch } = this.view;
    const linkType = state.schema.marks.link;
    if (!linkType) return;

    const tr = state.tr.removeMark(this.linkFrom, this.linkTo, linkType);
    dispatch(tr);
    this.view.focus();
    this.hide();
  }

  // ---- State management ----

  setView(view: EditorView) {
    this.view = view;
  }

  updateLinkInfo(from: number, to: number, href: string, text: string) {
    this.linkFrom = from;
    this.linkTo = to;
    this.linkHref = href;
    this.linkText = text;
  }

  destroy() {
    this.container.remove();
  }
}

// ---------------------------------------------------------------------------
// Helpers: detect link under mouse
// ---------------------------------------------------------------------------

interface LinkInfo {
  from: number;
  to: number;
  href: string;
  text: string;
}

/**
 * Given a mouse position, find a link mark under it (if any).
 */
function findLinkAtPos(view: EditorView, x: number, y: number): LinkInfo | null {
  const pos = view.posAtCoords({ left: x, top: y });
  if (!pos) return null;

  const { state } = view;
  const linkType = state.schema.marks.link;
  if (!linkType) return null;

  const $pos = state.doc.resolve(pos.pos);

  // Check the marks at this position
  const marks = $pos.marks();
  const linkMark = marks.find((m) => m.type === linkType);
  if (!linkMark) return null;

  // Walk backward to find the start of the link
  let from = pos.pos;
  while (from > 0) {
    const $before = state.doc.resolve(from - 1);
    if ($before.parent !== $pos.parent) break;
    const beforeMarks = $before.marksAcross($pos);
    if (
      !beforeMarks ||
      !beforeMarks.find((m) => m.type === linkType && m.attrs.href === linkMark.attrs.href)
    ) {
      break;
    }
    from--;
  }

  // Walk forward to find the end of the link
  let to = pos.pos;
  const parentEnd = $pos.end();
  while (to < parentEnd) {
    const $after = state.doc.resolve(to + 1);
    if ($after.parent !== $pos.parent) break;
    const node = $pos.parent.childAfter(to - $pos.start());
    if (!node.node) break;
    const nodeMarks = node.node.marks;
    if (!nodeMarks.find((m) => m.type === linkType && m.attrs.href === linkMark.attrs.href)) {
      break;
    }
    to = $pos.start() + node.offset + node.node.nodeSize;
  }

  const text = state.doc.textBetween(from, to, ' ');

  return { from, to, href: linkMark.attrs.href || '', text };
}

/**
 * Find the DOM `<a>` element at the given coordinates (if any).
 * Used to get the bounding rect for tooltip positioning.
 */
function findLinkElementAt(view: EditorView, x: number, y: number): HTMLAnchorElement | null {
  const domAtPos = view.posAtCoords({ left: x, top: y });
  if (!domAtPos) return null;

  // Use document.elementFromPoint to find the actual DOM element under the cursor
  const el = document.elementFromPoint(x, y);
  if (!el) return null;

  // Walk up to find the nearest <a> tag (ProseMirror renders link marks as <a>)
  const anchor = el.closest('a');
  if (!anchor) return null;

  // Make sure this anchor is inside the editor view DOM
  if (!view.dom.contains(anchor)) return null;

  return anchor as HTMLAnchorElement;
}

// ---------------------------------------------------------------------------
// Factory & exports
// ---------------------------------------------------------------------------

export const linkTooltip = tooltipFactory('linkTooltip');

export function configureLinkTooltip(ctx: Ctx) {
  const tooltipView = new LinkTooltipView();

  ctx.set(linkTooltip.key, {
    view: (view: EditorView) => {
      tooltipView.setView(view);

      /** The link info currently being shown */
      let currentLink: LinkInfo | null = null;
      /** Timer for delayed hide (allows moving mouse from link to tooltip) */
      let hideTimer: ReturnType<typeof setTimeout> | null = null;
      /** Whether the mouse is currently over the tooltip element */
      let isOverTooltip = false;

      // 调试用：带时间戳的日志
      let timerId = 0;

      function clearHideTimer() {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
      }

      function scheduleHide(source: string) {
        clearHideTimer();
        const id = ++timerId;
        hideTimer = setTimeout(() => {
          if (!isOverTooltip) {
            currentLink = null;
            tooltipView.hide();
          }
        }, 150);
      }

      // Track mouse entering/leaving the tooltip element itself
      tooltipView.container.addEventListener('mouseenter', () => {
        isOverTooltip = true;
        clearHideTimer();
      });
      tooltipView.container.addEventListener('mouseleave', () => {
        isOverTooltip = false;
        scheduleHide('container-mouseleave');
      });

      const handleMouseMove = (event: MouseEvent) => {
        // If mouse is over the tooltip container, don't hide
        if (isOverTooltip) return;

        // First check if the mouse is strictly over an <a> DOM element
        const anchorEl = findLinkElementAt(view, event.clientX, event.clientY);

        if (anchorEl) {
          // Mouse is over an actual <a> element — now resolve link info
          const link = findLinkAtPos(view, event.clientX, event.clientY);

          if (link) {
            clearHideTimer();

            // Only update if it's a different link
            if (!currentLink || currentLink.from !== link.from || currentLink.to !== link.to) {
              currentLink = link;
              tooltipView.updateLinkInfo(link.from, link.to, link.href, link.text);
              tooltipView.show(anchorEl.getBoundingClientRect());
            }
          } else {
            // <a> found but no link mark (shouldn't happen, but be safe)
            if (currentLink) {
              scheduleHide('mousemove-no-link-mark');
            }
          }
        } else {
          // Mouse is NOT over any <a> element — schedule hide
          if (currentLink) {
            scheduleHide('mousemove-no-anchor');
          }
        }
      };

      const handleMouseLeave = () => {
        scheduleHide('view-mouseleave');
      };

      view.dom.addEventListener('mousemove', handleMouseMove);
      view.dom.addEventListener('mouseleave', handleMouseLeave);

      return {
        update: (updatedView: EditorView, prevState: EditorState) => {
          tooltipView.setView(updatedView);
          // 仅在文档实际变更时才隐藏（选区/焦点变化不应影响 tooltip）
          if (currentLink && !updatedView.state.doc.eq(prevState.doc)) {
            currentLink = null;
            tooltipView.hide();
          }
        },
        destroy: () => {
          clearHideTimer();
          view.dom.removeEventListener('mousemove', handleMouseMove);
          view.dom.removeEventListener('mouseleave', handleMouseLeave);
          tooltipView.destroy();
        },
      };
    },
  });
}

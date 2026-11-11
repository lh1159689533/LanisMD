/**
 * Link 操作共享函数
 *
 * 供悬浮工具栏（link-tooltip）与右键菜单（context-menu）复用，
 * 避免「访问链接 / 编辑 / 复制 / 取消链接」四类操作的逻辑重复实现。
 *
 * @changelog
 * | 版本   | 变更说明                         | 关联                                          |
 * | v1.0.0 | 初始实现：抽取链接操作共享函数   | REQ: 20261104-node-context-menu TECH: 链接右键菜单 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView } from '@milkdown/kit/prose/view';
import { navigateLink } from './click';
import { createLinkDialog } from '../tooltip-toolbar';

/** 链接信息（范围 / 地址 / 文本） */
export interface LinkInfo {
  from: number;
  to: number;
  href: string;
  text: string;
}

/**
 * 在浏览器中打开链接（内部锚点 / 本地文件 / 外部 URL）。
 */
export function openLink(view: EditorView | undefined, href: string): void {
  if (!href) return;
  // navigateLink 是 async（外部 URL 可能弹确认框），需要捕获异常避免静默失败
  Promise.resolve(navigateLink(href, view)).catch((err) => {
    console.error('Failed to open link:', err);
  });
}

/**
 * 复制链接地址到剪贴板。
 */
export function copyLink(href: string): Promise<void> {
  return navigator.clipboard.writeText(href);
}

/**
 * 弹出编辑对话框并应用修改（移除旧 mark、按需替换文本、重新添加 link mark）。
 */
export function editLink(
  view: EditorView,
  from: number,
  to: number,
  text: string,
  href: string,
): void {
  const dialog = createLinkDialog(view, text, href, (newText, newHref) => {
    const linkType = view.state.schema.marks.link;
    if (!linkType) return;

    const { state, dispatch } = view;
    let tr = state.tr;

    // 先移除原有链接 mark
    tr = tr.removeMark(from, to, linkType);

    // 文本变化时替换文本内容，否则仅更新 href
    const currentText = state.doc.textBetween(from, to, ' ');
    if (newText !== currentText) {
      tr = tr.insertText(newText, from, to);
      const newTo = from + newText.length;
      tr = tr.addMark(from, newTo, linkType.create({ href: newHref }));
    } else {
      tr = tr.addMark(from, to, linkType.create({ href: newHref }));
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

/**
 * 取消链接（移除 link mark，保留纯文本）。
 */
export function unlinkLink(view: EditorView, from: number, to: number): void {
  const { state, dispatch } = view;
  const linkType = state.schema.marks.link;
  if (!linkType) return;

  const tr = state.tr.removeMark(from, to, linkType);
  dispatch(tr);
  view.focus();
}

/**
 * 根据鼠标坐标查找其下的链接 mark 及完整范围。
 */
export function findLinkAtPos(view: EditorView, x: number, y: number): LinkInfo | null {
  const pos = view.posAtCoords({ left: x, top: y });
  if (!pos) return null;

  const { state } = view;
  const linkType = state.schema.marks.link;
  if (!linkType) return null;

  const $pos = state.doc.resolve(pos.pos);

  // 检查该位置的 marks
  const marks = $pos.marks();
  const linkMark = marks.find((m) => m.type === linkType);
  if (!linkMark) return null;

  // 向前回退找到链接起点
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

  // 向后推进找到链接终点
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

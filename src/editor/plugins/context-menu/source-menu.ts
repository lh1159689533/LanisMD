/**
 * 源码模式（CodeMirror）右键菜单
 *
 * 此前源码模式下右键被全局屏蔽，没有任何菜单。这里补充常规编辑操作与
 * 「添加到 AI 对话」，与所见即所得模式的右键菜单保持一致的入口。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联           |
 * | v1.0.0 | 初始实现：源码模式编辑操作 + 添加到 AI 对话 | REQ: AI 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { EditorView } from '@codemirror/view';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

import { buildSourceChatMenuItems } from '../ai-edit/chat-bridge';
import { closeActiveMenu, showContextMenu, type ContextMenuItem } from './renderer';

const ICON_CUT =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>';
const ICON_COPY =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const ICON_PASTE =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';
const ICON_SELECT_ALL =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';

/** 读取剪贴板：优先 Tauri 插件（避免 WKWebView 的原生粘贴确认），浏览器环境回退 Clipboard API */
async function readClipboard(): Promise<string> {
  try {
    return await readText();
  } catch {
    return navigator.clipboard.readText();
  }
}

/** 写入剪贴板：优先 Tauri 插件，浏览器环境回退 Clipboard API */
async function writeClipboard(text: string): Promise<void> {
  try {
    await writeText(text);
  } catch {
    await navigator.clipboard.writeText(text);
  }
}

function buildItems(view: EditorView): ContextMenuItem[] {
  const { from, to } = view.state.selection.main;
  const hasSelection = from !== to;
  const items: ContextMenuItem[] = [
    {
      label: '剪切',
      icon: ICON_CUT,
      disabled: !hasSelection,
      action: () => {
        void writeClipboard(view.state.sliceDoc(from, to)).then(() => {
          view.dispatch({ changes: { from, to, insert: '' } });
          view.focus();
        });
      },
    },
    {
      label: '复制',
      icon: ICON_COPY,
      disabled: !hasSelection,
      action: () => {
        void writeClipboard(view.state.sliceDoc(from, to)).finally(() => view.focus());
      },
    },
    {
      label: '粘贴',
      icon: ICON_PASTE,
      action: () => {
        readClipboard()
          .then((text) => {
            if (text) view.dispatch(view.state.replaceSelection(text));
          })
          .catch(() => {
            // 剪贴板不可读时忽略
          })
          .finally(() => view.focus());
      },
    },
    {
      label: '全选',
      icon: ICON_SELECT_ALL,
      action: () => {
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
      },
    },
  ];

  const chatItems = buildSourceChatMenuItems(view);
  if (chatItems.length > 0) items.push({ label: '', separator: true }, ...chatItems);
  return items;
}

/** CodeMirror 扩展：注册源码模式右键菜单 */
export function sourceContextMenu() {
  return EditorView.domEventHandlers({
    contextmenu: (event, view) => {
      event.preventDefault();
      closeActiveMenu();
      showContextMenu(buildItems(view), event.clientX, event.clientY);
      return true;
    },
  });
}

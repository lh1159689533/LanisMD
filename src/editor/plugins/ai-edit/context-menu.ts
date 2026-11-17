/**
 * 编辑器自定义右键菜单
 *
 * 完全替换浏览器原生右键菜单，包含：
 * - 常规编辑操作：剪切、复制、粘贴、全选
 * - AI 操作（需有选中文本且 AI 功能启用）：
 *   - AI 润色（仅选中）
 *   - AI 润色（完整上下文）
 *   - AI 翻译
 *   - AI 解释
 */

import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { readText } from '@tauri-apps/plugin-clipboard-manager';

import { AI_COMMANDS } from '@/services/ai/commands';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { toggleImmersiveReading } from '@/utils/immersive-reading';
import { runAiCommand } from './generator';
import { showContextMenu, closeActiveMenu, type ContextMenuItem } from '../context-menu/renderer';

/**
 * 在编辑器上注册自定义右键菜单。
 * 返回销毁函数（取消监听）。
 */
export function registerContextMenu(view: EditorView): () => void {
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    closeActiveMenu();

    // 右键时 macOS WebKit 会自动选中光标下的词（英文整词、中文单字），
    // 但它只改了 DOM 选区、未同步到编辑器 state。此处清掉该自动选词，
    // 让屏幕高亮与「编辑器内部无选中」保持一致，菜单据此正确显示为无选中。
    if (view.state.selection.empty) {
      const domSelection = window.getSelection();
      if (domSelection && !domSelection.isCollapsed) {
        domSelection.removeAllRanges();
      }
    }

    const items = buildMenuItems(view);
    showContextMenu(items, e.clientX, e.clientY);
  }

  view.dom.addEventListener('contextmenu', handleContextMenu);

  return () => {
    view.dom.removeEventListener('contextmenu', handleContextMenu);
    closeActiveMenu();
  };
}

// ---------------------------------------------------------------------------
// 菜单项构建
// ---------------------------------------------------------------------------

/** 剪切图标 */
const ICON_CUT =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>';

/** 复制图标 */
const ICON_COPY =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

/** 粘贴图标 */
const ICON_PASTE =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>';

/** 全选图标 */
const ICON_SELECT_ALL =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>';

/** AI 魔法棒图标 */
const ICON_AI =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 13.9 8.1 19 10 13.9 11.9 12 17 10.1 11.9 5 10 10.1 8.1 12 3z"/><path d="M18 16l.75 2L21 19l-2.25 1L18 22l-.75-2L15 19l2.25-1L18 16z"/></svg>';

/** 沉浸式阅读图标（书本） */
const ICON_BOOK =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';

function buildMenuItems(view: EditorView): ContextMenuItem[] {
  const { state } = view;
  const { from, to } = state.selection;
  const hasSelection = from !== to;
  const immersive = useUIStore.getState().immersiveReading;

  const items: ContextMenuItem[] = [];

  // -- 沉浸式阅读切换项（始终位于菜单顶部） --
  // 开启时显示「关闭沉浸式阅读」，关闭时显示「开启沉浸式阅读」
  items.push({
    label: immersive ? '关闭沉浸式阅读' : '开启沉浸式阅读',
    icon: ICON_BOOK,
    action: () => {
      toggleImmersiveReading();
    },
  });

  // 沉浸式阅读开启时：仅保留只读类操作（复制 / 全选），其余编辑类与 AI 操作全部隐藏
  if (immersive) {
    items.push({ label: '', separator: true });
    items.push({
      label: '复制',
      icon: ICON_COPY,
      disabled: !hasSelection,
      action: () => {
        document.execCommand('copy');
        view.focus();
      },
    });
    items.push({
      label: '全选',
      icon: ICON_SELECT_ALL,
      action: () => {
        const { state: s, dispatch } = view;
        const tr = s.tr.setSelection(TextSelection.create(s.doc, 0, s.doc.content.size));
        dispatch(tr);
        view.focus();
      },
    });
    return items;
  }

  // -- 常规编辑操作（非沉浸式） --
  items.push({ label: '', separator: true });

  items.push({
    label: '剪切',
    icon: ICON_CUT,
    disabled: !hasSelection,
    action: () => {
      document.execCommand('cut');
      view.focus();
    },
  });

  items.push({
    label: '复制',
    icon: ICON_COPY,
    disabled: !hasSelection,
    action: () => {
      document.execCommand('copy');
      view.focus();
    },
  });

  items.push({
    label: '粘贴',
    icon: ICON_PASTE,
    action: () => {
      // 优先走 Tauri 剪贴板插件（Rust 侧读取，不经 WebKit），
      // 避免触发 WKWebView 的原生「Paste」确认按钮
      readText()
        .then((text) => {
          if (text) {
            const { state: s, dispatch } = view;
            const tr = s.tr.insertText(text, s.selection.from, s.selection.to);
            dispatch(tr);
          }
          view.focus();
        })
        .catch(() => {
          // 浏览器环境（pnpm dev）回退到 Clipboard API
          void navigator.clipboard
            .readText()
            .then((text) => {
              if (text) {
                const { state: s, dispatch } = view;
                const tr = s.tr.insertText(text, s.selection.from, s.selection.to);
                dispatch(tr);
              }
              view.focus();
            })
            .catch(() => {
              view.focus();
            });
        });
    },
  });

  items.push({
    label: '全选',
    icon: ICON_SELECT_ALL,
    action: () => {
      const { state: s, dispatch } = view;
      const tr = s.tr.setSelection(TextSelection.create(s.doc, 0, s.doc.content.size));
      dispatch(tr);
      view.focus();
    },
  });

  // -- AI 操作分区 --
  const aiEnabled = isAiEnabled();
  if (aiEnabled && hasSelection) {
    items.push({ label: '', separator: true });

    const selectedText = state.doc.textBetween(from, to, '\n', '\n');
    const fullDocument = state.doc.textBetween(0, state.doc.content.size, '\n', '\n');

    items.push({
      label: 'AI 润色（仅选中）',
      icon: ICON_AI,
      action: () => {
        void runAiCommand(view, AI_COMMANDS.polish);
      },
    });

    items.push({
      label: 'AI 润色（完整上下文）',
      icon: ICON_AI,
      action: () => {
        void runAiCommand(view, AI_COMMANDS.polish, {
          selection: selectedText,
          fullDocument,
        });
      },
    });

    items.push({
      label: 'AI 翻译',
      icon: ICON_AI,
      action: () => {
        void runAiCommand(view, AI_COMMANDS.translate, {
          options: { targetLang: '英语' },
        });
      },
    });

    items.push({
      label: 'AI 解释',
      icon: ICON_AI,
      action: () => {
        void runAiCommand(view, AI_COMMANDS.explain);
      },
    });
  }

  return items;
}

/** 检查 AI 功能是否启用 */
function isAiEnabled(): boolean {
  const { config } = useSettingsStore.getState();
  return Boolean(config.ai?.enabled);
}

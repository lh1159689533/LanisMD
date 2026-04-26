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

import { AI_COMMANDS } from '@/services/ai/commands';
import { useSettingsStore } from '@/stores/settings-store';
import { runAiCommand } from './generator';

/** 当前显示的右键菜单（全局唯一） */
let activeMenu: HTMLElement | null = null;

/** 关闭当前活跃的右键菜单 */
function closeActiveMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
}

/** 菜单项定义 */
interface MenuItem {
  label: string;
  icon?: string;
  /** 分隔线标记 */
  separator?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 点击回调 */
  action?: () => void;
  /** 附加的 CSS 类 */
  extraClass?: string;
}

/**
 * 在编辑器上注册自定义右键菜单。
 * 返回销毁函数（取消监听）。
 */
export function registerContextMenu(view: EditorView): () => void {
  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    closeActiveMenu();

    const items = buildMenuItems(view);
    if (items.length === 0) return;

    // 创建菜单 DOM
    const menu = document.createElement('div');
    menu.className = 'lanismd-ai-context-menu';

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'lanismd-ai-context-menu-separator';
        menu.appendChild(sep);
        continue;
      }

      const btn = document.createElement('button');
      btn.className = 'lanismd-ai-context-menu-item';
      if (item.extraClass) btn.classList.add(item.extraClass);
      if (item.disabled) {
        btn.classList.add('lanismd-ai-context-menu-item-disabled');
        btn.disabled = true;
      }
      btn.type = 'button';

      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'lanismd-ai-context-menu-icon';
        iconSpan.innerHTML = item.icon;
        btn.appendChild(iconSpan);
      }

      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      btn.appendChild(labelSpan);

      if (!item.disabled && item.action) {
        btn.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          closeActiveMenu();
          item.action!();
        });
      }

      menu.appendChild(btn);
    }

    // 定位菜单
    menu.style.position = 'fixed';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.style.zIndex = '9998';

    document.body.appendChild(menu);
    activeMenu = menu;

    // 延迟调整位置确保在视口内
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        menu.style.left = `${window.innerWidth - rect.width - 8}px`;
      }
      if (rect.bottom > window.innerHeight - 8) {
        menu.style.top = `${window.innerHeight - rect.height - 8}px`;
      }
    });

    // 点击其他位置关闭
    function handleOutsideClick(ev: MouseEvent) {
      if (!menu.contains(ev.target as Node)) {
        closeActiveMenu();
        document.removeEventListener('mousedown', handleOutsideClick, true);
      }
    }
    // 延迟绑定，避免当前事件立刻触发
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleOutsideClick, true);
    });

    // 滚动时关闭
    function handleScroll() {
      closeActiveMenu();
      document.removeEventListener('scroll', handleScroll, true);
    }
    document.addEventListener('scroll', handleScroll, true);
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

function buildMenuItems(view: EditorView): MenuItem[] {
  const { state } = view;
  const { from, to } = state.selection;
  const hasSelection = from !== to;

  const items: MenuItem[] = [];

  // -- 常规编辑操作 --
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
      // 使用 Clipboard API 粘贴
      void navigator.clipboard.readText().then((text) => {
        if (text) {
          const { state: s, dispatch } = view;
          const tr = s.tr.insertText(text, s.selection.from, s.selection.to);
          dispatch(tr);
        }
        view.focus();
      }).catch(() => {
        // 回退到 execCommand
        document.execCommand('paste');
        view.focus();
      });
    },
  });

  items.push({
    label: '全选',
    icon: ICON_SELECT_ALL,
    action: () => {
      const { state: s, dispatch } = view;
      const tr = s.tr.setSelection(
        TextSelection.create(s.doc, 0, s.doc.content.size),
      );
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
      extraClass: 'lanismd-ai-context-menu-item-ai',
      action: () => {
        void runAiCommand(view, AI_COMMANDS.polish);
      },
    });

    items.push({
      label: 'AI 润色（完整上下文）',
      icon: ICON_AI,
      extraClass: 'lanismd-ai-context-menu-item-ai',
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
      extraClass: 'lanismd-ai-context-menu-item-ai',
      action: () => {
        void runAiCommand(view, AI_COMMANDS.translate, {
          options: { targetLang: '英语' },
        });
      },
    });

    items.push({
      label: 'AI 解释',
      icon: ICON_AI,
      extraClass: 'lanismd-ai-context-menu-item-ai',
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

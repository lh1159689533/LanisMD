/**
 * 沉浸式阅读 —— 协同副作用集中处理。
 *
 * 由于切换沉浸式阅读会跨多个 store（UI / Editor），
 * 把这些副作用从单纯的 store action 中抽离出来，统一封装在此处。
 *
 * 调用方：StatusBar 按钮、编辑器右键菜单等。
 */

import { useUIStore } from '@/stores/ui-store';
import { useEditorStore } from '@/stores/editor-store';

/**
 * 模块级变量：记忆「进入沉浸式阅读前」用户的编辑模式，
 * 退出沉浸式阅读时恢复。
 *
 * 仅保留在内存中，不持久化（重启后由用户重新打开沉浸式阅读时再次记录）。
 */
let previousEditorMode: 'wysiwyg' | 'source' | null = null;

/**
 * 切换沉浸式阅读模式（带副作用）：
 * - 开启时：记忆当前编辑模式 → 强制切到 wysiwyg → 自动收起侧边栏一次
 * - 关闭时：恢复之前的编辑模式（若曾记录）
 *
 * 注意：侧边栏只在「开启时」自动收起，关闭时不主动展开（尊重用户后续手动调整）。
 */
export function toggleImmersiveReading(): void {
  const ui = useUIStore.getState();
  const editor = useEditorStore.getState();
  const willEnable = !ui.immersiveReading;

  if (willEnable) {
    // 进入沉浸式阅读
    previousEditorMode = editor.mode;
    if (editor.mode !== 'wysiwyg') {
      editor.setMode('wysiwyg');
    }
    if (ui.sidebarOpen) {
      // 收起侧边栏，但保留宽度，方便用户手动展开
      ui.collapseSidebar(ui.sidebarWidth);
    }
    if (ui.aiHistoryOpen) {
      // 关闭 AI 历史面板
      ui.closeAiHistory();
    }
  } else {
    // 退出沉浸式阅读：恢复之前的模式
    if (previousEditorMode && previousEditorMode !== editor.mode) {
      editor.setMode(previousEditorMode);
    }
    previousEditorMode = null;
  }

  ui.toggleImmersiveReading();
}

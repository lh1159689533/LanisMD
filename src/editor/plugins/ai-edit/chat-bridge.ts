/**
 * 编辑器与 AI 对话面板之间的桥接
 *
 * - 右键菜单「添加到 AI 对话」：选中片段 / 整篇文档（所见即所得与源码模式共用）
 * - 对话回复写回文档：插入到光标所在块之后 / 替换当前选区
 *
 * 写回前检查沉浸式阅读（只读）与是否有打开的文档。
 *
 * @changelog
 * | 版本   | 变更说明                              | 关联           |
 * | v1.0.0 | 初始实现：添加到对话、回复写回文档 | REQ: AI 对话框 |
 * | v1.1.0 | 菜单图标统一为 AI 图标             | REQ: AI 图标统一 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView as SourceView } from '@codemirror/view';
import type { EditorView } from '@milkdown/kit/prose/view';

import { aiIconSvg } from '@/constants/ai-icon';
import { attachToChat } from '@/services/ai/chat-runner';
import { useEditorStore } from '@/stores/editor-store';
import { useFileStore } from '@/stores/file-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';

import type { ContextMenuItem } from '../context-menu/renderer';
import {
  insertMarkdownAfterBlock,
  replaceRangeWithMarkdown,
  serializeDocToMarkdown,
  serializeRangeToMarkdown,
} from './commit/markdown-bridge';

/** AI 图标（全局统一，见 constants/ai-icon.ts） */
const ICON_AI = aiIconSvg(14);

/** AI 助手是否启用 */
function isAiEnabled(): boolean {
  return Boolean(useSettingsStore.getState().config.ai?.enabled);
}

/**
 * 「添加到 AI 对话」菜单项：有选中内容时添加片段，否则添加整篇文档。
 * AI 未启用时返回空数组。
 */
export function buildChatMenuItems(options: {
  hasSelection: boolean;
  getSelection: () => string;
  getDocument: () => string;
}): ContextMenuItem[] {
  if (!isAiEnabled()) return [];
  return [
    options.hasSelection
      ? {
          label: '添加到 AI 对话',
          icon: ICON_AI,
          action: () => attachToChat('selection', options.getSelection()),
        }
      : {
          label: '添加当前文档到 AI 对话',
          icon: ICON_AI,
          action: () => attachToChat('document', options.getDocument()),
        },
  ];
}

/** 所见即所得编辑器的「添加到 AI 对话」菜单项 */
export function buildWysiwygChatMenuItems(view: EditorView): ContextMenuItem[] {
  const { from, to } = view.state.selection;
  return buildChatMenuItems({
    hasSelection: from !== to,
    getSelection: () => serializeRangeToMarkdown(view, from, to),
    getDocument: () => serializeDocToMarkdown(view),
  });
}

/** 源码编辑器的「添加到 AI 对话」菜单项 */
export function buildSourceChatMenuItems(view: SourceView): ContextMenuItem[] {
  const { from, to } = view.state.selection.main;
  return buildChatMenuItems({
    hasSelection: from !== to,
    getSelection: () => view.state.sliceDoc(from, to),
    getDocument: () => view.state.doc.toString(),
  });
}

// ---------------------------------------------------------------------------
// 回复写回文档
// ---------------------------------------------------------------------------

/** 写回方式 */
export type ChatWriteMode = 'insert' | 'replace';

/** 当前能否写回文档；不能时返回原因 */
export function getChatWriteBlocker(): string | null {
  if (!useFileStore.getState().currentFile) return '请先打开一个文档';
  if (useUIStore.getState().immersiveReading) return '沉浸式阅读模式下不可编辑文档';
  const { mode, wysiwygView, sourceView } = useEditorStore.getState();
  if ((mode === 'wysiwyg' && !wysiwygView) || (mode === 'source' && !sourceView)) {
    return '编辑器尚未就绪';
  }
  return null;
}

/** 源码模式：在光标所在行之后插入，或替换选区 */
function writeToSource(view: SourceView, markdown: string, mode: ChatWriteMode): void {
  const { from, to } = view.state.selection.main;
  if (mode === 'replace' && from !== to) {
    view.dispatch({
      changes: { from, to, insert: markdown },
      selection: { anchor: from + markdown.length },
      scrollIntoView: true,
    });
  } else {
    const line = view.state.doc.lineAt(to);
    const insert = `\n\n${markdown}\n`;
    view.dispatch({
      changes: { from: line.to, insert },
      selection: { anchor: line.to + insert.length },
      scrollIntoView: true,
    });
  }
  view.focus();
}

/**
 * 把 Markdown 写回文档。
 *
 * @param mode - insert：插入到光标所在块之后；replace：替换选区（无选区时等同于 insert）
 * @returns 是否写入成功（失败时已提示原因）
 */
export function writeChatResultToEditor(markdown: string, mode: ChatWriteMode): boolean {
  const content = markdown.trim();
  if (!content) return false;
  const blocker = getChatWriteBlocker();
  if (blocker) {
    useUIStore.getState().addToast({ type: 'info', message: blocker });
    return false;
  }

  const { mode: editorMode, wysiwygView, sourceView } = useEditorStore.getState();
  if (editorMode === 'source' && sourceView) {
    writeToSource(sourceView, content, mode);
    return true;
  }
  if (!wysiwygView) return false;

  const { from, to } = wysiwygView.state.selection;
  if (mode === 'replace' && from !== to) {
    replaceRangeWithMarkdown(wysiwygView, from, to, content);
  } else {
    insertMarkdownAfterBlock(wysiwygView, to, content);
  }
  return true;
}

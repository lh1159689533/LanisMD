import { create } from 'zustand';
import type { EditorView as CMEditorView } from '@codemirror/view';
import type { EditorView as PMEditorView } from '@milkdown/kit/prose/view';
import type { OutlineItem } from '@/types';
import { useSettingsStore } from '@/stores/settings-store';

/** 从设置中获取编辑器默认值 */
function getEditorDefaults() {
  const config = useSettingsStore.getState().config.editor;
  return {
    mode: config.defaultMode as 'wysiwyg' | 'source',
    focusMode: config.defaultFocusMode,
    typewriterMode: config.defaultTypewriterMode,
  };
}

interface EditorState {
  mode: 'wysiwyg' | 'source';
  focusMode: boolean;
  typewriterMode: boolean;
  wordCount: number;
  charCount: number;
  lineCount: number;
  readingTime: number;
  outline: OutlineItem[];
  /** 当前激活（高亮）的大纲标题 ID */
  activeHeadingId: string | null;
  cursorLine: number;
  cursorColumn: number;
  /** 源码模式下的 CodeMirror EditorView 实例引用 */
  sourceView: CMEditorView | null;
  /** WYSIWYG 模式下的 ProseMirror EditorView 实例引用 */
  wysiwygView: PMEditorView | null;

  setMode: (mode: 'wysiwyg' | 'source') => void;
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;
  updateStats: (content: string) => void;
  updateOutline: (items: OutlineItem[]) => void;
  /** 设置当前激活的大纲标题 ID（用于滚动/光标同步高亮） */
  setActiveHeadingId: (id: string | null) => void;
  updateCursor: (line: number, column: number) => void;
  /** 注册/注销源码模式的 CodeMirror EditorView */
  setSourceView: (view: CMEditorView | null) => void;
  /** 注册/注销 WYSIWYG 模式的 ProseMirror EditorView */
  setWysiwygView: (view: PMEditorView | null) => void;
}

export const useEditorStore = create<EditorState>()((set) => {
  const defaults = getEditorDefaults();

  return {
    mode: defaults.mode,
    focusMode: defaults.focusMode,
    typewriterMode: defaults.typewriterMode,
  wordCount: 0,
  charCount: 0,
  lineCount: 0,
  readingTime: 0,
  outline: [],
  activeHeadingId: null,
  cursorLine: 1,
  cursorColumn: 1,
  sourceView: null,
  wysiwygView: null,

  setMode: (mode) => set({ mode }),
  toggleFocusMode: () => set((s) => {
    const newValue = !s.focusMode;
    // 切换后通知编辑器刷新装饰
    requestAnimationFrame(() => {
      const state = useEditorStore.getState();
      // WYSIWYG 模式：通知 ProseMirror 刷新装饰
      if (state.wysiwygView) {
        const tr = state.wysiwygView.state.tr.setMeta('focusModeToggle', true);
        state.wysiwygView.dispatch(tr);
      }
      // 源码模式：清除或重建行级 blur class
      if (state.sourceView) {
        const lines = state.sourceView.dom.querySelectorAll('.cm-line');
        if (!newValue) {
          lines.forEach((line) => line.classList.remove('lanismd-focus-blur'));
        } else {
          // 触发一次选区变化来重建装饰
          const pos = state.sourceView.state.selection.main.head;
          state.sourceView.dispatch({ selection: { anchor: pos } });
        }
      }
    });
    return { focusMode: newValue };
  }),
  toggleTypewriterMode: () => set((s) => ({ typewriterMode: !s.typewriterMode })),

  updateStats: (content) => {
    const charCount = content.length; // 含空格的总字符数
    const chineseChars = (content.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishWords = content
      .replace(/[\u4e00-\u9fff]/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length;
    const wordCount = chineseChars + englishWords;
    const lineCount = content.split('\n').length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 300));
    set({ charCount, wordCount, lineCount, readingTime });
  },

  updateOutline: (items) => set({ outline: items }),
  setActiveHeadingId: (id) => set({ activeHeadingId: id }),
  updateCursor: (line, column) => set({ cursorLine: line, cursorColumn: column }),
  setSourceView: (view) => set({ sourceView: view }),
  setWysiwygView: (view) => set({ wysiwygView: view }),
}; });

import { create } from 'zustand';
import type { EditorView as CMEditorView } from '@codemirror/view';
import type { EditorView as PMEditorView } from '@milkdown/kit/prose/view';
import type { OutlineItem } from '@/types';

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

export const useEditorStore = create<EditorState>()((set) => ({
  mode: 'wysiwyg',
  focusMode: false,
  typewriterMode: false,
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
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
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
}));

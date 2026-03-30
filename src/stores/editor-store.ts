import { create } from 'zustand';
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
  cursorLine: number;
  cursorColumn: number;

  setMode: (mode: 'wysiwyg' | 'source') => void;
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;
  updateStats: (content: string) => void;
  updateOutline: (items: OutlineItem[]) => void;
  updateCursor: (line: number, column: number) => void;
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
  cursorLine: 1,
  cursorColumn: 1,

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
  updateCursor: (line, column) => set({ cursorLine: line, cursorColumn: column }),
}));

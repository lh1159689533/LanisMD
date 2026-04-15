import { create } from 'zustand';

interface SearchMatch {
  /** 匹配在文档中的起始位置 */
  from: number;
  /** 匹配在文档中的结束位置 */
  to: number;
}

interface SearchState {
  /** 搜索面板是否打开 */
  isOpen: boolean;
  /** 仅高亮模式：不显示搜索面板 UI，仅在编辑器中高亮关键词（用于全局搜索跳转） */
  highlightOnly: boolean;
  /** 替换行是否展开 */
  showReplace: boolean;
  /** 搜索关键词 */
  searchText: string;
  /** 替换文本 */
  replaceText: string;
  /** 是否区分大小写 */
  caseSensitive: boolean;
  /** 是否全词匹配 */
  wholeWord: boolean;
  /** 是否使用正则表达式 */
  useRegex: boolean;
  /** 所有匹配结果（包含文档位置） */
  matches: SearchMatch[];
  /** 当前高亮的匹配索引（从 0 开始，-1 表示无匹配） */
  currentIndex: number;

  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
  toggleReplace: () => void;
  setSearchText: (text: string) => void;
  setReplaceText: (text: string) => void;
  setCaseSensitive: (value: boolean) => void;
  setWholeWord: (value: boolean) => void;
  setUseRegex: (value: boolean) => void;
  /** 更新匹配结果（由 ProseMirror 插件调用） */
  setMatches: (matches: SearchMatch[]) => void;
  /** 设置当前高亮索引 */
  setCurrentIndex: (index: number) => void;
  /** 导航到下一个匹配 */
  navigateNext: () => void;
  /** 导航到上一个匹配 */
  navigatePrev: () => void;
  /** 启用仅高亮模式（全局搜索跳转时调用） */
  enableHighlightOnly: (text: string, caseSensitive: boolean, wholeWord: boolean, useRegex: boolean, activeIndex: number) => void;
  /** 关闭仅高亮模式 */
  disableHighlightOnly: () => void;
  /** 重置搜索状态（关闭时调用） */
  reset: () => void;
}

export const useSearchStore = create<SearchState>()((set, get) => ({
  isOpen: false,
  highlightOnly: false,
  showReplace: false,
  searchText: '',
  replaceText: '',
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
  matches: [],
  currentIndex: -1,

  openSearch: () => set({ isOpen: true, highlightOnly: false }),
  closeSearch: () => {
    set({
      isOpen: false,
      highlightOnly: false,
      searchText: '',
      replaceText: '',
      matches: [],
      currentIndex: -1,
    });
  },
  toggleSearch: () => {
    const { isOpen } = get();
    if (isOpen) {
      get().closeSearch();
    } else {
      set({ isOpen: true });
    }
  },
  toggleReplace: () => set((s) => ({ showReplace: !s.showReplace })),
  setSearchText: (text) => set({ searchText: text, currentIndex: -1 }),
  setReplaceText: (text) => set({ replaceText: text }),
  setCaseSensitive: (value) => set({ caseSensitive: value, currentIndex: -1 }),
  setWholeWord: (value) => set({ wholeWord: value, currentIndex: -1 }),
  setUseRegex: (value) => set({ useRegex: value, currentIndex: -1 }),
  setMatches: (matches) => {
    const { currentIndex } = get();
    // 如果当前索引超出新匹配数量，重置为第一个
    const newIndex = matches.length > 0
      ? (currentIndex >= 0 && currentIndex < matches.length ? currentIndex : 0)
      : -1;
    set({ matches, currentIndex: newIndex });
  },
  setCurrentIndex: (index) => set({ currentIndex: index }),
  navigateNext: () => {
    const { matches, currentIndex } = get();
    if (matches.length === 0) return;
    const next = currentIndex >= matches.length - 1 ? 0 : currentIndex + 1;
    set({ currentIndex: next });
  },
  navigatePrev: () => {
    const { matches, currentIndex } = get();
    if (matches.length === 0) return;
    const prev = currentIndex <= 0 ? matches.length - 1 : currentIndex - 1;
    set({ currentIndex: prev });
  },
  enableHighlightOnly: (text, cs, ww, re, activeIndex) => {
    set({
      highlightOnly: true,
      isOpen: false,
      searchText: text,
      caseSensitive: cs,
      wholeWord: ww,
      useRegex: re,
      currentIndex: activeIndex,
    });
  },
  disableHighlightOnly: () => {
    set({
      highlightOnly: false,
      searchText: '',
      matches: [],
      currentIndex: -1,
    });
  },
  reset: () => set({
    searchText: '',
    replaceText: '',
    matches: [],
    currentIndex: -1,
    highlightOnly: false,
  }),
}));

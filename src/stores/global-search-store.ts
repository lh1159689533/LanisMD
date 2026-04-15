import { create } from 'zustand';
import {
  globalSearchService,
  type FileSearchResult,
} from '@/services/tauri/global-search-service';
import { useFileTreeStore } from './file-tree-store';

interface GlobalSearchState {
  // 搜索参数
  searchText: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  includeFolders: string;
  excludeFolders: string;
  showFilters: boolean;

  // 搜索结果
  results: FileSearchResult[];
  totalMatches: number;
  totalFiles: number;
  isSearching: boolean;
  /** 搜索错误信息（正则语法错误等） */
  errorMessage: string;

  // 结果展示状态
  expandedFiles: Set<string>;

  // Actions
  setSearchText: (text: string) => void;
  toggleCaseSensitive: () => void;
  toggleWholeWord: () => void;
  toggleUseRegex: () => void;
  setIncludeFolders: (value: string) => void;
  setExcludeFolders: (value: string) => void;
  toggleFilters: () => void;
  toggleFileExpanded: (filePath: string) => void;
  performSearch: () => Promise<void>;
  clearResults: () => void;
}

export const useGlobalSearchStore = create<GlobalSearchState>()((set, get) => ({
  searchText: '',
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
  includeFolders: '',
  excludeFolders: '',
  showFilters: false,

  results: [],
  totalMatches: 0,
  totalFiles: 0,
  isSearching: false,
  errorMessage: '',

  expandedFiles: new Set<string>(),

  setSearchText: (text) => set({ searchText: text, errorMessage: '' }),

  toggleCaseSensitive: () => set((s) => ({ caseSensitive: !s.caseSensitive })),
  toggleWholeWord: () => set((s) => ({ wholeWord: !s.wholeWord })),
  toggleUseRegex: () => set((s) => ({ useRegex: !s.useRegex, errorMessage: '' })),

  setIncludeFolders: (value) => set({ includeFolders: value }),
  setExcludeFolders: (value) => set({ excludeFolders: value }),
  toggleFilters: () => set((s) => ({ showFilters: !s.showFilters })),

  toggleFileExpanded: (filePath) => {
    const { expandedFiles } = get();
    const next = new Set(expandedFiles);
    if (next.has(filePath)) {
      next.delete(filePath);
    } else {
      next.add(filePath);
    }
    set({ expandedFiles: next });
  },

  performSearch: async () => {
    const state = get();
    const { searchText } = state;

    if (!searchText.trim()) {
      set({ results: [], totalMatches: 0, totalFiles: 0, errorMessage: '' });
      return;
    }

    const rootPath = useFileTreeStore.getState().rootPath;
    if (!rootPath) {
      set({ errorMessage: '请先打开文件夹' });
      return;
    }

    set({ isSearching: true, errorMessage: '' });

    try {
      const parseFolders = (input: string): string[] =>
        input
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

      const response = await globalSearchService.search({
        rootPath,
        query: searchText,
        caseSensitive: state.caseSensitive,
        wholeWord: state.wholeWord,
        useRegex: state.useRegex,
        includeFolders: parseFolders(state.includeFolders),
        excludeFolders: parseFolders(state.excludeFolders),
      });

      // 搜索完成后默认展开所有文件
      const expanded = new Set<string>();
      for (const r of response.results) {
        expanded.add(r.filePath);
      }

      set({
        results: response.results,
        totalMatches: response.totalMatches,
        totalFiles: response.totalFiles,
        expandedFiles: expanded,
        isSearching: false,
      });
    } catch (err) {
      set({
        isSearching: false,
        errorMessage: String(err),
        results: [],
        totalMatches: 0,
        totalFiles: 0,
      });
    }
  },

  clearResults: () =>
    set({
      searchText: '',
      results: [],
      totalMatches: 0,
      totalFiles: 0,
      errorMessage: '',
      expandedFiles: new Set(),
    }),
}));

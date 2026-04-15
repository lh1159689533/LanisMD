/**
 * Search Highlight Plugin
 *
 * 在 WYSIWYG（Milkdown/ProseMirror）编辑器中高亮搜索匹配结果。
 * 通过监听 search-store 中的搜索状态，动态创建 Decoration 来标记匹配位置。
 *
 * 两种装饰类型：
 * - `.lanismd-search-match`：所有匹配项的背景高亮
 * - `.lanismd-search-match-active`：当前激活匹配项的高亮（更醒目）
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { useSearchStore } from '@/stores/search-store';

// ---------------------------------------------------------------------------
// Plugin Key
// ---------------------------------------------------------------------------

export const searchHighlightPluginKey = new PluginKey('SEARCH_HIGHLIGHT');

// ---------------------------------------------------------------------------
// 辅助函数：构建正则表达式
// ---------------------------------------------------------------------------

function buildSearchRegex(
  searchText: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  useRegex: boolean,
): RegExp | null {
  if (!searchText) return null;

  try {
    const flags = caseSensitive ? 'g' : 'gi';
    let pattern = useRegex ? searchText : searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 全词匹配：用词边界包裹
    if (wholeWord && !useRegex) {
      pattern = `\\b${pattern}\\b`;
    }
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 辅助函数：在文档中查找所有匹配
// ---------------------------------------------------------------------------

interface MatchPosition {
  from: number;
  to: number;
}

function findMatchesInDoc(
  doc: import('@milkdown/kit/prose/model').Node,
  regex: RegExp,
): MatchPosition[] {
  const matches: MatchPosition[] = [];

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(node.text)) !== null) {
        const from = pos + match.index;
        const to = from + match[0].length;
        if (match[0].length > 0) {
          matches.push({ from, to });
        }
        // 防止空匹配造成死循环
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    }
  });

  return matches;
}

// ---------------------------------------------------------------------------
// 辅助函数：创建装饰集
// ---------------------------------------------------------------------------

function createSearchDecorations(
  doc: import('@milkdown/kit/prose/model').Node,
  matches: MatchPosition[],
  activeIndex: number,
): DecorationSet {
  if (matches.length === 0) {
    return DecorationSet.empty;
  }

  const decorations: Decoration[] = matches.map((match, index) => {
    const isActive = index === activeIndex;
    return Decoration.inline(match.from, match.to, {
      class: isActive ? 'lanismd-search-match lanismd-search-match-active' : 'lanismd-search-match',
    });
  });

  return DecorationSet.create(doc, decorations);
}

// ---------------------------------------------------------------------------
// ProseMirror 插件
// ---------------------------------------------------------------------------

interface SearchPluginState {
  decorations: DecorationSet;
  matches: MatchPosition[];
  searchText: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  currentIndex: number;
}

export const searchHighlightPlugin = $prose(() => {
  return new Plugin({
    key: searchHighlightPluginKey,

    state: {
      init(_, state): SearchPluginState {
        const store = useSearchStore.getState();
        // 在搜索面板打开或仅高亮模式下执行搜索
        const shouldHighlight = store.isOpen || store.highlightOnly;
        const regex = shouldHighlight
          ? buildSearchRegex(store.searchText, store.caseSensitive, store.wholeWord, store.useRegex)
          : null;
        const matches = regex ? findMatchesInDoc(state.doc, regex) : [];

        // 同步匹配结果到 store
        store.setMatches(matches);

        return {
          decorations: createSearchDecorations(state.doc, matches, store.currentIndex),
          matches,
          searchText: store.searchText,
          caseSensitive: store.caseSensitive,
          wholeWord: store.wholeWord,
          useRegex: store.useRegex,
          currentIndex: store.currentIndex,
        };
      },

      apply(tr, pluginState, _oldState, newState): SearchPluginState {
        const store = useSearchStore.getState();
        const { searchText, caseSensitive, wholeWord, useRegex, currentIndex, isOpen, highlightOnly } = store;

        // 搜索面板关闭且非仅高亮模式时清除所有装饰
        if (!isOpen && !highlightOnly) {
          if (pluginState.matches.length > 0) {
            store.setMatches([]);
          }
          return {
            decorations: DecorationSet.empty,
            matches: [],
            searchText: '',
            caseSensitive,
            wholeWord,
            useRegex,
            currentIndex: -1,
          };
        }

        // 检查是否需要重新计算匹配
        const searchChanged =
          searchText !== pluginState.searchText ||
          caseSensitive !== pluginState.caseSensitive ||
          wholeWord !== pluginState.wholeWord ||
          useRegex !== pluginState.useRegex;

        const docChanged = tr.docChanged;
        const indexChanged = currentIndex !== pluginState.currentIndex;

        if (!searchChanged && !docChanged && !indexChanged) {
          return pluginState;
        }

        // 需要重新搜索时
        if (searchChanged || docChanged) {
          const regex = buildSearchRegex(searchText, caseSensitive, wholeWord, useRegex);
          const matches = regex ? findMatchesInDoc(newState.doc, regex) : [];

          // 同步匹配结果到 store
          store.setMatches(matches);

          const activeIndex = store.currentIndex;

          return {
            decorations: createSearchDecorations(newState.doc, matches, activeIndex),
            matches,
            searchText,
            caseSensitive,
            wholeWord,
            useRegex,
            currentIndex: activeIndex,
          };
        }

        // 只是索引变化，重新生成装饰即可
        return {
          ...pluginState,
          decorations: createSearchDecorations(newState.doc, pluginState.matches, currentIndex),
          currentIndex,
        };
      },
    },

    props: {
      decorations(state) {
        const pluginState = this.getState(state) as SearchPluginState | undefined;
        return pluginState?.decorations ?? DecorationSet.empty;
      },
    },
  });
});

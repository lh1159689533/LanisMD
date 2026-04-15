import { useCallback, useEffect, useRef } from 'react';
import { TextSelection } from '@milkdown/kit/prose/state';
import { useGlobalSearchStore } from '@/stores/global-search-store';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSearchStore } from '@/stores/search-store';
import { fileService } from '@/services/tauri';
import { cn } from '@/utils/cn';

import '../../styles/layout/search-panel.css';

/**
 * 向上查找真正的滚动容器（overflow: auto/scroll）
 */
function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  while (el) {
    const { overflow, overflowY } = getComputedStyle(el);
    if (
      overflow === 'auto' || overflow === 'scroll' ||
      overflowY === 'auto' || overflowY === 'scroll'
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * 在 WYSIWYG 模式下启用高亮并跳转到第 matchIndex 个匹配
 */
function scrollToMatchInWysiwyg(
  view: import('@milkdown/kit/prose/view').EditorView,
  searchText: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  useRegexFlag: boolean,
  matchIndex: number,
): void {
  // 通过 searchStore 的 highlightOnly 模式触发 search-highlight 插件高亮
  const store = useSearchStore.getState();
  store.enableHighlightOnly(searchText, caseSensitive, wholeWord, useRegexFlag, matchIndex);

  // dispatch 一个空事务，触发 search-highlight 插件的 apply 重新计算装饰
  view.dispatch(view.state.tr);

  // 插件 apply 后，searchStore.matches 已被更新，读取匹配位置
  const { matches, currentIndex } = useSearchStore.getState();
  const targetIndex = currentIndex >= 0 ? currentIndex : matchIndex;
  if (targetIndex < 0 || targetIndex >= matches.length) return;

  const target = matches[targetIndex];

  try {
    const { tr } = view.state;
    const selection = TextSelection.create(view.state.doc, target.from, target.to);
    view.dispatch(tr.setSelection(selection));

    // 滚动外层容器到匹配位置
    requestAnimationFrame(() => {
      const scrollContainer = findScrollContainer(view.dom.parentElement);
      if (!scrollContainer) return;
      const coords = view.coordsAtPos(target.from);
      if (!coords) return;
      const containerRect = scrollContainer.getBoundingClientRect();
      const offset = coords.top - containerRect.top;
      // 如果匹配项不在可视区域内，滚动让其居中偏上
      if (offset < 60 || offset > containerRect.height - 60) {
        scrollContainer.scrollBy({
          top: offset - containerRect.height / 3,
          behavior: 'smooth',
        });
      }
    });
  } catch (e) {
    console.warn('全局搜索跳转失败:', e);
  }
}

/**
 * 在源码模式下跳转到指定行
 */
function scrollToLineInSource(lineNumber: number): void {
  const sourceView = useEditorStore.getState().sourceView;
  if (!sourceView) return;

  const doc = sourceView.state.doc;
  if (lineNumber < 1 || lineNumber > doc.lines) return;

  const line = doc.line(lineNumber);
  sourceView.dispatch({
    selection: { anchor: line.from, head: line.to },
    scrollIntoView: true,
  });

  // 滚动外层容器
  requestAnimationFrame(() => {
    const scrollContainer = findScrollContainer(sourceView.dom.parentElement);
    if (!scrollContainer) return;
    const coords = sourceView.coordsAtPos(line.from);
    if (!coords) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const offset = coords.top - containerRect.top;
    if (offset < 60 || offset > containerRect.height - 60) {
      scrollContainer.scrollBy({
        top: offset - containerRect.height / 3,
        behavior: 'smooth',
      });
    }
  });
}

/**
 * 搜索面板 - VSCode 风格的全局文件内容搜索
 */
export function SearchPanel() {
  const {
    searchText,
    caseSensitive,
    wholeWord,
    useRegex,
    showFilters,
    includeFolders,
    excludeFolders,
    results,
    totalMatches,
    totalFiles,
    isSearching,
    errorMessage,
    expandedFiles,
    setSearchText,
    toggleCaseSensitive,
    toggleWholeWord,
    toggleUseRegex,
    toggleFilters,
    setIncludeFolders,
    setExcludeFolders,
    toggleFileExpanded,
    performSearch,
    clearResults,
  } = useGlobalSearchStore();

  const rootPath = useFileTreeStore((s) => s.rootPath);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // debounce 300ms 自动搜索
  const triggerSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch();
    }, 300);
  }, [performSearch]);

  // 搜索文本变化时触发
  const handleSearchTextChange = useCallback(
    (text: string) => {
      setSearchText(text);
      if (!text.trim()) {
        clearResults();
        return;
      }
      triggerSearch();
    },
    [setSearchText, clearResults, triggerSearch],
  );

  // 切换搜索选项时重新搜索
  useEffect(() => {
    if (searchText.trim()) {
      triggerSearch();
    }
  }, [caseSensitive, wholeWord, useRegex]);

  // 过滤条件变化时重新搜索
  useEffect(() => {
    if (searchText.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        performSearch();
      }, 500);
    }
  }, [includeFolders, excludeFolders]);

  // 清理定时器，卸载时关闭仅高亮模式
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // 组件卸载时（切换面板等），关闭仅高亮模式
      useSearchStore.getState().disableHighlightOnly();
    };
  }, []);

  // 点击结果项 -> 打开文件并跳转到行
  const handleResultClick = useCallback(
    async (filePath: string, lineNumber: number, matchIndex: number) => {
      try {
        const currentFile = useFileStore.getState().currentFile;
        const needOpen = currentFile?.filePath !== filePath;

        // 如果文件未打开，先打开
        if (needOpen) {
          const result = await fileService.readFile({ path: filePath });
          const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
          useFileStore.getState().openFile(filePath, result.content, result.encoding, fileName);
        }

        // 联动文件树：展开父目录 + 高亮选中（与 QuickOpen 保持一致）
        useFileTreeStore.getState().revealFile(filePath);

        // 等待编辑器准备好后执行跳转
        const maxWait = needOpen ? 2000 : 200;
        const interval = 50;
        let elapsed = 0;

        const tryJump = () => {
          const currentMode = useEditorStore.getState().mode;
          if (currentMode === 'source') {
            const sv = useEditorStore.getState().sourceView;
            if (sv) {
              scrollToLineInSource(lineNumber);
              return;
            }
          } else {
            const view = useEditorStore.getState().wysiwygView;
            if (view) {
              scrollToMatchInWysiwyg(
                view,
                searchText,
                caseSensitive,
                wholeWord,
                useRegex,
                matchIndex,
              );
              return;
            }
          }

          // 编辑器还没准备好，继续等待
          elapsed += interval;
          if (elapsed < maxWait) {
            setTimeout(tryJump, interval);
          }
        };

        // 文件未打开时先等一小段让编辑器开始初始化
        setTimeout(tryJump, needOpen ? 100 : 0);
      } catch {
        // 文件打开失败静默处理
      }
    },
    [searchText, caseSensitive, wholeWord, useRegex],
  );

  // 获取相对路径
  const getRelativePath = useCallback(
    (filePath: string) => {
      if (rootPath && filePath.startsWith(rootPath)) {
        return filePath.slice(rootPath.length + 1);
      }
      return filePath;
    },
    [rootPath],
  );

  // 渲染高亮文本
  const renderHighlightedLine = useCallback(
    (lineContent: string, matchStart: number, matchEnd: number) => {
      const before = lineContent.slice(0, matchStart);
      const match = lineContent.slice(matchStart, matchEnd);
      const after = lineContent.slice(matchEnd);

      // 截断过长的前缀
      const maxPrefix = 20;
      const trimmedBefore =
        before.length > maxPrefix ? '...' + before.slice(before.length - maxPrefix) : before;

      return (
        <span className="lanismd-search-match-text">
          <span className="lanismd-search-context">{trimmedBefore}</span>
          <span className="lanismd-search-highlight">{match}</span>
          <span className="lanismd-search-context">{after}</span>
        </span>
      );
    },
    [],
  );

  return (
    <div className="lanismd-search-panel">
      {/* 标题栏 */}
      <div className="lanismd-search-header">
        <span className="lanismd-search-title">搜索</span>
        <button
          className={cn('lanismd-search-filter-toggle', showFilters && 'active')}
          onClick={toggleFilters}
          title="切换文件夹过滤"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 4h12v1H2V4zm2 3h8v1H4V7zm2 3h4v1H6v-1z" />
          </svg>
        </button>
      </div>

      {/* 搜索输入区 - 选项按钮内嵌在输入框内，和编辑器搜索样式一致 */}
      <div className="lanismd-search-input-row">
        <div className="lanismd-search-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => handleSearchTextChange(e.target.value)}
            placeholder="搜索..."
            className="lanismd-search-input"
            spellCheck={false}
          />
          {/* 选项按钮组：区分大小写 / 全词匹配 / 正则（内嵌在输入框内） */}
          <div className="lanismd-search-options">
            <button
              className={cn('lanismd-search-option-btn', caseSensitive && 'active')}
              onClick={toggleCaseSensitive}
              title="区分大小写"
            >
              Aa
            </button>
            <button
              className={cn('lanismd-search-option-btn', wholeWord && 'active')}
              onClick={toggleWholeWord}
              title="全词匹配"
            >
              <span className="lanismd-search-whole-word">ab</span>
            </button>
            <button
              className={cn('lanismd-search-option-btn', useRegex && 'active')}
              onClick={toggleUseRegex}
              title="正则表达式"
            >
              .*
            </button>
          </div>
          {searchText && (
            <button
              className="lanismd-search-clear-btn"
              onClick={() => handleSearchTextChange('')}
              title="清除"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 8.707l3.646 3.647.708-.707L8.707 8l3.647-3.646-.707-.708L8 7.293 4.354 3.646l-.708.708L7.293 8l-3.647 3.646.708.708L8 8.707z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 文件夹过滤区域 */}
      {showFilters && (
        <div className="lanismd-search-filters">
          <div className="lanismd-search-filter-field">
            <label className="lanismd-search-filter-label">包含文件夹</label>
            <input
              type="text"
              value={includeFolders}
              onChange={(e) => setIncludeFolders(e.target.value)}
              placeholder="例如: docs, notes"
              className="lanismd-search-filter-input"
              spellCheck={false}
            />
          </div>
          <div className="lanismd-search-filter-field">
            <label className="lanismd-search-filter-label">排除文件夹</label>
            <input
              type="text"
              value={excludeFolders}
              onChange={(e) => setExcludeFolders(e.target.value)}
              placeholder="例如: archive, .trash"
              className="lanismd-search-filter-input"
              spellCheck={false}
            />
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {errorMessage && (
        <div className="lanismd-search-error">{errorMessage}</div>
      )}

      {/* 搜索状态/统计 */}
      {isSearching && (
        <div className="lanismd-search-status">搜索中...</div>
      )}

      {!isSearching && searchText.trim() && !errorMessage && (
        <div className="lanismd-search-stats">
          {totalMatches > 0
            ? `${totalMatches} 个结果，包含于 ${totalFiles} 个文件中`
            : '未找到结果'}
        </div>
      )}

      {!rootPath && searchText.trim() && (
        <div className="lanismd-search-empty">请先打开文件夹</div>
      )}

      {/* 搜索结果列表 */}
      <div className="lanismd-search-results">
        {results.map((file) => {
          const isExpanded = expandedFiles.has(file.filePath);
          return (
            <div key={file.filePath} className="lanismd-search-file-group">
              {/* 文件名行 */}
              <button
                className="lanismd-search-file-header"
                onClick={() => toggleFileExpanded(file.filePath)}
              >
                <svg
                  className={cn('lanismd-search-chevron', isExpanded && 'expanded')}
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M5.7 13.7L5 13l4.6-5L5 3l.7-.7L10.8 8z" />
                </svg>
                <span className="lanismd-search-file-name" title={getRelativePath(file.filePath)}>
                  {file.fileName}
                </span>
                <span className="lanismd-search-file-path">
                  {getRelativePath(file.filePath)}
                </span>
                <span className="lanismd-search-match-count">{file.matches.length}</span>
              </button>

              {/* 匹配项列表 */}
              {isExpanded && (
                <div className="lanismd-search-match-list">
                  {file.matches.map((match, idx) => (
                    <button
                      key={`${match.lineNumber}-${match.matchStart}-${idx}`}
                      className="lanismd-search-match-item"
                      onClick={() => handleResultClick(file.filePath, match.lineNumber, idx)}
                      title={`第 ${match.lineNumber} 行`}
                    >
                      {renderHighlightedLine(
                        match.lineContent,
                        match.matchStart,
                        match.matchEnd,
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * SearchReplace - 文档内搜索替换面板
 *
 * 连接 search-store，通过 ProseMirror 插件实现实时搜索高亮、
 * 匹配导航和文本替换。
 *
 * 布局参考 VS Code 风格：
 * - 搜索行：输入框（内嵌 Aa/ab/.* 选项按钮）+ 匹配计数 + 上下导航 + 展开替换 + 关闭
 * - 替换行（可折叠）：输入框 + 替换 + 全部替换
 *
 * 样式类名前缀: lanismd-editor-search-（与全局搜索 lanismd-search- 严格区分）
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  RiCloseLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
} from 'react-icons/ri';
import { cn } from '@/utils/cn';
import { useSearchStore } from '@/stores/search-store';

interface SearchReplaceProps {
  /** 滚动到指定位置的回调（由父组件提供，用于将匹配项滚动到可视区域） */
  onScrollToMatch?: (from: number, to: number) => void;
  /** 替换当前匹配的回调 */
  onReplace?: (from: number, to: number, replaceText: string) => void;
  /** 替换全部匹配的回调 */
  onReplaceAll?: (replaceText: string) => void;
}

export function SearchReplace({ onScrollToMatch, onReplace, onReplaceAll }: SearchReplaceProps) {
  const {
    searchText,
    replaceText,
    caseSensitive,
    wholeWord,
    useRegex,
    showReplace,
    matches,
    currentIndex,
    setSearchText,
    setReplaceText,
    setCaseSensitive,
    setWholeWord,
    setUseRegex,
    toggleReplace,
    navigateNext,
    navigatePrev,
    closeSearch,
  } = useSearchStore();

  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时自动聚焦搜索输入框
  useEffect(() => {
    // 延迟一帧确保 DOM 已渲染
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  // 当 currentIndex 变化时滚动到对应匹配位置
  useEffect(() => {
    if (currentIndex >= 0 && currentIndex < matches.length) {
      const match = matches[currentIndex];
      onScrollToMatch?.(match.from, match.to);
    }
  }, [currentIndex, matches, onScrollToMatch]);

  const handleNavigateNext = useCallback(() => {
    navigateNext();
  }, [navigateNext]);

  const handleNavigatePrev = useCallback(() => {
    navigatePrev();
  }, [navigatePrev]);

  const handleReplace = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < matches.length) {
      const match = matches[currentIndex];
      onReplace?.(match.from, match.to, replaceText);
    }
  }, [currentIndex, matches, replaceText, onReplace]);

  const handleReplaceAll = useCallback(() => {
    onReplaceAll?.(replaceText);
  }, [replaceText, onReplaceAll]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          handleNavigatePrev();
        } else {
          handleNavigateNext();
        }
      }
      if (e.key === 'Escape') {
        closeSearch();
      }
    },
    [handleNavigateNext, handleNavigatePrev, closeSearch],
  );

  const handleReplaceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleReplace();
      }
      if (e.key === 'Escape') {
        closeSearch();
      }
    },
    [handleReplace, closeSearch],
  );

  // 显示匹配计数文本
  const matchCountText = matches.length > 0
    ? `${currentIndex + 1}/${matches.length}`
    : searchText ? '无结果' : '';

  // 匹配计数是否无结果
  const noResult = !!(searchText && matches.length === 0);

  return (
    <div
      className="lanismd-editor-search-panel"
      // 阻止点击事件冒泡到编辑器
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="lanismd-editor-search-body">
        {/* 展开/折叠替换行的箭头 */}
        <button
          type="button"
          onClick={toggleReplace}
          title={showReplace ? '折叠替换' : '展开替换'}
          className="lanismd-editor-search-toggle"
        >
          {showReplace ? <RiArrowDownSLine size={14} /> : <RiArrowRightSLine size={14} />}
        </button>

        {/* 右侧主体内容 */}
        <div className="lanismd-editor-search-content">
          {/* 搜索行 */}
          <div className="lanismd-editor-search-row">
            {/* 搜索输入框（内嵌选项按钮） */}
            <div className="lanismd-editor-search-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="搜索..."
                className="lanismd-editor-search-input"
                spellCheck={false}
              />
              {/* 选项按钮组：区分大小写 / 全词匹配 / 正则 */}
              <div className="lanismd-editor-search-options">
                <button
                  type="button"
                  onClick={() => setCaseSensitive(!caseSensitive)}
                  title="区分大小写"
                  className={cn('lanismd-editor-search-option-btn', caseSensitive && 'active')}
                >
                  Aa
                </button>
                <button
                  type="button"
                  onClick={() => setWholeWord(!wholeWord)}
                  title="全词匹配"
                  className={cn('lanismd-editor-search-option-btn', wholeWord && 'active')}
                >
                  <span className="lanismd-editor-search-whole-word">ab</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUseRegex(!useRegex)}
                  title="正则表达式"
                  className={cn('lanismd-editor-search-option-btn', useRegex && 'active')}
                >
                  .*
                </button>
              </div>
            </div>

            {/* 匹配计数 */}
            <span className={cn('lanismd-editor-search-count', noResult && 'no-result')}>
              {matchCountText}
            </span>

            {/* 导航按钮 */}
            <button
              type="button"
              onClick={handleNavigatePrev}
              disabled={matches.length === 0}
              title="上一个 (Shift+Enter)"
              className="lanismd-editor-search-btn"
            >
              <RiArrowUpLine size={14} />
            </button>
            <button
              type="button"
              onClick={handleNavigateNext}
              disabled={matches.length === 0}
              title="下一个 (Enter)"
              className="lanismd-editor-search-btn"
            >
              <RiArrowDownLine size={14} />
            </button>

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={closeSearch}
              title="关闭 (Escape)"
              className="lanismd-editor-search-btn"
            >
              <RiCloseLine size={14} />
            </button>
          </div>

          {/* 替换行（可折叠） */}
          {showReplace && (
            <div className="lanismd-editor-search-row">
              <div className="lanismd-editor-search-input-wrapper">
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  onKeyDown={handleReplaceKeyDown}
                  placeholder="替换..."
                  className="lanismd-editor-search-input"
                  spellCheck={false}
                />
              </div>
              {/* 替换按钮 */}
              <button
                type="button"
                onClick={handleReplace}
                disabled={matches.length === 0}
                title="替换当前匹配 (Enter)"
                className="lanismd-editor-search-replace-btn"
              >
                替换
              </button>
              <button
                type="button"
                onClick={handleReplaceAll}
                disabled={matches.length === 0}
                title="替换全部匹配"
                className="lanismd-editor-search-replace-btn"
              >
                全部
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

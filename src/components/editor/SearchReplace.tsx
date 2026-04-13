/**
 * SearchReplace - 文档内搜索替换面板
 *
 * 连接 search-store，通过 ProseMirror 插件实现实时搜索高亮、
 * 匹配导航和文本替换。
 *
 * 布局参考 VS Code 风格：
 * - 搜索行：输入框（内嵌 Aa/ab/.* 选项按钮）+ 匹配计数 + 上下导航 + 展开替换 + 关闭
 * - 替换行（可折叠）：输入框 + 替换 + 全部替换
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

/**
 * 选项图标按钮（内嵌在输入框右侧）
 */
function OptionButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-medium',
        'transition-colors',
        active
          ? 'bg-[var(--lanismd-accent)] text-white'
          : 'text-[var(--lanismd-sidebar-text)] opacity-60 hover:opacity-100',
      )}
    >
      {children}
    </button>
  );
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

  // 匹配计数颜色
  const matchCountColor = searchText && matches.length === 0
    ? 'text-red-400'
    : 'text-[var(--lanismd-sidebar-text)]';

  return (
    <div
      className={cn(
        'lanismd-search-panel',
        'sticky top-2 z-50 float-right mr-4',
        'rounded-lg border border-[var(--lanismd-editor-border)] bg-[var(--lanismd-editor-bg)] shadow-lg',
        'p-2',
      )}
      // 阻止点击事件冒泡到编辑器
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-1">
        {/* 展开/折叠替换行的箭头 */}
        <button
          type="button"
          onClick={toggleReplace}
          title={showReplace ? '折叠替换' : '展开替换'}
          className={cn(
            'mt-[5px] flex h-5 w-5 shrink-0 items-center justify-center rounded',
            'text-[var(--lanismd-sidebar-text)] transition-colors',
            'hover:bg-black/5 dark:hover:bg-white/10',
          )}
        >
          {showReplace ? <RiArrowDownSLine size={14} /> : <RiArrowRightSLine size={14} />}
        </button>

        {/* 右侧主体内容 */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* 搜索行 */}
          <div className="flex items-center gap-1">
            {/* 搜索输入框（内嵌选项按钮） */}
            <div
              className={cn(
                'flex h-7 min-w-0 flex-1 items-center gap-0.5 overflow-hidden',
                'rounded-md border border-[var(--lanismd-editor-border)] bg-[var(--lanismd-sidebar-bg)]',
                'focus-within:border-[var(--lanismd-accent)]',
              )}
            >
              <input
                ref={inputRef}
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="搜索..."
                className={cn(
                  'h-full min-w-0 flex-1 bg-transparent px-2',
                  'text-xs text-[var(--lanismd-editor-text)] outline-none',
                )}
              />
              {/* 选项按钮组：区分大小写 / 全词匹配 / 正则 */}
              <div className="flex shrink-0 items-center gap-0.5 pr-1">
                <OptionButton
                  active={caseSensitive}
                  title="区分大小写"
                  onClick={() => setCaseSensitive(!caseSensitive)}
                >
                  Aa
                </OptionButton>
                <OptionButton
                  active={wholeWord}
                  title="全词匹配"
                  onClick={() => setWholeWord(!wholeWord)}
                >
                  <span className="underline decoration-1 underline-offset-2">ab</span>
                </OptionButton>
                <OptionButton
                  active={useRegex}
                  title="正则表达式"
                  onClick={() => setUseRegex(!useRegex)}
                >
                  .*
                </OptionButton>
              </div>
            </div>

            {/* 匹配计数 */}
            <span className={cn('min-w-[44px] shrink-0 text-center text-[10px]', matchCountColor)}>
              {matchCountText}
            </span>

            {/* 导航按钮 */}
            <button
              type="button"
              onClick={handleNavigatePrev}
              disabled={matches.length === 0}
              title="上一个 (Shift+Enter)"
              className="shrink-0 rounded p-1 transition-colors hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
            >
              <RiArrowUpLine size={14} />
            </button>
            <button
              type="button"
              onClick={handleNavigateNext}
              disabled={matches.length === 0}
              title="下一个 (Enter)"
              className="shrink-0 rounded p-1 transition-colors hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
            >
              <RiArrowDownLine size={14} />
            </button>

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={closeSearch}
              title="关闭 (Escape)"
              className="shrink-0 rounded p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <RiCloseLine size={14} />
            </button>
          </div>

          {/* 替换行（可折叠） */}
          {showReplace && (
            <div className="flex items-center gap-1">
              <div
                className={cn(
                  'flex h-7 min-w-0 flex-1 items-center overflow-hidden',
                  'rounded-md border border-[var(--lanismd-editor-border)] bg-[var(--lanismd-sidebar-bg)]',
                  'focus-within:border-[var(--lanismd-accent)]',
                )}
              >
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  onKeyDown={handleReplaceKeyDown}
                  placeholder="替换..."
                  className={cn(
                    'h-full min-w-0 flex-1 bg-transparent px-2',
                    'text-xs text-[var(--lanismd-editor-text)] outline-none',
                  )}
                />
              </div>
              {/* 替换按钮 */}
              <button
                type="button"
                onClick={handleReplace}
                disabled={matches.length === 0}
                title="替换当前匹配 (Enter)"
                className={cn(
                  'flex h-7 shrink-0 items-center rounded-md px-2',
                  'text-[10px] text-[var(--lanismd-sidebar-text)]',
                  'transition-colors hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10',
                )}
              >
                替换
              </button>
              <button
                type="button"
                onClick={handleReplaceAll}
                disabled={matches.length === 0}
                title="替换全部匹配"
                className={cn(
                  'flex h-7 shrink-0 items-center rounded-md px-2',
                  'text-[10px] text-[var(--lanismd-sidebar-text)]',
                  'transition-colors hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10',
                )}
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

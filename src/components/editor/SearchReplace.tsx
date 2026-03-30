import { useState, useCallback, useEffect, useRef } from 'react';
import { RiSearchLine, RiCloseLine, RiArrowUpLine, RiArrowDownLine } from 'react-icons/ri';
import { cn } from '@/utils/cn';

interface SearchReplaceProps {
  onClose: () => void;
  content: string;
  onReplace?: (search: string, replace: string) => void;
  onReplaceAll?: (search: string, replace: string) => void;
}

export function SearchReplace({ onClose, content, onReplace, onReplaceAll }: SearchReplaceProps) {
  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!searchText) {
      setMatchCount(0);
      setCurrentIndex(0);
      return;
    }

    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const pattern = useRegex ? searchText : searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(pattern, flags);
      const matches = content.match(regex);
      setMatchCount(matches ? matches.length : 0);
      setCurrentIndex(matches && matches.length > 0 ? 1 : 0);
    } catch {
      setMatchCount(0);
      setCurrentIndex(0);
    }
  }, [searchText, content, caseSensitive, useRegex]);

  const navigateMatch = useCallback(
    (direction: 'next' | 'prev') => {
      setCurrentIndex((prev) => {
        if (direction === 'next') {
          return prev >= matchCount ? 1 : prev + 1;
        }
        return prev <= 1 ? matchCount : prev - 1;
      });
    },
    [matchCount],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          navigateMatch('prev');
        } else {
          navigateMatch('next');
        }
      }
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [navigateMatch, onClose],
  );

  return (
    <div
      className={cn(
        'absolute right-4 top-12 z-50 w-80 p-3',
        'rounded-lg border border-[var(--editor-border)] bg-[var(--editor-bg)] shadow-lg',
      )}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <div className="relative flex-1">
          <RiSearchLine
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--sidebar-text)]"
            size={13}
          />
          <input
            ref={inputRef}
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索..."
            className={cn(
              'h-7 w-full pl-7 pr-2',
              'rounded-md border border-[var(--editor-border)] bg-[var(--sidebar-bg)]',
              'text-xs text-[var(--editor-text)] outline-none focus:border-[var(--accent)]',
            )}
          />
        </div>
        <span className="min-w-[40px] text-center text-[10px] text-[var(--sidebar-text)]">
          {matchCount > 0 ? `${currentIndex}/${matchCount}` : '0'}
        </span>
        <button
          onClick={() => navigateMatch('prev')}
          disabled={matchCount === 0}
          className="rounded p-1 transition-colors hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
        >
          <RiArrowUpLine size={14} />
        </button>
        <button
          onClick={() => navigateMatch('next')}
          disabled={matchCount === 0}
          className="rounded p-1 transition-colors hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
        >
          <RiArrowDownLine size={14} />
        </button>
        <button
          onClick={onClose}
          className="rounded p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <RiCloseLine size={14} />
        </button>
      </div>

      <div className="mb-2 flex items-center gap-1.5">
        <div className="relative flex-1">
          <RiSearchLine
            className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--sidebar-text)] opacity-50"
            size={13}
          />
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="替换..."
            className={cn(
              'h-7 w-full pl-7 pr-2',
              'rounded-md border border-[var(--editor-border)] bg-[var(--sidebar-bg)]',
              'text-xs text-[var(--editor-text)] outline-none focus:border-[var(--accent)]',
            )}
          />
        </div>
        <button
          onClick={() => onReplace?.(searchText, replaceText)}
          disabled={matchCount === 0}
          className={cn(
            'h-7 rounded-md bg-[var(--accent)] px-2 text-[10px] text-white',
            'transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-30',
          )}
        >
          替换
        </button>
        <button
          onClick={() => onReplaceAll?.(searchText, replaceText)}
          disabled={matchCount === 0}
          className={cn(
            'h-7 rounded-md bg-[var(--accent)] px-2 text-[10px] text-white',
            'transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-30',
          )}
        >
          全部
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label
          className={cn(
            'flex cursor-pointer items-center gap-1',
            'select-none text-[10px] text-[var(--sidebar-text)]',
          )}
        >
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="h-3 w-3 accent-[var(--accent)]"
          />
          区分大小写
        </label>
        <label
          className={cn(
            'flex cursor-pointer items-center gap-1',
            'select-none text-[10px] text-[var(--sidebar-text)]',
          )}
        >
          <input
            type="checkbox"
            checked={useRegex}
            onChange={(e) => setUseRegex(e.target.checked)}
            className="h-3 w-3 accent-[var(--accent)]"
          />
          正则
        </label>
      </div>
    </div>
  );
}

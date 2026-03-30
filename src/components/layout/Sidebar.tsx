import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  RiListOrdered,
  RiSearchLine,
  RiSideBarLine,
  RiFolderLine,
  RiSettings3Line,
} from 'react-icons/ri';
import { useUIStore } from '@/stores/ui-store';
import { useFileStore } from '@/stores/file-store';
import { parseOutline } from '@/utils/toc';
import { cn } from '@/utils/cn';
import { FileTree } from './FileTree';
import type { OutlineItem } from '@/types';

function scrollToHeading(item: OutlineItem) {
  const editorRoot = document.querySelector('.milkdown-editor-root .ProseMirror');
  if (!editorRoot) return;

  const headings = editorRoot.querySelectorAll('h1, h2, h3, h4, h5, h6');
  for (const heading of headings) {
    if (heading.textContent?.trim() === item.text && heading.tagName === `H${item.level}`) {
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
  }
}

function OutlineTree({ items, depth = 0 }: { items: OutlineItem[]; depth?: number }) {
  if (!items.length) return null;

  return (
    <div style={{ marginLeft: depth > 0 ? 12 : 0 }}>
      {items.map((item) => (
        <div key={item.id}>
          <button
            className={cn(
              'w-full truncate rounded px-2 py-1 text-left text-xs',
              'text-[var(--sidebar-text)] transition-colors',
              'hover:bg-black/5 hover:text-[var(--accent)]',
              'dark:hover:bg-white/5',
            )}
            title={item.text}
            onClick={() => scrollToHeading(item)}
          >
            {item.text}
          </button>
          {item.children.length > 0 && <OutlineTree items={item.children} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}

const MIN_SIDEBAR_WIDTH = 150;
const MAX_SIDEBAR_WIDTH = 500;

export function Sidebar() {
  const {
    sidebarOpen,
    sidebarPanel,
    sidebarWidth,
    toggleSidebar,
    collapseSidebar,
    expandSidebar,
    setSidebarPanel,
    setSidebarWidth,
  } = useUIStore();
  const openSettings = useUIStore((s) => s.openSettings);
  const currentFile = useFileStore((s) => s.currentFile);

  const isResizing = useRef(false);
  const widthRef = useRef(sidebarWidth);
  const contentPanelRef = useRef<HTMLDivElement>(null);
  const innerPanelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  /** Track whether content is visually collapsed during drag (snap behaviour) */
  const snapCollapsedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [searchText, setSearchText] = useState('');

  const outline = useMemo(() => {
    if (!currentFile?.content) return [];
    return parseOutline(currentFile.content);
  }, [currentFile?.content]);

  // Sync width ref when store changes (e.g. sidebar toggled back open)
  useEffect(() => {
    widthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;
      snapCollapsedRef.current = !sidebarOpen; // start collapsed if sidebar was already closed
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      // Get the icon bar width to use as offset
      const iconBarWidth =
        contentPanelRef.current?.parentElement
          ?.querySelector('.sidebar-icon-bar')
          ?.getBoundingClientRect().width ?? 36;

      const onMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const rawWidth = ev.clientX - iconBarWidth;
          const clampedRaw = Math.max(0, Math.min(MAX_SIDEBAR_WIDTH, rawWidth));
          widthRef.current = clampedRaw;

          if (clampedRaw < MIN_SIDEBAR_WIDTH) {
            // --- snap collapse: instantly hide content panel ---
            if (!snapCollapsedRef.current) {
              snapCollapsedRef.current = true;
            }
            if (contentPanelRef.current) {
              contentPanelRef.current.style.width = '0px';
            }
          } else {
            // --- above threshold: show content panel at current width ---
            if (snapCollapsedRef.current) {
              snapCollapsedRef.current = false;
            }
            const displayWidth = Math.max(MIN_SIDEBAR_WIDTH, clampedRaw);
            if (contentPanelRef.current) {
              contentPanelRef.current.style.width = `${clampedRaw}px`;
            }
            if (innerPanelRef.current) {
              innerPanelRef.current.style.width = `${displayWidth}px`;
            }
          }
        });
      };

      const onMouseUp = () => {
        isResizing.current = false;
        cancelAnimationFrame(rafRef.current);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        const finalWidth = widthRef.current;

        if (finalWidth < MIN_SIDEBAR_WIDTH) {
          // Collapse: keep inline width at 0 and keep transition disabled (isDragging stays true)
          if (contentPanelRef.current) {
            contentPanelRef.current.style.width = '0px';
          }
          if (sidebarOpen) {
            collapseSidebar(MIN_SIDEBAR_WIDTH);
          }
          setIsDragging(false);
        } else {
          const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, finalWidth));
          widthRef.current = clampedWidth;
          if (!sidebarOpen) {
            expandSidebar(clampedWidth);
          } else {
            setSidebarWidth(clampedWidth);
          }
          if (contentPanelRef.current) {
            contentPanelRef.current.style.width = '';
          }
          if (innerPanelRef.current) {
            innerPanelRef.current.style.width = '';
          }
          setIsDragging(false);
        }

        snapCollapsedRef.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [setSidebarWidth, sidebarOpen, collapseSidebar, expandSidebar],
  );

  const contentWidth = sidebarOpen ? sidebarWidth : 0;

  return (
    <div className="sidebar flex h-full shrink-0 bg-[var(--sidebar-bg)] relative">
      {/* 图标栏 - 带过渡动画 */}
      <div
        className={cn(
          'sidebar-icon-bar flex flex-col items-center gap-1',
          'border-r border-[var(--sidebar-border)] px-1 py-2',
          'transition-opacity duration-300 ease-in-out',
          sidebarOpen ? 'opacity-100' : 'opacity-70',
        )}
      >
        <button
          onClick={() => setSidebarPanel('files')}
          className={cn(
            'rounded-md p-1.5 transition-all duration-200',
            sidebarPanel === 'files'
              ? 'scale-105 bg-[var(--accent)] text-white'
              : 'text-[var(--sidebar-text)] hover:scale-105 hover:bg-black/5 dark:hover:bg-white/10',
          )}
          title="文件树"
        >
          <RiFolderLine size={16} />
        </button>
        <button
          onClick={() => setSidebarPanel('outline')}
          className={cn(
            'rounded-md p-1.5 transition-all duration-200',
            sidebarPanel === 'outline'
              ? 'scale-105 bg-[var(--accent)] text-white'
              : 'text-[var(--sidebar-text)] hover:scale-105 hover:bg-black/5 dark:hover:bg-white/10',
          )}
          title="大纲"
        >
          <RiListOrdered size={16} />
        </button>
        <button
          onClick={() => setSidebarPanel('search')}
          className={cn(
            'rounded-md p-1.5 transition-all duration-200',
            sidebarPanel === 'search'
              ? 'scale-105 bg-[var(--accent)] text-white'
              : 'text-[var(--sidebar-text)] hover:scale-105 hover:bg-black/5 dark:hover:bg-white/10',
          )}
          title="搜索"
        >
          <RiSearchLine size={16} />
        </button>

        {/* 切换按钮 - 置底 */}
        <button
          onClick={toggleSidebar}
          className={cn(
            'mt-auto rounded-md p-1.5 transition-all duration-200',
            'hover:scale-105 hover:bg-black/5 dark:hover:bg-white/10',
            !sidebarOpen && 'text-[var(--accent)]',
          )}
          title="切换侧边栏"
        >
          <RiSideBarLine
            size={16}
            className={sidebarOpen ? 'text-[var(--sidebar-text)]' : 'text-[var(--accent)]'}
          />
        </button>
        {/* 设置 */}
        <button
          onClick={() => openSettings('general')}
          className={cn(
            'rounded-md p-1.5 transition-all duration-200',
            'hover:scale-105 hover:bg-black/5 dark:hover:bg-white/10',
          )}
          title="设置"
        >
          <RiSettings3Line size={16} className="text-[var(--sidebar-text)]" />
        </button>
      </div>

      {/* 内容面板 - 带过渡动画（拖拽时禁用 CSS transition 避免延迟） */}
      <div
        ref={contentPanelRef}
        className={cn(
          'sidebar-content overflow-hidden',
          'border-r border-[var(--sidebar-border)]',
          !isDragging && 'transition-[width] duration-300 ease-in-out',
        )}
        style={{ width: `${contentWidth}px` }}
      >
        <div
          ref={innerPanelRef}
          className={cn(
            'h-full p-3',
            sidebarPanel === 'files' ? 'overflow-hidden' : 'overflow-auto',
          )}
          style={{ width: `${sidebarWidth}px` }}
        >
          {sidebarPanel === 'outline' && (
            <div className="text-xs text-[var(--sidebar-text)]">
              <p className="mb-2 font-medium">大纲</p>
              {outline.length > 0 ? (
                <OutlineTree items={outline} />
              ) : (
                <p className="text-[10px] opacity-60">
                  {currentFile ? '未找到标题' : '打开文件以查看大纲'}
                </p>
              )}
            </div>
          )}
          {sidebarPanel === 'files' && (
            <div className="-m-3 h-full">
              <FileTree />
            </div>
          )}
          {sidebarPanel === 'search' && (
            <div className="text-xs text-[var(--sidebar-text)]">
              <p className="mb-2 font-medium">搜索</p>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="在文件中搜索..."
                className={cn(
                  'w-full rounded-md border border-[var(--editor-border)]',
                  'bg-white px-2 py-1.5 text-xs dark:bg-[#1a1b26]',
                  'focus:outline-none focus:ring-1 focus:ring-[var(--accent)]',
                )}
              />
            </div>
          )}
        </div>
      </div>

      {/* 拖拽调整宽度 - 增强视觉反馈（始终渲染，折叠时也可拖拽展开） */}
      <div
        className={cn(
          'sidebar-resizer group absolute -right-1 flex h-full w-[6px]',
          'cursor-col-resize items-center justify-center transition-colors',
          isDragging ? 'bg-[var(--accent)]/20' : 'hover:bg-[var(--accent)]/10',
        )}
        onMouseDown={handleMouseDown}
      >
        <div
          className={cn(
            'h-8 w-[2px] rounded-full transition-all duration-150',
            isDragging
              ? 'h-12 bg-[var(--accent)] opacity-60'
              : 'bg-[var(--sidebar-text)] opacity-0 group-hover:h-10 group-hover:opacity-25',
          )}
        />
      </div>
    </div>
  );
}

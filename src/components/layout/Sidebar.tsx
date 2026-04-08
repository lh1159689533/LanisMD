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

import '../../styles/layout/sidebar.css';

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
    <div className={cn('outline-tree', depth > 0 && 'outline-tree-level')}>
      {items.map((item) => (
        <div key={item.id}>
          <button
            className={cn('outline-item', `level-${Math.min(item.level, 6)}`)}
            title={item.text}
            onClick={() => scrollToHeading(item)}
          >
            <span className="outline-item-marker" />
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
    <div className={cn('sidebar', !sidebarOpen && 'collapsed')}>
      {/* 图标栏 */}
      <div className="sidebar-icon-bar">
        <button
          onClick={() => setSidebarPanel('files')}
          className={cn('sidebar-icon-btn', sidebarPanel === 'files' && 'active')}
          title="文件树"
        >
          <RiFolderLine size={16} />
        </button>
        <button
          onClick={() => setSidebarPanel('outline')}
          className={cn('sidebar-icon-btn', sidebarPanel === 'outline' && 'active')}
          title="大纲"
        >
          <RiListOrdered size={16} />
        </button>
        <button
          onClick={() => setSidebarPanel('search')}
          className={cn('sidebar-icon-btn', sidebarPanel === 'search' && 'active')}
          title="搜索"
        >
          <RiSearchLine size={16} />
        </button>

        {/* 切换按钮 - 置底 */}
        <button
          onClick={toggleSidebar}
          className={cn('sidebar-icon-btn toggle-btn', !sidebarOpen && 'collapsed')}
          title="切换侧边栏"
        >
          <RiSideBarLine size={16} />
        </button>
        {/* 设置 */}
        <button onClick={() => openSettings('general')} className="sidebar-icon-btn" title="设置">
          <RiSettings3Line size={16} />
        </button>
      </div>

      {/* 内容面板 */}
      <div
        ref={contentPanelRef}
        className={cn('sidebar-content', isDragging && 'no-transition')}
        style={{ width: `${contentWidth}px` }}
      >
        <div
          ref={innerPanelRef}
          className={cn('sidebar-content-inner', sidebarPanel === 'files' && 'files-panel')}
          style={{ width: `${sidebarWidth}px` }}
        >
          {sidebarPanel === 'outline' && (
            <div className="outline-panel">
              <p className="outline-panel-title">大纲</p>
              {outline.length > 0 ? (
                <OutlineTree items={outline} />
              ) : (
                <p className="outline-panel-empty">
                  {currentFile ? '未找到标题' : '打开文件以查看大纲'}
                </p>
              )}
            </div>
          )}
          {sidebarPanel === 'files' && <FileTree />}
          {sidebarPanel === 'search' && (
            <div className="search-panel">
              <p className="search-panel-title">搜索</p>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="在文件中搜索..."
                className="search-panel-input"
              />
            </div>
          )}
        </div>
      </div>

      {/* 拖拽调整宽度 */}
      <div
        className={cn('sidebar-resizer', isDragging && 'dragging')}
        onMouseDown={handleMouseDown}
      >
        <div className="sidebar-resizer-handle" />
      </div>
    </div>
  );
}

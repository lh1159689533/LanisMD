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
import { useEditorStore } from '@/stores/editor-store';
import { parseOutline } from '@/utils/toc';
import { scrollToHeadingByIndex, scrollToHeadingInSource } from '@/editor/plugins/outline-sync';
import { cn } from '@/utils/cn';
import { FileTree } from './FileTree';
import { SearchPanel } from './SearchPanel';
import type { OutlineItem } from '@/types';

import '../../styles/layout/sidebar.css';

/**
 * 跳转到指定标题位置（自动根据编辑模式选择 WYSIWYG 或源码模式跳转方式）
 */
function handleScrollToHeading(item: OutlineItem) {
  const mode = useEditorStore.getState().mode;

  if (mode === 'source') {
    scrollToHeadingInSource(item.index);
  } else {
    scrollToHeadingByIndex(item.index);
  }

  // 手动设置激活标题
  useEditorStore.getState().setActiveHeadingId(item.id);
}

/**
 * 递归扁平化大纲树，用于滚动到激活项
 */
function flattenOutline(items: OutlineItem[]): OutlineItem[] {
  const result: OutlineItem[] = [];
  for (const item of items) {
    result.push(item);
    if (item.children.length > 0) {
      result.push(...flattenOutline(item.children));
    }
  }
  return result;
}

function OutlineTree({
  items,
  depth = 0,
  activeHeadingId,
}: {
  items: OutlineItem[];
  depth?: number;
  activeHeadingId: string | null;
}) {
  if (!items.length) return null;

  return (
    <div className={cn('outline-tree', depth > 0 && 'outline-tree-level')}>
      {items.map((item) => (
        <div key={item.id}>
          <button
            className={cn(
              'outline-item',
              `level-${Math.min(item.level, 6)}`,
              activeHeadingId === item.id && 'active',
            )}
            title={item.text}
            data-heading-id={item.id}
            onClick={() => handleScrollToHeading(item)}
          >
            <span className="outline-item-marker" />
            {item.text}
          </button>
          {item.children.length > 0 && (
            <OutlineTree
              items={item.children}
              depth={depth + 1}
              activeHeadingId={activeHeadingId}
            />
          )}
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

  // 编辑器模式和大纲数据
  const editorMode = useEditorStore((s) => s.mode);
  const storeOutline = useEditorStore((s) => s.outline);
  const activeHeadingId = useEditorStore((s) => s.activeHeadingId);

  // WYSIWYG 模式下使用 ProseMirror 插件驱动的大纲数据，
  // 源码模式下回退到从 markdown 文本解析
  const outline = useMemo(() => {
    if (editorMode === 'wysiwyg' && storeOutline.length > 0) {
      return storeOutline;
    }
    if (!currentFile?.content) return [];
    return parseOutline(currentFile.content);
  }, [editorMode, storeOutline, currentFile?.content]);

  // 源码模式下的滚动同步：通过 CodeMirror EditorView API 监听滚动，精确定位当前标题
  useEffect(() => {
    if (editorMode !== 'source' || sidebarPanel !== 'outline') return;
    if (!currentFile?.content) return;

    const syncSourceOutlineActive = (scrollContainer: HTMLElement) => {
      const view = useEditorStore.getState().sourceView;
      if (!view) return;

      // 从当前大纲数据获取扁平列表
      const flatItems = flattenOutline(outline);
      if (flatItems.length === 0) return;

      // 当滚动容器在顶部时，直接激活第一个标题
      if (scrollContainer.scrollTop <= 5) {
        useEditorStore.getState().setActiveHeadingId(flatItems[0].id);
        return;
      }

      // 预计算每个标题在 markdown 中的行号（1-based）
      const lines = currentFile.content.split('\n');
      let headingIdx = 0;
      const headingLineNumbers: { outlineId: string; lineNumber: number }[] = [];

      for (let i = 0; i < lines.length && headingIdx < flatItems.length; i++) {
        if (/^#{1,6}\s+.+$/.test(lines[i])) {
          headingLineNumbers.push({
            outlineId: flatItems[headingIdx].id,
            lineNumber: i + 1,
          });
          headingIdx++;
        }
      }

      // 使用滚动容器的 boundingRect 作为参考系
      const containerRect = scrollContainer.getBoundingClientRect();
      const bufferPx = 20;
      let activeId: string | null = null;

      for (const { outlineId, lineNumber } of headingLineNumbers) {
        try {
          const line = view.state.doc.line(lineNumber);
          const coords = view.coordsAtPos(line.from);
          if (!coords) continue;

          const relativeTop = coords.top - containerRect.top;
          if (relativeTop <= bufferPx) {
            activeId = outlineId;
          } else {
            break;
          }
        } catch {
          continue;
        }
      }

      useEditorStore.getState().setActiveHeadingId(activeId);
    };

    // 查找真正的滚动容器（向上查找 overflow: auto/scroll 的祖先）
    let scrollContainer: HTMLElement | null = null;
    let scrollHandler: (() => void) | null = null;

    // 延迟绑定（等 DOM 和 EditorView 稳定）
    const timer = setTimeout(() => {
      const view = useEditorStore.getState().sourceView;
      if (!view) return;

      // 从 EditorView DOM 向上查找实际的滚动容器
      let el: HTMLElement | null = view.dom.parentElement;
      while (el) {
        const { overflow, overflowY } = getComputedStyle(el);
        if (overflow === 'auto' || overflow === 'scroll' ||
            overflowY === 'auto' || overflowY === 'scroll') {
          scrollContainer = el;
          break;
        }
        el = el.parentElement;
      }

      if (scrollContainer) {
        scrollHandler = () => syncSourceOutlineActive(scrollContainer!);
        scrollContainer.addEventListener('scroll', scrollHandler, { passive: true });
        // 初始同步一次
        syncSourceOutlineActive(scrollContainer);
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      if (scrollContainer && scrollHandler) {
        scrollContainer.removeEventListener('scroll', scrollHandler);
      }
    };
  }, [editorMode, sidebarPanel, outline, currentFile?.content]);

  // 当 activeHeadingId 变化时，自动滚动大纲面板使激活项可见
  const outlinePanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeHeadingId || sidebarPanel !== 'outline') return;
    const panel = outlinePanelRef.current;
    if (!panel) return;

    const activeEl = panel.querySelector(`[data-heading-id="${activeHeadingId}"]`);
    if (activeEl) {
      // 只在激活项不在可见区域时才滚动
      const panelRect = panel.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      if (elRect.top < panelRect.top || elRect.bottom > panelRect.bottom) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeHeadingId, sidebarPanel]);

  const isResizing = useRef(false);
  const widthRef = useRef(sidebarWidth);
  const contentPanelRef = useRef<HTMLDivElement>(null);
  const innerPanelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  /** 拖拽过程中内容面板是否折叠（吸附行为） */
  const snapCollapsedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

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
            <div className="outline-panel" ref={outlinePanelRef}>
              <p className="outline-panel-title">大纲</p>
              {outline.length > 0 ? (
                <OutlineTree items={outline} activeHeadingId={activeHeadingId} />
              ) : (
                <p className="outline-panel-empty">
                  {currentFile ? '未找到标题' : '打开文件以查看大纲'}
                </p>
              )}
            </div>
          )}
          {sidebarPanel === 'files' && <FileTree />}
          {sidebarPanel === 'search' && <SearchPanel />}
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

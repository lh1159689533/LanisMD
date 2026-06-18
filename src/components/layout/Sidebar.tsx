import { useCallback, useRef, useEffect, useMemo } from 'react';
import {
  RiListOrdered,
  RiSearchLine,
  RiSideBarLine,
  RiFolderLine,
  RiSettings3Line,
  RiHistoryLine,
} from 'react-icons/ri';
import { useUIStore } from '@/stores/ui-store';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useResizable } from '@/hooks/useResizable';
import { ResizeHandle } from '@/components/common/ResizeHandle';
import { parseOutline } from '@/utils/toc';
import { scrollToHeadingByIndex, scrollToHeadingInSource } from '@/editor/plugins/outline-sync';
import { cn } from '@/utils/cn';
import { withShortcut } from '@/utils/shortcut';
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
  const recentFoldersOpen = useUIStore((s) => s.recentFoldersOpen);
  const toggleRecentFolders = useUIStore((s) => s.toggleRecentFolders);
  const registerRecentFoldersTriggerEl = useUIStore((s) => s.registerRecentFoldersTriggerEl);
  const unregisterRecentFoldersTriggerEl = useUIStore(
    (s) => s.unregisterRecentFoldersTriggerEl,
  );
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
        if (
          overflow === 'auto' ||
          overflow === 'scroll' ||
          overflowY === 'auto' ||
          overflowY === 'scroll'
        ) {
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

  const contentPanelRef = useRef<HTMLDivElement>(null);
  const innerPanelRef = useRef<HTMLDivElement>(null);
  const recentFoldersBtnRef = useRef<HTMLButtonElement>(null);

  // 注册「最近打开」按钮 DOM 到全局，供浮层 outside-click 排除使用
  useEffect(() => {
    const el = recentFoldersBtnRef.current;
    if (!el) return;
    registerRecentFoldersTriggerEl(el);
    return () => unregisterRecentFoldersTriggerEl(el);
  }, [registerRecentFoldersTriggerEl, unregisterRecentFoldersTriggerEl]);

  // 计算 iconBar 宽度的辅助函数（用于 calcWidth）
  const getIconBarWidth = useCallback(() => {
    return (
      contentPanelRef.current?.parentElement
        ?.querySelector('.sidebar-icon-bar')
        ?.getBoundingClientRect().width ?? 36
    );
  }, []);

  // 使用通用的 resize Hook
  const { isDragging, resizerRef, handleMouseDown, handleResizerMouseMove } = useResizable({
    width: sidebarWidth,
    minWidth: MIN_SIDEBAR_WIDTH,
    maxWidth: MAX_SIDEBAR_WIDTH,
    calcWidth: useCallback(
      (clientX: number) => clientX - getIconBarWidth(),
      [getIconBarWidth],
    ),
    onWidthChange: useCallback(
      (w: number) => {
        if (w === 0) {
          // 折叠态
          if (contentPanelRef.current) {
            contentPanelRef.current.style.width = '0px';
          }
        } else {
          // 正常拖拽
          const displayWidth = Math.max(MIN_SIDEBAR_WIDTH, w);
          if (contentPanelRef.current) {
            contentPanelRef.current.style.width = `${w}px`;
          }
          if (innerPanelRef.current) {
            innerPanelRef.current.style.width = `${displayWidth}px`;
          }
        }
      },
      [],
    ),
    onCollapse: useCallback(() => {
      if (sidebarOpen) {
        collapseSidebar(MIN_SIDEBAR_WIDTH);
      }
    }, [sidebarOpen, collapseSidebar]),
    onCommit: useCallback(
      (w: number) => {
        if (!sidebarOpen) {
          expandSidebar(w);
        } else {
          setSidebarWidth(w);
        }
        if (contentPanelRef.current) {
          contentPanelRef.current.style.width = `${w}px`;
        }
        if (innerPanelRef.current) {
          innerPanelRef.current.style.width = `${w}px`;
        }
      },
      [sidebarOpen, expandSidebar, setSidebarWidth],
    ),
  });

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
          title={withShortcut('大纲', 'toggleOutline')}
        >
          <RiListOrdered size={16} />
        </button>
        <button
          onClick={() => setSidebarPanel('search')}
          className={cn('sidebar-icon-btn', sidebarPanel === 'search' && 'active')}
          title={withShortcut('搜索', 'toggleGlobalSearch')}
        >
          <RiSearchLine size={16} />
        </button>

        {/* 切换按钮 - 置底 */}
        <button
          onClick={toggleSidebar}
          className={cn('sidebar-icon-btn toggle-btn', !sidebarOpen && 'collapsed')}
          title={withShortcut('切换侧边栏', 'toggleSidebar')}
        >
          <RiSideBarLine size={16} />
        </button>
        {/* 最近打开的文件夹 - 紧贴设置按钮上方 */}
        <button
          ref={recentFoldersBtnRef}
          onClick={toggleRecentFolders}
          className={cn('sidebar-icon-btn', recentFoldersOpen && 'active')}
          title="最近打开的文件夹"
        >
          <RiHistoryLine size={16} />
        </button>
        {/* 设置 */}
        <button
          onClick={() => openSettings('general')}
          className="sidebar-icon-btn"
          title={withShortcut('设置', 'openSettings')}
        >
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
      <ResizeHandle
        elRef={resizerRef}
        isDragging={isDragging}
        onMouseDown={handleMouseDown}
        onMouseMove={handleResizerMouseMove}
        className="sidebar-resizer-position"
      />
    </div>
  );
}

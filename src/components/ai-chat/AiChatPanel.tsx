/**
 * AI 对话面板（编辑区右侧，与编辑区并排，不遮挡文档）
 *
 * - 顶部：历史入口、对话 Tab（可新建 / 关闭 / 中键关闭）、关闭面板
 * - 主体：当前 Tab 的对话视图；打开历史记录时由历史视图铺满主体
 * - 左边缘可拖拽调整宽度，拖到最小宽度以下时收起面板
 *
 * 替代原「AI 历史」面板：指令历史并入面板的历史侧栏。
 *
 * @changelog
 * | 版本   | 变更说明                                  | 关联           |
 * | v1.0.0 | 初始实现：Tab 化对话面板与内置历史侧栏 | REQ: AI 对话框 |
 * | v1.1.0 | 历史记录改为铺满对话区域                 | REQ: AI 图标统一 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useEffect, useRef } from 'react';
import { RiAddLine, RiCloseLine, RiHistoryLine } from 'react-icons/ri';

import { ResizeHandle } from '@/components/common/ResizeHandle';
import { useResizable } from '@/hooks/useResizable';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useAiStore } from '@/stores/ai-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';

import { ChatHistory } from './ChatHistory';
import { ChatView } from './ChatView';

import '@/styles/layout/ai-chat.css';

/** 面板最小宽度 */
const MIN_WIDTH = 260;
/** 面板宽度占窗口的最大比例 */
const MAX_WIDTH_RATIO = 0.6;

function ChatTabs() {
  const conversations = useAiChatStore((s) => s.conversations);
  const openTabIds = useAiChatStore((s) => s.openTabIds);
  const activeId = useAiChatStore((s) => s.activeId);
  const runningIds = useAiChatStore((s) => s.runningIds);
  const setActive = useAiChatStore((s) => s.setActive);
  const closeTab = useAiChatStore((s) => s.closeTab);
  const setHistoryOpen = useAiChatStore((s) => s.setHistoryOpen);
  const tabsRef = useRef<HTMLDivElement>(null);

  // 当前 Tab 变化时滚动到可见区域
  useEffect(() => {
    tabsRef.current
      ?.querySelector<HTMLElement>('.lanismd-ai-chat-tab.is-active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId, openTabIds.length]);

  return (
    <div ref={tabsRef} className="lanismd-ai-chat-tabs" role="tablist">
      {openTabIds.map((id) => {
        const conversation = conversations.find((c) => c.id === id);
        if (!conversation) return null;
        const active = id === activeId;
        return (
          <div
            key={id}
            role="tab"
            aria-selected={active}
            className={cn('lanismd-ai-chat-tab', active && 'is-active')}
            title={conversation.title}
            onClick={() => {
              // 点击 Tab 时从历史记录回到对应对话
              setActive(id);
              setHistoryOpen(false);
            }}
            onAuxClick={(e) => {
              if (e.button === 1) closeTab(id);
            }}
          >
            {runningIds[id] && <span className="lanismd-ai-chat-tab-dot" />}
            <span className="lanismd-ai-chat-tab-title">{conversation.title}</span>
            <button
              type="button"
              className="lanismd-ai-chat-tab-close"
              title="关闭"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(id);
              }}
            >
              <RiCloseLine size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function AiChatPanel() {
  const width = useUIStore((s) => s.aiChatWidth);
  const setWidth = useUIStore((s) => s.setAiChatWidth);
  const closeAiChat = useUIStore((s) => s.closeAiChat);
  const refreshConfig = useAiStore((s) => s.refreshConfig);

  const loaded = useAiChatStore((s) => s.loaded);
  const activeId = useAiChatStore((s) => s.activeId);
  const openTabCount = useAiChatStore((s) => s.openTabIds.length);
  const historyOpen = useAiChatStore((s) => s.historyOpen);
  const toggleHistory = useAiChatStore((s) => s.toggleHistory);
  const setHistoryOpen = useAiChatStore((s) => s.setHistoryOpen);
  const createConversation = useAiChatStore((s) => s.createConversation);
  const setActive = useAiChatStore((s) => s.setActive);
  const activeConversation = useAiChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeId),
  );

  const panelRef = useRef<HTMLDivElement>(null);

  // 打开面板时刷新模型列表（配置文件可能已在外部修改）
  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  // 没有打开的 Tab 时自动新建一个空对话
  useEffect(() => {
    if (!loaded) return;
    if (openTabCount === 0) createConversation();
    else if (!activeId) setActive(useAiChatStore.getState().openTabIds[0]);
  }, [loaded, openTabCount, activeId, createConversation, setActive]);

  const { isDragging, resizerRef, handleMouseDown, handleResizerMouseMove } = useResizable({
    width,
    minWidth: MIN_WIDTH,
    maxWidth: useCallback(() => document.body.clientWidth * MAX_WIDTH_RATIO, []),
    calcWidth: useCallback((clientX: number) => {
      const container = panelRef.current?.closest('.editor-container');
      const rect = container?.getBoundingClientRect();
      return rect ? rect.right - clientX : 0;
    }, []),
    onWidthChange: useCallback((w: number) => {
      if (panelRef.current) panelRef.current.style.width = `${w}px`;
    }, []),
    onCollapse: closeAiChat,
    onCommit: useCallback(
      (w: number) => {
        if (panelRef.current) panelRef.current.style.width = `${w}px`;
        setWidth(w);
      },
      [setWidth],
    ),
  });

  return (
    <div
      ref={panelRef}
      className={cn('lanismd-ai-chat-panel', isDragging && 'no-transition')}
      style={{ width: `${width}px` }}
    >
      <ResizeHandle
        elRef={resizerRef}
        isDragging={isDragging}
        onMouseDown={handleMouseDown}
        onMouseMove={handleResizerMouseMove}
      />

      <div className="lanismd-ai-chat-inner">
        <div className="lanismd-ai-chat-header">
          <button
            type="button"
            className={cn('lanismd-ai-chat-icon-btn', historyOpen && 'is-active')}
            title="历史记录"
            onClick={toggleHistory}
          >
            <RiHistoryLine size={15} />
          </button>
          <ChatTabs />
          <button
            type="button"
            className="lanismd-ai-chat-icon-btn"
            title="新对话"
            onClick={() => {
              createConversation();
              setHistoryOpen(false);
            }}
          >
            <RiAddLine size={16} />
          </button>
          <button
            type="button"
            className="lanismd-ai-chat-icon-btn"
            title="关闭面板"
            onClick={closeAiChat}
          >
            <RiCloseLine size={16} />
          </button>
        </div>

        <div className="lanismd-ai-chat-body">
          {/* 历史记录打开时铺满整个对话区域，关闭后回到当前对话 */}
          {historyOpen ? (
            <ChatHistory />
          ) : (
            activeConversation && <ChatView conversation={activeConversation} />
          )}
        </div>
      </div>
    </div>
  );
}

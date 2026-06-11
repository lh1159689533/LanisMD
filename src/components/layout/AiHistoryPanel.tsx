import { useState, useCallback, useRef, useEffect } from 'react';
import { RiCloseLine, RiDeleteBinLine, RiSparklingLine } from 'react-icons/ri';
import { useAiStore } from '@/stores/ai-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/utils/cn';
import type { AiHistoryEntry } from '@/stores/ai-store';

import '../../styles/layout/ai-history.css';

/** AI 历史面板最小宽度 */
const MIN_WIDTH = 200;
/** 面板宽度占编辑区的最大比例 */
const MAX_WIDTH_RATIO = 0.36;

/** 格式化时间戳为简短的时间字符串 */
function formatTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  if (isToday) {
    return `${hours}:${minutes}`;
  }

  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day} ${hours}:${minutes}`;
}

/** 截取预览文本 */
function getPreview(text: string, maxLen = 120): string {
  const cleaned = text.replace(/\n+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + '...';
}

/** 根据 commandId 获取结果区域标签 */
function getResultLabel(commandId: string): string {
  if (commandId === 'explain') return '解释';
  if (commandId === 'polish') return '润色后';
  if (commandId.startsWith('translate')) return '译文';
  return '结果';
}

/** 判断是否为需要显示原文的指令 */
function shouldShowOriginal(commandId: string): boolean {
  return commandId === 'explain' || commandId === 'polish' || commandId.startsWith('translate');
}

/** 判断是否为需要显示用户输入描述的指令 */
function shouldShowUserInput(commandId: string): boolean {
  return commandId === 'mermaid' || commandId === 'latex';
}

function HistoryItem({ entry }: { entry: AiHistoryEntry }) {
  const showOriginal = shouldShowOriginal(entry.commandId as string) && entry.originalText;
  const showUserInput = shouldShowUserInput(entry.commandId as string) && entry.originalText;

  return (
    <div className="lanismd-ai-history-item">
      <div className="lanismd-ai-history-item-header">
        <span className="lanismd-ai-history-item-command">{entry.commandLabel}</span>
        <span className="lanismd-ai-history-item-time">{formatTime(entry.timestamp)}</span>
      </div>
      {showOriginal && (
        <div className="lanismd-ai-history-item-original">
          <span className="lanismd-ai-history-item-label">原文</span>
          <div className="lanismd-ai-history-item-text">{getPreview(entry.originalText!)}</div>
        </div>
      )}
      {showUserInput && (
        <div className="lanismd-ai-history-item-original">
          <span className="lanismd-ai-history-item-label">描述</span>
          <div className="lanismd-ai-history-item-text">{getPreview(entry.originalText!)}</div>
        </div>
      )}
      <div className="lanismd-ai-history-item-result">
        <div className="lanismd-ai-history-item-text">{getPreview(entry.result)}</div>
      </div>
    </div>
  );
}

export function AiHistoryPanel() {
  const history = useAiStore((s) => s.history);
  const clearHistory = useAiStore((s) => s.clearHistory);
  const closeAiHistory = useUIStore((s) => s.closeAiHistory);
  const aiHistoryWidth = useUIStore((s) => s.aiHistoryWidth);
  const setAiHistoryWidth = useUIStore((s) => s.setAiHistoryWidth);

  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(aiHistoryWidth);
  const rafRef = useRef<number>(0);
  /** 拖拽过程中面板是否折叠（吸附行为） */
  const snapCollapsedRef = useRef(false);

  // 同步 width ref
  useEffect(() => {
    widthRef.current = aiHistoryWidth;
  }, [aiHistoryWidth]);

  const handleClear = useCallback(() => {
    clearHistory();
  }, [clearHistory]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      snapCollapsedRef.current = false;
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      // 获取编辑区容器宽度作为最大限制
      const editorContainer = panelRef.current?.closest('.editor-container');
      const maxWidth = document.body.clientWidth * MAX_WIDTH_RATIO;

      const onMouseMove = (ev: MouseEvent) => {
        cancelAnimationFrame(rafRef.current);
        // 面板在右侧，宽度 = 容器右边界 - 鼠标位置
        const containerRect = editorContainer?.getBoundingClientRect();
        if (!containerRect) return;

        const rawWidth = containerRect.right - ev.clientX;
        const clampedRaw = Math.max(0, Math.min(maxWidth, rawWidth));
        widthRef.current = clampedRaw;
        rafRef.current = requestAnimationFrame(() => {
          if (clampedRaw < MIN_WIDTH) {
            // 吸附折叠：瞬间隐藏面板
            if (!snapCollapsedRef.current) {
              snapCollapsedRef.current = true;
            }
            if (panelRef.current) {
              panelRef.current.style.width = '0px';
            }
          } else {
            // 超过阈值：恢复面板显示
            if (snapCollapsedRef.current) {
              snapCollapsedRef.current = false;
            }
            if (panelRef.current) {
              panelRef.current.style.width = `${clampedRaw}px`;
            }
          }
        });
      };

      const onMouseUp = () => {
        cancelAnimationFrame(rafRef.current);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        const finalWidth = widthRef.current;

        if (finalWidth < MIN_WIDTH) {
          // 宽度小于最小值：关闭面板
          if (panelRef.current) {
            panelRef.current.style.width = '0px';
          }
          closeAiHistory();
        } else {
          // 正常结束：保存最终宽度
          const clampedWidth = Math.max(MIN_WIDTH, Math.min(maxWidth, finalWidth));
          widthRef.current = clampedWidth;
          if (panelRef.current) {
            // 直接设置最终宽度
            panelRef.current.style.width = `${clampedWidth}px`;
          }
          setAiHistoryWidth(clampedWidth);
        }

        snapCollapsedRef.current = false;
        setIsDragging(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [closeAiHistory, setAiHistoryWidth],
  );

  return (
    <div
      ref={panelRef}
      className={cn('lanismd-ai-history-panel', isDragging && 'no-transition')}
      style={{ width: `${aiHistoryWidth}px` }}
    >
      {/* 左侧拖拽手柄 */}
      <div
        className={cn('lanismd-ai-history-resize-handle', isDragging && 'dragging')}
        onMouseDown={handleMouseDown}
      >
        <div className="lanismd-ai-history-resize-handle-bar" />
      </div>

      {/* 面板内容区 */}
      <div className="lanismd-ai-history-inner">
        {/* 面板头部 */}
        <div className="lanismd-ai-history-header">
          <div className="lanismd-ai-history-title">
            <RiSparklingLine size={14} />
            <span>AI 历史</span>
          </div>
          <div className="lanismd-ai-history-actions">
            {history.length > 0 && (
              <button
                onClick={handleClear}
                className="lanismd-ai-history-action-btn"
                title="清除全部历史"
              >
                <RiDeleteBinLine size={13} />
              </button>
            )}
            <button
              onClick={closeAiHistory}
              className="lanismd-ai-history-action-btn"
              title="关闭面板"
            >
              <RiCloseLine size={15} />
            </button>
          </div>
        </div>

        {/* 面板内容 */}
        <div className="lanismd-ai-history-body">
          {history.length === 0 ? (
            <div
              className={cn(
                'flex h-full select-none flex-col items-center justify-center gap-2',
                'text-xs text-[var(--lanismd-text-muted)]',
              )}
            >
              <RiSparklingLine size={24} className="opacity-30" />
              <span>暂无 AI 生成记录</span>
              <span className="opacity-60">使用 AI 指令后，结果将显示在这里</span>
            </div>
          ) : (
            <div className="lanismd-ai-history-list">
              {history.map((entry) => (
                <HistoryItem key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

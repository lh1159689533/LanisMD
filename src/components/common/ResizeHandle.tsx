import { cn } from '@/utils/cn';

import '../../styles/layout/resize-handle.css';

export interface ResizeHandleProps {
  /** 外部 ref，用于 DOM 查询 */
  elRef?: React.MutableRefObject<HTMLDivElement | null>;
  /** 是否正在拖拽 */
  isDragging: boolean;
  /** mousedown 事件处理 */
  onMouseDown: (e: React.MouseEvent) => void;
  /** mousemove 事件处理（handle 跟随鼠标 Y 位置） */
  onMouseMove: (e: React.MouseEvent) => void;
  /** 附加 className */
  className?: string;
}

/**
 * 通用的水平拖拽 resize 手柄组件。
 *
 * 渲染一个窄条区域，hover 时显示竖线指示器，支持跟随鼠标 Y 位置。
 * 用于 Sidebar 右边缘和 AiHistoryPanel 左边缘的宽度调整。
 */
export function ResizeHandle({
  elRef,
  isDragging,
  onMouseDown,
  onMouseMove,
  className,
}: ResizeHandleProps) {
  return (
    <div
      ref={elRef}
      className={cn('lanismd-resize-handle', isDragging && 'dragging', className)}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
    >
      <div className="lanismd-resize-handle-bar" />
    </div>
  );
}

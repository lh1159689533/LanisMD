import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * 水平拖拽调整宽度 Hook 的配置项
 */
export interface UseResizableOptions {
  /** 当前宽度（受控值，来自外部 store） */
  width: number;
  /** 最小宽度（低于此值触发折叠） */
  minWidth: number;
  /** 最大宽度（固定数值或动态计算函数） */
  maxWidth: number | (() => number);
  /**
   * 根据鼠标 clientX 计算原始宽度。
   * - Sidebar（右边缘拖拽）: clientX - iconBarWidth
   * - AiHistoryPanel（左边缘拖拽）: containerRight - clientX
   */
  calcWidth: (clientX: number) => number;
  /**
   * 拖拽过程中直接操作 DOM 设置宽度（绕过 React state 实现 60fps）。
   * 参数 width 为 0 表示折叠态。
   */
  onWidthChange: (width: number) => void;
  /** 低于最小宽度时的折叠回调 */
  onCollapse: () => void;
  /** 拖拽结束、最终宽度确认时的持久化回调 */
  onCommit: (width: number) => void;
}

export interface UseResizableReturn {
  /** 是否正在拖拽 */
  isDragging: boolean;
  /** resizer 容器的 ref，传递给 ResizeHandle 的 elRef prop */
  resizerRef: React.MutableRefObject<HTMLDivElement | null>;
  /** 绑定到 resizer 容器的 mousedown 事件 */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** 绑定到 resizer 容器的 mousemove 事件（handle 跟随鼠标 Y 位置） */
  handleResizerMouseMove: (e: React.MouseEvent) => void;
}

/**
 * 水平拖拽调整宽度的通用 Hook。
 *
 * 封装了拖拽状态管理、RAF 节流、吸附折叠、鼠标跟随 handle 等逻辑，
 * 消除 Sidebar 和 AiHistoryPanel 之间的重复代码。
 */
export function useResizable(options: UseResizableOptions): UseResizableReturn {
  const { width, minWidth, maxWidth, calcWidth, onWidthChange, onCollapse, onCommit } = options;

  const resizerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);
  const rafRef = useRef<number>(0);
  const snapCollapsedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  // 同步外部 width 到 ref
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  // 解析 maxWidth（支持固定值和动态函数）
  const resolveMaxWidth = useCallback((): number => {
    return typeof maxWidth === 'function' ? maxWidth() : maxWidth;
  }, [maxWidth]);

  // 拖动条跟随鼠标 Y 位置
  const handleResizerMouseMove = useCallback((e: React.MouseEvent) => {
    const resizerEl = resizerRef.current;
    if (!resizerEl) return;
    const rect = resizerEl.getBoundingClientRect();
    // 查找 handle-bar 子元素（统一类名）
    const handleEl = resizerEl.querySelector('.lanismd-resize-handle-bar') as HTMLElement;
    if (!handleEl) return;
    const handleHeight = handleEl.offsetHeight;
    const minTop = 0;
    const maxTop = rect.height - handleHeight;
    const relativeY = e.clientY - rect.top - handleHeight / 2;
    const clampedTop = Math.max(minTop, Math.min(maxTop, relativeY));
    handleEl.style.top = `${clampedTop}px`;
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      snapCollapsedRef.current = false;
      setIsDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const currentMaxWidth = resolveMaxWidth();

      const onMouseMove = (ev: MouseEvent) => {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          const rawWidth = calcWidth(ev.clientX);
          const clampedRaw = Math.max(0, Math.min(currentMaxWidth, rawWidth));
          widthRef.current = clampedRaw;

          if (clampedRaw < minWidth) {
            // 吸附折叠
            if (!snapCollapsedRef.current) {
              snapCollapsedRef.current = true;
            }
            onWidthChange(0);
          } else {
            // 正常拖拽
            if (snapCollapsedRef.current) {
              snapCollapsedRef.current = false;
            }
            onWidthChange(clampedRaw);
          }
        });
      };

      const onMouseUp = () => {
        cancelAnimationFrame(rafRef.current);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        const finalWidth = widthRef.current;

        if (finalWidth < minWidth) {
          // 折叠
          onWidthChange(0);
          onCollapse();
        } else {
          // 提交最终宽度
          const clampedWidth = Math.max(minWidth, Math.min(currentMaxWidth, finalWidth));
          widthRef.current = clampedWidth;
          onWidthChange(clampedWidth);
          onCommit(clampedWidth);
        }

        snapCollapsedRef.current = false;
        setIsDragging(false);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [calcWidth, minWidth, resolveMaxWidth, onWidthChange, onCollapse, onCommit],
  );

  return {
    isDragging,
    resizerRef,
    handleMouseDown,
    handleResizerMouseMove,
  };
}

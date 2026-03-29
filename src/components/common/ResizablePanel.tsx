import { useRef, useCallback, useEffect, useState } from "react";

export interface ResizablePanelProps {
  /** Reference to the container element whose height is the basis for ratio calculations */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Default height as a ratio of container height (0-1), default 0.35 */
  defaultRatio?: number;
  /** Minimum height ratio (0-1), default 0.1 */
  minRatio?: number;
  /** Maximum height ratio (0-1), default 0.9 */
  maxRatio?: number;
  /** Called when dragging below minRatio — triggers close */
  onCloseByDrag?: () => void;
  /** Children rendered inside the panel body (below the drag handle) */
  children: React.ReactNode;
}

/**
 * A panel that can be resized vertically by dragging a handle at the top.
 * Height is expressed as a ratio of a parent container's height.
 * Dragging past the minimum ratio will invoke `onCloseByDrag`.
 */
export function ResizablePanel({
  containerRef,
  defaultRatio = 0.35,
  minRatio = 0.1,
  maxRatio = 0.9,
  onCloseByDrag,
  children,
}: ResizablePanelProps) {
  const [height, setHeight] = useState<number | null>(null);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  // Initialise height from container on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setHeight(container.clientHeight * defaultRatio);
  }, [containerRef, defaultRatio]);

  const getContainerHeight = useCallback(() => {
    return containerRef.current?.clientHeight ?? 400;
  }, [containerRef]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startY.current = e.clientY;
      startHeight.current = height ?? getContainerHeight() * defaultRatio;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const containerH = getContainerHeight();
        const delta = startY.current - ev.clientY; // dragging up = positive delta = taller
        let newHeight = startHeight.current + delta;

        const minH = containerH * minRatio;
        const maxH = containerH * maxRatio;

        // If dragged below minimum → close
        if (newHeight < minH) {
          isDragging.current = false;
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          onCloseByDrag?.();
          return;
        }

        newHeight = Math.min(newHeight, maxH);
        setHeight(newHeight);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [height, getContainerHeight, defaultRatio, minRatio, maxRatio, onCloseByDrag]
  );

  if (height === null) return null;

  return (
    <div
      className="flex flex-col bg-[var(--sidebar-bg)] border-t border-[var(--sidebar-border)] shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
      style={{ height: `${height}px` }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="flex items-center justify-center h-[6px] shrink-0 cursor-row-resize group hover:bg-[var(--accent)]/10 transition-colors"
      >
        <div className="w-8 h-[3px] rounded-full bg-[var(--sidebar-text)] opacity-20 group-hover:opacity-40 transition-opacity" />
      </div>

      {/* Panel body */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

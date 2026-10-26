/**
 * Board Block - Plait 画板 React 封装
 *
 * 将 Plait 思维导图（@plait/mind）封装为受控 React 组件，供 ProseMirror NodeView
 * 通过 createRoot 挂载。核心职责：
 * - 用 Wrapper + Board + withMind 渲染思维导图。
 * - 通过 Board.afterInit 捕获 board 实例，供运行时切换只读态。
 * - onValueChange 回调把最新元素与视口透出给 NodeView（用于防抖回写）。
 *
 * 关键实现说明：react-board 的 Wrapper 只在挂载时依据 options 创建一次 board，
 * 之后不会响应 options.readonly 这个 prop 的变化。而 PlaitBoard.isReadonly(board)
 * 是实时读取 board.options.readonly 的，所有交互（移动/选择/热键/文本编辑）都在
 * 事件触发时实时判定。因此运行时直接 mutate board.options.readonly 即可切换交互能力，
 * 无需重挂 board（对齐「共用同一 createRoot 不重挂」的设计）；只需额外手动同步
 * 容器的 .readonly 修饰类（该类为渲染期计算，仅影响 cursor 等外观）。
 *
 * @changelog
 * | 版本   | 变更说明                                | 关联                                                 |
 * | v1.0.0 | 初始实现：Plait 思维导图封装 + 只读态运行时切换 | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * | v1.1.0 | afterInit 透出 board 实例给 NodeView（样式工具栏地基） | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §3.2 |
 * | v1.1.1 | 修复：运行时切换 readonly 时同步 board.pointer，修复选中机制失效 | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board, Wrapper } from '@plait-board/react-board';
import { withMind } from '@plait/mind';
import type { PlaitBoard, PlaitBoardOptions, PlaitElement, Viewport } from '@plait/core';
import { PlaitPointerType } from '@plait/core';

import { CSS_PREFIX } from './constants';

// 说明：@plait-board/react-board 与 react-text 的 package.json 仅在 exports 中
// 暴露了 "." 入口，未声明 "./index.css" 子路径。Vite 5 严格遵循 exports，
// 直接 import 其 CSS 子路径会解析失败。因此这两个包的基础样式已移植到
// src/styles/editor/board-block.css（作用域限定在 .lanismd-board-block）。

/** BoardReact 组件属性 */
export interface BoardReactProps {
  /** 初始画板元素树（仅在挂载时读取，后续变化不驱动重渲染） */
  initialElements: PlaitElement[];
  /** 初始视口（缩放/平移），可选 */
  initialViewport?: Viewport;
  /** 是否只读；运行时切换会实时影响交互能力 */
  readonly: boolean;
  /** 画板内容变更回调（透出最新元素与当前视口，用于防抖回写） */
  onChange: (elements: PlaitElement[], viewport?: Viewport) => void;
  /**
   * board 实例就绪回调（afterInit 时触发一次）。
   *
   * 供 NodeView 拿到 board 实例，用于挂载样式工具栏的 selection 联动。
   */
  onBoardReady?: (board: PlaitBoard) => void;
}

/**
 * Plait 思维导图画板组件。
 */
export function BoardReact({
  initialElements,
  initialViewport,
  readonly,
  onChange,
  onBoardReady,
}: BoardReactProps) {
  const boardRef = useRef<PlaitBoard | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 冻结初始值：父级（NodeView）在防抖回写后可能重渲染，
  // 但画板内部已自持状态，绝不能用外部数据把它重置回旧值。
  const [value] = useState(() => initialElements);
  const [viewport] = useState(() => initialViewport);

  // options 仅在 Wrapper 挂载时生效，用初始只读态创建 board。
  const [initialReadonly] = useState(() => readonly);
  const options = useMemo<PlaitBoardOptions>(
    () => ({ readonly: initialReadonly }),
    [initialReadonly],
  );

  const plugins = useMemo(() => [withMind], []);

  // 捕获 board 实例，供只读态运行时切换 + 样式工具栏 selection 联动使用。
  const onBoardReadyRef = useRef(onBoardReady);
  useEffect(() => {
    onBoardReadyRef.current = onBoardReady;
  }, [onBoardReady]);

  const handleAfterInit = useCallback((board: PlaitBoard) => {
    boardRef.current = board;
    onBoardReadyRef.current?.(board);
  }, []);

  // 用 ref 持有最新 onChange，避免其身份变化触发 Wrapper 频繁重建回调。
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const handleValueChange = useCallback((next: PlaitElement[]) => {
    const board = boardRef.current;
    onChangeRef.current(next, board?.viewport);
  }, []);

  // 运行时切换只读态：直接 mutate board.options.readonly（实时影响交互 gating），
  // 并手动同步 .plait-board-container 的 .readonly 修饰类（渲染期计算，仅外观）。
  //
  // 关键：必须同步 board.pointer。Plait 仅在创建 board 时依据初始 readonly 选项
  // 一次性设定 pointer（readonly → 'hand'，可编辑 → 'selection'，见 plait-core
  // 的 board context 初始化），运行时切换 readonly 不会重新派生 pointer。
  // 若不同步，pointer 恒为创建时的 'hand'，withSelection 的 isHandleSelection
  // 恒为 false，选中缓存永不写入——节点选中/拖拽/框选全部失效。
  useEffect(() => {
    const board = boardRef.current;
    if (board) {
      board.options.readonly = readonly;
      board.pointer = readonly ? PlaitPointerType.hand : PlaitPointerType.selection;
    }
    const boardEl = containerRef.current?.querySelector('.plait-board-container');
    if (boardEl) {
      boardEl.classList.toggle('readonly', readonly);
    }
  }, [readonly]);

  return (
    <div
      ref={containerRef}
      className={`${CSS_PREFIX}__canvas`}
      // 阻止画板内部事件冒泡到编辑器外层（进一步隔离由 NodeView.stopEvent 兜底）
      data-board-readonly={readonly ? 'true' : 'false'}
    >
      <Wrapper
        value={value}
        viewport={viewport}
        options={options}
        plugins={plugins}
        onValueChange={handleValueChange}
      >
        <Board afterInit={handleAfterInit} />
      </Wrapper>
    </div>
  );
}

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
 * | v1.2.0 | pointer 与 readonly 解耦（编辑态可自由切手型）+ 注入初始主题 | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §三 |
 * | v1.2.1 | 修复：注入 MindThemeColors，使切主题真正改变节点配色 | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §三 |
 * | v1.3.0 | 按 mode 分流 Plait 插件与主题色表（白板接入 withDraw） | REQ: 20261027-board-whiteboard-draw §3.3 / §4.4 |
 * | v1.3.1 | 修复：白板插件链挂载 withImageRender，修复图片插入后静默不渲染 | REQ: 20261027-board-whiteboard-draw §3.9 |
 * | v1.3.2 | 白板插件链挂载 withHitTest，修复无文字图形点击内部无法选中 | REQ: 20261028-board-interior-hit |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board, Wrapper } from '@plait-board/react-board';
import { MindThemeColors, withMind } from '@plait/mind';
import { withDraw } from '@plait/draw';
import type {
  PlaitBoard,
  PlaitBoardOptions,
  PlaitElement,
  PlaitPlugin,
  PlaitTheme,
  ThemeColorMode,
  Viewport,
} from '@plait/core';
import { PlaitPointerType } from '@plait/core';

import { CSS_PREFIX } from './constants';
import { withImageRender } from './image-render';
import { withHitTest } from './with-hit-test';
import type { BoardMode } from './types';

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
  /** 初始画板主题（仅在挂载时生效，后续由画布工具栏运行时切换） */
  initialTheme?: ThemeColorMode;
  /**
   * 画板形态，决定注册哪套 Plait 插件与主题色表。
   *
   * 仅在挂载时读取：`Wrapper` 不响应 `plugins` 的运行时变化，而 `mode` 是
   * 块级不可变属性（由 codec 在 NodeView 边界一次性解出），天然契合。
   * 缺省为 `'mindmap'`，保证未传该 prop 的既有调用点行为不变。
   */
  mode?: BoardMode;
  /** 是否只读；运行时切换会实时影响交互能力 */
  readonly: boolean;
  /** 画板内容变更回调（透出最新元素与当前视口，用于防抖回写） */
  onChange: (elements: PlaitElement[], viewport?: Viewport) => void;
  /**
   * 画板主题变更回调。
   *
   * 必须单独透出：Wrapper 的 `onValueChange` 仅在存在「真实元素变更」时触发，
   * `set_theme` / `set_viewport` / `set_selection` 这三类 op 被显式排除
   * （见 @plait-board/react-board 内 onValueChange 的触发条件）。因此纯主题
   * 切换不会走 onChange，需要由本回调驱动持久化。
   */
  onThemeChange?: (mode: ThemeColorMode) => void;
  /**
   * board 实例就绪回调（afterInit 时触发一次）。
   *
   * 供 NodeView 拿到 board 实例，用于挂载样式工具栏的 selection 联动。
   */
  onBoardReady?: (board: PlaitBoard) => void;
  /**
   * 指针模式被本组件重置后的通知回调。
   *
   * 只读态切换时本组件会强制重设 `board.pointer`（见下方 effect 说明），
   * 该赋值不经 Plait 的 op 流程、不触发 `board.onChange`，画布工具栏无法
   * 自动感知。因此这里显式通知宿主重新同步工具栏的手型高亮状态。
   */
  onPointerReset?: () => void;
}

/**
 * Plait 画板组件（思维导图 / 白板双形态）。
 */
export function BoardReact({
  initialElements,
  initialViewport,
  initialTheme,
  mode = 'mindmap',
  readonly,
  onChange,
  onThemeChange,
  onBoardReady,
  onPointerReset,
}: BoardReactProps) {
  const boardRef = useRef<PlaitBoard | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 冻结初始值：父级（NodeView）在防抖回写后可能重渲染，
  // 但画板内部已自持状态，绝不能用外部数据把它重置回旧值。
  const [value] = useState(() => initialElements);
  const [viewport] = useState(() => initialViewport);

  // 初始主题同样冻结：Wrapper 仅在挂载时读取 theme 创建 board，
  // 运行时主题切换走 BoardTransforms.updateThemeColor（由画布工具栏发起）。
  const [theme] = useState<PlaitTheme | undefined>(() =>
    initialTheme ? { themeColorMode: initialTheme } : undefined,
  );

  // options 仅在 Wrapper 挂载时生效，用初始只读态创建 board。
  //
  // themeColors 需按 mode 分流：
  //
  // - 导图：必须显式注入 MindThemeColors。@plait/mind 的 getMindThemeColor
  //   读的是 board.options.themeColors，缺省时拿到 @plait/core 的 ThemeColors
  //   （只有 mode / boardBackground / textColor，没有 branchColors / rootFill /
  //   rootTextColor），isMindThemeColor 判定失败后恒回落 MindDefaultThemeColor。
  //   结果就是切主题只有画布背景色（纯 CSS 驱动）变化，节点填充 / 描边 / 连线
  //   配色永远停在默认主题。
  //
  // - 白板：必须「不注入」。@plait/draw 的图形配色走自己的 DrawThemeColors
  //   常量（getDrawDefaultStrokeColor / getFlowchartDefaultFill 直接按
  //   themeColorMode 查表），完全不读 board.options.themeColors；该选项只影响
  //   core 侧的 textColor / boardBackground 取值。此处留空让 core 回落自带的
  //   ThemeColors，若错误沿用 MindThemeColors 会让文本色走导图色表。
  const [initialReadonly] = useState(() => readonly);
  const options = useMemo<PlaitBoardOptions>(
    () => ({
      readonly: initialReadonly,
      ...(mode === 'board' ? {} : { themeColors: MindThemeColors }),
    }),
    [initialReadonly, mode],
  );

  // 插件按形态分流；mode 为块级不可变属性，Wrapper 只在挂载时读取一次。
  // 白板模式额外挂载：
  // - withImageRender：react-board 内置 withImage 把 renderImage 留为 throw 占位，
  //   宿主不实现会导致图片元素数据正常但静默不渲染（初始化异常被 @plait/core
  //   的 list-render 吞掉）。
  // - withHitTest：放宽点选命中（须在 withDraw 之后，才能包装到 draw 定义的
  //   board.isHit），修复无文字未填充图形点击内部空白区无法选中。
  const plugins = useMemo<PlaitPlugin[]>(
    () => (mode === 'board' ? [withDraw, withImageRender, withHitTest] : [withMind]),
    [mode],
  );

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

  // 同样用 ref 持有，避免身份变化导致 Wrapper 频繁重建回调
  const onThemeChangeRef = useRef(onThemeChange);
  useEffect(() => {
    onThemeChangeRef.current = onThemeChange;
  }, [onThemeChange]);

  const handleThemeChange = useCallback((mode: ThemeColorMode) => {
    onThemeChangeRef.current?.(mode);
  }, []);

  // 运行时切换只读态：直接 mutate board.options.readonly（实时影响交互 gating），
  // 并手动同步 .plait-board-container 的 .readonly 修饰类（渲染期计算，仅外观）。
  //
  // 关键：必须同步 board.pointer。Plait 仅在创建 board 时依据初始 readonly 选项
  // 一次性设定 pointer（readonly → 'hand'，可编辑 → 'selection'，见 plait-core
  // 的 board context 初始化），运行时切换 readonly 不会重新派生 pointer。
  // 若不同步，pointer 恒为创建时的 'hand'，withSelection 的 isHandleSelection
  // 恒为 false，选中缓存永不写入——节点选中/拖拽/框选全部失效。
  //
  // pointer 与 readonly 的「解耦」语义：本 effect 只在 readonly 发生跳变时运行，
  // 因此它给出的只是该状态下的**初始**指针模式（预览态 → 手型，编辑态 → 选择）。
  // 此后画布工具栏可自由改写 board.pointer，本 effect 不会再把它拉回去，直到
  // 下一次进出编辑态。注意：该赋值不走 op 流程、不触发 board.onChange，
  // 所以必须显式调用 onPointerReset 通知宿主刷新工具栏高亮。
  const onPointerResetRef = useRef(onPointerReset);
  useEffect(() => {
    onPointerResetRef.current = onPointerReset;
  }, [onPointerReset]);

  useEffect(() => {
    const board = boardRef.current;
    if (board) {
      board.options.readonly = readonly;
      board.pointer = readonly ? PlaitPointerType.hand : PlaitPointerType.selection;
      onPointerResetRef.current?.();
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
      data-board-mode={mode}
    >
      <Wrapper
        value={value}
        viewport={viewport}
        theme={theme}
        options={options}
        plugins={plugins}
        onValueChange={handleValueChange}
        onThemeChange={handleThemeChange}
      >
        <Board afterInit={handleAfterInit} />
      </Wrapper>
    </div>
  );
}

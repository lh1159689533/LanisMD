/**
 * Board Style Toolbar - 入口（创建/挂载/定位/selection 联动）
 *
 * 批次 1 地基：在编辑态选中思维导图节点时，于画板视口顶部居中浮现一条空工具栏骨架；
 * 取消选中或选中非 mind 元素时隐藏。
 *
 * 批次 2 节点级样式：在骨架内挂载节点形状/填充/描边三个能力组按钮，
 * 选中节点时回填当前样式值。
 *
 * 白板形态分流（PRD §3.8）：
 * 同一条工具栏按 `mode` 装配两套互斥的能力组，并在三处做分流——
 * 1. **选中态读取**：导图 `getSelectedMindElements` / 白板 `getSelectedDrawElements`
 * 2. **样式快照**：导图 `getCurrentStyles` / 白板 `getDrawStyles`
 * 3. **定位锚点**：导图 `MindElement.getNode()` / 白板 `points` 包围盒
 * 导图侧的函数与能力组一行不改，白板侧全部是并列新增，两者回归面相互隔离。
 * 导图专属能力组（结构/分支/节点形状）在白板模式**不创建**，不产生无用 DOM。
 *
 * 定位策略：绝对定位于画板块内，锚定选中元素上方居中（上方空间不足则改放下方）。
 *
 * 事件隔离：工具栏所有交互沿用 `mousedown + preventDefault + stopPropagation` 范式，
 * 避免抢走编辑器焦点或误触 Plait/ProseMirror。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次1地基：浮动工具栏骨架 + selection 联动    | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次1 |
 * | v1.1.0 | 批次2：挂载形状/填充/描边能力组 + 样式回填    | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.2.0 | 批次3：挂载结构/分支能力组 + 样式回填          | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次3 |
 * | v1.3.0 | 下划线节点隐藏填充/描边能力组                   | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.4.0 | 批次4：挂载文字样式能力组 + 样式回填           | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次4 |
 * | v1.5.0 | 按画板形态分流：白板装配填充/描边/不透明度/文字样式 | REQ: 20261027-board-whiteboard-draw §3.8 |
 * | v1.6.0 | 白板新增图形切换/旋转/端点走线/矢量线形态四个能力组 | REQ: 20261027-board-whiteboard-draw §3.7 / §3.8 |
 * | v1.7.0 | 图片元素选中时隐藏样式工具栏（无适用能力组） | REQ: 20261027-board-whiteboard-draw §3.9 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { ATTACHED_ELEMENT_CLASS_NAME, toHostPointFromViewBoxPoint, PlaitBoard } from '@plait/core';
import { getRectangleByNode, MindElement } from '@plait/mind';

import {
  getSelectedMindElements,
  getSelectedDrawElements,
  getCurrentStyles,
  getDrawStyles,
  getDrawCapabilities,
  getDrawSelectionRectangle,
  subscribeBoardChange,
  hasAnyNonUnderlineShape,
  isAllImage,
} from './selection';
import { createStructureSegment, type StructureSegment } from './segments/structure';
import { createBranchSegment, type BranchSegment } from './segments/branch';
import { createNodeShapeSegment, type NodeShapeSegment } from './segments/node-shape';
import { createFillSegment, type FillSegment } from './segments/fill';
import { createStrokeSegment, type StrokeSegment } from './segments/stroke';
import { createTextStyleSegment, type TextStyleSegment } from './segments/text-style';
import { createDrawFillSegment, type DrawFillSegment } from './segments/draw-fill';
import { createDrawStrokeSegment, type DrawStrokeSegment } from './segments/draw-stroke';
import { createOpacitySegment, type OpacitySegment } from './segments/opacity';
import { createShapeSwitchSegment, type ShapeSwitchSegment } from './segments/shape-switch';
import { createLineMarkerSegment, type LineMarkerSegment } from './segments/line-marker';
import {
  createVectorLineShapeSegment,
  type VectorLineShapeSegment,
} from './segments/vector-line-shape';
import { createRotateSegment, type RotateSegment } from './segments/rotate';
import type { StyleToolbarController } from './types';
import type { BoardMode } from '../types';

/** 样式工具栏 CSS 类名前缀 */
export const STYLE_TOOLBAR_PREFIX = 'lanismd-board-style-toolbar';

/** 导图形态的能力组集合 */
interface MindSegmentSet {
  structure: StructureSegment;
  branch: BranchSegment;
  shape: NodeShapeSegment;
  fill: FillSegment;
  stroke: StrokeSegment;
  textStyle: TextStyleSegment;
}

/** 白板形态的能力组集合 */
interface DrawSegmentSet {
  fill: DrawFillSegment;
  stroke: DrawStrokeSegment;
  opacity: OpacitySegment;
  shapeSwitch: ShapeSwitchSegment;
  rotate: RotateSegment;
  lineMarker: LineMarkerSegment;
  vectorLineShape: VectorLineShapeSegment;
  /**
   * 文字样式段与导图**复用同一份实现**：`text-style.ts` 本身不依赖 `@plait/mind`，
   * 底层的 `applyBold` 等写操作已改为形态无关（经 `getTextEditorsByElement` 取
   * Slate editor，对 draw 图形同样有效），故零改造即可接入。
   */
  textStyle: TextStyleSegment;
}

/**
 * 创建节点样式工具栏控制器。
 *
 * 返回的控制器由 NodeView 在进入编辑态时 `attach(board)`，退出编辑态时 `detach()`，
 * 销毁时 `destroy()`。
 *
 * @param initialMode 画板形态。主窗口构造时即可确定；全屏窗口需等数据解码，
 *                    届时用 `setMode()` 补齐。
 */
export function createStyleToolbar(initialMode: BoardMode = 'mindmap'): StyleToolbarController {
  // 工具栏根 DOM
  // 注意：必须携带 Plait 约定的 plait-board-attached 类。Plait 的 globalPointerUp
  // 会在指针抬起时清空"既不在 board 容器内、也不是 attached 元素"的目标的选中态；
  // 工具栏挂在 board 容器外，若不带该类，点击工具栏的瞬间选中就被清空，
  // 触发 sync 后工具栏立即隐藏（点击任何按钮面板都会消失）。
  const dom = document.createElement('div');
  dom.className = `${STYLE_TOOLBAR_PREFIX} ${ATTACHED_ELEMENT_CLASS_NAME}`;
  dom.setAttribute('data-visible', 'false');

  // 内容容器
  const content = document.createElement('div');
  content.className = `${STYLE_TOOLBAR_PREFIX}__content`;
  dom.appendChild(content);

  let mode: BoardMode = initialMode;
  let board: PlaitBoard | null = null;
  let unsubscribe: (() => void) | null = null;

  /** 能力组按形态惰性创建并缓存，避免为用不到的形态生成 DOM 与监听 */
  let mindSegments: MindSegmentSet | null = null;
  let drawSegments: DrawSegmentSet | null = null;

  // -------------------------------------------------------------------------
  // 能力组装配
  // -------------------------------------------------------------------------

  /** 创建导图形态的能力组（结构 | 分支 | 节点形状 | 填充 | 描边 | 文字样式） */
  function ensureMindSegments(): MindSegmentSet {
    if (!mindSegments) {
      mindSegments = {
        structure: createStructureSegment(),
        branch: createBranchSegment(),
        shape: createNodeShapeSegment(),
        fill: createFillSegment(),
        stroke: createStrokeSegment(),
        textStyle: createTextStyleSegment(),
      };
    }
    return mindSegments;
  }

  /**
   * 创建白板形态的能力组。
   *
   * 顺序即视觉顺序：填充 → 描边 → 不透明度 → 图形切换 → 旋转 → 端点/走线 →
   * 矢量线形态 → 文字样式。前四者为通用样式，中间三个按元素类型分流显示，
   * 文字样式最后。
   */
  function ensureDrawSegments(): DrawSegmentSet {
    if (!drawSegments) {
      drawSegments = {
        fill: createDrawFillSegment(),
        stroke: createDrawStrokeSegment(),
        opacity: createOpacitySegment(),
        shapeSwitch: createShapeSwitchSegment(),
        rotate: createRotateSegment(),
        lineMarker: createLineMarkerSegment(),
        vectorLineShape: createVectorLineShapeSegment(),
        textStyle: createTextStyleSegment(),
      };
    }
    return drawSegments;
  }

  /** 按当前形态把对应能力组挂进内容容器（顺序即视觉顺序） */
  function assembleSegments(): void {
    content.innerHTML = '';
    if (mode === 'board') {
      const segments = ensureDrawSegments();
      content.appendChild(segments.fill.button);
      content.appendChild(segments.stroke.button);
      content.appendChild(segments.opacity.button);
      content.appendChild(segments.shapeSwitch.button);
      content.appendChild(segments.rotate.button);
      content.appendChild(segments.lineMarker.button);
      content.appendChild(segments.vectorLineShape.button);
      content.appendChild(segments.textStyle.button);
    } else {
      const segments = ensureMindSegments();
      content.appendChild(segments.structure.button);
      content.appendChild(segments.branch.button);
      content.appendChild(segments.shape.button);
      content.appendChild(segments.fill.button);
      content.appendChild(segments.stroke.button);
      content.appendChild(segments.textStyle.button);
    }
    dom.setAttribute('data-mode', mode);
    if (board) {
      propagateBoard(board);
    }
  }

  /** 把 board 透传给当前形态的能力组 */
  function propagateBoard(target: PlaitBoard): void {
    if (mode === 'board') {
      const segments = ensureDrawSegments();
      segments.fill.setBoard(target);
      segments.stroke.setBoard(target);
      segments.opacity.setBoard(target);
      segments.shapeSwitch.setBoard(target);
      segments.rotate.setBoard(target);
      segments.lineMarker.setBoard(target);
      segments.vectorLineShape.setBoard(target);
      segments.textStyle.setBoard(target);
    } else {
      const segments = ensureMindSegments();
      segments.structure.setBoard(target);
      segments.branch.setBoard(target);
      segments.shape.setBoard(target);
      segments.fill.setBoard(target);
      segments.stroke.setBoard(target);
      segments.textStyle.setBoard(target);
    }
  }

  /** 运行时切换形态（全屏窗口解码出数据后调用） */
  function setMode(nextMode: BoardMode): void {
    if (mode === nextMode) return;
    mode = nextMode;
    assembleSegments();
    sync();
  }

  // 阻止工具栏内的 mousedown 抢焦点 / 冒泡到 Plait / ProseMirror。
  // 注意：preventDefault 会阻断 input/textarea/select 等表单控件获得焦点，
  // 导致数字输入框无法聚焦/输入（change 事件不触发）。因此对表单控件
  // 跳过 preventDefault（仅 stopPropagation 阻止冒泡），其余元素维持原范式。
  dom.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    const target = e.target as HTMLElement | null;
    const isFormControl =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);
    if (!isFormControl) {
      e.preventDefault();
    }
  });

  // -------------------------------------------------------------------------
  // 选中态联动
  // -------------------------------------------------------------------------

  /** 依据当前选中态刷新显隐 + 回填样式值 */
  function sync(): void {
    if (!board) {
      setVisible(false);
      return;
    }
    if (mode === 'board') {
      syncDraw(board);
    } else {
      syncMind(board);
    }
  }

  /** 导图形态的同步逻辑（保持原实现不变） */
  function syncMind(target: PlaitBoard): void {
    const segments = ensureMindSegments();
    const selected = getSelectedMindElements(target);
    const hasSelection = selected.length > 0;

    setVisible(hasSelection);
    if (!hasSelection) return;

    // 下划线节点无填充/描边视觉表现：全部选中节点为下划线时隐藏这两个能力组
    const showFillStroke = hasAnyNonUnderlineShape(target);
    segments.fill.setVisible(showFillStroke);
    segments.stroke.setVisible(showFillStroke);

    // 回填当前样式值到各能力组
    try {
      const styles = getCurrentStyles(target);
      if (styles) {
        segments.structure.setActiveStructure(styles.layout);
        segments.branch.setActiveBranch(
          styles.branchShape,
          styles.branchWidth,
          styles.branchColor,
        );
        segments.shape.setActiveShape(styles.shape);
        segments.fill.setActiveFill(styles.fill);
        segments.stroke.setActiveStroke(styles.strokeColor, styles.strokeWidth);
        segments.textStyle.setActiveTextStyle({
          bold: styles.bold,
          italic: styles.italic,
          underlined: styles.underlined,
          fontSize: styles.fontSize,
          textColor: styles.textColor,
          textAlign: styles.textAlign,
        });
      }
    } catch (e) {}
  }

  /**
   * 白板形态的同步逻辑。
   *
   * 能力组显隐取「全体选中元素都支持」的交集语义，满足 PRD §3.8 验收：
   * 多选「图形 + 连线」时填充组隐藏（连线无填充语义），描边与不透明度保留。
   */
  function syncDraw(target: PlaitBoard): void {
    const segments = ensureDrawSegments();
    const selected = getSelectedDrawElements(target);
    // 图片元素无适用的样式能力组（拖移/缩放/旋转/删除由 withDraw 内置），隐藏工具栏
    if (isAllImage(selected)) {
      setVisible(false);
      return;
    }
    const hasSelection = selected.length > 0;

    setVisible(hasSelection);
    if (!hasSelection) return;

    const capabilities = getDrawCapabilities(target);
    segments.fill.setVisible(capabilities.fill);
    segments.shapeSwitch.setVisible(capabilities.shapeSwitch);
    segments.rotate.setVisible(capabilities.rotate);
    segments.lineMarker.setVisible(capabilities.arrowLine);
    segments.vectorLineShape.setVisible(capabilities.vectorLine);
    segments.textStyle.setVisible(capabilities.text);
    // 描边与不透明度对本期支持的所有 draw 元素都有效，恒显示
    segments.stroke.setVisible(true);
    segments.opacity.setVisible(true);

    try {
      const styles = getDrawStyles(target);
      if (styles) {
        segments.fill.setActiveFill(styles.fill);
        segments.stroke.setActiveStroke(styles.strokeColor, styles.strokeWidth, styles.strokeStyle);
        segments.opacity.setActiveOpacity(styles.opacity);
        segments.shapeSwitch.setActiveShape(styles.shape);
        segments.rotate.setActiveAngle(styles.angle);
        segments.lineMarker.setActiveLine(
          styles.arrowLineShape,
          styles.sourceMarker,
          styles.targetMarker,
        );
        segments.vectorLineShape.setActiveShape(styles.vectorLineShape);
        segments.textStyle.setActiveTextStyle({
          bold: styles.bold,
          italic: styles.italic,
          underlined: styles.underlined,
          fontSize: styles.fontSize,
          textColor: styles.textColor,
          textAlign: styles.textAlign,
        });
      }
    } catch (e) {}
  }

  // -------------------------------------------------------------------------
  // 定位
  // -------------------------------------------------------------------------

  /**
   * 取定位锚点矩形（viewBox 坐标系），按形态分流。
   *
   * - 导图：`MindElement.getNode()` → `getRectangleByNode`。`node.x/y` 是布局
   *   实时坐标，与命中检测 `isHitMindElement` 同源。不能用
   *   `getRectangleByElement`（`element.points` 仅创建时写入，布局重排后不更新），
   *   也不能用 core 的 `board.getRectangle`（对 mind 返回 topic 文字矩形）。
   * - 白板：draw 元素没有布局节点，`points` 本身就是权威几何（resize/拖移都会
   *   实时写回），故取全部选中元素 points 的联合外接矩形。
   */
  function getAnchorRectangle(
    target: PlaitBoard,
  ): { x: number; y: number; width: number; height: number } | null {
    if (mode === 'board') {
      return getDrawSelectionRectangle(target);
    }
    const element = getSelectedMindElements(target)[0];
    if (!element) return null;
    const node = MindElement.getNode(element as MindElement);
    if (!node) return null;
    return getRectangleByNode(node);
  }

  /**
   * 将工具栏定位到当前选中元素的上方居中。
   *
   * 定位锚点为选中矩形的顶部中心点（工具栏 transform 为 translate(-50%,-100%)，
   * 使其整体上移到锚点上方）。坐标链路：
   * viewBox 系 → toHostPointFromViewBoxPoint（host 相对）→ 加 host 屏幕偏移
   * （屏幕系）→ 减去块矩形偏移得到块内坐标。
   *
   * 边界处理：
   * - 元素上方空间不足（工具栏顶会超出视口顶部）时，改放到元素下方；
   * - 水平方向钳制在块范围内，避免元素贴近左右边缘时工具栏溢出。
   */
  function updatePosition(): void {
    const block = dom.parentElement;
    if (!block || !board) return;

    const viewBoxRect = getAnchorRectangle(board);
    if (!viewBoxRect) return;

    // viewBox → 屏幕坐标：注意不能用 toActiveRectangleFromViewBoxRectangle，
    // 它返回的是 boardContainer 相对坐标（"active" 系），不是屏幕坐标。
    const boardInstance = board;
    const host = PlaitBoard.getHost(boardInstance);
    const toScreen = (vx: number, vy: number): [number, number] => {
      const hostPoint = toHostPointFromViewBoxPoint(boardInstance, [vx, vy]);
      const rect = host.getBoundingClientRect();
      return [hostPoint[0] + rect.x, hostPoint[1] + rect.y];
    };
    const topLeft = toScreen(viewBoxRect.x, viewBoxRect.y);
    const bottomRight = toScreen(
      viewBoxRect.x + viewBoxRect.width,
      viewBoxRect.y + viewBoxRect.height,
    );
    const screenRect = {
      x: topLeft[0],
      y: topLeft[1],
      width: bottomRight[0] - topLeft[0],
      height: bottomRight[1] - topLeft[1],
    };
    const blockRect = block.getBoundingClientRect();

    // 元素矩形中心（块内坐标）
    const nodeCenterX = screenRect.x - blockRect.left + screenRect.width / 2;
    const nodeTop = screenRect.y - blockRect.top;
    const nodeBottom = nodeTop + screenRect.height;

    const GAP = 8;
    const toolbarW = dom.offsetWidth || 120;
    const toolbarH = dom.offsetHeight || 40;

    // 水平：居中于元素，并钳制在块内
    let left = nodeCenterX;
    const minLeft = toolbarW / 2;
    const maxLeft = blockRect.width - toolbarW / 2;
    left = Math.max(minLeft, Math.min(maxLeft, left));

    // 垂直：默认元素上方；上方空间不足则改放元素下方
    let top = nodeTop - GAP;
    const toolbarTopScreen = blockRect.top + top - toolbarH; // transform translateY(-100%)
    if (toolbarTopScreen < 0) {
      top = nodeBottom + GAP;
    }

    dom.style.left = `${left}px`;
    dom.style.top = `${top}px`;
  }

  /** 视口滚动/缩放时的位置跟随（仅工具栏可见期间监听） */
  function handleViewportChange(): void {
    if (dom.classList.contains('is-visible')) {
      updatePosition();
    }
  }

  /** 设置工具栏显隐 */
  function setVisible(visible: boolean): void {
    dom.setAttribute('data-visible', visible ? 'true' : 'false');
    dom.classList.toggle('is-visible', visible);
    if (visible) {
      updatePosition();
    }
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  function attach(nextBoard: PlaitBoard): void {
    if (board === nextBoard) return;
    detach();
    board = nextBoard;

    // 把 board 透传给当前形态的能力组
    propagateBoard(nextBoard);

    // 视口变化时跟随定位（scroll 用捕获以覆盖内部滚动容器；passive 不阻塞滚动）
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    unsubscribe = subscribeBoardChange(board, sync);
    sync();
  }

  function detach(): void {
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('scroll', handleViewportChange, true);
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    board = null;
    setVisible(false);
  }

  function destroy(): void {
    detach();
    if (mindSegments) {
      mindSegments.structure.destroy();
      mindSegments.branch.destroy();
      mindSegments.shape.destroy();
      mindSegments.fill.destroy();
      mindSegments.stroke.destroy();
      mindSegments.textStyle.destroy();
      mindSegments = null;
    }
    if (drawSegments) {
      drawSegments.fill.destroy();
      drawSegments.stroke.destroy();
      drawSegments.opacity.destroy();
      drawSegments.shapeSwitch.destroy();
      drawSegments.rotate.destroy();
      drawSegments.lineMarker.destroy();
      drawSegments.vectorLineShape.destroy();
      drawSegments.textStyle.destroy();
      drawSegments = null;
    }
    dom.remove();
  }

  // 初始装配
  assembleSegments();

  return { dom, attach, detach, setMode, sync, destroy };
}

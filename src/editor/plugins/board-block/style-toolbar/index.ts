/**
 * Board Style Toolbar - 入口（创建/挂载/定位/selection 联动）
 *
 * 批次 1 地基：在编辑态选中思维导图节点时，于画板视口顶部居中浮现一条空工具栏骨架；
 * 取消选中或选中非 mind 元素时隐藏。
 *
 * 批次 2 节点级样式：在骨架内挂载节点形状/填充/描边三个能力组按钮，
 * 选中节点时回填当前样式值。
 *
 * 定位策略：绝对定位于画板容器（`.lanismd-board-block__host`）顶部居中，
 * 不跟随选中节点（规避坐标换算与遮挡，见技术方案决策基线）。
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
 * /@changelog
 *
 * @author hhhuilli
 */

import {
  getHitElementByPoint,
  ATTACHED_ELEMENT_CLASS_NAME,
  toHostPointFromViewBoxPoint,
  PlaitBoard,
} from '@plait/core';
import { getRectangleByNode, MindElement } from '@plait/mind';

import {
  getSelectedMindElements,
  getCurrentStyles,
  subscribeBoardChange,
  hasAnyNonUnderlineShape,
} from './selection';
import { createStructureSegment, type StructureSegment } from './segments/structure';
import { createBranchSegment, type BranchSegment } from './segments/branch';
import { createNodeShapeSegment, type NodeShapeSegment } from './segments/node-shape';
import { createFillSegment, type FillSegment } from './segments/fill';
import { createStrokeSegment, type StrokeSegment } from './segments/stroke';
import { createTextStyleSegment, type TextStyleSegment } from './segments/text-style';
import type { StyleToolbarController } from './types';

/** 样式工具栏 CSS 类名前缀 */
export const STYLE_TOOLBAR_PREFIX = 'lanismd-board-style-toolbar';

/**
 * 创建节点样式工具栏控制器。
 *
 * 返回的控制器由 NodeView 在进入编辑态时 `attach(board)`，退出编辑态时 `detach()`，
 * 销毁时 `destroy()`。
 */
export function createStyleToolbar(): StyleToolbarController {
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

  // --- 创建各能力组 ---
  const structureSegment: StructureSegment = createStructureSegment();
  const branchSegment: BranchSegment = createBranchSegment();
  const shapeSegment: NodeShapeSegment = createNodeShapeSegment();
  const fillSegment: FillSegment = createFillSegment();
  const strokeSegment: StrokeSegment = createStrokeSegment();
  const textStyleSegment: TextStyleSegment = createTextStyleSegment();

  // 按顺序挂载到内容容器（结构 | 分支 | 节点形状 | 节点填充 | 节点描边 | 文字样式）
  content.appendChild(structureSegment.button);
  content.appendChild(branchSegment.button);
  content.appendChild(shapeSegment.button);
  content.appendChild(fillSegment.button);
  content.appendChild(strokeSegment.button);
  content.appendChild(textStyleSegment.button);

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

  let board: PlaitBoard | null = null;
  let unsubscribe: (() => void) | null = null;

  /** 依据当前选中态刷新显隐 + 回填样式值 */
  function sync(): void {
    if (!board) {
      setVisible(false);
      return;
    }
    const selected = getSelectedMindElements(board);
    const hasSelection = selected.length > 0;

    setVisible(hasSelection);

    if (hasSelection) {
      // 下划线节点无填充/描边视觉表现：全部选中节点为下划线时隐藏这两个能力组
      const showFillStroke = hasAnyNonUnderlineShape(board);
      fillSegment.setVisible(showFillStroke);
      strokeSegment.setVisible(showFillStroke);

      // 回填当前样式值到各能力组
      try {
        const styles = getCurrentStyles(board);
        if (styles) {
          structureSegment.setActiveStructure(styles.layout);
          branchSegment.setActiveBranch(styles.branchShape, styles.branchWidth, styles.branchColor);
          shapeSegment.setActiveShape(styles.shape);
          fillSegment.setActiveFill(styles.fill);
          strokeSegment.setActiveStroke(styles.strokeColor, styles.strokeWidth);
          textStyleSegment.setActiveTextStyle({
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
  }

  /**
   * 将工具栏定位到当前选中节点的上方居中。
   *
   * 定位锚点为选中节点矩形的顶部中心点（工具栏 transform 为 translate(-50%,-100%)，
   * 使其整体上移到锚点上方）。坐标链路：
   * board.getRectangle(element)（viewBox 系）→ toActiveRectangleFromViewBoxRectangle
   * （屏幕系）→ 减去块矩形偏移得到块内坐标。
   *
   * 边界处理：
   * - 节点上方空间不足（工具栏顶会超出视口顶部）时，改放到节点下方；
   * - 水平方向钳制在块范围内，避免节点贴近左右边缘时工具栏溢出。
   */
  function updatePosition(): void {
    const block = dom.parentElement;
    if (!block || !board) return;
    const element = getSelectedMindElements(board)[0];
    if (!element) return;

    // 权威节点矩形：MindElement.getNode → MindNode（x/y 为布局实时坐标），
    // getRectangleByNode 按 node.x + hGap 等还原节点边框矩形（与命中检测 isHitMindElement
    // 用的是同一套数据）。不能用 getRectangleByElement（element.points 仅创建时写入，
    // 布局重排后不更新），也不能用 core 的 board.getRectangle（对 mind 返回 topic 文字矩形）。
    const node = MindElement.getNode(element as MindElement);
    if (!node) return;
    const viewBoxRect = getRectangleByNode(node);

    // viewBox → 屏幕坐标：注意不能用 toActiveRectangleFromViewBoxRectangle，
    // 它返回的是 boardContainer 相对坐标（"active" 系），不是屏幕坐标。
    // 这里用 toHostPointFromViewBoxPoint（viewBox → host 相对）+
    // toScreenPointFromHostPoint（host 相对 → 屏幕）得到真正的客户端坐标。
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

    // 节点矩形中心（块内坐标）
    const nodeCenterX = screenRect.x - blockRect.left + screenRect.width / 2;
    const nodeTop = screenRect.y - blockRect.top;
    const nodeBottom = nodeTop + screenRect.height;

    const GAP = 8;
    const toolbarW = dom.offsetWidth || 120;
    const toolbarH = dom.offsetHeight || 40;

    // 水平：居中于节点，并钳制在块内
    let left = nodeCenterX;
    const minLeft = toolbarW / 2;
    const maxLeft = blockRect.width - toolbarW / 2;
    left = Math.max(minLeft, Math.min(maxLeft, left));

    // 垂直：默认节点上方；上方空间不足则改放节点下方
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

  function attach(nextBoard: PlaitBoard): void {
    if (board === nextBoard) return;
    detach();
    board = nextBoard;

    // 把 board 透传给各能力组
    structureSegment.setBoard(nextBoard);
    branchSegment.setBoard(nextBoard);
    shapeSegment.setBoard(nextBoard);
    fillSegment.setBoard(nextBoard);
    strokeSegment.setBoard(nextBoard);
    textStyleSegment.setBoard(nextBoard);

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
    structureSegment.destroy();
    branchSegment.destroy();
    shapeSegment.destroy();
    fillSegment.destroy();
    strokeSegment.destroy();
    textStyleSegment.destroy();
    dom.remove();
  }

  return { dom, attach, detach, sync, destroy };
}

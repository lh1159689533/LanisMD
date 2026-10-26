/**
 * Board Style Toolbar - selection 联动
 *
 * 封装对 Plait board 选中态的订阅与读取：
 * - 通过覆写 `board.onChange`（保留并链式调用原实现）监听每次画板变更，
 *   变更后读取当前选中元素，交给回调判定工具栏显隐。
 * - `getSelectedMindElements` 过滤出思维导图节点（`mind` / `mind_child`）。
 * - `getCurrentStyles` 读取首个选中 mind 节点的样式值，用于回填工具栏 UI。
 *
 * 选用 `board.onChange` 而非 DOM 事件的原因：Plait 所有交互（点击选择、框选、
 * 热键、apply 操作）最终都会触发 `onChange`，覆写它可稳定捕获选中态变化，
 * 无需关心底层交互细节（对齐技术方案 §五「批次1 spike 先跑通」）。
 *
 * @changelog
 * | 版本   | 变更说明                          | 关联                                                        |
 * | v1.0.0 | 批次1地基：onChange 订阅 + 选中读取  | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §3.2 |
 * | v1.1.0 | 批次2：getCurrentStyles 读取当前样式值 | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.2.0 | 批次3：读取连线结构/布局方向/分支宽色   | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次3 |
 * | v1.3.0 | 新增 hasAnyNonUnderlineShape：全下划线时隐藏填充/描边 | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.4.0 | 批次4：读取文字样式（粗/斜/字号/字色）    | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次4 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { getSelectedElements, PlaitBoard, PlaitElement } from '@plait/core';
import {
  MindElement,
  MindElementShape,
  BranchShape,
  MindQueries,
  getShapeByElement,
  getFillByElement,
  getStrokeColorByElement,
  getStrokeWidthByElement,
  getBranchShapeByMindElement,
  getBranchWidthByMindElement,
  getBranchColorByMindElement,
  getDefaultFontSizeForMindElement,
} from '@plait/mind';
import { Node as SlateNode } from 'slate';

import { isMindElement } from './types';
import type { ShapeOption, BranchShapeOption, LayoutDirectionOption, TextAlignOption } from './constants';
import { DEFAULT_STROKE_WIDTH, DEFAULT_BRANCH_WIDTH } from './constants';

// ---------------------------------------------------------------------------
// 选中态读取
// ---------------------------------------------------------------------------

/** 读取当前选中的思维导图节点（过滤掉非 mind 元素） */
export function getSelectedMindElements(board: PlaitBoard): PlaitElement[] {
  const all = getSelectedElements(board);
  return all.filter(isMindElement);
}

// ---------------------------------------------------------------------------
// 当前样式值（回填 UI）
// ---------------------------------------------------------------------------

/** 选中节点的当前样式快照 */
export interface NodeStyleSnapshot {
  /** 节点形状 */
  shape: ShapeOption;
  /** 填充颜色（无自定义则为默认色字符串） */
  fill: string | null;
  /** 描边颜色（无自定义则为默认色字符串） */
  strokeColor: string | null;
  /** 描边宽度 */
  strokeWidth: number;
  /** 连线结构（曲线/折线） */
  branchShape: BranchShapeOption;
  /** 布局方向（右/左/上/下，非逻辑方向布局返回 null 表示不匹配） */
  layout: LayoutDirectionOption | null;
  /** 分支连线颜色 */
  branchColor: string | null;
  /** 分支连线宽度 */
  branchWidth: number;
  /** 文字是否加粗 */
  bold: boolean;
  /** 文字是否斜体 */
  italic: boolean;
  /** 文字是否下划线 */
  underlined: boolean;
  /** 文字颜色（无自定义 mark 时为 null） */
  textColor: string | null;
  /** 文字字号（无显式 mark 时回退为节点默认字号） */
  fontSize: number;
  /** 文字水平对齐（无显式 align 时为 null，视觉默认左对齐） */
  textAlign: TextAlignOption | null;
}

/**
 * 读取首个选中 mind 节点的当前样式值。
 *
 * 用于工具栏各能力组的 UI 回填（选中态高亮、颜色预览等）。
 * 若无选中节点返回 null。
 */
export function getCurrentStyles(board: PlaitBoard): NodeStyleSnapshot | null {
  const elements = getSelectedMindElements(board);
  if (elements.length === 0) return null;

  const el = elements[0] as MindElement;

  // 形状
  let shape: ShapeOption;
  try {
    const plaitShape = getShapeByElement(board, el);
    shape = plaitShape === MindElementShape.underline ? 'underline' : 'round-rectangle';
  } catch (e) {
    // [style-toolbar-diag] 形状读取异常
    console.error('[style-toolbar-diag] getShapeByElement error', e);
    shape = 'round-rectangle';
  }

  // 填充
  let fill: string | null;
  try {
    fill = getFillByElement(board, el) || null;
  } catch (e) {
    // [style-toolbar-diag] 填充读取异常
    console.error('[style-toolbar-diag] getFillByElement error', e);
    fill = null;
  }

  // 描边色
  let strokeColor: string | null;
  try {
    strokeColor = getStrokeColorByElement(board, el) || null;
  } catch (e) {
    // [style-toolbar-diag] 描边色读取异常
    console.error('[style-toolbar-diag] getStrokeColorByElement error', e);
    strokeColor = null;
  }

  // 描边宽
  let strokeWidth: number;
  try {
    strokeWidth = getStrokeWidthByElement(board, el);
  } catch (e) {
    // [style-toolbar-diag] 描边宽读取异常
    console.error('[style-toolbar-diag] getStrokeWidthByElement error', e);
    strokeWidth = DEFAULT_STROKE_WIDTH;
  }

  // 连线结构
  let branchShape: BranchShapeOption;
  try {
    const plaitBranchShape = getBranchShapeByMindElement(board, el);
    branchShape = plaitBranchShape === BranchShape.polyline ? 'polyline' : 'bight';
  } catch (e) {
    // [style-toolbar-diag] 连线结构读取异常
    console.error('[style-toolbar-diag] getBranchShapeByMindElement error', e);
    branchShape = 'bight';
  }

  // 布局方向（仅逻辑方向 right/left/upward/downward 映射，其余返回 null）
  let layout: LayoutDirectionOption | null;
  try {
    const plaitLayout = MindQueries.getLayoutByElement(el);
    if (
      plaitLayout === 'right' ||
      plaitLayout === 'left' ||
      plaitLayout === 'upward' ||
      plaitLayout === 'downward'
    ) {
      layout = plaitLayout;
    } else {
      layout = null;
    }
  } catch (e) {
    // [style-toolbar-diag] 布局方向读取异常
    console.error('[style-toolbar-diag] getLayoutByElement error', e);
    layout = null;
  }

  // 分支色
  let branchColor: string | null;
  try {
    branchColor = getBranchColorByMindElement(board, el) || null;
  } catch (e) {
    // [style-toolbar-diag] 分支色读取异常
    console.error('[style-toolbar-diag] getBranchColorByMindElement error', e);
    branchColor = null;
  }

  // 分支宽
  let branchWidth: number;
  try {
    branchWidth = getBranchWidthByMindElement(board, el);
  } catch (e) {
    // [style-toolbar-diag] 分支宽读取异常
    console.error('[style-toolbar-diag] getBranchWidthByMindElement error', e);
    branchWidth = DEFAULT_BRANCH_WIDTH;
  }

  // 文字样式（从 topic 的文本节点读取 mark）
  const textStyle = readTextMarks(el);

  return {
    shape,
    fill,
    strokeColor,
    strokeWidth,
    branchShape,
    layout,
    branchColor,
    branchWidth,
    ...textStyle,
  };
}

/**
 * 读取选中 mind 节点的文字样式 mark。
 *
 * mark 存储在 `element.data.topic` 的文本节点（`CustomText`）上，主题可能含
 * inline 链接等结构，故用 Slate `Node.texts` 展平所有文本节点后再汇总 mark。
 * 字号无显式 mark 时回退为节点默认字号（根 18 / 子 14）。
 */
function readTextMarks(el: MindElement): {
  bold: boolean;
  italic: boolean;
  underlined: boolean;
  textColor: string | null;
  fontSize: number;
  textAlign: TextAlignOption | null;
} {
  let bold = false;
  let italic = false;
  let underlined = false;
  let textColor: string | null = null;
  let fontSizeMark: number | null = null;
  let textAlign: TextAlignOption | null = null;

  try {
    const topic = el.data?.topic;
    if (topic) {
      // 水平对齐是段落字段，非 mark
      const align = (topic as { align?: string }).align;
      if (align === 'left' || align === 'center' || align === 'right') {
        textAlign = align;
      }
      for (const [node] of SlateNode.texts(topic as never)) {
        const textNode = node as {
          bold?: boolean;
          italic?: boolean;
          underlined?: boolean;
          color?: string;
          'font-size'?: number | string;
        };
        if (textNode.bold) bold = true;
        if (textNode.italic) italic = true;
        if (textNode.underlined) underlined = true;
        if (typeof textNode.color === 'string') textColor = textNode.color;
        const rawSize = textNode['font-size'];
        if (rawSize !== undefined && rawSize !== null) {
          fontSizeMark = Number(rawSize);
        }
      }
    }
  } catch (e) {
    // [style-toolbar-diag] 文字 mark 读取异常
    console.error('[style-toolbar-diag] readTextMarks error', e);
  }

  let fontSize: number;
  try {
    fontSize = fontSizeMark ?? getDefaultFontSizeForMindElement(el);
  } catch (e) {
    // [style-toolbar-diag] 默认字号读取异常
    console.error('[style-toolbar-diag] getDefaultFontSizeForMindElement error', e);
    fontSize = 14;
  }

  return { bold, italic, underlined, textColor, fontSize, textAlign };
}

// ---------------------------------------------------------------------------
// 下划线形状判定
// ---------------------------------------------------------------------------

/**
 * 判断当前选中的 mind 节点中是否存在非「下划线」形状的节点。
 *
 * 下划线节点没有填充/描边的视觉表现，因此仅当所有选中节点都是下划线时
 * 才应隐藏「节点填充」「节点描边」能力组；只要存在至少一个圆角矩形节点，
 * 就返回 true（显示这两个能力组）。
 */
export function hasAnyNonUnderlineShape(board: PlaitBoard): boolean {
  const elements = getSelectedMindElements(board);
  if (elements.length === 0) return false;
  return elements.some((element) => {
    try {
      return getShapeByElement(board, element as MindElement) !== MindElementShape.underline;
    } catch (e) {
      // 形状读取异常时保守返回 true（不隐藏），避免误隐藏能力组
      return true;
    }
  });
}

// ---------------------------------------------------------------------------
// 变更订阅
// ---------------------------------------------------------------------------

/**
 * 订阅 board 的变更事件。
 *
 * 通过链式覆写 `board.onChange` 实现：先执行 Plait 原始 onChange，
 * 再调用外部传入的 `listener`。返回一个还原函数，调用后恢复原始 onChange。
 *
 * @param board    Plait board 实例
 * @param listener 每次变更后触发的回调
 * @returns 取消订阅（还原原始 onChange）的清理函数
 */
export function subscribeBoardChange(board: PlaitBoard, listener: () => void): () => void {
  const originalOnChange = board.onChange;

  board.onChange = () => {
    originalOnChange();
    listener();
  };

  return () => {
    board.onChange = originalOnChange;
  };
}

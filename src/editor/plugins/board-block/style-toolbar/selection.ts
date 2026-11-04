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
 * | v1.5.0 | 新增画板分支：draw 元素选中读取/样式快照/能力位/包围盒 | REQ: 20261027-board-whiteboard-draw §3.8 |
 * | v1.6.0 | 新增图形类型/旋转角/箭头线端点走线/矢量线形态的读取与能力位 | REQ: 20261027-board-whiteboard-draw §3.7 / §3.8 |
 * | v1.7.0 | 新增 isAllImage 判定：图片元素无适用样式能力组，用于隐藏工具栏 | REQ: 20261027-board-whiteboard-draw §3.9 |
 * /@changelog
 *
 * @author hhhuilli
 */

import {
  getAngleByElement,
  getSelectedElements,
  PlaitBoard,
  PlaitElement,
  RectangleClient,
} from '@plait/core';
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
// draw 侧的同名读取函数与 mind 侧签名/取值路径都不同，必须别名导入区分：
// mind 的 getStrokeWidthByElement 签名为 (board, element)，draw 的只收 element。
import {
  PlaitDrawElement,
  type GeometryShapes,
  type PlaitArrowLine,
  type PlaitGeometry,
  type PlaitVectorLine,
  getFillByElement as getDrawFillByElement,
  getStrokeColorByElement as getDrawStrokeColorByElement,
  getStrokeStyleByElement as getDrawStrokeStyleByElement,
  getStrokeWidthByElement as getDrawStrokeWidthByElement,
  isClosedDrawElement,
} from '@plait/draw';
import { Node as SlateNode } from 'slate';

import { isDrawElement, isMindElement } from './types';
import type {
  ShapeOption,
  BranchShapeOption,
  LayoutDirectionOption,
  StrokeStyleOption,
  TextAlignOption,
  ArrowLineShapeOption,
  ArrowLineMarkerOption,
  VectorLineShapeOption,
} from './constants';
import {
  DEFAULT_BRANCH_WIDTH,
  DEFAULT_OPACITY,
  DEFAULT_STROKE_STYLE,
  DEFAULT_STROKE_WIDTH,
  DRAW_DEFAULT_FONT_SIZE,
} from './constants';

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
    shape = 'round-rectangle';
  }

  // 填充
  let fill: string | null;
  try {
    fill = getFillByElement(board, el) || null;
  } catch (e) {
    fill = null;
  }

  // 描边色
  let strokeColor: string | null;
  try {
    strokeColor = getStrokeColorByElement(board, el) || null;
  } catch (e) {
    strokeColor = null;
  }

  // 描边宽
  let strokeWidth: number;
  try {
    strokeWidth = getStrokeWidthByElement(board, el);
  } catch (e) {
    strokeWidth = DEFAULT_STROKE_WIDTH;
  }

  // 连线结构
  let branchShape: BranchShapeOption;
  try {
    const plaitBranchShape = getBranchShapeByMindElement(board, el);
    branchShape = plaitBranchShape === BranchShape.polyline ? 'polyline' : 'bight';
  } catch (e) {
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
    layout = null;
  }

  // 分支色
  let branchColor: string | null;
  try {
    branchColor = getBranchColorByMindElement(board, el) || null;
  } catch (e) {
    branchColor = null;
  }

  // 分支宽
  let branchWidth: number;
  try {
    branchWidth = getBranchWidthByMindElement(board, el);
  } catch (e) {
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
  } catch (e) {}

  let fontSize: number;
  try {
    fontSize = fontSizeMark ?? getDefaultFontSizeForMindElement(el);
  } catch (e) {
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
// 画板分支：选中态读取
// ---------------------------------------------------------------------------

/** 读取当前选中的 draw 元素（过滤掉非 draw 元素） */
export function getSelectedDrawElements(board: PlaitBoard): PlaitElement[] {
  const all = getSelectedElements(board);
  return all.filter(isDrawElement);
}

/**
 * 判断选中集合是否全部为图片元素。
 *
 * 图片没有本期样式工具栏的任何能力组语义（填充/描边/不透明度/文字等均不适用），
 * 其拖移 / 缩放 / 旋转 / 删除由 `withDraw` 内置的 resize / rotate / hotkey 提供。
 * 因此图片被选中时样式工具栏应整体隐藏，而非显示「描边 + 不透明度」等无意义项。
 */
export function isAllImage(elements: PlaitElement[]): boolean {
  return elements.length > 0 && elements.every((element) => PlaitDrawElement.isImage(element));
}

/** draw 元素的当前样式快照（含文字样式，供工具栏回填） */
export interface DrawStyleSnapshot {
  /** 填充色（无自定义时为 Plait 按主题算出的默认值） */
  fill: string | null;
  /** 描边色 */
  strokeColor: string | null;
  /** 描边宽度 */
  strokeWidth: number;
  /** 描边线型（实线 / 虚线 / 点线） */
  strokeStyle: StrokeStyleOption;
  /** 不透明度（0~1） */
  opacity: number;
  /** 图形类型（仅选中 geometry 时有值） */
  shape: GeometryShapes | null;
  /** 旋转角（弧度，仅选中 geometry 时有值） */
  angle: number;
  /** 箭头线走线形态（仅选中 arrow-line 时有值） */
  arrowLineShape: ArrowLineShapeOption | null;
  /** 箭头线源端点标记（仅选中 arrow-line 时有值） */
  sourceMarker: ArrowLineMarkerOption | null;
  /** 箭头线目标端点标记（仅选中 arrow-line 时有值） */
  targetMarker: ArrowLineMarkerOption | null;
  /** 矢量线形态（仅选中 vector-line 时有值） */
  vectorLineShape: VectorLineShapeOption | null;
  /** 文字是否加粗 */
  bold: boolean;
  /** 文字是否斜体 */
  italic: boolean;
  /** 文字是否下划线 */
  underlined: boolean;
  /** 文字颜色（无自定义 mark 时为 null） */
  textColor: string | null;
  /** 文字字号（无显式 mark 时回退默认字号） */
  fontSize: number;
  /** 文字水平对齐（无显式 align 时为 null） */
  textAlign: TextAlignOption | null;
}

/**
 * 画板模式下各能力组的可用性。
 *
 * PRD §3.8 验收要求「多选不同类型元素（图形 + 连线）时，只显示两者共有的
 * 能力组」，故这里一律取**全体选中元素都支持**的交集语义：
 * 只要有一个元素不支持，该能力组即隐藏。
 */
export interface DrawCapabilities {
  /** 是否可改填充：要求全部选中元素都是「闭合」图形（连线/开放折线无填充语义） */
  fill: boolean;
  /** 是否可改文字样式：要求全部选中元素都承载单段文本 */
  text: boolean;
  /** 是否可切换图形：要求全部选中元素都是非文本的 geometry */
  shapeSwitch: boolean;
  /** 是否可旋转：要求全部选中元素都是 geometry（带 angle 字段） */
  rotate: boolean;
  /** 是否可改端点/走线：要求全部选中元素都是 arrow-line */
  arrowLine: boolean;
  /** 是否可改矢量线形态：要求全部选中元素都是 vector-line */
  vectorLine: boolean;
}

/** 计算画板模式下的能力组可用性 */
export function getDrawCapabilities(board: PlaitBoard): DrawCapabilities {
  const elements = getSelectedDrawElements(board);
  if (elements.length === 0) {
    return {
      fill: false,
      text: false,
      shapeSwitch: false,
      rotate: false,
      arrowLine: false,
      vectorLine: false,
    };
  }
  const fill = elements.every((element) => {
    try {
      return isClosedDrawElement(element);
    } catch (e) {
      // 判定异常时保守返回 false，避免把填充写到不支持的元素上
      return false;
    }
  });
  const text = elements.every((element) => hasSingleText(element));
  // 图形切换：`switchGeometryShape` 内部会跳过 text 图形，故这里同样排除 text
  const shapeSwitch = elements.every(
    (element) => PlaitDrawElement.isGeometry(element) && !PlaitDrawElement.isText(element),
  );
  const rotate = elements.every((element) => PlaitDrawElement.isGeometry(element));
  const arrowLine = elements.every((element) => PlaitDrawElement.isArrowLine(element));
  const vectorLine = elements.every((element) => PlaitDrawElement.isVectorLine(element));
  return { fill, text, shapeSwitch, rotate, arrowLine, vectorLine };
}

/**
 * 判定元素是否承载「单段文本」。
 *
 * 本期只支持单文本图形（`PlaitGeometry.text`）。多文本图形
 * （`PlaitMultipleTextGeometry.texts`，如 UML 的 class / interface）与连线文字
 * （`PlaitArrowLine.texts`）的读写路径不同，顺延后续批次（PRD §3.11 / §3.6）。
 */
function hasSingleText(element: PlaitElement): boolean {
  try {
    if (!PlaitDrawElement.isGeometry(element)) return false;
    // 多文本图形带 texts 数组，不走 text 字段
    if ('texts' in element) return false;
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 读取首个选中 draw 元素的当前样式值。
 *
 * draw 侧的读取函数全部来自 `@plait/draw`：它们在元素未显式写入属性时，会按
 * 主题（`DrawThemeColors`）算出 Plait 实际渲染用的默认值，因此工具栏回填出的
 * 颜色与画布所见一致。
 *
 * 若无选中元素返回 null。
 */
export function getDrawStyles(board: PlaitBoard): DrawStyleSnapshot | null {
  const elements = getSelectedDrawElements(board);
  if (elements.length === 0) return null;

  const el = elements[0];

  let fill: string | null;
  try {
    fill = getDrawFillByElement(board, el) || null;
  } catch (e) {
    fill = null;
  }

  let strokeColor: string | null;
  try {
    strokeColor = getDrawStrokeColorByElement(board, el) || null;
  } catch (e) {
    strokeColor = null;
  }

  let strokeWidth: number;
  try {
    strokeWidth = Number(getDrawStrokeWidthByElement(el)) || DEFAULT_STROKE_WIDTH;
  } catch (e) {
    strokeWidth = DEFAULT_STROKE_WIDTH;
  }

  let strokeStyle: StrokeStyleOption;
  try {
    const raw = getDrawStrokeStyleByElement(board, el);
    strokeStyle =
      raw === 'dashed' || raw === 'dotted' || raw === 'solid' ? raw : DEFAULT_STROKE_STYLE;
  } catch (e) {
    strokeStyle = DEFAULT_STROKE_STYLE;
  }

  // opacity 是元素自有字段，无需走 Plait 的默认值计算
  const rawOpacity = (el as { opacity?: number }).opacity;
  const opacity = typeof rawOpacity === 'number' ? rawOpacity : DEFAULT_OPACITY;

  // 批次 2 按元素类型分流读取：图形取 shape/angle，箭头线取走线+端点，矢量线取形态。
  // Plait 枚举值恒与本地字面量联合一一对应，`as unknown as` 仅为绕过枚举名义类型断言。
  let shape: GeometryShapes | null = null;
  let angle = 0;
  let arrowLineShape: ArrowLineShapeOption | null = null;
  let sourceMarker: ArrowLineMarkerOption | null = null;
  let targetMarker: ArrowLineMarkerOption | null = null;
  let vectorLineShape: VectorLineShapeOption | null = null;

  try {
    if (PlaitDrawElement.isGeometry(el)) {
      shape = (el as PlaitGeometry).shape;
      angle = getAngleByElement(el) || 0;
    } else if (PlaitDrawElement.isArrowLine(el)) {
      const line = el as PlaitArrowLine;
      arrowLineShape = line.shape as unknown as ArrowLineShapeOption;
      sourceMarker = line.source.marker as unknown as ArrowLineMarkerOption;
      targetMarker = line.target.marker as unknown as ArrowLineMarkerOption;
    } else if (PlaitDrawElement.isVectorLine(el)) {
      vectorLineShape = (el as PlaitVectorLine).shape as unknown as VectorLineShapeOption;
    }
  } catch (e) {}

  return {
    fill,
    strokeColor,
    strokeWidth,
    strokeStyle,
    opacity,
    shape,
    angle,
    arrowLineShape,
    sourceMarker,
    targetMarker,
    vectorLineShape,
    ...readDrawTextMarks(el),
  };
}

/**
 * 读取 draw 元素的文字样式 mark。
 *
 * 与导图的差异仅在取值入口：导图是 `element.data.topic`，draw 是 `element.text`，
 * 两者都是 Slate 的 `ParagraphElement`，因此展平与汇总逻辑完全一致。
 * 字号无显式 mark 时回退 draw 的统一默认字号（导图是按根/子分 18 / 14）。
 */
function readDrawTextMarks(element: PlaitElement): {
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
    const text = (element as { text?: unknown }).text;
    if (text) {
      const align = (text as { align?: string }).align;
      if (align === 'left' || align === 'center' || align === 'right') {
        textAlign = align;
      }
      for (const [node] of SlateNode.texts(text as never)) {
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
  } catch (e) {}

  return {
    bold,
    italic,
    underlined,
    textColor,
    fontSize: fontSizeMark ?? DRAW_DEFAULT_FONT_SIZE,
    textAlign,
  };
}

// ---------------------------------------------------------------------------
// 画板分支：选中包围盒（工具栏定位）
// ---------------------------------------------------------------------------

/**
 * 计算全部选中 draw 元素的联合包围盒（viewBox 坐标系）。
 *
 * draw 元素没有导图的 `MindElement.getNode()` 布局节点，但它们的 `points`
 * 就是权威几何数据（resize / 拖移都会实时写回 points），因此直接把所有选中
 * 元素的 points 汇总后交给 `RectangleClient.getRectangleByPoints` 求外接矩形。
 *
 * 已知近似：旋转过的图形（`angle` 非 0）返回的是**未旋转**的包围盒，
 * 工具栏可能略微偏移。旋转角本身在批次 2 才引入，届时一并处理。
 */
export function getDrawSelectionRectangle(
  board: PlaitBoard,
): { x: number; y: number; width: number; height: number } | null {
  const elements = getSelectedDrawElements(board);
  if (elements.length === 0) return null;
  const points = elements.flatMap((element) => (element as { points?: number[][] }).points ?? []);
  if (points.length === 0) return null;
  try {
    return RectangleClient.getRectangleByPoints(points as never);
  } catch (e) {
    return null;
  }
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

/**
 * Board Style Toolbar - Plait 样式写操作封装
 *
 * 统一封装对 Plait board 的所有节点样式修改 API，供各能力组下拉面板调用。
 * 调用后 Plait 自动触发 `onValueChange` → 走现有防抖回写，持久化零改动。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次2：形状/填充/描边写操作封装              | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §3.2 |
 * | v1.0.1 | 移除「直角矩形」映射（Plait 无此形状）       | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.1.0 | 批次3：连线结构/布局方向/分支宽色写操作      | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次3 |
 * | v1.1.1 | 分支样式（形状/宽/色）改为应用到整棵树        | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次3 |
 * | v1.2.0 | 批次4：文字样式（粗/斜/字号/字色）写操作     | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次4 |
 * | v1.3.0 | 新增画板写操作（填充/描边/线型/不透明度）；文字写操作改为形态无关 | REQ: 20261027-board-whiteboard-draw §3.8 |
 * | v1.4.0 | 新增画板写操作（图形切换/箭头线端点走线/矢量线形态/旋转） | REQ: 20261027-board-whiteboard-draw §3.7 / §3.8 |
 * /@changelog
 *
 * @author hhhuilli
 */

import {
  degreesToRadians,
  getAngleByElement,
  getSelectedElements,
  normalizeAngle,
  PlaitBoard,
  rotateElements,
  Transforms,
} from '@plait/core';
import {
  MindTransforms,
  MindElementShape,
  BranchShape,
  MindElement,
  getDefaultFontSizeForMindElement,
} from '@plait/mind';
import { PropertyTransforms, StrokeStyle, getTextEditorsByElement } from '@plait/common';
import { DrawTransforms, PlaitDrawElement, getMemorizeKey } from '@plait/draw';
import type {
  ArrowLineHandleKey,
  ArrowLineMarkerType,
  ArrowLineShape,
  GeometryShapes,
  VectorLineShape,
} from '@plait/draw';
import { Editor, Transforms as SlateTransforms } from 'slate';

import { isMindElement } from './types';
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
import { COLOR_NONE, DRAW_DEFAULT_FONT_SIZE } from './constants';

// ---------------------------------------------------------------------------
// 节点形状
// ---------------------------------------------------------------------------

/**
 * 设置选中节点的形状。
 *
 * Plait 节点形状仅有 2 种枚举（MindElementShape）：
 * - `underline` → `MindElementShape.underline`
 * - `round-rectangle` → `MindElementShape.roundRectangle`
 */
export function applyShape(board: PlaitBoard, shape: ShapeOption): void {
  const plaitShape =
    shape === 'underline' ? MindElementShape.underline : MindElementShape.roundRectangle;
  MindTransforms.setShape(board, plaitShape);
}

// ---------------------------------------------------------------------------
// 节点填充
// ---------------------------------------------------------------------------

/**
 * 设置选中节点的填充颜色。
 *
 * @param color 十六进制色值，传 `null` 清除自定义填充（恢复默认）
 */
export function applyFillColor(board: PlaitBoard, color: string | null): void {
  PropertyTransforms.setFillColor(board, color, {});
}

// ---------------------------------------------------------------------------
// 节点描边
// ---------------------------------------------------------------------------

/**
 * 设置选中节点的描边颜色。
 *
 * @param color 十六进制色值，传 `null` 清除自定义描边色
 */
export function applyStrokeColor(board: PlaitBoard, color: string | null): void {
  PropertyTransforms.setStrokeColor(board, color, {});
}

/**
 * 设置选中节点的描边宽度。
 */
export function applyStrokeWidth(board: PlaitBoard, width: number): void {
  PropertyTransforms.setStrokeWidth(board, width, {});
}

// ---------------------------------------------------------------------------
// 分支样式（曲线/折线、配色、宽度）—— 应用到整棵树
// ---------------------------------------------------------------------------

/**
 * 将分支样式属性应用到整棵思维导图的所有节点（根 + 全部后代）。
 *
 * Plait 的 `branchShape`/`branchWidth`/`branchColor` 是「父节点」属性，
 * 决定「父节点 → 其子节点」的连线外观。仅设置选中节点时，只会影响
 * 选中节点作为父节点时连接其子节点的连线；用户期望统一整棵树的连线样式，
 * 因此这里遍历所有节点逐一写入。
 *
 * `Transforms.setNode` 对 `null` 值执行「移除属性」，正好用于清除
 * `branchColor` 使其回退到默认主题色。
 */
function applyBranchPropertyToAll(
  board: PlaitBoard,
  key: 'branchShape' | 'branchWidth' | 'branchColor',
  value: BranchShape | number | string | null,
): void {
  const selected = getSelectedElements(board).filter(isMindElement);
  if (selected.length === 0) return;
  const root = MindElement.getRoot(board, selected[0] as MindElement);
  const walk = (element: MindElement): void => {
    const path = PlaitBoard.findPath(board, element);
    const props = { [key]: value } as Parameters<typeof Transforms.setNode>[1];
    Transforms.setNode(board, props, path);
    (element.children ?? []).forEach((child) => walk(child as MindElement));
  };
  walk(root as MindElement);
}

/**
 * 设置整棵树的连线结构（曲线 / 折线）。
 *
 * Plait `BranchShape` 仅 2 种枚举：`bight`（曲线）、`polyline`（折线）。
 */
export function applyBranchShape(board: PlaitBoard, branchShape: BranchShapeOption): void {
  const plaitBranchShape = branchShape === 'bight' ? BranchShape.bight : BranchShape.polyline;
  applyBranchPropertyToAll(board, 'branchShape', plaitBranchShape);
}

// ---------------------------------------------------------------------------
// 分支布局方向
// ---------------------------------------------------------------------------

/**
 * 设置选中节点的布局方向（右/左/上/下）。
 *
 * `MindLayoutType` 定义在 `@plait/layouts`（传递依赖，未从 `@plait/mind` 导出），
 * 其枚举值与字符串字面量一致，运行时等价。这里以断言传入对应的方向字符串。
 */
export function applyLayout(board: PlaitBoard, layout: LayoutDirectionOption): void {
  MindTransforms.setLayout(
    board,
    layout as unknown as Parameters<typeof MindTransforms.setLayout>[1],
  );
}

// ---------------------------------------------------------------------------
// 分支宽度 / 颜色
// ---------------------------------------------------------------------------

/**
 * 设置整棵树的分支连线宽度。
 */
export function applyBranchWidth(board: PlaitBoard, width: number): void {
  applyBranchPropertyToAll(board, 'branchWidth', width);
}

/**
 * 设置整棵树的分支连线颜色。
 *
 * `Transforms.setNode` 对 `null` 值执行「移除属性」，因此传 `null` 时
 * 所有节点的 `branchColor` 被移除，`getBranchColorByMindElement` 回退到
 * 描边色/默认主题色。
 *
 * @param color 十六进制色值，传 `null` 清除自定义分支色（恢复默认）
 */
export function applyBranchColor(board: PlaitBoard, color: string | null): void {
  applyBranchPropertyToAll(board, 'branchColor', color);
}

// ---------------------------------------------------------------------------
// 画板（draw 元素）样式写操作
// ---------------------------------------------------------------------------

/**
 * draw 元素的样式写入选项。
 *
 * `getMemorizeKey` 来自 `@plait/draw`：`PropertyTransforms.setProperty` 会用它
 * 把本次写入的属性记进 Plait 的「最近样式」缓存，使**随后新建的图形自动继承**
 * 刚设置的填充/描边（与 Plait 自身应用的行为一致）。不传则每次新建都回落默认样式。
 *
 * 导图侧刻意不传该选项（保持已交付行为不变），故此处单独定义而非抽公共。
 */
const DRAW_PROPERTY_OPTIONS = { getMemorizeKey };

/**
 * 设置选中 draw 元素的填充色。
 *
 * @param color 十六进制色值，传 `null` 清除自定义填充（恢复主题默认）
 */
export function applyDrawFillColor(board: PlaitBoard, color: string | null): void {
  PropertyTransforms.setFillColor(board, color, DRAW_PROPERTY_OPTIONS);
}

/**
 * 设置选中 draw 元素的描边色。
 *
 * @param color 十六进制色值，传 `null` 清除自定义描边色
 */
export function applyDrawStrokeColor(board: PlaitBoard, color: string | null): void {
  PropertyTransforms.setStrokeColor(board, color, DRAW_PROPERTY_OPTIONS);
}

/** 设置选中 draw 元素的描边宽度 */
export function applyDrawStrokeWidth(board: PlaitBoard, width: number): void {
  PropertyTransforms.setStrokeWidth(board, width, DRAW_PROPERTY_OPTIONS);
}

/**
 * 设置选中 draw 元素的描边线型（实线 / 虚线 / 点线）。
 *
 * 业务侧用字面量联合类型表达，这里映射到 `@plait/common` 的 `StrokeStyle` 枚举。
 */
export function applyDrawStrokeStyle(board: PlaitBoard, style: StrokeStyleOption): void {
  const plaitStyle =
    style === 'dashed'
      ? StrokeStyle.dashed
      : style === 'dotted'
        ? StrokeStyle.dotted
        : StrokeStyle.solid;
  PropertyTransforms.setStrokeStyle(board, plaitStyle, DRAW_PROPERTY_OPTIONS);
}

/**
 * 设置选中 draw 元素的不透明度。
 *
 * `opacity` 没有专门的 PropertyTransforms 方法，走通用 `setProperty`
 * （底层为 `Transforms.setNode`，与填充/描边同一条持久化链路）。
 *
 * @param opacity 0~1 的数值
 */
export function applyOpacity(board: PlaitBoard, opacity: number): void {
  PropertyTransforms.setProperty(board, { opacity }, DRAW_PROPERTY_OPTIONS);
}

// ---------------------------------------------------------------------------
// 画板（draw 元素）批次 2 写操作：图形切换 / 箭头线端点与走线 / 矢量线形态 / 旋转
// ---------------------------------------------------------------------------

/**
 * 切换选中图形的类型（同类图形间切换，不丢失文本与位置）。
 *
 * `switchGeometryShape` 内部仅对「非 text 图形」执行 `setNode({ shape })`，
 * points / text / fill / angle 等其余字段原样保留；text 图形会被跳过。
 */
export function applyGeometryShape(board: PlaitBoard, shape: GeometryShapes): void {
  DrawTransforms.switchGeometryShape(board, shape);
}

/**
 * 设置选中箭头线的走线形态（直线 / 曲线 / 折线）。
 *
 * 本地字面量联合 `ArrowLineShapeOption` 的值与 `ArrowLineShape` 枚举字符串值
 * 一一对应，此处断言仅为绕过枚举名义类型。
 */
export function applyArrowLineShape(board: PlaitBoard, shape: ArrowLineShapeOption): void {
  DrawTransforms.setArrowLineShape(board, { shape: shape as unknown as ArrowLineShape });
}

/**
 * 设置选中箭头线某个端点（源 / 目标）的标记。
 *
 * @param handleKey 端点键（`source` / `target`）
 * @param marker    端点标记（9 种之一）
 */
export function applyArrowLineMark(
  board: PlaitBoard,
  handleKey: ArrowLineHandleKey,
  marker: ArrowLineMarkerOption,
): void {
  DrawTransforms.setArrowLineMark(board, handleKey, marker as unknown as ArrowLineMarkerType);
}

/**
 * 设置选中矢量线的形态（直线段 / 曲线段）。
 */
export function applyVectorLineShape(board: PlaitBoard, shape: VectorLineShapeOption): void {
  DrawTransforms.setVectorLineShape(board, { shape: shape as unknown as VectorLineShape });
}

/**
 * 将选中图形旋转到指定绝对角度（度）。
 *
 * Plait 没有「直接设置绝对角度」的公开 API，`rotateElements` 是**相对旋转**
 * （绕选中包围盒中心旋转 points 并在原 angle 上累加 delta）。因此这里先取首个
 * 选中元素当前角度，算出 `delta = normalizeAngle(target - current)` 再调用。
 * 多选时沿用内置旋转手柄语义：所有元素按同一 delta 旋转。
 */
export function applyRotation(board: PlaitBoard, angleDeg: number): void {
  const elements = getSelectedElements(board).filter(PlaitDrawElement.isGeometry);
  if (elements.length === 0) return;
  const target = degreesToRadians(angleDeg);
  const current = getAngleByElement(elements[0]) || 0;
  const delta = normalizeAngle(target - current);
  rotateElements(board, elements, delta);
}

// ---------------------------------------------------------------------------
// 颜色工具函数
// ---------------------------------------------------------------------------

/** 解析颜色值：COLOR_NONE 标记 → null，其他原样返回 */
export function resolveColor(value: string): string | null {
  return value === COLOR_NONE ? null : value;
}

// ---------------------------------------------------------------------------
// 文字样式（粗体 / 斜体 / 字号 / 字色）
// ---------------------------------------------------------------------------

/**
 * 收集当前选中元素对应的 Slate editor 列表。
 *
 * 导图节点由 `TextManage` 承载主题文本，draw 的图形同样用 `TextManage` 承载
 * 内部文本，两者都能用 `@plait/common` 的 `getTextEditorsByElement` 取到 editor。
 * 因此这里**刻意不按形态过滤元素**：不承载文本的元素（如箭头连线）返回空数组，
 * 天然被跳过。导图模式下选中项只可能是 mind 节点，行为与过滤版完全一致。
 */
function getSelectedTextEditors(board: PlaitBoard): Editor[] {
  const selected = getSelectedElements(board);
  const editors: Editor[] = [];
  selected.forEach((element) => {
    editors.push(...getTextEditorsByElement(element));
  });
  return editors;
}

/**
 * 对单个 editor 选中全文后执行 mark 写操作，并在结束后还原原选中态。
 *
 * 关键点（技术方案 §四批次4 风险点）：节点处于「选中但非文本编辑态」时，
 * `editor.selection` 通常为 null，而 Slate 内置 `Editor.addMark`/`removeMark`
 * 在无选区时是空操作。因此先显式选中全文（`Editor.start/end(editor, [])`），
 * 使 mark 以「扩展选区」形式经 `Transforms.setNodes`/`unsetNodes` 落到全部文本节点。
 */
function withFullSelection(editor: Editor, action: () => void): void {
  const prevSelection = editor.selection;
  if (editor.children.length > 0) {
    SlateTransforms.select(editor, {
      anchor: Editor.start(editor, []),
      focus: Editor.end(editor, []),
    });
  }
  try {
    action();
  } finally {
    // 还原原选中态：非编辑态下为 null，编辑态下保留光标位置
    if (prevSelection) {
      SlateTransforms.select(editor, prevSelection);
    } else {
      SlateTransforms.deselect(editor);
    }
  }
}

/** 对多个 editor 统一写入 mark */
function applyMarkToEditors(editors: Editor[], key: string, value: unknown): void {
  editors.forEach((editor) => {
    withFullSelection(editor, () => {
      Editor.addMark(editor, key, value);
    });
  });
}

/** 对多个 editor 统一移除 mark */
function removeMarkFromEditors(editors: Editor[], key: string): void {
  editors.forEach((editor) => {
    withFullSelection(editor, () => {
      Editor.removeMark(editor, key);
    });
  });
}

/**
 * 设置选中节点的文字加粗。
 *
 * `bold` 为 `CustomText` 标准 mark，写入 `true` 开启、移除 mark 关闭。
 */
export function applyBold(board: PlaitBoard, bold: boolean): void {
  const editors = getSelectedTextEditors(board);
  if (bold) {
    applyMarkToEditors(editors, 'bold', true);
  } else {
    removeMarkFromEditors(editors, 'bold');
  }
}

/**
 * 设置选中节点的文字斜体。
 */
export function applyItalic(board: PlaitBoard, italic: boolean): void {
  const editors = getSelectedTextEditors(board);
  if (italic) {
    applyMarkToEditors(editors, 'italic', true);
  } else {
    removeMarkFromEditors(editors, 'italic');
  }
}

/**
 * 设置选中节点的文字下划线。
 *
 * `underlined` 为 `CustomText` 标准 mark（对应 `MarkTypes.underline`），
 * 写入 `true` 开启、移除 mark 关闭。
 */
export function applyUnderline(board: PlaitBoard, underline: boolean): void {
  const editors = getSelectedTextEditors(board);
  if (underline) {
    applyMarkToEditors(editors, 'underlined', true);
  } else {
    removeMarkFromEditors(editors, 'underlined');
  }
}

/**
 * 设置选中节点的文字颜色。
 *
 * `color` 为 `CustomText` 标准 mark，传 `null` 移除 mark 恢复主题默认字色。
 */
export function applyTextColor(board: PlaitBoard, color: string | null): void {
  const editors = getSelectedTextEditors(board);
  if (color) {
    applyMarkToEditors(editors, 'color', color);
  } else {
    removeMarkFromEditors(editors, 'color');
  }
}

/**
 * 设置选中元素的文字字号。
 *
 * 字号以 `CustomText['font-size']` mark 存储（运行时为数值）。「目标字号等于该
 * 元素的默认字号时移除 mark」以回到默认，故需按元素分别判定默认值：
 * - 导图：根节点 18 / 子节点 14（`getDefaultFontSizeForMindElement`）
 * - 画板：统一 14（draw 元素无根/子之分）
 *
 * 这样多选根/子节点（或图形）时各自回到正确的默认字号。
 */
export function applyFontSize(board: PlaitBoard, size: number): void {
  const selected = getSelectedElements(board);
  selected.forEach((element) => {
    const editors = getTextEditorsByElement(element);
    if (editors.length === 0) return;
    const defaultSize = isMindElement(element)
      ? getDefaultFontSizeForMindElement(element as MindElement)
      : DRAW_DEFAULT_FONT_SIZE;
    if (size === defaultSize) {
      removeMarkFromEditors(editors, 'font-size');
    } else {
      applyMarkToEditors(editors, 'font-size', size);
    }
  });
}

/**
 * 设置选中节点的文字水平对齐。
 *
 * 对齐不是文字 mark，而是主题段落（`ParagraphElement`）的 `align` 字段，
 * 取值 `Alignment` 枚举（left/center/right）。因此用 `Transforms.setNodes`
 * 直接写入 `at: [0]`（主题段落节点），无需选区。
 */
export function applyTextAlign(board: PlaitBoard, align: TextAlignOption): void {
  const editors = getSelectedTextEditors(board);
  editors.forEach((editor) => {
    // `align` 是 Plait 自定义段落字段，非 Slate 内置 Node 属性，故需断言绕过类型约束
    SlateTransforms.setNodes(editor, { align } as never, { at: [0] });
  });
}

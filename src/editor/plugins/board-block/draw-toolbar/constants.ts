/**
 * Board Draw Toolbar - 常量与工具项定义
 *
 * 集中维护创建工具条的 CSS 前缀、工具项清单与符号中文名映射。
 *
 * 清单的来源约定：
 * 基础图形 / 流程图 / UML 符号的 pointer 清单一律从 `@plait/draw` 的
 * `getBasicPointers()` / `getFlowchartPointers()` / `getUMLPointers()` 动态获取，
 * 本文件只维护「pointer → 中文名」的映射，不手工维护清单本身，以免与包升级脱节。
 * 缩略图亦不手工维护：由 `shape-panel` 调 `drawGeometry` 实时渲染真实图形。
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                                      |
 * | v1.0.0 | 初始实现：选择 / 手型 / 矩形 三工具项 | REQ: 20261027-board-whiteboard-draw §3.4  |
 * | v1.1.0 | 矩形替换为「图形」弹出面板；新增连线工具与三分类定义 | REQ: 20261027-board-whiteboard-draw §3.5 / §3.6 |
 * | v1.2.0 | 新增矢量线工具项；缩略图尺寸常量移至共享 shape-thumbnail.ts | REQ: 20261027-board-whiteboard-draw §3.7 |
 * | v1.2.1 | 工具名称「矢量线」更名「矢量绘图」 | REQ: 20261027-board-whiteboard-draw §3.7 |
 * | v1.3.0 | 开启流程图分类并补齐 24 种符号中文名 | REQ: 20261027-board-whiteboard-draw §3.10 |
 * | v1.4.0 | 开启 UML 分类并补齐 21 种符号中文名 | REQ: 20261027-board-whiteboard-draw §3.11 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { PlaitPointerType } from '@plait/core';
import {
  ArrowLineShape,
  BasicShapes,
  FlowchartSymbols,
  UMLSymbols,
  VectorLinePointerType,
  getBasicPointers,
  getFlowchartPointers,
  getUMLPointers,
} from '@plait/draw';

import { DRAW_ICONS } from './icons';
import type { DrawToolItem, ShapeCategory } from './types';

/** CSS 类名前缀 */
export const DRAW_TOOLBAR_PREFIX = 'lanismd-board-draw-toolbar';

/**
 * 指针类工具项：选择 / 手型。
 *
 * 与 `canvas-toolbar` 的手型按钮功能重叠但语义不同：这里是「创建什么」的
 * 起点选择器，手型与选择作为「不创建任何元素」的两个基础态列在最上方，
 * 使整条工具条的高亮状态与 `board.pointer` 形成完备的一一映射。
 */
export const POINTER_TOOLS: DrawToolItem[] = [
  {
    pointer: PlaitPointerType.selection,
    modifier: 'selection',
    title: '选择',
    icon: DRAW_ICONS.selection,
  },
  {
    pointer: PlaitPointerType.hand,
    modifier: 'hand',
    title: '拖拽画布',
    icon: DRAW_ICONS.hand,
  },
];

// ---------------------------------------------------------------------------
// 图形分类（网格面板的 tab 框架）
// ---------------------------------------------------------------------------

/**
 * 图形分类定义。
 *
 * 三个分类的 tab 框架在批次 1 一次搭完，批次 3 开启流程图分类、批次 4 开启
 * UML 分类，面板结构无需再改（仅需维护 `SHAPE_NAMES` 中文名映射）。
 */
export const SHAPE_CATEGORIES: readonly ShapeCategory[] = [
  {
    id: 'basic',
    label: '基础',
    pointers: getBasicPointers(),
    enabled: true,
  },
  {
    id: 'flowchart',
    label: '流程图',
    pointers: getFlowchartPointers(),
    enabled: true,
  },
  {
    id: 'uml',
    label: 'UML',
    pointers: getUMLPointers(),
    enabled: true,
  },
];

/**
 * 符号中文名映射（pointer → 中文名）。
 *
 * 覆盖 `BasicShapes` 21 项、`FlowchartSymbols` 24 项与 `UMLSymbols` 21 项。
 * 未命中的 pointer 由 `getShapeLabel` 回落为 pointer 原文，保证新增图形不会显示为空白。
 */
export const SHAPE_NAMES: Readonly<Record<string, string>> = {
  [BasicShapes.rectangle]: '矩形',
  [BasicShapes.roundRectangle]: '圆角矩形',
  [BasicShapes.ellipse]: '椭圆',
  [BasicShapes.diamond]: '菱形',
  [BasicShapes.parallelogram]: '平行四边形',
  [BasicShapes.text]: '文本',
  [BasicShapes.triangle]: '三角形',
  [BasicShapes.leftArrow]: '左箭头',
  [BasicShapes.trapezoid]: '梯形',
  [BasicShapes.rightArrow]: '右箭头',
  [BasicShapes.cross]: '十字',
  [BasicShapes.star]: '星形',
  [BasicShapes.pentagon]: '五边形',
  [BasicShapes.hexagon]: '六边形',
  [BasicShapes.octagon]: '八边形',
  [BasicShapes.pentagonArrow]: '五边箭头',
  [BasicShapes.processArrow]: '流程箭头',
  [BasicShapes.twoWayArrow]: '双向箭头',
  [BasicShapes.comment]: '批注',
  [BasicShapes.roundComment]: '圆角批注',
  [BasicShapes.cloud]: '云朵',

  // 流程图符号（24 种）
  [FlowchartSymbols.process]: '处理',
  [FlowchartSymbols.decision]: '判定',
  [FlowchartSymbols.data]: '数据',
  [FlowchartSymbols.connector]: '连接点',
  [FlowchartSymbols.terminal]: '终止',
  [FlowchartSymbols.manualInput]: '手动输入',
  [FlowchartSymbols.preparation]: '准备',
  [FlowchartSymbols.manualLoop]: '手动循环',
  [FlowchartSymbols.merge]: '合并',
  [FlowchartSymbols.delay]: '延时',
  [FlowchartSymbols.storedData]: '已存数据',
  [FlowchartSymbols.or]: '或',
  [FlowchartSymbols.summingJunction]: '汇总连接',
  [FlowchartSymbols.predefinedProcess]: '预定义处理',
  [FlowchartSymbols.offPage]: '跨页连接',
  [FlowchartSymbols.document]: '文档',
  [FlowchartSymbols.multiDocument]: '多文档',
  [FlowchartSymbols.database]: '数据库',
  [FlowchartSymbols.hardDisk]: '硬盘',
  [FlowchartSymbols.internalStorage]: '内部存储',
  [FlowchartSymbols.noteCurlyRight]: '右花括号注释',
  [FlowchartSymbols.noteCurlyLeft]: '左花括号注释',
  [FlowchartSymbols.noteSquare]: '方括号注释',
  [FlowchartSymbols.display]: '显示',

  // UML 符号（21 种）
  [UMLSymbols.actor]: '角色',
  [UMLSymbols.useCase]: '用例',
  [UMLSymbols.container]: '容器',
  [UMLSymbols.note]: '注释',
  [UMLSymbols.simpleClass]: '简单类',
  [UMLSymbols.activityClass]: '活动类',
  [UMLSymbols.branchMerge]: '分支合并',
  [UMLSymbols.port]: '端口',
  [UMLSymbols.package]: '包',
  [UMLSymbols.combinedFragment]: '组合片段',
  [UMLSymbols.class]: '类',
  [UMLSymbols.interface]: '接口',
  [UMLSymbols.object]: '对象',
  [UMLSymbols.component]: '组件',
  [UMLSymbols.componentBox]: '组件框',
  [UMLSymbols.template]: '模板',
  [UMLSymbols.activation]: '激活',
  [UMLSymbols.deletion]: '销毁',
  [UMLSymbols.assembly]: '组装',
  [UMLSymbols.providedInterface]: '提供接口',
  [UMLSymbols.requiredInterface]: '需求接口',
};

/** 取 pointer 的中文显示名；未配置时回落 pointer 原文 */
export function getShapeLabel(pointer: string): string {
  return SHAPE_NAMES[pointer] ?? pointer;
}

// ---------------------------------------------------------------------------
// 箭头连线
// ---------------------------------------------------------------------------

/**
 * 箭头连线的三种走线。
 *
 * 清单刻意不用 `getArrowLinePointers()`：该函数返回 `Object.keys(ArrowLineShape)`，
 * 顺序与中文名需一一对应，这里显式枚举以保证面板顺序稳定且图标不会错位。
 */
export const ARROW_LINE_TOOLS: readonly DrawToolItem[] = [
  {
    pointer: ArrowLineShape.straight,
    modifier: 'line-straight',
    title: '直线',
    icon: DRAW_ICONS.lineStraight,
  },
  {
    pointer: ArrowLineShape.curve,
    modifier: 'line-curve',
    title: '曲线',
    icon: DRAW_ICONS.lineCurve,
  },
  {
    pointer: ArrowLineShape.elbow,
    modifier: 'line-elbow',
    title: '折线',
    icon: DRAW_ICONS.lineElbow,
  },
];

/** 连线工具的默认走线（首次点击「连线」按钮时生效） */
export const DEFAULT_ARROW_LINE_SHAPE: string = ArrowLineShape.straight;

// ---------------------------------------------------------------------------
// 矢量线（多边形）
// ---------------------------------------------------------------------------

/**
 * 矢量线工具项。
 *
 * 单个按钮、无弹出面板：`@plait/draw` 的 `withVectorLineCreateByDraw` 在创建时
 * **硬编码为直线段**，曲线段只能创建后经样式工具栏切换（PRD Q: vector_line_entry），
 * 因此创建工具条无需提供「直线段 / 曲线段」选择。
 */
export const VECTOR_LINE_TOOL: DrawToolItem = {
  pointer: VectorLinePointerType.vectorLine,
  modifier: 'vector-line',
  title: '矢量绘图（连续点击绘制，双击 / Esc 结束）',
  icon: DRAW_ICONS.vectorLine,
};

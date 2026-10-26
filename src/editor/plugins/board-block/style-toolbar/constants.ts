/**
 * Board Style Toolbar - 常量定义
 *
 * 主题色板、默认色板、节点形状/描边默认值等。
 * 取色面板的色板数据来源于 Plait `MindThemeColors` 映射 + 固定默认配色。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次2：主题/默认色板 + 形状/描边常量         | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.0.1 | 移除「直角矩形」选项（Plait 无此节点形状）   | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.1.0 | 批次3：连线结构/布局方向/分支宽度常量        | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次3 |
 * | v1.2.0 | 批次4：文字字号档位常量                       | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次4 |
 * /@changelog
 *
 * @author hhhuilli
 */

/** CSS 类名前缀（style-toolbar 子模块） */
export const PREFIX = 'lanismd-board-style-toolbar';

// ---------------------------------------------------------------------------
// 取色面板 - 主题配色基础色（无色 + 黑 + 白，排在 branchColors 前面）
// ---------------------------------------------------------------------------

/** 「无颜色」占位标记（UI 上显示斜线圆圈，传 null 给 Plait 清除自定义色） */
export const COLOR_NONE = '__none__';

/** 主题配色 Tab 中固定的前置基础色 */
export const THEME_BASE_COLORS: readonly string[] = [COLOR_NONE, '#000000', '#ffffff'];

// ---------------------------------------------------------------------------
// 取色面板 - 默认配色（固定，与主题无关）
// ---------------------------------------------------------------------------

/** 默认配色 Tab 第 1 行：淡色 */
export const DEFAULT_COLORS_LIGHT: readonly string[] = [
  '#f5f5f5', // 浅灰/白
  '#fce4d6', // 浅桃
  '#fef3cd', // 浅黄
  '#d9d2f0', // 浅紫
  '#fce4ec', // 浅粉
  '#d4f4f4', // 浅青
];

/** 默认配色 Tab 第 2 行：饱和色 */
export const DEFAULT_COLORS_DARK: readonly string[] = [
  '#000000', // 黑
  '#c10534', // 深红
  '#f5d623', // 黄
  '#2563eb', // 蓝
  '#4a148c', // 深紫
  '#6b8e23', // 橄榄绿
];

// ---------------------------------------------------------------------------
// 色彩梯度 - HSL 明度插值
// ---------------------------------------------------------------------------

/** 色彩梯度的档位数 */
export const GRADIENT_STEPS = 6;

/**
 * 从 0（最亮）到 5（最暗）的 HSL 明度分布。
 * 用于在选中某主色后生成 6 级明度梯度。
 */
export const GRADIENT_LIGHTNESS: readonly number[] = [0.92, 0.78, 0.62, 0.48, 0.35, 0.22];

// ---------------------------------------------------------------------------
// 节点形状
// ---------------------------------------------------------------------------

/** 形状选项 ID（与 Plait MindElementShape 枚举值对齐） */
export type ShapeOption = 'underline' | 'round-rectangle';

export interface ShapeItem {
  id: ShapeOption;
  label: string;
}

/** 节点形状选项列表（与下拉面板顺序一致） */
export const SHAPE_OPTIONS: readonly ShapeItem[] = [
  { id: 'underline', label: '下划线' },
  { id: 'round-rectangle', label: '圆角矩形' },
];

// ---------------------------------------------------------------------------
// 描边默认值
// ---------------------------------------------------------------------------

/** 描边宽度默认值 */
export const DEFAULT_STROKE_WIDTH = 2;

/** 描边宽度范围 */
export const MIN_STROKE_WIDTH = 0;
export const MAX_STROKE_WIDTH = 10;

// ---------------------------------------------------------------------------
// 连线结构（BranchShape）
// ---------------------------------------------------------------------------

/** 连线结构选项 ID（与 Plait BranchShape 枚举值对齐：bight 曲线 / polyline 折线） */
export type BranchShapeOption = 'bight' | 'polyline';

export interface BranchShapeItem {
  id: BranchShapeOption;
  label: string;
}

/** 连线结构选项列表（与下拉面板顺序一致） */
export const BRANCH_SHAPE_OPTIONS: readonly BranchShapeItem[] = [
  { id: 'bight', label: '曲线' },
  { id: 'polyline', label: '折线' },
];

// ---------------------------------------------------------------------------
// 分支布局方向（MindLayoutType 的 4 个逻辑方向）
// ---------------------------------------------------------------------------

/**
 * 布局方向选项 ID。
 *
 * 与 `@plait/layouts` 的 `MindLayoutType` 字符串值一致（right/left/upward/downward）。
 * 由于 `MindLayoutType` 定义在传递依赖 `@plait/layouts` 中、未从 `@plait/mind` 导出，
 * 业务侧以字符串字面量等价表示。
 */
export type LayoutDirectionOption = 'right' | 'left' | 'upward' | 'downward';

export interface LayoutDirectionItem {
  id: LayoutDirectionOption;
  label: string;
}

/** 布局方向选项列表（右/左/上/下，与下拉面板顺序一致） */
export const LAYOUT_DIRECTION_OPTIONS: readonly LayoutDirectionItem[] = [
  { id: 'right', label: '右侧' },
  { id: 'left', label: '左侧' },
  { id: 'upward', label: '上方' },
  { id: 'downward', label: '下方' },
];

// ---------------------------------------------------------------------------
// 分支宽度默认值
// ---------------------------------------------------------------------------

/** 分支连线宽度默认值（对齐 Plait STROKE_WIDTH） */
export const DEFAULT_BRANCH_WIDTH = 2;

/** 分支连线宽度范围 */
export const MIN_BRANCH_WIDTH = 0;
export const MAX_BRANCH_WIDTH = 10;

// ---------------------------------------------------------------------------
// 取色面板 - 每行色块数
// ---------------------------------------------------------------------------

/** 色块每行数量 */
export const COLORS_PER_ROW = 6;

// ---------------------------------------------------------------------------
// 文字样式 - 字号档位
// ---------------------------------------------------------------------------

/**
 * 字号档位（px），与 Plait `FontSizes` 枚举值对齐。
 *
 * 文字字号 mark 存储于 `CustomText['font-size']`，写入为数值。
 * 根节点默认字号 18、子节点默认 14（由 `getDefaultFontSizeForMindElement` 决定），
 * 选择档位等于节点默认字号时移除 mark 以回退默认。
 */
export const FONT_SIZE_OPTIONS: readonly number[] = [
  12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48,
];

// ---------------------------------------------------------------------------
// 文字样式 - 水平对齐
// ---------------------------------------------------------------------------

/** 水平对齐选项 ID（与 Plait `Alignment` 枚举值对齐：left/center/right） */
export type TextAlignOption = 'left' | 'center' | 'right';

export interface TextAlignItem {
  id: TextAlignOption;
  label: string;
}

/** 水平对齐选项列表（与下拉面板顺序一致） */
export const TEXT_ALIGN_OPTIONS: readonly TextAlignItem[] = [
  { id: 'left', label: '左对齐' },
  { id: 'center', label: '居中' },
  { id: 'right', label: '右对齐' },
];

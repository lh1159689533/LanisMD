/**
 * Board Style Toolbar - SVG 图标集
 *
 * 工具栏按钮与下拉面板所需的 SVG 图标。
 * 所有图标返回 SVG 字符串（innerHTML），由调用方注入到按钮 DOM。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次2：形状/填充/描边图标                    | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.0.1 | 移除「直角矩形」图标                        | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * | v1.1.0 | 批次3：连线结构/布局方向图标                 | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次3 |
 * | v1.2.0 | 批次4：文字样式（粗体/斜体/A）图标           | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次4 |
 * /@changelog
 *
 * @author hhhuilli
 */

// ---------------------------------------------------------------------------
// 节点形状图标（下拉面板内的 3 个选项）
// ---------------------------------------------------------------------------

/** 下划线形状 */
export const ICON_SHAPE_UNDERLINE = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <line x1="3" y1="16" x2="17" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

/** 圆角矩形形状（也作为工具栏触发按钮图标） */
export const ICON_SHAPE_ROUND_RECT = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="5" width="14" height="10" rx="4" stroke="currentColor" stroke-width="1.5" fill="none"/>
</svg>`;

// ---------------------------------------------------------------------------
// 节点填充图标（实心圆，颜色动态替换）
// ---------------------------------------------------------------------------

/** 节点填充 —— 工具栏按钮图标（实心圆带描边环，fill 属性由调用方动态设置；描边环保证浅色/默认填充下依然可见） */
export const ICON_FILL = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="10" cy="10" r="7" fill="currentColor" stroke="#b8bcc0" stroke-width="1.5"/>
</svg>`;

// ---------------------------------------------------------------------------
// 节点描边图标（空心圆，stroke 颜色动态替换）
// ---------------------------------------------------------------------------

/** 节点描边 —— 工具栏按钮图标（空心圆，stroke 属性由调用方动态设置） */
export const ICON_STROKE = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="2.5" fill="none"/>
</svg>`;

// ---------------------------------------------------------------------------
// 取色面板 - 无颜色图标（斜线圆圈）
// ---------------------------------------------------------------------------

/** 无颜色 —— 斜线穿过的圆圈 */
export const ICON_NO_COLOR = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" stroke="#ccc" stroke-width="1.5" fill="none"/>
  <line x1="5" y1="5" x2="19" y2="19" stroke="#ccc" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

// ---------------------------------------------------------------------------
// 取色面板 - 选中勾号
// ---------------------------------------------------------------------------

/** 选中勾号（色彩梯度内使用） */
export const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ---------------------------------------------------------------------------
// 连线结构图标（分支形状：曲线 / 折线）
// ---------------------------------------------------------------------------

/** 连线结构 —— 曲线（bight），也作为连线结构触发按钮图标 */
export const ICON_BRANCH_BIGHT = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 16 C 8 16, 12 4, 17 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

/** 连线结构 —— 折线（polyline） */
export const ICON_BRANCH_POLYLINE = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 16 L 10 16 L 10 4 L 17 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// ---------------------------------------------------------------------------
// 结构图标（节点结构布局）
// ---------------------------------------------------------------------------

/** 结构 —— 工具栏触发按钮图标（中心节点向上下左右四方向展开） */
export const ICON_STRUCTURE = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="10" cy="10" r="2" fill="currentColor"/>
  <path d="M10 8 V6 M10 12 V14 M8 10 H6 M12 10 H14" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="10" cy="4" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="10" cy="16" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="4" cy="10" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="16" cy="10" r="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

// ---------------------------------------------------------------------------
// 分支图标（分支连线）
// ---------------------------------------------------------------------------

/** 分支 —— 工具栏触发按钮图标（Y 形分叉连线） */
export const ICON_BRANCH = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 3 V10 M10 10 C10 14, 4 14, 4 17 M10 10 C10 14, 16 14, 16 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

/** 布局方向 —— 右侧（根在左，子节点向右展开） */
export const ICON_LAYOUT_RIGHT = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="4" cy="10" r="2" fill="currentColor"/>
  <path d="M6 10 H11" stroke="currentColor" stroke-width="1.5"/>
  <path d="M11 10 V5 H13 M11 10 V15 H13" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="15" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="15" cy="15" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

/** 布局方向 —— 左侧（根在右，子节点向左展开） */
export const ICON_LAYOUT_LEFT = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="10" r="2" fill="currentColor"/>
  <path d="M14 10 H9" stroke="currentColor" stroke-width="1.5"/>
  <path d="M9 10 V5 H7 M9 10 V15 H7" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="5" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="5" cy="15" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

/** 布局方向 —— 上方（根在下，子节点向上展开） */
export const ICON_LAYOUT_UPWARD = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="10" cy="16" r="2" fill="currentColor"/>
  <path d="M10 14 V9" stroke="currentColor" stroke-width="1.5"/>
  <path d="M10 9 H5 V7 M10 9 H15 V7" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="5" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="15" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

/** 布局方向 —— 下方（根在上，子节点向下展开） */
export const ICON_LAYOUT_DOWNWARD = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="10" cy="4" r="2" fill="currentColor"/>
  <path d="M10 6 V11" stroke="currentColor" stroke-width="1.5"/>
  <path d="M10 11 H5 V13 M10 11 H15 V13" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="5" cy="15" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="15" cy="15" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
</svg>`;

// ---------------------------------------------------------------------------
// 文字样式图标（粗体 / 斜体 / A）
// ---------------------------------------------------------------------------

/** 文字样式 —— 工具栏触发按钮图标（字母 A） */
export const ICON_TEXT_STYLE = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 5 L6 15 M10 5 L14 15 M7.2 11.5 H12.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** 粗体 —— 下拉面板内加粗切换按钮 */
export const ICON_BOLD = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M7 4.5 H10.5 A2.5 2.5 0 0 1 10.5 9.5 H7 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M7 9.5 H11 A2.5 2.5 0 0 1 11 14.5 H7 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
</svg>`;

/** 斜体 —— 下拉面板内斜体切换按钮 */
export const ICON_ITALIC = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M11 4 H15 M7 16 H11 M12.5 4 L8.5 16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

/** 下划线 —— 下拉面板内下划线切换按钮 */
export const ICON_UNDERLINE = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 4 V11 A4 4 0 0 0 14 11 V4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M5 16 H15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

// ---------------------------------------------------------------------------
// 水平对齐图标
// ---------------------------------------------------------------------------

/** 左对齐 */
export const ICON_ALIGN_LEFT = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 5 H16 M4 9 H11 M4 13 H16 M4 17 H8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

/** 居中 */
export const ICON_ALIGN_CENTER = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 5 H16 M6 9 H14 M4 13 H16 M7 17 H13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

/** 右对齐 */
export const ICON_ALIGN_RIGHT = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 5 H16 M9 9 H16 M4 13 H16 M12 17 H16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
</svg>`;

/**
 * Board Draw Toolbar - 工具图标
 *
 * 创建工具条的 SVG 图标集。统一 `viewBox="0 0 24 24"`、`stroke="currentColor"`，
 * 由 CSS 控制尺寸与配色，与 `canvas-toolbar/icons.ts` 的约定保持一致。
 *
 * 注意：图形网格面板里的 21 / 24 / 21 个符号缩略图**不在此处维护**，
 * 而是由 `shape-panel` 调 `@plait/draw` 的 `drawGeometry` 实时渲染真实图形，
 * 与包升级永不脱节（见 PRD Q15）。本文件只放工具条按钮级图标。
 *
 * @changelog
 * | 版本   | 变更说明                     | 关联                                      |
 * | v1.0.0 | 初始实现：选择 / 手型 / 矩形  | REQ: 20261027-board-whiteboard-draw §3.4  |
 * | v1.1.0 | 新增图形 / 三种走线 / 角标箭头图标 | REQ: 20261027-board-whiteboard-draw §3.5 / §3.6 |
 * | v1.1.1 | 移除 caret 角标图标：图形 / 连线按钮不再显示小三角 | REQ: 20261027-board-whiteboard-draw §3.5 / §3.6 |
 * | v1.2.0 | 新增矢量线图标 | REQ: 20261027-board-whiteboard-draw §3.7 |
 * | v1.2.1 | 矢量绘图图标更换为设计稿钢笔图标（fill 改 currentColor 适配主题） | REQ: 20261027-board-whiteboard-draw §3.7 |
 * | v1.3.0 | 新增图片图标 | REQ: 20261027-board-whiteboard-draw §3.9 |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 创建工具条图标集 */
export const DRAW_ICONS = {
  /** 选择（箭头指针） */
  selection:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3l7 17 2.5-6.5L20 11z"/></svg>',
  /** 手型（拖拽画布） */
  hand: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
  /** 图形（方 + 圆叠放，表示「一组图形」） */
  shapes:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="11" height="11" rx="1"/><circle cx="16.5" cy="16.5" r="5"/></svg>',
  /** 直线连线 */
  lineStraight:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20L17 6"/><path d="M12 5h6v6"/></svg>',
  /** 曲线连线 */
  lineCurve:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19C3 10 10 5 18 5"/><path d="M13 4.5l5 .5-.5 5"/></svg>',
  /** 折线连线 */
  lineElbow:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h8V6h7"/><path d="M15 3l3 3-3 3"/></svg>',
  /**
   * 矢量绘图（钢笔工具）。
   *
   * 采用用户提供的设计稿图标（iconfont「矢量绘图」，原 viewBox 1024）。
   * viewBox 收紧到笔尖图形的实际包围盒（约 500×500，原 1024 视框中图形只占
   * 中间一半，导致同尺寸下比相邻图标小一圈）；`fill` 改 `currentColor`
   * 以适配亮 / 暗主题。
   */
  vectorLine:
    '<svg width="16" height="16" viewBox="283 246 500 500" xmlns="http://www.w3.org/2000/svg"><path d="M548.928 272.928a56.416 56.416 0 0 1 72.576-0.416l3.84 3.488 122.112 122.112c20.704 20.736 21.92 53.568 3.648 75.712l-3.648 4.032-3.424 3.136a56.48 56.48 0 0 1-60.224 8.256l-51.808 131.072a63.68 63.68 0 0 1-39.104 37.056l-5.44 1.568-254.496 60.608a21.696 21.696 0 0 1-26.688-22.56l0.512-3.296 57.824-257.056a63.744 63.744 0 0 1 33.6-43.008l5.184-2.336 130.816-51.648a56.416 56.416 0 0 1 7.808-59.776l3.488-3.808 3.424-3.136z m15.2 101.44l-144.8 57.28a20.32 20.32 0 0 0-11.392 11.296l-0.992 3.2-41.056 182.304 94.272-94.208a62.944 62.944 0 0 1 8.416-68.224l3.648-3.968a62.816 62.816 0 0 1 88.864-0.128c24.576 24.576 24.384 64.32-0.128 88.864a62.944 62.944 0 0 1-69.376 13.344l-95.904 95.84 181.728-43.2a20.384 20.384 0 0 0 12.8-9.408l1.472-2.944 57.28-145.12L564.16 374.4z m-33.696 118.208a19.456 19.456 0 0 0-27.52 0.128 19.456 19.456 0 0 0-0.128 27.52 19.456 19.456 0 0 0 27.52-0.096 19.456 19.456 0 0 0 0.128-27.52z m64.224-185.92a13.024 13.024 0 0 0-16.352-1.664l-2.048 1.664-1.696 2.048a13.024 13.024 0 0 0-0.064 14.4l1.664 2.016 122.144 122.144a13.024 13.024 0 0 0 16.352 1.664l2.048-1.664 1.696-2.08a13.024 13.024 0 0 0 0.064-14.368l-1.696-2.048-122.112-122.112z" fill="currentColor"/></svg>',
  /** 图片（插入本地图片） */
  image:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
} as const;

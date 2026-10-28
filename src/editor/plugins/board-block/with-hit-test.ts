/**
 * Board Hit Test - 放宽点选命中（宿主 board 插件）
 *
 * 背景（为什么需要本模块）：@plait/draw 的点选命中 `isHitDrawElement` 有一条
 * 严格模式分支——「无文字且未填充」的几何图形内部不参与点选（`isStrict` 默认
 * 恒为 true，来自 @plait/core `getHitElementByPoint` 的默认参数），只有边线
 * 能命中。这是 Plait 的刻意设计：让未填充图形的内部可「穿透」点击，便于选中
 * 被完全覆盖的下层图形。但对本产品而言，用户预期是「点击图形内部空白区也能
 * 选中」（带文字的图形本就如此，无文字图形反而不行，体验割裂）。
 *
 * 实现：包装 `board.isHit`，把 `isStrict` 强制为 false。影响面（已核对源码）：
 * - `board.isHit` 的唯一调用点是 @plait/core 的点选命中管线（点击选中、右键
 *   命中检测），放宽后无文字未填充图形内部可点选；
 * - 框选走 `isRectangleHit` → `isHitElementInside`，不读 `isStrict`，行为不变；
 * - 导图（@plait/mind）的 `isHit` 不读 `isStrict`，不受影响。
 * 重叠场景：内部命中时 `getOneHitElement` 取最上层命中元素；需要选中被完全
 * 覆盖的下层图形时使用框选。
 *
 * 注册约束：必须在 `withDraw` 之后执行（插件链顺序），否则包装不到 draw
 * 定义的 `board.isHit`。
 *
 * @changelog
 * | 版本   | 变更说明                                        | 关联                              |
 * | v1.0.0 | 初始实现：无文字未填充图形内部可点选              | REQ: 20261028-board-interior-hit  |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

/**
 * 放宽点选命中的 board 插件。
 *
 * @param board 画板实例
 */
export function withHitTest(board: PlaitBoard): PlaitBoard {
  const prevIsHit = board.isHit.bind(board);
  board.isHit = (element, point, _isStrict) => prevIsHit(element, point, false);
  return board;
}

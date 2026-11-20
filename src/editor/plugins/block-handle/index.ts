/**
 * Block Handle Plugin
 *
 * Notion 风格的块级操作手柄：
 * - 六点抓手：拖拽改变块顺序；单击弹出块操作菜单（在下方插入/转为/删除）
 * - ＋ 加号：弹出与斜杠命令完全相同的菜单，选中命令后才在当前块下方插入新块
 *
 * 使用 @milkdown/kit/plugin/block 的 BlockProvider 定位手柄。
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                                               |
 * | v1.0.0 | 初始实现：拖拽抓手                             | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * | v1.1.0 | 新增：手柄点击菜单、加号触发斜杠菜单           | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * | v1.2.0 | 加号改为直接弹出悬浮斜杠菜单，不再预先插入空行 | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { ActiveNode } from '@milkdown/kit/plugin/block';
import { BlockProvider, block } from '@milkdown/kit/plugin/block';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';

import { openFloatingSlashMenu } from '../slash-menu';

import { prepareInsertTarget } from './block-actions';
import { createBlockHandle } from './dom';
import { openBlockMenu } from './menu';

export { block };

/** 单击与拖拽的位移阈值（像素）；拖拽本身不会产生 click，这里做二次兜底 */
const CLICK_MOVE_THRESHOLD = 4;

export function configureBlock(ctx: Ctx) {
  const { wrapper: handleEl, addBtn, dragBtn } = createBlockHandle();
  let currentView: EditorView | null = null;
  let blockProvider: BlockProvider | null = null;

  /**
   * ＋ 号与菜单里「在下方插入」共用的逻辑：只弹出斜杠菜单，不动文档。
   * active 由调用方在打开菜单时捕获，避免鼠标移开后 BlockProvider 清空 active。
   */
  const openInsertMenu = (active: ActiveNode, anchor: DOMRect) => {
    if (!currentView) return;
    openFloatingSlashMenu({
      view: currentView,
      anchor,
      prepare: (view) => prepareInsertTarget(view, active),
    });
  };

  // ---- ＋ 号 ----
  // 这里可以安全 preventDefault + stopPropagation：加号不参与拖拽。若让 mousedown
  // 冒泡到根元素，BlockProvider 会建立 NodeSelection 把当前块整块选中。
  addBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!blockProvider?.active) return;
    openInsertMenu(blockProvider.active, addBtn.getBoundingClientRect());
  });

  // ---- 六点抓手 ----
  // 单击打开菜单，拖拽时浏览器不会派发 click，因此不干扰原有排序能力。
  // mousedown 上不做 preventDefault/stopPropagation，保证根元素能收到事件并
  // 建立拖拽所需的 NodeSelection 与 dataTransfer slice。
  let pressPoint: { x: number; y: number } | null = null;
  dragBtn.addEventListener('mousedown', (e) => {
    pressPoint = { x: e.clientX, y: e.clientY };
  });

  dragBtn.addEventListener('click', (e) => {
    const moved =
      pressPoint &&
      (Math.abs(e.clientX - pressPoint.x) > CLICK_MOVE_THRESHOLD ||
        Math.abs(e.clientY - pressPoint.y) > CLICK_MOVE_THRESHOLD);
    pressPoint = null;
    if (moved || !currentView || !blockProvider?.active) return;

    openBlockMenu({
      view: currentView,
      active: blockProvider.active,
      anchor: dragBtn.getBoundingClientRect(),
      onInsertBelow: openInsertMenu,
    });
  });

  ctx.set(block.key, {
    view: (view: EditorView) => {
      currentView = view;

      const provider = new BlockProvider({
        ctx,
        content: handleEl,
        getOffset: () => ({ mainAxis: 16, crossAxis: 0 }),
        getPlacement: ({ active }) => {
          if (active.el) {
            const height = active.el.getBoundingClientRect().height;
            return height > 80 ? 'left-start' : 'left';
          }
          return 'left';
        },
      });

      blockProvider = provider;

      return {
        update: () => {
          provider.update();
        },
        destroy: () => {
          provider.destroy();
          handleEl.remove();
          blockProvider = null;
          currentView = null;
        },
      };
    },
  });
}

/**
 * Block Handle Plugin
 *
 * Notion 风格的块级操作手柄：
 * - ＋（加号）：点击后在当前块后插入新段落并触发 Slash 菜单
 * - ⠿（六点拖拽）：拖拽实现块排序
 *
 * 使用 @milkdown/kit/plugin/block 的 BlockProvider 来定位手柄。
 */

import { BlockProvider } from '@milkdown/kit/plugin/block';
import { block } from '@milkdown/kit/plugin/block';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------

const addIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

const dragIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><circle cx="9" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/><circle cx="9" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/></svg>`;

// ---------------------------------------------------------------------------
// Block Handle DOM 构建器
// ---------------------------------------------------------------------------

function createBlockHandle(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'milkdown-block-handle';

  // Drag handle
  // 说明：此按钮仅作为可视化的"拖拽抓手"，真正的拖拽事件由 Milkdown
  // BlockProvider 在根元素（.milkdown-block-handle）上统一监听并处理。
  // 因此这里不设置 draggable，也不注册 dragstart/dragend，避免子元素
  // 先捕获事件后阻止冒泡，导致 Milkdown 的 dragstart 逻辑（设置
  // view.dragging 与 dataTransfer 的 text/html slice）无法执行，
  // 最终造成"松开鼠标后节点没有移动"的问题。
  const dragBtn = document.createElement('button');
  dragBtn.className = 'milkdown-block-btn milkdown-block-drag';
  dragBtn.innerHTML = dragIcon;
  dragBtn.setAttribute('aria-label', '拖拽移动');
  dragBtn.setAttribute('data-tooltip', '拖拽移动块');
  dragBtn.type = 'button';

  wrapper.appendChild(dragBtn);

  return wrapper;
}

// ---------------------------------------------------------------------------
// Plugin config
// ---------------------------------------------------------------------------

export { block };

export function configureBlock(ctx: Ctx) {
  const handleEl = createBlockHandle();
  let currentView: EditorView | null = null;
  let blockProvider: BlockProvider | null = null;

  // ---- Add button: insert a new paragraph and type "/" ----
  const addBtn = handleEl.querySelector('.milkdown-block-add');
  if (addBtn) {
    addBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (!currentView || !blockProvider) return;
      const active = blockProvider.active;
      if (!active) return;

      const { $pos } = active;
      const { state, dispatch } = currentView;
      const schema = state.schema;

      // Find block boundaries using $pos
      const blockEnd = $pos.end();

      // Insert a new paragraph after the current block
      const paragraph = schema.nodes.paragraph;
      if (!paragraph) return;

      const tr = state.tr.insert(blockEnd + 1, paragraph.create(null, schema.text('/')));
      dispatch(tr.scrollIntoView());

      // Focus and move cursor to end of the "/" text
      setTimeout(() => {
        if (!currentView) return;
        const newState = currentView.state;
        const newPos = blockEnd + 2; // after the paragraph start
        currentView.dispatch(
          newState.tr.setSelection(TextSelection.create(newState.doc, newPos + 1)),
        );
        currentView.focus();
      }, 10);
    });
  }

  // ---- Drag handle ----
  // 不再自行处理 dragstart/dragend。Milkdown BlockProvider 会把
  // dragstart/dragend 监听器挂在 handleEl（即 .milkdown-block-handle 根元素）
  // 上并设置 handleEl.draggable = true，在其 dragstart 中：
  //   1. 基于 mousedown 时建立的 NodeSelection，把 slice 序列化写入
  //      dataTransfer 的 text/html 与 text/plain；
  //   2. 设置 view.dragging = { slice, move: true }，让 ProseMirror 内置
  //      drop handler 在释放时执行"移动节点"操作。
  // 我们此前在子元素 .milkdown-block-drag 上调用 stopPropagation()，恰好
  // 阻断了上述流程，导致 drop 时 view.dragging 为空、dataTransfer 无有效
  // slice，节点不会移动。

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
        },
      };
    },
  });
}

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
import { NodeSelection, TextSelection } from '@milkdown/kit/prose/state';

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

  // Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'milkdown-block-btn milkdown-block-add';
  addBtn.innerHTML = addIcon;
  addBtn.setAttribute('aria-label', '添加块');
  addBtn.setAttribute('data-tooltip', '点击添加块');
  addBtn.type = 'button';

  // Drag handle
  const dragBtn = document.createElement('button');
  dragBtn.className = 'milkdown-block-btn milkdown-block-drag';
  dragBtn.innerHTML = dragIcon;
  dragBtn.setAttribute('aria-label', '拖拽移动');
  dragBtn.setAttribute('data-tooltip', '拖拽移动块');
  dragBtn.setAttribute('draggable', 'true');
  dragBtn.type = 'button';

  wrapper.appendChild(addBtn);
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

      const tr = state.tr.insert(
        blockEnd + 1,
        paragraph.create(null, schema.text('/')),
      );
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

  // ---- Drag handle: real drag & drop ----
  const dragBtn = handleEl.querySelector('.milkdown-block-drag') as HTMLElement | null;
  if (dragBtn) {
    dragBtn.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      if (!currentView || !blockProvider) return;
      const active = blockProvider.active;
      if (!active) return;

      const { $pos, node } = active;
      const { state } = currentView;

      // For top-level blocks, use $pos.before() to get the node start position
      const nodeFrom = $pos.before($pos.depth);
      const nodeTo = nodeFrom + node.nodeSize;

      // Set drag data
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', '');
        e.dataTransfer.setData(
          'application/x-milkdown-block',
          JSON.stringify({ from: nodeFrom, to: nodeTo }),
        );
      }

      // Add a dragging class for visual feedback
      handleEl.classList.add('dragging');
      const blockDom = active.el;
      if (blockDom) {
        blockDom.classList.add('milkdown-block-dragging');
      }

      // Select the node to enable ProseMirror's built-in drag & drop
      try {
        currentView.dispatch(
          state.tr.setSelection(NodeSelection.create(state.doc, nodeFrom)),
        );
      } catch {
        // Fallback: keep current selection if NodeSelection fails
      }

      // Set the drag image
      if (blockDom && e.dataTransfer) {
        const rect = blockDom.getBoundingClientRect();
        e.dataTransfer.setDragImage(blockDom, rect.width / 2, 20);
      }
    });

    dragBtn.addEventListener('dragend', () => {
      handleEl.classList.remove('dragging');
      // Clean up dragging styles from all elements
      document.querySelectorAll('.milkdown-block-dragging').forEach((el) => {
        el.classList.remove('milkdown-block-dragging');
      });
    });
  }

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

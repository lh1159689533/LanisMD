/**
 * Image Upload Progress Plugin
 *
 * 使用 ProseMirror 的 Plugin + DecorationSet 来管理图片上传占位块。
 * 这是 ProseMirror 官方推荐的方式，不直接操作 DOM，而是通过
 * Transaction meta + Plugin state 来驱动 decoration 的增减。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import type { EditorView } from '@milkdown/kit/prose/view';

// ---------------------------------------------------------------------------
// Plugin Key & Types
// ---------------------------------------------------------------------------

export const uploadProgressPluginKey = new PluginKey<DecorationSet>('IMAGE_UPLOAD_PROGRESS');

interface AddPlaceholderAction {
  type: 'add';
  id: string;
  pos: number;
}

interface RemovePlaceholderAction {
  type: 'remove';
  id: string;
}

type PlaceholderAction = AddPlaceholderAction | RemovePlaceholderAction;

// ---------------------------------------------------------------------------
// Placeholder ID generation
// ---------------------------------------------------------------------------

let placeholderCounter = 0;

function generatePlaceholderId(): string {
  return `img-loading-${Date.now()}-${++placeholderCounter}`;
}

// ---------------------------------------------------------------------------
// Placeholder DOM creation
// ---------------------------------------------------------------------------

function createPlaceholderWidget(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-loading-placeholder';
  wrapper.contentEditable = 'false';

  wrapper.innerHTML = `
    <div class="image-loading-skeleton">
      <div class="image-loading-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
      <div class="image-loading-text">正在处理图片…</div>
      <div class="image-loading-spinner"></div>
    </div>
  `;

  return wrapper;
}

// ---------------------------------------------------------------------------
// ProseMirror Plugin
// ---------------------------------------------------------------------------

export const imageUploadProgressPlugin = $prose(() => {
  return new Plugin({
    key: uploadProgressPluginKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, set) {
        // Map existing decorations through the transaction (handles position shifts)
        set = set.map(tr.mapping, tr.doc);

        const action = tr.getMeta(uploadProgressPluginKey) as PlaceholderAction | undefined;
        if (!action) return set;

        if (action.type === 'add') {
          const widget = Decoration.widget(action.pos, createPlaceholderWidget, {
            id: action.id,
          });
          return set.add(tr.doc, [widget]);
        }

        if (action.type === 'remove') {
          // Find and remove the decoration with the matching id
          const found = set.find(undefined, undefined, (spec) => spec.id === action.id);
          if (found.length > 0) {
            return set.remove(found);
          }
        }

        return set;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Insert a loading placeholder at the current cursor position.
 * Returns the placeholder ID for later removal.
 */
export function insertLoadingPlaceholder(view: EditorView): string {
  const id = generatePlaceholderId();
  const { state, dispatch } = view;
  const { from } = state.selection;

  const tr = state.tr.setMeta(uploadProgressPluginKey, {
    type: 'add',
    id,
    pos: from,
  } as AddPlaceholderAction);

  dispatch(tr);
  return id;
}

/**
 * Remove the loading placeholder and insert the actual image-block node.
 * If src is empty, just remove the placeholder (error case).
 */
export function replaceLoadingWithImage(
  view: EditorView,
  placeholderId: string,
  src: string,
): void {
  const { state } = view;

  // Find the position of the placeholder decoration
  const decoSet = uploadProgressPluginKey.getState(state);
  if (!decoSet) return;

  const found = decoSet.find(undefined, undefined, (spec) => spec.id === placeholderId);

  // Remove the placeholder decoration
  let tr = state.tr.setMeta(uploadProgressPluginKey, {
    type: 'remove',
    id: placeholderId,
  } as RemovePlaceholderAction);

  // Insert the image-block node at the placeholder position (or fallback to cursor)
  if (src) {
    const schema = state.schema;
    const imageBlockType = schema.nodes['image-block'] || schema.nodes.image_block;

    if (imageBlockType) {
      const imageNode = imageBlockType.create({ src, caption: '' });
      const insertPos = found.length > 0 ? found[0].from : state.selection.from;
      tr = tr.insert(insertPos, imageNode);
    }
  }

  view.dispatch(tr.scrollIntoView());
}

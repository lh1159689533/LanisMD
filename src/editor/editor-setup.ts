import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { cursor } from '@milkdown/kit/plugin/cursor';
import { indent } from '@milkdown/kit/plugin/indent';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { upload } from '@milkdown/plugin-upload';
import {
  listItemBlockComponent,
  listItemBlockConfig,
} from '@milkdown/kit/component/list-item-block';
import { slash, configureSlash } from './plugins/slash-menu';
import { block, configureBlock } from './plugins/block-handle';
import { tooltip, configureTooltip } from './plugins/tooltip-toolbar';
import { underlineMarkSchema } from './plugins/underline-mark';
import { imageViewPlugin } from './plugins/image-view';
import '@milkdown/kit/prose/view/style/prosemirror.css';

export type EditorListener = {
  onMarkdownUpdated?: (markdown: string, prevMarkdown: string) => void;
  onDocUpdated?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

// SVG icons for the list-item-block component (checkbox & bullet)
const bulletIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`;
const checkBoxCheckedIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8.29 13.29a.996.996 0 0 1-1.41 0L5.71 12.7a.996.996 0 1 1 1.41-1.41L10 14.17l6.88-6.88a.996.996 0 1 1 1.41 1.41l-7.58 7.59z"/></svg>`;
const checkBoxUncheckedIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M18 19H6c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1h12c.55 0 1 .45 1 1v12c0 .55-.45 1-1 1zM19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>`;

export function createEditor(root: HTMLElement, defaultValue: string) {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, defaultValue);
      // Configure list-item-block rendering (checkbox icons for task lists)
      ctx.set(listItemBlockConfig.key, {
        renderLabel: ({
          label,
          listType,
          checked,
        }) => {
          if (checked == null) {
            if (listType === 'bullet') return bulletIcon;
            return label;
          }
          if (checked) return checkBoxCheckedIcon;
          return checkBoxUncheckedIcon;
        },
      });
    })
    .config(configureSlash)
    .config(configureBlock)
    .config(configureTooltip)
    .use(commonmark)
    .use(gfm)
    .use(underlineMarkSchema)
    .use(listItemBlockComponent)
    .use(history)
    .use(listener)
    .use(clipboard)
    .use(cursor)
    .use(indent)
    .use(trailing)
    .use(upload)
    .use(slash)
    .use(block)
    .use(tooltip)
    .use(imageViewPlugin);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupEditorListeners(
  editor: { action: (fn: (ctx: any) => void) => void },
  listeners?: EditorListener,
) {
  editor.action((ctx) => {
    const manager = ctx.get(listenerCtx);
    if (!manager) return;

    manager
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .markdownUpdated((_ctx: any, markdown: string, prevMarkdown: string) => {
        listeners?.onMarkdownUpdated?.(markdown, prevMarkdown);
      })
      .updated(() => {
        listeners?.onDocUpdated?.();
      })
      .focus(() => {
        listeners?.onFocus?.();
      })
      .blur(() => {
        listeners?.onBlur?.();
      });
  });
}

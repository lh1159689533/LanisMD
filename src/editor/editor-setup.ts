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
import { imageInlineComponent } from '@milkdown/kit/component/image-inline';
import { slash, configureSlash } from './plugins/slash-menu';
import { block, configureBlock } from './plugins/block-handle';
import { tooltip, configureTooltip } from './plugins/tooltip-toolbar';
import { linkTooltip, configureLinkTooltip } from './plugins/link-tooltip';
import { underlineMarkSchema } from './plugins/underline-mark';
import {
  imageBlockComponent,
  configureImageBlock,
  extendedImageBlockSchema,
  remarkHtmlImagePlugin,
  imageBlockPastePlugin,
  imageBlockToolbarPlugin,
  imageUploadProgressPlugin,
  imageInputRulePlugin,
  imageResizePlugin,
  imageBlockClickPlugin,
  openImageDialog,
} from './plugins/image-block';
import {
  configureImageInline,
  imageInlineToolbarPlugin,
  imageInlineResizePlugin,
  imageInlineClickPlugin,
  setOpenImageDialogForInlineEdit,
} from './plugins/image-inline';
import { codeBlockComponent, configureCodeBlock } from './plugins/code-block';
import { tableHandlePlugin, extendedTableSchema } from './plugins/table-block';
import { remarkGfmAlertPlugin, gfmAlertSchema } from './plugins/gfm-alert';
import '@milkdown/kit/prose/view/style/prosemirror.css';
import type { EditorView } from '@milkdown/kit/prose/view';

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

// Register the inline image edit dialog function
// This reuses the same dialog as image-block, but updates inline image nodes

async function openImageDialogForInlineEdit(
  view: EditorView,
  nodePos: number,
): Promise<void> {
  const result = await openImageDialog();
  if (!result || !result.src) return;

  const { state, dispatch } = view;
  try {
    const resolvedPos = state.doc.resolve(nodePos);
    const node = resolvedPos.nodeAfter;
    if (node && node.type.name === 'image') {
      // Use setNodeAttribute for inline nodes
      const tr = state.tr.setNodeMarkup(nodePos, undefined, {
        ...node.attrs,
        src: result.src,
      });
      dispatch(tr);
    }
  } catch (e) {
    console.warn('Failed to update inline image:', e);
  }
  view.focus();
}

// Register the function with the toolbar plugin
setOpenImageDialogForInlineEdit(openImageDialogForInlineEdit);

export function createEditor(root: HTMLElement, defaultValue: string) {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, defaultValue);
      // Configure list-item-block rendering (checkbox icons for task lists)
      ctx.set(listItemBlockConfig.key, {
        renderLabel: ({ label, listType, checked }) => {
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
    .config(configureLinkTooltip)
    .config(configureImageBlock)
    .config(configureImageInline)
    .config(configureCodeBlock)
    .use(commonmark)
    .use(gfm)
    .use(underlineMarkSchema)
    .use(gfmAlertSchema)
    .use(remarkGfmAlertPlugin)
    .use(listItemBlockComponent)
    .use(imageBlockComponent)
    .use(imageInlineComponent)
    .use(extendedImageBlockSchema)
    .use(remarkHtmlImagePlugin)
    .use(imageBlockPastePlugin)
    .use(imageBlockToolbarPlugin)
    .use(imageUploadProgressPlugin)
    .use(imageInputRulePlugin)
    .use(imageResizePlugin)
    .use(imageBlockClickPlugin)
    .use(imageInlineToolbarPlugin)
    .use(imageInlineResizePlugin)
    .use(imageInlineClickPlugin)
    .use(codeBlockComponent)
    .use(extendedTableSchema)
    .use(tableHandlePlugin)
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
    .use(linkTooltip);
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

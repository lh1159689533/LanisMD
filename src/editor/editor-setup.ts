import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { indent } from "@milkdown/kit/plugin/indent";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { upload } from "@milkdown/plugin-upload";
import { slashFactory } from "@milkdown/plugin-slash";
import { tooltipFactory } from "@milkdown/kit/plugin/tooltip";
import "@milkdown/kit/prose/view/style/prosemirror.css";

const slash = slashFactory("slash");
const tooltip = tooltipFactory("tooltip");

export type EditorListener = {
  onMarkdownUpdated?: (markdown: string, prevMarkdown: string) => void;
  onDocUpdated?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function createEditor(
  root: HTMLElement,
  defaultValue: string
) {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, defaultValue);
      ctx.set(slash.key, {});
      ctx.set(tooltip.key, {});
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(listener)
    .use(clipboard)
    .use(cursor)
    .use(indent)
    .use(trailing)
    .use(upload)
    .use(slash)
    .use(tooltip);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupEditorListeners(editor: { action: (fn: (ctx: any) => void) => void }, listeners?: EditorListener) {
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

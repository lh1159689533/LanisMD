/**
 * Editor Setup - Based on @milkdown/crepe
 *
 * 使用 Crepe 预设编辑器，内置 block handle、slash menu、toolbar 等功能。
 */

import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

export type EditorListener = {
  onMarkdownUpdated?: (markdown: string, prevMarkdown: string) => void;
  onDocUpdated?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

export function createCrepeEditor(
  root: HTMLElement,
  defaultValue: string,
  listeners?: EditorListener,
): Crepe {
  const crepe = new Crepe({
    root,
    defaultValue,
    features: {
      [Crepe.Feature.CodeMirror]: false,
      [Crepe.Feature.Latex]: false,
      [Crepe.Feature.TopBar]: false,
    },
    featureConfigs: {
      [Crepe.Feature.Placeholder]: {
        text: '输入 / 触发命令菜单...',
      },
    },
  });

  if (listeners) {
    crepe.on((listener) => {
      if (listeners.onMarkdownUpdated) {
        listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
          listeners.onMarkdownUpdated!(markdown, prevMarkdown);
        });
      }
      if (listeners.onDocUpdated) {
        listener.updated(() => {
          listeners.onDocUpdated!();
        });
      }
      if (listeners.onFocus) {
        listener.focus(() => {
          listeners.onFocus!();
        });
      }
      if (listeners.onBlur) {
        listener.blur(() => {
          listeners.onBlur!();
        });
      }
    });
  }

  return crepe;
}

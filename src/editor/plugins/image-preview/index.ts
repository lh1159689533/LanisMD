/**
 * Image Preview Plugin
 *
 * 正文图片（图片块 / 行内图片）点击预览：
 * - 编辑模式：双击图片打开预览（单击仍保留选中、缩放、工具栏等编辑行为）
 * - 沉浸式阅读（编辑器不可编辑）：单击图片即打开预览
 * - 另外对外暴露 openImagePreview，供图片工具栏与右键菜单的「预览」入口调用
 *
 * 预览层本身的实现见 viewer.ts，图集收集规则见 gallery.ts。
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                                   |
 * | v1.0.0 | 初始实现：双击 / 沉浸模式单击打开预览 | REQ: 20261113-image-preview TECH: 图片预览方案 §一、§三 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

import { collectGallery, isPreviewableImage, resolvePreviewableImage } from './gallery';
import { destroyImagePreview, showImagePreview } from './viewer';

export { previewIcons } from './icons';
export { isImagePreviewOpen } from './viewer';

const imagePreviewPluginKey = new PluginKey('IMAGE_PREVIEW');

/**
 * 以指定图片为起点打开预览，图集为当前编辑器内全部正文图片
 *
 * @returns 图片不可预览（空状态、上传中、加载失败）时返回 false
 */
export function openImagePreview(view: EditorView, img: HTMLImageElement | null): boolean {
  if (!img || !isPreviewableImage(img)) return false;
  const { items, index } = collectGallery(view.dom, img);
  showImagePreview({ items, index });
  return true;
}

/**
 * 处理触发事件：命中可预览图片时打开预览并终止事件传播
 *
 * 必须在捕获阶段终止：image-block 的缩放插件在 img 上直接绑定了 click 并 stopPropagation，
 * 冒泡阶段（ProseMirror handleDOMEvents）收不到图片块的单击。
 */
function handleTrigger(view: EditorView, event: MouseEvent): void {
  if (event.button !== 0) return;
  const img = resolvePreviewableImage(event.target);
  if (!img) return;

  if (openImagePreview(view, img)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

export const imagePreviewPlugin = $prose(() => {
  return new Plugin({
    key: imagePreviewPluginKey,
    view(editorView) {
      // 编辑模式：双击预览；只读（沉浸式阅读）：单击预览
      const onDoubleClick = (e: MouseEvent) => {
        if (editorView.editable) handleTrigger(editorView, e);
      };
      const onClick = (e: MouseEvent) => {
        if (!editorView.editable) handleTrigger(editorView, e);
      };
      editorView.dom.addEventListener('dblclick', onDoubleClick, true);
      editorView.dom.addEventListener('click', onClick, true);

      return {
        destroy() {
          editorView.dom.removeEventListener('dblclick', onDoubleClick, true);
          editorView.dom.removeEventListener('click', onClick, true);
          // 编辑器销毁（如切换文件）时预览层引用的原图已失效，直接移除
          destroyImagePreview();
        },
      };
    },
  });
});

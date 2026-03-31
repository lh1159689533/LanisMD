/**
 * Image NodeView Plugin
 *
 * 在编辑器渲染 image 节点时，自动将本地相对路径（如 ./assets/image.png、img/image.png）
 * 通过 Tauri 的 asset 协议（convertFileSrc）转换为可被 WebView 加载的 URL。
 * 无需 IPC 读取文件或 base64 编码，零开销直接加载本地图片。
 * ProseMirror 节点属性中仍保留相对路径，确保 Markdown 序列化不受影响。
 */

import { $view } from '@milkdown/kit/utils';
import { imageSchema } from '@milkdown/kit/preset/commonmark';
import type { EditorView, NodeView } from '@milkdown/kit/prose/view';
import type { Node } from '@milkdown/kit/prose/model';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useFileStore } from '@/stores/file-store';

/**
 * Check if a src is a relative path that needs resolving.
 * Uses an exclusion approach: anything that is NOT a full URL or data URL
 * is treated as a relative path.
 */
function isRelativePath(src: string): boolean {
  if (!src) return false;
  // data: URLs (base64 inline images)
  if (src.startsWith('data:')) return false;
  // Full URLs with protocol (http://, https://, ftp://, etc.)
  if (src.includes('://')) return false;
  return true;
}

/**
 * Build the absolute file path for a relative image src
 * based on the current document's directory.
 */
function buildAbsolutePath(src: string): string | null {
  const currentFile = useFileStore.getState().currentFile;
  if (!currentFile?.filePath) return null;

  const lastSlash = currentFile.filePath.lastIndexOf('/');
  const docDir = lastSlash >= 0 ? currentFile.filePath.substring(0, lastSlash) : '';
  const relativePart = src.startsWith('./') ? src.substring(2) : src;
  return `${docDir}/${relativePart}`;
}

/**
 * ProseMirror NodeView for image nodes.
 * Renders images using Tauri's asset protocol URLs while keeping
 * the original relative path in the node attributes.
 */
class ImageNodeView implements NodeView {
  dom: HTMLElement;
  private img: HTMLImageElement;

  constructor(node: Node, _view: EditorView, _getPos: () => number | undefined) {
    this.dom = document.createElement('div');
    this.dom.style.display = 'contents';

    this.img = document.createElement('img');
    this.img.alt = node.attrs.alt || '';
    this.img.title = node.attrs.title || '';

    this.dom.appendChild(this.img);

    this.resolveAndSetSrc(node.attrs.src || '');
  }

  /**
   * Resolve the image src: if it's a relative path,
   * convert the absolute file path to an asset protocol URL via convertFileSrc.
   */
  private resolveAndSetSrc(src: string): void {
    if (!src) return;

    if (!isRelativePath(src)) {
      // External URL or already a data URL — use directly
      this.img.src = src;
      return;
    }

    const absolutePath = buildAbsolutePath(src);
    if (!absolutePath) {
      this.img.src = src;
      return;
    }

    // Convert absolute file path to Tauri asset protocol URL
    // e.g. /Users/xxx/docs/img/image.png → asset://localhost/Users/xxx/docs/img/image.png
    this.img.src = convertFileSrc(absolutePath);
  }

  update(node: Node): boolean {
    if (node.type.name !== 'image') return false;
    this.img.alt = node.attrs.alt || '';
    this.img.title = node.attrs.title || '';
    this.resolveAndSetSrc(node.attrs.src || '');
    return true;
  }

  // selectNode / deselectNode for ProseMirror selection styling
  selectNode() {
    this.img.classList.add('ProseMirror-selectednode');
  }

  deselectNode() {
    this.img.classList.remove('ProseMirror-selectednode');
  }

  stopEvent() {
    return false;
  }

  ignoreMutation() {
    return true;
  }
}

/**
 * Milkdown $view plugin that registers the custom image NodeView.
 */
export const imageViewPlugin = $view(imageSchema.node, () => {
  return (node: Node, view: EditorView, getPos: () => number | undefined): NodeView => {
    return new ImageNodeView(node, view, getPos);
  };
});

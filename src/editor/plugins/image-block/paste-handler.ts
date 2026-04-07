/**
 * Image Paste Plugin
 *
 * 处理图片粘贴事件：当用户从剪贴板粘贴图片时，
 * 立即插入一个加载占位块（骨架屏动画），然后在后台将图片保存到 assets 目录，
 * 保存完成后替换为真正的 image-block 节点。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { useFileStore } from '@/stores/file-store';
import { fileService } from '@/services/tauri';
import { insertLoadingPlaceholder, replaceLoadingWithImage } from './upload-progress';

const imagePastePluginKey = new PluginKey('IMAGE_PASTE');

/**
 * Save a pasted image File to the document's assets directory.
 * Returns the relative path (e.g., `./assets/image_1234.png`).
 * Uses the Tauri backend command to bypass frontend fs scope restrictions.
 */
async function savePastedImage(file: File): Promise<string> {
  const currentFile = useFileStore.getState().currentFile;
  if (!currentFile?.filePath) {
    return URL.createObjectURL(file);
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const timestamp = Date.now();
    const fileName = `image_${timestamp}.${ext}`;

    // Use Tauri backend command to save (no fs scope issues)
    const relativePath = await fileService.saveImageBytesToAssets(uint8, fileName, currentFile.filePath);
    return relativePath;
  } catch (err) {
    console.error('Failed to save pasted image:', err);
    return URL.createObjectURL(file);
  }
}

export const imageBlockPastePlugin = $prose(() => {
  return new Plugin({
    key: imagePastePluginKey,
    props: {
      handlePaste(view, event) {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // Check if there are image files in the clipboard
        const items = Array.from(clipboardData.items);
        const imageItem = items.find((item) => item.type.startsWith('image/'));

        if (!imageItem) return false;

        const file = imageItem.getAsFile();
        if (!file) return false;

        // Prevent default paste behavior for images
        event.preventDefault();

        // Step 1: Immediately insert a loading placeholder
        const placeholderId = insertLoadingPlaceholder(view);

        // Step 2: Save the image in background, then replace placeholder
        savePastedImage(file).then((src) => {
          replaceLoadingWithImage(view, placeholderId, src);
        });

        return true;
      },
    },
  });
});

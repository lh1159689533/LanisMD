/**
 * Image Block Plugin
 *
 * 集成 @milkdown/components/image-block，提供增强的图片块功能：
 * - 输入 Markdown 图片语法 `![]()` 显示上传条（空状态），点击可上传或输入 URL
 * - 粘贴图片自动上传到 assets 目录
 * - 图片操作栏：编辑（弹窗选本地/URL）、对齐（居左/居中/居右）、删除
 * - 四角拖拽手柄调整图片大小（等比例缩放，点击选中后显示）
 * - 图片标题（caption）编辑
 */

import {
  imageBlockComponent,
  imageBlockConfig,
} from '@milkdown/kit/component/image-block';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';
import { useFileStore } from '@/stores/file-store';
import { fileService } from '@/services/tauri';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';

import { isRelativePath, buildAbsolutePath } from './types';
import { insertLoadingPlaceholder, replaceLoadingWithImage } from './upload-progress';
import { setOpenImageDialogForEdit } from './toolbar';

// 重新导出所有子模块
export { extendedImageBlockSchema, remarkHtmlImagePlugin } from './schema-extend';
export { imageBlockClickPlugin } from './click-handler';
export { imageInputRulePlugin } from './input-rule';
export { imageBlockPastePlugin } from './paste-handler';
export { imageResizePlugin } from './resize';
export { imageBlockToolbarPlugin } from './toolbar';
export { imageUploadProgressPlugin, insertLoadingPlaceholder, replaceLoadingWithImage } from './upload-progress';
export { imageViewPlugin } from './view';

// 重新导出类型
export type { ImageDialogResult } from './types';
export { isRelativePath, buildAbsolutePath } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 将 File 对象（来自粘贴/拖拽/上传）保存到 assets 目录
 * 返回类似 `./assets/image_xxxx.png` 的相对路径
 * 使用 Tauri 后端命令绕过前端 fs scope 限制
 */
async function saveFileToAssets(file: File): Promise<string> {
  const currentFile = useFileStore.getState().currentFile;
  if (!currentFile?.filePath) {
    // 回退：返回 blob URL（不会持久化，但至少能显示图片）
    return URL.createObjectURL(file);
  }

  try {
    // 将文件数据读取为 Uint8Array
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // 生成唯一文件名
    const ext = file.name.split('.').pop() || 'png';
    const timestamp = Date.now();
    const fileName = `image_${timestamp}.${ext}`;

    // 使用 Tauri 后端命令保存（无 fs scope 问题）
    const relativePath = await fileService.saveImageBytesToAssets(uint8, fileName, currentFile.filePath);
    return relativePath;
  } catch (err) {
    console.error('Failed to save image to assets:', err);
    return URL.createObjectURL(file);
  }
}

/**
 * 打开图片对话框（复用现有设计）并返回结果
 */
function openImageDialog(): Promise<{ src: string; alt: string } | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'milkdown-tooltip-dialog-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'milkdown-tooltip-dialog';

    dialog.innerHTML = `
      <div class="milkdown-tooltip-dialog-title">选择图片</div>
      <div class="milkdown-tooltip-dialog-tabs">
        <button type="button" class="milkdown-tooltip-dialog-tab active" data-tab="upload">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          上传
        </button>
        <button type="button" class="milkdown-tooltip-dialog-tab" data-tab="url">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          URL
        </button>
      </div>
      <div class="milkdown-tooltip-dialog-tab-panel" data-panel="upload">
        <div class="milkdown-tooltip-dialog-field">
          <button type="button" class="milkdown-tooltip-dialog-file-btn" data-action="pick-local">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <span>点击选择图片文件…</span>
          </button>
          <div class="milkdown-tooltip-dialog-file-name" data-field="file-name" style="display:none;"></div>
        </div>
      </div>
      <div class="milkdown-tooltip-dialog-tab-panel" data-panel="url" style="display:none;">
        <div class="milkdown-tooltip-dialog-field">
          <label>图片 URL</label>
          <input type="text" class="milkdown-tooltip-dialog-input" data-field="src" placeholder="https://example.com/image.png" />
        </div>
      </div>
      <div class="milkdown-tooltip-dialog-actions">
        <button class="milkdown-tooltip-dialog-btn cancel">取消</button>
        <button class="milkdown-tooltip-dialog-btn confirm">确定</button>
      </div>
    `;

    overlay.appendChild(dialog);

    // Tab 切换
    const tabBtns = dialog.querySelectorAll('.milkdown-tooltip-dialog-tab') as NodeListOf<HTMLButtonElement>;
    const uploadPanel = dialog.querySelector('[data-panel="upload"]') as HTMLElement;
    const urlPanel = dialog.querySelector('[data-panel="url"]') as HTMLElement;
    const pickLocalBtn = dialog.querySelector('[data-action="pick-local"]') as HTMLButtonElement;
    const fileNameDisplay = dialog.querySelector('[data-field="file-name"]') as HTMLDivElement;
    const srcInput = dialog.querySelector('[data-field="src"]') as HTMLInputElement;
    const cancelBtn = dialog.querySelector('.cancel') as HTMLButtonElement;
    const confirmBtn = dialog.querySelector('.confirm') as HTMLButtonElement;

    let activeTab = 'upload';
    let localFilePath: string | null = null;

    function switchTab(tabName: string) {
      activeTab = tabName;
      tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
      uploadPanel.style.display = tabName === 'upload' ? '' : 'none';
      urlPanel.style.display = tabName === 'url' ? '' : 'none';
      if (tabName === 'url') setTimeout(() => srcInput.focus(), 50);
    }

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        switchTab(btn.dataset.tab || 'upload');
      });
    });

    function close() {
      overlay.remove();
    }

    async function submit() {
      if (activeTab === 'upload') {
        if (!localFilePath) return;
        const currentFile = useFileStore.getState().currentFile;
        if (!currentFile?.filePath) {
          close();
          resolve(null);
          return;
        }
        try {
          const relativePath = await fileService.copyImageToAssets(localFilePath, currentFile.filePath);
          close();
          resolve({ src: relativePath, alt: '' });
        } catch (err) {
          console.error('Failed to copy image to assets:', err);
          close();
          resolve(null);
        }
      } else {
        const src = srcInput.value.trim();
        if (src) {
          close();
          resolve({ src, alt: '' });
        }
      }
    }

    pickLocalBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const selected = await tauriOpen({
          multiple: false,
          filters: [{
            name: '图片',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'],
          }],
        });
        if (!selected) return;
        let filePath: string | null = null;
        if (typeof selected === 'string') {
          filePath = selected;
        } else if (selected && typeof selected === 'object' && 'path' in selected) {
          filePath = (selected as { path: string }).path;
        }
        if (filePath) {
          localFilePath = filePath;
          const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? '未知文件';
          fileNameDisplay.textContent = `✓ ${fileName}`;
          fileNameDisplay.style.display = 'block';
          pickLocalBtn.classList.add('has-file');
        }
      } catch (err) {
        console.error('Failed to open file dialog:', err);
      }
    });

    cancelBtn.addEventListener('click', () => { close(); resolve(null); });
    confirmBtn.addEventListener('click', submit);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) { close(); resolve(null); }
    });
    srcInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { close(); resolve(null); }
    });

    document.body.appendChild(overlay);
    setTimeout(() => {
      const firstInput = overlay.querySelector('input') as HTMLInputElement;
      if (firstInput) firstInput.focus();
    }, 50);
  });
}

// ---------------------------------------------------------------------------
// 图片块加载遮罩辅助函数
// ---------------------------------------------------------------------------

/**
 * 在 DOM 中查找当前活动的（空）image-block 元素
 * 当用户在上传栏中拖拽/选择文件时，image-block
 * 元素是具有可见 `.image-edit` 子元素（空状态）的元素
 */
function findActiveImageBlock(): HTMLElement | null {
  // 策略 1：从当前聚焦的元素查找
  const active = document.activeElement;
  if (active) {
    const block = active.closest('.milkdown-image-block');
    if (block) return block as HTMLElement;
  }

  // 策略 2：查找具有可见上传栏（.image-edit）的 image-block
  const allBlocks = document.querySelectorAll('.milkdown-image-block');
  for (const block of allBlocks) {
    const editBar = block.querySelector('.image-edit') as HTMLElement | null;
    if (editBar) {
      // 检查编辑栏是否可见（未被 CSS 隐藏）
      const style = window.getComputedStyle(editBar);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        return block as HTMLElement;
      }
    }
  }

  // 策略 3：查找具有 'selected' 类的 image-block
  const selected = document.querySelector('.milkdown-image-block.selected');
  if (selected) return selected as HTMLElement;

  return null;
}

/**
 * 在 image-block 元素上显示加载遮罩
 */
function showImageBlockLoading(el: HTMLElement): void {
  // 不添加多个遮罩
  if (el.querySelector('.image-block-loading-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'image-block-loading-overlay';
  overlay.innerHTML = `
    <div class="image-block-loading-content">
      <div class="image-loading-spinner"></div>
      <span>正在保存图片…</span>
    </div>
  `;
  el.style.position = 'relative';
  el.appendChild(overlay);
}

/**
 * 从 image-block 元素移除加载遮罩
 */
function hideImageBlockLoading(el: HTMLElement): void {
  const overlay = el.querySelector('.image-block-loading-overlay');
  if (overlay) overlay.remove();
}

// ---------------------------------------------------------------------------
// 图片块配置
// ---------------------------------------------------------------------------

import { convertFileSrc } from '@tauri-apps/api/core';

export function configureImageBlock(ctx: Ctx) {
  ctx.update(imageBlockConfig.key, (defaultConfig) => ({
    ...defaultConfig,
    imageIcon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    captionIcon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    uploadButton: '点击上传图片',
    confirmButton: '确认 ⏎',
    uploadPlaceholderText: '或粘贴图片链接…',
    captionPlaceholderText: '添加图片说明…',
    // 处理文件上传（拖放、粘贴或上传按钮点击）
    onUpload: async (file: File): Promise<string> => {
      // 找到触发上传的 image-block 元素并显示加载遮罩
      const imageBlockEl = findActiveImageBlock();
      if (imageBlockEl) {
        showImageBlockLoading(imageBlockEl);
      }
      try {
        const result = await saveFileToAssets(file);
        return result;
      } finally {
        if (imageBlockEl) {
          hideImageBlockLoading(imageBlockEl);
        }
      }
    },
    // 将本地相对路径代理到 Tauri asset protocol URL
    proxyDomURL: (url: string): string => {
      if (isRelativePath(url)) {
        const absolutePath = buildAbsolutePath(url);
        if (absolutePath) {
          return convertFileSrc(absolutePath);
        }
      }
      return url;
    },
    onImageLoadError: (event: Event) => {
      console.warn('Image load failed:', (event.target as HTMLImageElement)?.src);
    },
  }));
}

// ---------------------------------------------------------------------------
// 辅助函数：带加载占位符的上传
// ---------------------------------------------------------------------------

/**
 * openImageDialog 的增强版本，在图片复制到 assets 时
 * 在编辑器中显示加载占位符
 * 对话框立即关闭并显示占位符
 */
export function openImageDialogWithProgress(
  view: EditorView,
  onComplete: (src: string) => void,
): void {
  // 我们包装对话框以拦截提交流程
  openImageDialogAsync(view, onComplete);
}

/**
 * 内部：打开对话框，提交时立即关闭对话框，
 * 插入加载占位符，然后保存文件并替换
 */
function openImageDialogAsync(
  view: EditorView,
  onComplete: (src: string) => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'milkdown-tooltip-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'milkdown-tooltip-dialog';

  dialog.innerHTML = `
    <div class="milkdown-tooltip-dialog-title">选择图片</div>
    <div class="milkdown-tooltip-dialog-tabs">
      <button type="button" class="milkdown-tooltip-dialog-tab active" data-tab="upload">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        上传
      </button>
      <button type="button" class="milkdown-tooltip-dialog-tab" data-tab="url">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        URL
      </button>
    </div>
    <div class="milkdown-tooltip-dialog-tab-panel" data-panel="upload">
      <div class="milkdown-tooltip-dialog-field">
        <button type="button" class="milkdown-tooltip-dialog-file-btn" data-action="pick-local">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span>点击选择图片文件…</span>
        </button>
        <div class="milkdown-tooltip-dialog-file-name" data-field="file-name" style="display:none;"></div>
      </div>
    </div>
    <div class="milkdown-tooltip-dialog-tab-panel" data-panel="url" style="display:none;">
      <div class="milkdown-tooltip-dialog-field">
        <label>图片 URL</label>
        <input type="text" class="milkdown-tooltip-dialog-input" data-field="src" placeholder="https://example.com/image.png" />
      </div>
    </div>
    <div class="milkdown-tooltip-dialog-actions">
      <button class="milkdown-tooltip-dialog-btn cancel">取消</button>
      <button class="milkdown-tooltip-dialog-btn confirm">确定</button>
    </div>
  `;

  overlay.appendChild(dialog);

  const tabBtns = dialog.querySelectorAll('.milkdown-tooltip-dialog-tab') as NodeListOf<HTMLButtonElement>;
  const uploadPanel = dialog.querySelector('[data-panel="upload"]') as HTMLElement;
  const urlPanel = dialog.querySelector('[data-panel="url"]') as HTMLElement;
  const pickLocalBtn = dialog.querySelector('[data-action="pick-local"]') as HTMLButtonElement;
  const fileNameDisplay = dialog.querySelector('[data-field="file-name"]') as HTMLDivElement;
  const srcInput = dialog.querySelector('[data-field="src"]') as HTMLInputElement;
  const cancelBtn = dialog.querySelector('.cancel') as HTMLButtonElement;
  const confirmBtn = dialog.querySelector('.confirm') as HTMLButtonElement;

  let activeTab = 'upload';
  let localFilePath: string | null = null;

  function switchTab(tabName: string) {
    activeTab = tabName;
    tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
    uploadPanel.style.display = tabName === 'upload' ? '' : 'none';
    urlPanel.style.display = tabName === 'url' ? '' : 'none';
    if (tabName === 'url') setTimeout(() => srcInput.focus(), 50);
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(btn.dataset.tab || 'upload');
    });
  });

  function close() {
    overlay.remove();
  }

  async function submit() {
    if (activeTab === 'upload') {
      if (!localFilePath) return;
      const currentFile = useFileStore.getState().currentFile;
      if (!currentFile?.filePath) {
        close();
        return;
      }

      // 立即关闭对话框
      close();

      // 在编辑器中插入加载占位符
      const placeholderId = insertLoadingPlaceholder(view);

      // 在后台将图片复制到 assets
      try {
        const relativePath = await fileService.copyImageToAssets(localFilePath, currentFile.filePath);
        replaceLoadingWithImage(view, placeholderId, relativePath);
        onComplete(relativePath);
      } catch (err) {
        console.error('Failed to copy image to assets:', err);
        // 出错时移除占位符
        replaceLoadingWithImage(view, placeholderId, '');
      }
    } else {
      const src = srcInput.value.trim();
      if (src) {
        close();
        onComplete(src);
      }
    }
  }

  pickLocalBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const selected = await tauriOpen({
        multiple: false,
        filters: [{
          name: '图片',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'],
        }],
      });
      if (!selected) return;
      let filePath: string | null = null;
      if (typeof selected === 'string') {
        filePath = selected;
      } else if (selected && typeof selected === 'object' && 'path' in selected) {
        filePath = (selected as { path: string }).path;
      }
      if (filePath) {
        localFilePath = filePath;
        const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? '未知文件';
        fileNameDisplay.textContent = `✓ ${fileName}`;
        fileNameDisplay.style.display = 'block';
        pickLocalBtn.classList.add('has-file');
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err);
    }
  });

  cancelBtn.addEventListener('click', () => { close(); });
  confirmBtn.addEventListener('click', submit);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) { close(); }
  });
  srcInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { close(); }
  });

  document.body.appendChild(overlay);
  setTimeout(() => {
    const firstInput = overlay.querySelector('input') as HTMLInputElement;
    if (firstInput) firstInput.focus();
  }, 50);
}

// ---------------------------------------------------------------------------
// 编辑现有 image-block（不插入新节点）
// ---------------------------------------------------------------------------

/**
 * 打开图片对话框以编辑现有 image-block 节点
 * 仅通过 `setNodeMarkup` 更新现有节点的 `src` 属性
 * 不插入新节点或加载占位符
 */
export async function openImageDialogForEdit(
  view: EditorView,
  nodePos: number,
): Promise<void> {
  const result = await openImageDialog();
  if (!result || !result.src) return;

  const { state, dispatch } = view;
  try {
    const resolvedPos = state.doc.resolve(nodePos);
    const node = resolvedPos.nodeAfter || resolvedPos.parent;
    if (node && (node.type.name === 'image-block' || node.type.name === 'image_block')) {
      const tr = state.tr.setNodeMarkup(nodePos, undefined, {
        ...node.attrs,
        src: result.src,
      });
      dispatch(tr);
    }
  } catch (e) {
    console.warn('Failed to update image block:', e);
  }
  view.focus();
}

// Register the openImageDialogForEdit function with the toolbar module
setOpenImageDialogForEdit(openImageDialogForEdit);

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { imageBlockComponent, openImageDialog };

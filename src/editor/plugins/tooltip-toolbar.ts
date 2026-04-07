/**
 * Tooltip Floating Toolbar Plugin
 *
 * Notion 风格的浮动格式化工具栏：
 * - 选中文字后在选区上方浮出
 * - 支持：加粗、斜体、下划线、删除线、行内代码、链接、图片、清除格式
 * - 已激活的格式按钮高亮显示
 * - 跟随主题切换（深色/浅色）
 */

import { TooltipProvider, tooltipFactory } from '@milkdown/kit/plugin/tooltip';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { EditorState } from '@milkdown/kit/prose/state';
import { NodeSelection, Selection } from '@milkdown/kit/prose/state';
import { toggleMark } from '@milkdown/kit/prose/commands';
import type { MarkType } from '@milkdown/kit/prose/model';

import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { useFileStore } from '@/stores/file-store';
import { fileService } from '@/services/tauri';

import { insertLoadingPlaceholder, replaceLoadingWithImage } from './image-block';

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if the selection is a CellSelection (table row/column/multi-cell selection)
 * CellSelection is from prosemirror-tables and has $anchorCell and $headCell properties
 */
function isCellSelection(selection: Selection): boolean {
  return (
    selection &&
    '$anchorCell' in selection &&
    '$headCell' in selection
  );
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

const icons = {
  bold: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>',
  italic:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>',
  underline:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/></svg>',
  strikethrough:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4c-.5-1.5-2.5-3-5-3-3 0-5 2-5 4 0 1.5.5 2.5 2 3.5"/><path d="M8 20c.5 1.5 2.5 3 5 3 3 0 5-2 5-4 0-1.5-.5-2.5-2-3.5"/><line x1="4" y1="12" x2="20" y2="12"/></svg>',
  code: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  image:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  clearFormat:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H8.5l-3.2-3.2a2 2 0 0 1 0-2.83L14.17 5.1a2 2 0 0 1 2.83 0l4.89 4.89a2 2 0 0 1 0 2.83L15.12 19.6"/><path d="m9.69 12.31 4.24 4.24"/></svg>',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a mark type is currently active in the selection
 */
function isMarkActive(state: EditorState, markType: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) {
    return !!markType.isInSet(state.storedMarks || $from.marks());
  }
  return state.doc.rangeHasMark(from, to, markType);
}

/**
 * Toggle a mark on the current selection
 */
function toggleMarkCommand(view: EditorView, markType: MarkType) {
  const cmd = toggleMark(markType);
  cmd(view.state, view.dispatch);
  view.focus();
}

/**
 * Remove all marks from the current selection
 */
function clearAllMarks(view: EditorView) {
  const { state, dispatch } = view;
  const { from, to } = state.selection;
  if (from === to) return;

  let tr = state.tr;
  // Remove all marks in the selection
  const marks = new Set<MarkType>();
  state.doc.nodesBetween(from, to, (node) => {
    node.marks.forEach((mark) => marks.add(mark.type));
  });
  marks.forEach((markType) => {
    tr = tr.removeMark(from, to, markType);
  });

  dispatch(tr);
  view.focus();
}

// ---------------------------------------------------------------------------
// Link Dialog
// ---------------------------------------------------------------------------

export function createLinkDialog(
  view: EditorView,
  existingText: string,
  existingHref: string,
  onSubmit: (text: string, href: string) => void,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'milkdown-tooltip-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'milkdown-tooltip-dialog';

  dialog.innerHTML = `
    <div class="milkdown-tooltip-dialog-title">插入链接</div>
    <div class="milkdown-tooltip-dialog-field">
      <label>文本</label>
      <input type="text" class="milkdown-tooltip-dialog-input" data-field="text" placeholder="链接文本" />
    </div>
    <div class="milkdown-tooltip-dialog-field">
      <label>URL</label>
      <input type="text" class="milkdown-tooltip-dialog-input" data-field="href" placeholder="https://" />
    </div>
    <div class="milkdown-tooltip-dialog-actions">
      <button class="milkdown-tooltip-dialog-btn cancel">取消</button>
      <button class="milkdown-tooltip-dialog-btn confirm">确定</button>
    </div>
  `;

  overlay.appendChild(dialog);

  const textInput = dialog.querySelector('[data-field="text"]') as HTMLInputElement;
  const hrefInput = dialog.querySelector('[data-field="href"]') as HTMLInputElement;
  const cancelBtn = dialog.querySelector('.cancel') as HTMLButtonElement;
  const confirmBtn = dialog.querySelector('.confirm') as HTMLButtonElement;

  textInput.value = existingText;
  hrefInput.value = existingHref;

  function close() {
    overlay.remove();
    view.focus();
  }

  function submit() {
    const text = textInput.value.trim();
    const href = hrefInput.value.trim();
    if (href) {
      onSubmit(text || href, href);
    }
    close();
  }

  cancelBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', submit);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  hrefInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') close();
  });
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      hrefInput.focus();
    }
    if (e.key === 'Escape') close();
  });

  return overlay;
}

// ---------------------------------------------------------------------------
// Image Dialog
// ---------------------------------------------------------------------------

function createImageDialog(
  view: EditorView,
  onSubmit: (src: string, alt: string) => void,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'milkdown-tooltip-dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'milkdown-tooltip-dialog';

  dialog.innerHTML = `
    <div class="milkdown-tooltip-dialog-title">插入图片</div>
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
      <div class="milkdown-tooltip-dialog-field">
        <label>描述（Alt）</label>
        <input type="text" class="milkdown-tooltip-dialog-input" data-field="upload-alt" placeholder="图片描述（可选）" />
      </div>
    </div>
    <div class="milkdown-tooltip-dialog-tab-panel" data-panel="url" style="display:none;">
      <div class="milkdown-tooltip-dialog-field">
        <label>图片 URL</label>
        <input type="text" class="milkdown-tooltip-dialog-input" data-field="src" placeholder="https://example.com/image.png" />
      </div>
      <div class="milkdown-tooltip-dialog-field">
        <label>描述（Alt）</label>
        <input type="text" class="milkdown-tooltip-dialog-input" data-field="url-alt" placeholder="图片描述（可选）" />
      </div>
    </div>
    <div class="milkdown-tooltip-dialog-actions">
      <button class="milkdown-tooltip-dialog-btn cancel">取消</button>
      <button class="milkdown-tooltip-dialog-btn confirm">确定</button>
    </div>
  `;

  overlay.appendChild(dialog);

  // Tab elements
  const tabBtns = dialog.querySelectorAll('.milkdown-tooltip-dialog-tab') as NodeListOf<HTMLButtonElement>;
  const uploadPanel = dialog.querySelector('[data-panel="upload"]') as HTMLElement;
  const urlPanel = dialog.querySelector('[data-panel="url"]') as HTMLElement;

  // Upload tab elements
  const pickLocalBtn = dialog.querySelector('[data-action="pick-local"]') as HTMLButtonElement;
  const fileNameDisplay = dialog.querySelector('[data-field="file-name"]') as HTMLDivElement;
  const uploadAltInput = dialog.querySelector('[data-field="upload-alt"]') as HTMLInputElement;

  // URL tab elements
  const srcInput = dialog.querySelector('[data-field="src"]') as HTMLInputElement;
  const urlAltInput = dialog.querySelector('[data-field="url-alt"]') as HTMLInputElement;

  const cancelBtn = dialog.querySelector('.cancel') as HTMLButtonElement;
  const confirmBtn = dialog.querySelector('.confirm') as HTMLButtonElement;

  // Track active tab and picked local file path
  let activeTab = 'upload';
  let localFilePath: string | null = null;

  // Tab switching
  function switchTab(tabName: string) {
    activeTab = tabName;
    tabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    uploadPanel.style.display = tabName === 'upload' ? '' : 'none';
    urlPanel.style.display = tabName === 'url' ? '' : 'none';

    // Auto-focus the right input
    if (tabName === 'url') {
      setTimeout(() => srcInput.focus(), 50);
    }
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(btn.dataset.tab || 'upload');
    });
  });

  function close() {
    overlay.remove();
    view.focus();
  }

  async function submit() {
    if (activeTab === 'upload') {
      if (!localFilePath) return;
      const alt = uploadAltInput.value.trim();
      const currentFile = useFileStore.getState().currentFile;
      if (!currentFile?.filePath) {
        console.error('No document path available for local image copy');
        close();
        return;
      }
      // Close dialog immediately so user sees loading in the editor
      close();
      try {
        const relativePath = await fileService.copyImageToAssets(localFilePath, currentFile.filePath);
        onSubmit(relativePath, alt);
      } catch (err) {
        console.error('Failed to copy image to assets:', err);
      }
    } else {
      const src = srcInput.value.trim();
      const alt = urlAltInput.value.trim();
      if (src) {
        close();
        onSubmit(src, alt);
      }
    }
  }

  // Handle "Pick Local File" button
  pickLocalBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const selected = await tauriOpen({
        multiple: false,
        filters: [
          {
            name: '图片',
            extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'],
          },
        ],
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

  cancelBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', submit);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });

  // Keyboard shortcuts
  srcInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      urlAltInput.focus();
    }
    if (e.key === 'Escape') close();
  });
  urlAltInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') close();
  });
  uploadAltInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') close();
  });

  return overlay;
}

// ---------------------------------------------------------------------------
// Toolbar Button Definition
// ---------------------------------------------------------------------------

interface ToolbarButton {
  id: string;
  icon: string;
  title: string;
  /** Mark type name in schema (null for special actions) */
  markName: string | null;
  /** Custom action handler (overrides default toggleMark) */
  action?: (view: EditorView) => void;
}

// ---------------------------------------------------------------------------
// Tooltip Toolbar View
// ---------------------------------------------------------------------------

class TooltipToolbarView {
  private container: HTMLElement;
  private buttons: Map<string, HTMLButtonElement> = new Map();
  private view: EditorView | null = null;
  private provider: TooltipProvider | null = null;

  private buttonDefs: ToolbarButton[] = [
    { id: 'bold', icon: icons.bold, title: '加粗', markName: 'strong' },
    { id: 'italic', icon: icons.italic, title: '斜体', markName: 'emphasis' },
    { id: 'underline', icon: icons.underline, title: '下划线', markName: 'underline' },
    { id: 'strikethrough', icon: icons.strikethrough, title: '删除线', markName: 'strike_through' },
    {
      id: 'separator-1',
      icon: '',
      title: '',
      markName: null,
    },
    { id: 'code', icon: icons.code, title: '行内代码', markName: 'inlineCode' },
    {
      id: 'link',
      icon: icons.link,
      title: '链接',
      markName: 'link',
      action: (view) => this.handleLinkAction(view),
    },
    {
      id: 'image',
      icon: icons.image,
      title: '图片',
      markName: null,
      action: (view) => this.handleImageAction(view),
    },
    {
      id: 'separator-2',
      icon: '',
      title: '',
      markName: null,
    },
    {
      id: 'clearFormat',
      icon: icons.clearFormat,
      title: '清除格式',
      markName: null,
      action: (view) => clearAllMarks(view),
    },
  ];

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'milkdown-tooltip';
    this.container.addEventListener('mousedown', (e) => {
      // Prevent the toolbar from stealing focus
      e.preventDefault();
    });

    this.buildToolbar();
  }

  get element() {
    return this.container;
  }

  private buildToolbar() {
    this.buttonDefs.forEach((def) => {
      if (def.id.startsWith('separator')) {
        const sep = document.createElement('div');
        sep.className = 'milkdown-tooltip-separator';
        this.container.appendChild(sep);
        return;
      }

      const btn = document.createElement('button');
      btn.className = 'milkdown-tooltip-btn';
      btn.innerHTML = def.icon;
      btn.setAttribute('aria-label', def.title);
      btn.setAttribute('title', def.title);
      btn.type = 'button';

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.view) return;

        if (def.action) {
          def.action(this.view);
        } else if (def.markName) {
          const markType = this.view.state.schema.marks[def.markName];
          if (markType) {
            toggleMarkCommand(this.view, markType);
          }
        }

        // Update active states after action
        this.updateActiveStates();
        // this.provider?.hide();
      });

      this.container.appendChild(btn);
      this.buttons.set(def.id, btn);
    });
  }

  /**
   * Update which buttons appear "active" based on current selection marks
   */
  updateActiveStates() {
    if (!this.view) return;
    const { state } = this.view;

    this.buttonDefs.forEach((def) => {
      if (def.id.startsWith('separator') || !def.markName) return;

      const btn = this.buttons.get(def.id);
      if (!btn) return;

      const markType = state.schema.marks[def.markName];
      if (markType) {
        const active = isMarkActive(state, markType);
        btn.dataset.active = String(active);
      } else {
        // Mark not available in schema, disable button
        btn.disabled = true;
        btn.style.opacity = '0.3';
        btn.style.cursor = 'not-allowed';
      }
    });
  }

  /**
   * Handle link button: show dialog to input text & URL
   */
  private handleLinkAction(view: EditorView) {
    const { state } = view;
    const { from, to } = state.selection;
    const selectedText = state.doc.textBetween(from, to, ' ');

    // Check if there's already a link mark on the selection
    const linkType = state.schema.marks.link;
    let existingHref = '';
    if (linkType) {
      state.doc.nodesBetween(from, to, (node) => {
        const linkMark = node.marks.find((m) => m.type === linkType);
        if (linkMark) {
          existingHref = linkMark.attrs.href || '';
        }
      });
    }

    // Hide the tooltip while dialog is open
    this.provider?.hide();

    const dialog = createLinkDialog(view, selectedText, existingHref, (text, href) => {
      if (!linkType) return;
      const { state: currentState, dispatch } = view;
      const { from: curFrom, to: curTo } = currentState.selection;

      let tr = currentState.tr;

      // Remove existing link marks first
      tr = tr.removeMark(curFrom, curTo, linkType);

      // If the text changed, replace the text content
      if (text !== currentState.doc.textBetween(curFrom, curTo, ' ')) {
        tr = tr.insertText(text, curFrom, curTo);
        const newTo = curFrom + text.length;
        tr = tr.addMark(curFrom, newTo, linkType.create({ href }));
      } else {
        tr = tr.addMark(curFrom, curTo, linkType.create({ href }));
      }

      dispatch(tr);
      view.focus();
    });

    document.body.appendChild(dialog);
    // Focus the first input after rendering
    setTimeout(() => {
      const firstInput = dialog.querySelector('input') as HTMLInputElement;
      if (firstInput) firstInput.focus();
    }, 50);
  }

  /**
   * Handle image button: insert an empty image-block (shows upload bar)
   * or open image dialog if image-block not available.
   */
  private handleImageAction(view: EditorView) {
    // Hide the tooltip while dialog is open
    this.provider?.hide();

    const { state, dispatch } = view;
    const schema = state.schema;
    const imageBlockType = schema.nodes['image-block'] || schema.nodes.image_block;

    if (imageBlockType) {
      // First delete the selected text, then insert image-block at the correct block position
      const { from, to } = state.selection;
      let tr = state.tr;

      // Delete the selected content first
      if (from !== to) {
        tr = tr.delete(from, to);
      }

      // After deletion, resolve the position to find the parent block boundary
      const mappedPos = tr.mapping.map(from);
      const $pos = tr.doc.resolve(mappedPos);

      // Find the end of the current block (paragraph) to insert the image-block after it
      // If the current block becomes empty after deletion, replace it entirely
      const parentNode = $pos.parent;

      const imageBlock = imageBlockType.create({ src: '', caption: '', ratio: 1 });

      if (parentNode.content.size === 0 || parentNode.textContent.trim() === '') {
        // Parent block is empty after deletion — replace it with the image-block
        const blockStart = $pos.before($pos.depth);
        const blockEnd = $pos.after($pos.depth);
        tr = tr.replaceWith(blockStart, blockEnd, imageBlock);
      } else {
        // Parent block still has content — insert image-block after the current block
        const blockEnd = $pos.after($pos.depth);
        tr = tr.insert(blockEnd, imageBlock);
      }

      dispatch(tr.scrollIntoView());
      view.focus();
    } else {
      // Fallback: use the old dialog approach with loading placeholder
      const dialog = createImageDialog(view, (src, alt) => {
        // For URL input, just insert directly
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
          const imageType = state.schema.nodes.image;
          if (!imageType) return;
          const { from, to } = state.selection;
          const tr = state.tr.replaceWith(from, to, imageType.create({ src, alt }));
          dispatch(tr);
          view.focus();
        } else {
          // For local file upload, show loading placeholder
          const placeholderId = insertLoadingPlaceholder(view);
          // The src is already a relative path from createImageDialog's upload handler
          replaceLoadingWithImage(view, placeholderId, src);
        }
      });

      document.body.appendChild(dialog);
      setTimeout(() => {
        const firstInput = dialog.querySelector('input') as HTMLInputElement;
        if (firstInput) firstInput.focus();
      }, 50);
    }
  }

  setView(view: EditorView) {
    this.view = view;
  }

  setProvider(provider: TooltipProvider) {
    this.provider = provider;
  }
}

// ---------------------------------------------------------------------------
// Factory & exports
// ---------------------------------------------------------------------------

export const tooltip = tooltipFactory('tooltip');

export function configureTooltip(ctx: Ctx) {
  const toolbarView = new TooltipToolbarView();

  ctx.set(tooltip.key, {
    view: (view: EditorView) => {
      toolbarView.setView(view);

      // Track mouse button state so we only show tooltip after selection completes
      let isMouseDown = false;

      const handleMouseDown = () => {
        isMouseDown = true;
      };
      const handleMouseUp = () => {
        isMouseDown = false;
        // Trigger a provider update after mouseup so tooltip can appear
        provider.update(view);
      };

      view.dom.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mouseup', handleMouseUp);

      const provider = new TooltipProvider({
        content: toolbarView.element,
        debounce: 50,
        shouldShow(view: EditorView, _prevState?: EditorState) {
          // Don't show while the mouse button is still held (still selecting)
          if (isMouseDown) return false;

          // Don't show if the view is not focused
          if (!view.hasFocus()) return false;

          const { state } = view;
          const { selection } = state;
          const { empty, from, to } = selection;

          // Only show when there's a non-empty text selection
          if (empty || from === to) return false;

          // Don't show for NodeSelection (when a node is selected, not text)
          // NodeSelection happens when clicking on node boundaries or draggable nodes
          if (selection instanceof NodeSelection) return false;

          // Don't show for CellSelection (table row/column/multi-cell selection)
          // CellSelection happens when clicking row/column handles or selecting multiple cells
          if (isCellSelection(selection)) return false;

          // Don't show if selection is entirely within a code block
          const $from = state.doc.resolve(from);
          if ($from.parent.type.name === 'code_block') return false;

          // Check that the selection contains actual text content
          const text = state.doc.textBetween(from, to, ' ');
          if (!text.trim()) return false;

          // Update active button states
          toolbarView.updateActiveStates();

          return true;
        },
      });

      toolbarView.setProvider(provider);

      return {
        update: (updatedView: EditorView, prevState: EditorState) => {
          toolbarView.setView(updatedView);
          provider.update(updatedView, prevState);
        },
        destroy: () => {
          view.dom.removeEventListener('mousedown', handleMouseDown);
          document.removeEventListener('mouseup', handleMouseUp);
          provider.destroy();
          toolbarView.element.remove();
        },
      };
    },
  });
}

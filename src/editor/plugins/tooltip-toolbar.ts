/**
 * Tooltip Floating Toolbar Plugin
 *
 * Notion 风格的浮动格式化工具栏：
 * - 选中文字后在选区上方浮出
 * - 支持：加粗、斜体、下划线、删除线、高亮、行内代码、链接、图片、清除格式
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
import { useSettingsStore } from '@/stores/settings-store';
import { AI_COMMANDS } from '@/services/ai/commands';
import type { AiCommand } from '@/types/ai';

import { insertLoadingPlaceholder, replaceLoadingWithImage } from './image-block';
import { runAiCommand } from './ai-edit';

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 检查选区是否为 CellSelection（表格行/列/多单元格选区）
 * CellSelection 来自 prosemirror-tables，具有 $anchorCell 和 $headCell 属性
 */
function isCellSelection(selection: Selection): boolean {
  return selection && '$anchorCell' in selection && '$headCell' in selection;
}

// ---------------------------------------------------------------------------
// SVG 图标
// ---------------------------------------------------------------------------

const icons = {
  bold: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>',
  italic:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>',
  underline:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/></svg>',
  strikethrough:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4c-.5-1.5-2.5-3-5-3-3 0-5 2-5 4 0 1.5.5 2.5 2 3.5"/><path d="M8 20c.5 1.5 2.5 3 5 3 3 0 5-2 5-4 0-1.5-.5-2.5-2-3.5"/><line x1="4" y1="12" x2="20" y2="12"/></svg>',
  highlight:
    '<svg width="18px" height="18px" viewBox="0 0 256 256" version="1.1" xmlns="http://www.w3.org/2000/svg"><g id="icon/填充色" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><g id="icon/背景颜色"><g id="编组" fill="currentColor"><g transform="translate(119.502295, 137.878331) rotate(-135.000000) translate(-119.502295, -137.878331) translate(48.002295, 31.757731)" id="矩形"><path d="M100.946943,60.8084699 L43.7469427,60.8084699 C37.2852111,60.8084699 32.0469427,66.0467383 32.0469427,72.5084699 L32.0469427,118.70847 C32.0469427,125.170201 37.2852111,130.40847 43.7469427,130.40847 L100.946943,130.40847 C107.408674,130.40847 112.646943,125.170201 112.646943,118.70847 L112.646943,72.5084699 C112.646943,66.0467383 107.408674,60.8084699 100.946943,60.8084699 Z M93.646,79.808 L93.646,111.408 L51.046,111.408 L51.046,79.808 L93.646,79.808 Z" fill-rule="nonzero"></path><path d="M87.9366521,16.90916 L87.9194966,68.2000001 C87.9183543,69.4147389 86.9334998,70.399264 85.7187607,70.4 L56.9423078,70.4 C55.7272813,70.4 54.7423078,69.4150264 54.7423078,68.2 L54.7423078,39.4621057 C54.7423078,37.2523513 55.5736632,35.1234748 57.0711706,33.4985176 L76.4832996,12.4342613 C78.9534987,9.75382857 83.1289108,9.5834005 85.8093436,12.0535996 C87.1658473,13.303709 87.9372691,15.0644715 87.9366521,16.90916 Z" fill-rule="evenodd"></path><path d="M131.3,111.241199 L11.7,111.241199 C5.23826843,111.241199 0,116.479467 0,122.941199 L0,200.541199 C0,207.002931 5.23826843,212.241199 11.7,212.241199 L131.3,212.241199 C137.761732,212.241199 143,207.002931 143,200.541199 L143,122.941199 C143,116.479467 137.761732,111.241199 131.3,111.241199 Z M124,130.241 L124,193.241 L19,193.241 L19,130.241 L124,130.241 Z" fill-rule="nonzero"></path></g></g><path d="M51,218 L205,218 C211.075132,218 216,222.924868 216,229 C216,235.075132 211.075132,240 205,240 L51,240 C44.9248678,240 40,235.075132 40,229 C40,222.924868 44.9248678,218 51,218 Z" id="矩形" fill="#FBDE28"></path></g></g></svg>',
  superscript:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 19 5.5-8L4 3"/><path d="m14 19-5.5-8L14 3"/><path d="M20 9h-4c0-1.5.44-2 1.5-2.5S20 5.33 20 4c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07"/></svg>',
  subscript:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m4 19 5.5-8L4 3"/><path d="m14 19-5.5-8L14 3"/><path d="M20 21h-4c0-1.5.44-2 1.5-2.5S20 17.33 20 16c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07"/></svg>',
  code: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  image:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  clearFormat:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H8.5l-3.2-3.2a2 2 0 0 1 0-2.83L14.17 5.1a2 2 0 0 1 2.83 0l4.89 4.89a2 2 0 0 1 0 2.83L15.12 19.6"/><path d="m9.69 12.31 4.24 4.24"/></svg>',
  aiPolish:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 13.9 8.1 19 10 13.9 11.9 12 17 10.1 11.9 5 10 10.1 8.1 12 3z"/><path d="M18 16l.75 2L21 19l-2.25 1L18 22l-.75-2L15 19l2.25-1L18 16z"/></svg>',
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
 * 在当前选区上切换 mark
 */
function toggleMarkCommand(view: EditorView, markType: MarkType) {
  const cmd = toggleMark(markType);
  cmd(view.state, view.dispatch);
  view.focus();
}

/**
 * 移除当前选区的所有 marks
 */
function clearAllMarks(view: EditorView) {
  const { state, dispatch } = view;
  const { from, to } = state.selection;
  if (from === to) return;

  let tr = state.tr;
  // 移除选区中的所有 marks
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

/**
 * 是否在 tooltip 中显示 AI 按钮
 * - 设置里 ai.enabled 为 true
 * - 设置里 ai.showInTooltip 为 true
 */
function isAiToolbarEnabled(): boolean {
  const { config } = useSettingsStore.getState();
  return Boolean(config.ai?.enabled) && Boolean(config.ai?.showInTooltip);
}

// ---------------------------------------------------------------------------
// 链接对话框
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
// 图片对话框
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

  // Tab 元素
  const tabBtns = dialog.querySelectorAll(
    '.milkdown-tooltip-dialog-tab',
  ) as NodeListOf<HTMLButtonElement>;
  const uploadPanel = dialog.querySelector('[data-panel="upload"]') as HTMLElement;
  const urlPanel = dialog.querySelector('[data-panel="url"]') as HTMLElement;

  // 上传 Tab 元素
  const pickLocalBtn = dialog.querySelector('[data-action="pick-local"]') as HTMLButtonElement;
  const fileNameDisplay = dialog.querySelector('[data-field="file-name"]') as HTMLDivElement;
  const uploadAltInput = dialog.querySelector('[data-field="upload-alt"]') as HTMLInputElement;

  // URL Tab 元素
  const srcInput = dialog.querySelector('[data-field="src"]') as HTMLInputElement;
  const urlAltInput = dialog.querySelector('[data-field="url-alt"]') as HTMLInputElement;

  const cancelBtn = dialog.querySelector('.cancel') as HTMLButtonElement;
  const confirmBtn = dialog.querySelector('.confirm') as HTMLButtonElement;

  // 跟踪活动 Tab 和选中的本地文件路径
  let activeTab = 'upload';
  let localFilePath: string | null = null;

  // Tab 切换
  function switchTab(tabName: string) {
    activeTab = tabName;
    tabBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    uploadPanel.style.display = tabName === 'upload' ? '' : 'none';
    urlPanel.style.display = tabName === 'url' ? '' : 'none';

    // 自动聚焦正确的输入框
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
      // 立即关闭对话框，让用户在编辑器中看到加载状态
      close();
      try {
        const relativePath = await fileService.copyImageToAssets(
          localFilePath,
          currentFile.filePath,
        );
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

  // 处理"选择本地文件"按钮
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

  // 键盘快捷键
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
// 工具栏按钮定义
// ---------------------------------------------------------------------------

interface ToolbarButton {
  id: string;
  icon: string;
  title: string;
  /** schema 中的 mark 类型名称（特殊操作为 null） */
  markName: string | null;
  /** 自定义操作处理器（覆盖默认的 toggleMark） */
  action?: (view: EditorView) => void;
  /** 追加到按钮上的额外 class（用于 AI 等特殊样式） */
  extraClass?: string;
  /** 动态显隐：返回 false 时按钮会被隐藏 */
  isVisible?: () => boolean;
  /** 子菜单项（AI 按钮使用） */
  submenuItems?: Array<{
    id: string;
    icon: string;
    label: string;
    action: (view: EditorView) => void;
  }>;
}

// ---------------------------------------------------------------------------
// Tooltip 工具栏视图
// ---------------------------------------------------------------------------

class TooltipToolbarView {
  private container: HTMLElement;
  private buttons: Map<string, HTMLButtonElement> = new Map();
  /** 保存各 id 对应的 DOM 元素（按钮或分隔符），用于动态显隐 */
  private elements: Map<string, HTMLElement> = new Map();
  private view: EditorView | null = null;
  private provider: TooltipProvider | null = null;

  private buttonDefs: ToolbarButton[] = [
    { id: 'bold', icon: icons.bold, title: '加粗', markName: 'strong' },
    { id: 'italic', icon: icons.italic, title: '斜体', markName: 'emphasis' },
    { id: 'underline', icon: icons.underline, title: '下划线', markName: 'underline' },
    { id: 'strikethrough', icon: icons.strikethrough, title: '删除线', markName: 'strike_through' },
    { id: 'highlight', icon: icons.highlight, title: '高亮', markName: 'highlight' },
    { id: 'superscript', icon: icons.superscript, title: '上标', markName: 'superscript' },
    { id: 'subscript', icon: icons.subscript, title: '下标', markName: 'subscript' },
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
    {
      id: 'separator-ai',
      icon: '',
      title: '',
      markName: null,
      isVisible: () => isAiToolbarEnabled(),
    },
    {
      id: 'ai-menu',
      icon: icons.aiPolish,
      title: 'AI 助手',
      markName: null,
      extraClass: 'milkdown-tooltip-btn-ai',
      isVisible: () => isAiToolbarEnabled(),
      action: (view) => this.handleAiCommand(view, AI_COMMANDS.polish),
      submenuItems: [
        {
          id: 'ai-polish',
          icon: AI_COMMANDS.polish.icon,
          label: '润色',
          action: (view) => this.handleAiCommand(view, AI_COMMANDS.polish),
        },
        {
          id: 'ai-translate',
          icon: AI_COMMANDS.translate.icon,
          label: '翻译',
          action: (view) => this.handleAiCommand(view, AI_COMMANDS.translate),
        },
        {
          id: 'ai-explain',
          icon: AI_COMMANDS.explain.icon,
          label: '解释',
          action: (view) => this.handleAiCommand(view, AI_COMMANDS.explain),
        },
      ],
    },
  ];

  /** 当前显示的 AI 子菜单元素 */
  private aiSubmenu: HTMLElement | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'milkdown-tooltip';
    this.container.addEventListener('mousedown', (e) => {
      // 阻止工具栏抢占焦点
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
        this.elements.set(def.id, sep);
        return;
      }

      const btn = document.createElement('button');
      btn.className = 'milkdown-tooltip-btn';
      if (def.extraClass) {
        btn.classList.add(def.extraClass);
      }
      btn.innerHTML = def.icon;
      btn.setAttribute('aria-label', def.title);
      btn.setAttribute('title', def.title);
      btn.type = 'button';

      // 有子菜单的按钮：添加下拉箭头，hover 展开
      if (def.submenuItems && def.submenuItems.length > 0) {
        // 添加小三角指示有子菜单
        const arrow = document.createElement('span');
        arrow.className = 'milkdown-tooltip-btn-arrow';
        arrow.innerHTML = '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>';
        btn.appendChild(arrow);

        btn.addEventListener('mouseenter', () => {
          this.showAiSubmenu(btn, def);
        });

        btn.addEventListener('mouseleave', (e) => {
          // 如果鼠标移向子菜单，不隐藏
          const relatedTarget = e.relatedTarget as HTMLElement | null;
          if (relatedTarget && this.aiSubmenu?.contains(relatedTarget)) return;
          // 延迟隐藏，给用户时间移到子菜单上
          setTimeout(() => {
            if (!this.aiSubmenu?.matches(':hover') && !btn.matches(':hover')) {
              this.hideAiSubmenu();
            }
          }, 100);
        });

        // 默认点击执行第一个子菜单项（润色）
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!this.view) return;
          if (def.action) {
            def.action(this.view);
          }
        });
      } else {
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

          // 操作后更新激活状态
          this.updateActiveStates();
        });
      }

      this.container.appendChild(btn);
      this.buttons.set(def.id, btn);
      this.elements.set(def.id, btn);
    });
  }

  /** 显示 AI 子菜单 */
  private showAiSubmenu(anchorBtn: HTMLElement, def: ToolbarButton) {
    if (this.aiSubmenu) {
      this.hideAiSubmenu();
    }
    if (!def.submenuItems || !this.view) return;

    const submenu = document.createElement('div');
    submenu.className = 'milkdown-tooltip-ai-submenu';

    def.submenuItems.forEach((item) => {
      const menuItem = document.createElement('button');
      menuItem.className = 'milkdown-tooltip-ai-submenu-item';
      menuItem.type = 'button';
      menuItem.innerHTML = `<span class="milkdown-tooltip-ai-submenu-icon">${item.icon}</span><span>${item.label}</span>`;

      menuItem.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.view) return;
        item.action(this.view);
        this.hideAiSubmenu();
      });

      submenu.appendChild(menuItem);
    });

    submenu.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!submenu.matches(':hover') && !anchorBtn.matches(':hover')) {
          this.hideAiSubmenu();
        }
      }, 100);
    });

    // 将子菜单挂载到 body，避免溢出 tooltip 容器导致编辑器出现滚动条
    document.body.appendChild(submenu);

    requestAnimationFrame(() => {
      const btnRect = anchorBtn.getBoundingClientRect();
      const submenuRect = submenu.getBoundingClientRect();

      // 默认在按钮下方，使用视口坐标（fixed 定位）
      let top = btnRect.bottom + 4;
      let left = btnRect.left;

      // 如果超出视口底部，改为在上方显示
      if (btnRect.bottom + submenuRect.height + 8 > window.innerHeight) {
        top = btnRect.top - submenuRect.height - 4;
      }

      // 如果超出视口右边，向左偏移
      if (left + submenuRect.width > window.innerWidth) {
        left = window.innerWidth - submenuRect.width - 8;
      }

      submenu.style.top = `${top}px`;
      submenu.style.left = `${left}px`;
    });

    this.aiSubmenu = submenu;
  }

  /** 隐藏 AI 子菜单 */
  hideAiSubmenu() {
    if (this.aiSubmenu) {
      this.aiSubmenu.remove();
      this.aiSubmenu = null;
    }
  }

  /**
   * 根据当前选区的 marks 更新哪些按钮显示为"激活"
   */
  updateActiveStates() {
    if (!this.view) return;
    const { state } = this.view;

    this.buttonDefs.forEach((def) => {
      // 先处理动态显隐（AI 等按钮受设置开关控制）
      if (def.isVisible) {
        const el = this.elements.get(def.id);
        if (el) {
          el.style.display = def.isVisible() ? '' : 'none';
        }
      }

      if (def.id.startsWith('separator') || !def.markName) return;

      const btn = this.buttons.get(def.id);
      if (!btn) return;

      const markType = state.schema.marks[def.markName];
      if (markType) {
        const active = isMarkActive(state, markType);
        btn.dataset.active = String(active);
      } else {
        // schema 中没有该 mark，禁用按钮
        btn.disabled = true;
        btn.style.opacity = '0.3';
        btn.style.cursor = 'not-allowed';
      }
    });
  }

  /**
   * 处理 AI 指令按钮
   *
   * 先隐藏 tooltip，让 AI 交互组件在原选区处显示；
   * 然后把当前选区交给 ai-edit 插件处理。
   */
  private handleAiCommand(view: EditorView, command: AiCommand) {
    this.provider?.hide();
    // 让 tooltip 隐藏后再异步启动，避免 DOM 遮挡
    requestAnimationFrame(() => {
      void runAiCommand(view, command);
    });
  }

  /**
   * 处理链接按钮：显示对话框输入文本和 URL
   */
  private handleLinkAction(view: EditorView) {
    const { state } = view;
    const { from, to } = state.selection;
    const selectedText = state.doc.textBetween(from, to, ' ');

    // 检查选区上是否已有链接 mark
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

      // 先移除已有的链接 marks
      tr = tr.removeMark(curFrom, curTo, linkType);

      // 如果文本改变，替换文本内容
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
    // 渲染后聚焦第一个输入框
    setTimeout(() => {
      const firstInput = dialog.querySelector('input') as HTMLInputElement;
      if (firstInput) firstInput.focus();
    }, 50);
  }

  /**
   * 处理图片按钮：插入空的 image-block（显示上传栏）
   * 或在 image-block 不可用时打开图片对话框
   */
  private handleImageAction(view: EditorView) {
    // Hide the tooltip while dialog is open
    this.provider?.hide();

    const { state, dispatch } = view;
    const schema = state.schema;
    const imageBlockType = schema.nodes['image-block'] || schema.nodes.image_block;

    if (imageBlockType) {
      // 先删除选中的文本，然后在正确的块位置插入 image-block
      const { from, to } = state.selection;
      let tr = state.tr;

      // 先删除选中的内容
      if (from !== to) {
        tr = tr.delete(from, to);
      }

      // 删除后，解析位置以找到父块边界
      const mappedPos = tr.mapping.map(from);
      const $pos = tr.doc.resolve(mappedPos);

      // 找到当前块（段落）的末尾，在其后插入 image-block
      // 如果当前块在删除后变空，则完全替换它
      const parentNode = $pos.parent;

      const imageBlock = imageBlockType.create({ src: '', caption: '', ratio: 1 });

      if (parentNode.content.size === 0 || parentNode.textContent.trim() === '') {
        // 删除后父块为空 — 用 image-block 替换它
        const blockStart = $pos.before($pos.depth);
        const blockEnd = $pos.after($pos.depth);
        tr = tr.replaceWith(blockStart, blockEnd, imageBlock);
      } else {
        // 父块仍有内容 — 在当前块后插入 image-block
        const blockEnd = $pos.after($pos.depth);
        tr = tr.insert(blockEnd, imageBlock);
      }

      dispatch(tr.scrollIntoView());
      view.focus();
    } else {
      // 回退：使用带加载占位符的旧对话框方式
      const dialog = createImageDialog(view, (src, alt) => {
        // 对于 URL 输入，直接插入
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
          const imageType = state.schema.nodes.image;
          if (!imageType) return;
          const { from, to } = state.selection;
          const tr = state.tr.replaceWith(from, to, imageType.create({ src, alt }));
          dispatch(tr);
          view.focus();
        } else {
          // 对于本地文件上传，显示加载占位符
          const placeholderId = insertLoadingPlaceholder(view);
          // src 已经是 createImageDialog 上传处理器返回的相对路径
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
// 工厂和导出
// ---------------------------------------------------------------------------

export const tooltip = tooltipFactory('tooltip');

export function configureTooltip(ctx: Ctx) {
  const toolbarView = new TooltipToolbarView();

  ctx.set(tooltip.key, {
    view: (view: EditorView) => {
      toolbarView.setView(view);

      // 跟踪鼠标按钮状态，只在选区完成后显示 tooltip
      let isMouseDown = false;

      const handleMouseDown = () => {
        isMouseDown = true;
      };
      const handleMouseUp = () => {
        isMouseDown = false;
        // mouseup 后触发 provider 更新，以便 tooltip 可以出现
        provider.update(view);
      };

      view.dom.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('mouseup', handleMouseUp);

      const provider = new TooltipProvider({
        content: toolbarView.element,
        debounce: 50,
        shouldShow(view: EditorView, _prevState?: EditorState) {
          // 鼠标按钮仍按下时不显示（仍在选择）
          if (isMouseDown) return false;

          // 视图未聚焦时不显示
          if (!view.hasFocus()) return false;

          const { state } = view;
          const { selection } = state;
          const { empty, from, to } = selection;

          // 仅在有非空文本选区时显示
          if (empty || from === to) return false;

          // 对于 NodeSelection 不显示（选中的是节点而非文本）
          // NodeSelection 发生在点击节点边界或可拖拽节点时
          if (selection instanceof NodeSelection) return false;

          // 对于 CellSelection 不显示（表格行/列/多单元格选区）
          // CellSelection 发生在点击行/列手柄或选择多个单元格时
          if (isCellSelection(selection)) return false;

          // 如果选区完全在代码块内不显示
          const $from = state.doc.resolve(from);
          if ($from.parent.type.name === 'code_block') return false;

          // 检查选区是否包含实际文本内容
          const text = state.doc.textBetween(from, to, ' ');
          if (!text.trim()) return false;

          // 更新活动按钮状态
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
          toolbarView.hideAiSubmenu();
          provider.destroy();
          toolbarView.element.remove();
        },
      };
    },
  });
}

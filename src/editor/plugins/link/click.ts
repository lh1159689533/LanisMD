/**
 * Link Click Plugin
 *
 * 处理 Cmd+Click (macOS) / Ctrl+Click (Linux/Windows) 链接跳转：
 * - 内部锚点（#heading）：滚动到当前文档对应标题
 * - 本地 Markdown 文件：在编辑器中打开（支持相对路径、绝对路径、file:// 协议，扩展名可省略）
 * - 本地 Markdown 文件 + 锚点：打开文件并跳转到对应标题
 * - 本地非 Markdown 文件：调用系统默认应用打开
 * - 外部 URL：用系统浏览器打开
 *
 * 文件不存在时通过 toast 提示用户。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { invoke } from '@tauri-apps/api/core';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import { parseLink } from './utils';
import type { ParsedLink } from './utils';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useUIStore } from '@/stores/ui-store';
import { fileService } from '@/services/tauri';
import { scrollToHeadingByIndex } from '../outline-sync';

const LINK_CLICK_KEY = new PluginKey('link-click');

// ---------------------------------------------------------------------------
// Rust 命令的返回类型
// ---------------------------------------------------------------------------

interface ResolvedLinkPath {
  resolvedPath: string | null;
  exists: boolean;
  isMarkdown: boolean;
}

// ---------------------------------------------------------------------------
// 核心跳转逻辑（导出供 tooltip 复用）
// ---------------------------------------------------------------------------

/**
 * 执行链接跳转
 *
 * @param href 链接的 href 值
 * @param view ProseMirror EditorView（用于内部锚点跳转时获取文档标题信息）
 */
export async function navigateLink(href: string, view?: EditorView): Promise<void> {
  const parsed = parseLink(href);

  switch (parsed.type) {
    case 'internal-anchor':
      handleInternalAnchor(parsed, view);
      break;
    case 'local-file':
      await handleLocalFile(parsed, view);
      break;
    case 'external-url':
      handleExternalUrl(parsed);
      break;
  }
}

// ---------------------------------------------------------------------------
// 内部锚点跳转
// ---------------------------------------------------------------------------

/**
 * 处理文档内部锚点跳转（#heading）
 */
function handleInternalAnchor(parsed: ParsedLink, view?: EditorView): void {
  if (!parsed.anchor) return;

  const headingIndex = findHeadingIndexInCurrentDoc(parsed.anchor, view);
  if (headingIndex >= 0) {
    scrollToHeadingByIndex(headingIndex);
  } else {
    useUIStore.getState().addToast({
      type: 'warning',
      message: `未找到标题: #${parsed.anchor}`,
    });
  }
}

/**
 * 在当前文档中查找锚点对应的标题索引
 */
function findHeadingIndexInCurrentDoc(anchor: string, view?: EditorView): number {
  // 对目标锚点应用与标题相同的规范化规则，确保两侧格式一致
  const target = toAnchor(anchor);
  if (!target) return -1;

  // 从 ProseMirror 文档中提取标题
  const headings = extractHeadingsFromView(view);
  if (headings.length === 0) return -1;

  return matchAnchorToHeading(headings, target);
}

// ---------------------------------------------------------------------------
// 本地文件跳转
// ---------------------------------------------------------------------------

/**
 * 处理本地文件链接跳转
 */
async function handleLocalFile(parsed: ParsedLink, view?: EditorView): Promise<void> {
  // 获取当前文件所在目录
  const currentFilePath = useFileStore.getState().currentFile?.filePath;
  if (!currentFilePath) {
    useUIStore.getState().addToast({
      type: 'warning',
      message: '请先保存当前文件后再使用链接跳转',
    });
    return;
  }

  const currentDir = getParentDir(currentFilePath);

  try {
    // 调用 Rust 解析路径
    const result = await invoke<ResolvedLinkPath>('resolve_link_path', {
      href: parsed.filePath,
      currentFileDir: currentDir,
    });

    if (!result.exists || !result.resolvedPath) {
      useUIStore.getState().addToast({
        type: 'error',
        message: `文件不存在: ${parsed.filePath}`,
      });
      return;
    }

    if (result.isMarkdown) {
      // Markdown 文件：在编辑器中打开
      await openMarkdownFile(result.resolvedPath, parsed.anchor, view);
    } else {
      // 非 Markdown 文件：用系统默认应用打开
      await shellOpen(result.resolvedPath);
    }
  } catch (err) {
    console.error('Failed to resolve link path:', err);
    useUIStore.getState().addToast({
      type: 'error',
      message: `链接解析失败: ${parsed.filePath}`,
    });
  }
}

/**
 * 在编辑器中打开 Markdown 文件
 */
async function openMarkdownFile(
  absolutePath: string,
  anchor: string,
  _view?: EditorView,
): Promise<void> {
  const { openFile, currentFile } = useFileStore.getState();

  // 如果是当前已打开的文件，只跳转锚点
  if (currentFile?.filePath === absolutePath) {
    if (anchor) {
      // 等一帧让文档加载完成
      requestAnimationFrame(() => {
        const pmView = useEditorStore.getState().wysiwygView;
        const headings = extractHeadingsFromView(pmView ?? undefined);
        const idx = matchAnchorToHeading(headings, toAnchor(anchor));
        if (idx >= 0) {
          scrollToHeadingByIndex(idx);
        }
      });
    }
    return;
  }

  // 处理未保存的更改：已有路径的文件静默保存
  if (currentFile?.isDirty && currentFile.filePath) {
    try {
      await fileService.writeFile({
        path: currentFile.filePath,
        content: currentFile.content,
        encoding: currentFile.encoding,
      });
      useFileStore.getState().markSaved();
    } catch (err) {
      console.error('Failed to auto-save before link navigation:', err);
    }
  }

  try {
    const result = await fileService.readFile({
      path: absolutePath,
      encoding: 'utf-8',
    });
    const fileName = absolutePath.split('/').pop() ?? absolutePath.split('\\').pop() ?? 'Unknown';
    openFile(absolutePath, result.content, result.encoding ?? 'utf-8', fileName);

    // 在文件树中高亮
    useFileTreeStore.getState().revealFile(absolutePath);

    // 如果有锚点，等文件加载和编辑器渲染完成后跳转
    if (anchor) {
      // 需要等待编辑器重新创建并渲染完成
      // useFileStore.openFile 会触发编辑器重建，需要延迟一段时间
      setTimeout(() => {
        const pmView = useEditorStore.getState().wysiwygView;
        const headings = extractHeadingsFromView(pmView ?? undefined);
        const idx = matchAnchorToHeading(headings, toAnchor(anchor));
        if (idx >= 0) {
          scrollToHeadingByIndex(idx);
        }
      }, 500);
    }
  } catch (err) {
    console.error('Failed to open markdown file:', err);
    useUIStore.getState().addToast({
      type: 'error',
      message: `打开文件失败: ${absolutePath}`,
    });
  }
}

// ---------------------------------------------------------------------------
// 外部 URL
// ---------------------------------------------------------------------------

/**
 * 处理外部 URL：用系统默认浏览器打开
 */
function handleExternalUrl(parsed: ParsedLink): void {
  if (!parsed.href) return;
  shellOpen(parsed.href).catch((err) => {
    console.error('Failed to open external link:', err);
  });
}

// ---------------------------------------------------------------------------
// 标题提取和锚点匹配辅助函数
// ---------------------------------------------------------------------------

interface SimpleHeading {
  text: string;
  index: number;
}

/**
 * 从 ProseMirror EditorView 中提取所有标题
 */
function extractHeadingsFromView(view?: EditorView): SimpleHeading[] {
  if (!view) return [];

  const headings: SimpleHeading[] = [];
  let headingIndex = 0;

  view.state.doc.descendants((node) => {
    if (node.type.name === 'heading') {
      const text = node.textContent.trim();
      if (text) {
        headings.push({ text, index: headingIndex });
        headingIndex++;
      }
    }
  });

  return headings;
}

/**
 * 将标题文本转换为锚点格式
 */
function toAnchor(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 根据锚点匹配标题
 *
 * 实现 Typora 的重复标题编号规则：
 * - 如果只有一个同名标题，#heading 直接匹配
 * - 如果有多个同名标题，使用 #heading-1, #heading-2 编号（从 1 开始）
 *
 * @returns 匹配到的标题的 index，未找到返回 -1
 */
function matchAnchorToHeading(headings: SimpleHeading[], targetAnchor: string): number {
  if (!targetAnchor) return -1;

  // 第一轮：构建锚点到标题的映射
  // 统计每个基础锚点的出现次数
  const anchorOccurrences = new Map<string, Array<{ index: number; occurrence: number }>>();

  for (const h of headings) {
    const baseAnchor = toAnchor(h.text);
    if (!anchorOccurrences.has(baseAnchor)) {
      anchorOccurrences.set(baseAnchor, []);
    }
    const list = anchorOccurrences.get(baseAnchor)!;
    list.push({ index: h.index, occurrence: list.length + 1 });
  }

  // 第二轮：匹配目标锚点
  for (const [baseAnchor, items] of anchorOccurrences) {
    // 如果只有一个同名标题，无编号的锚点直接匹配
    if (items.length === 1 && targetAnchor === baseAnchor) {
      return items[0].index;
    }

    // 对于多个同名标题或带编号的锚点
    for (const item of items) {
      const numberedAnchor = `${baseAnchor}-${item.occurrence}`;
      if (targetAnchor === numberedAnchor) {
        return item.index;
      }
    }
  }

  return -1;
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

/**
 * 获取文件所在目录路径
 */
function getParentDir(filePath: string): string {
  const sep = filePath.includes('/') ? '/' : '\\';
  const parts = filePath.split(sep);
  parts.pop();
  return parts.join(sep);
}

// ---------------------------------------------------------------------------
// ProseMirror 插件：拦截 Cmd+Click
// ---------------------------------------------------------------------------

export const linkClickPlugin = $prose(() => {
  return new Plugin({
    key: LINK_CLICK_KEY,
    props: {
      handleClick(view, pos, event) {
        // 检查是否按住了 Cmd (macOS) 或 Ctrl (Windows/Linux)
        const isMod = event.metaKey || event.ctrlKey;
        if (!isMod) return false;

        // 查找点击位置的 link mark
        const { state } = view;
        const linkType = state.schema.marks.link;
        if (!linkType) return false;

        const $pos = state.doc.resolve(pos);
        const marks = $pos.marks();
        const linkMark = marks.find((m) => m.type === linkType);
        if (!linkMark) return false;

        const href = linkMark.attrs.href;
        if (!href) return false;

        // 阻止默认行为，执行跳转
        event.preventDefault();
        navigateLink(href, view);

        return true;
      },
    },
  });
});

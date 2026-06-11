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
import { openUrl, openPath } from '@tauri-apps/plugin-opener';
import { parseLink } from './utils';
import type { ParsedLink } from './utils';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
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
      await handleExternalUrl(parsed);
      break;
  }
}

/**
 * 判断是否为 http/https 协议的链接（需要确认弹窗的目标）
 */
function isHttpUrl(href: string): boolean {
  const lower = href.trim().toLowerCase();
  return lower.startsWith('http://') || lower.startsWith('https://');
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
      await openPath(result.resolvedPath);
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
 * 处理外部 URL：根据设置决定是否弹窗确认，再用系统默认浏览器打开。
 *
 * - 仅对 http/https 链接进行确认拦截（与用户期望的"访问外部网页"语义一致）
 * - 其他协议（mailto / tel / ftp 等）保持原直接打开行为
 * - 用户在弹窗勾选「不再提示」后，会把设置项 `confirmExternalLinkOpen` 置为 false
 */
async function handleExternalUrl(parsed: ParsedLink): Promise<void> {
  if (!parsed.href) return;

  // 仅 http/https 走确认流程
  if (isHttpUrl(parsed.href)) {
    const { config, setConfig } = useSettingsStore.getState();

    if (config.confirmExternalLinkOpen) {
      const { requestLinkConfirm } = useUIStore.getState();
      const { confirmed, dontAskAgain } = await requestLinkConfirm(parsed.href);

      if (!confirmed) return;

      // 用户勾选「不再提示」：关闭设置开关
      if (dontAskAgain) {
        setConfig('confirmExternalLinkOpen', false);
      }
    }
  }

  try {
    await openUrl(parsed.href);
  } catch (err) {
    console.error('Failed to open external link:', err);
  }
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
      // 使用 handleDOMEvents.click 而非 handleClick：
      // - handleClick 接收的是 mouseup 合成事件，preventDefault 无法阻止 <a href> 的浏览器默认导航
      // - handleDOMEvents.click 接收原生 click 事件，preventDefault 才能真正取消默认跳转
      handleDOMEvents: {
        click(view, event) {
          // 沿 DOM 树向上找最近的 <a> 元素（点击点可能落在 <a> 内的 <strong>、<em> 等子节点上）
          const target = event.target as HTMLElement | null;
          const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
          if (!anchor) return false;

          // 用 getAttribute 而不是 .href，避免浏览器把相对路径解析成绝对 URL（影响本地文件判断）
          const href = anchor.getAttribute('href');
          if (!href) return false;

          // 校验该 <a> 确实在 ProseMirror 文档树内（排除 tooltip / 其它 UI 层的 <a>）。
          // 注意：不再使用 $pos.marks() 反查 link mark —— 因为 posAtDOM 返回的位置常落在
          // link 文本起点的边界，$pos.marks() 在边界会返回空数组（边界既不归属于前节点也不归属于后节点），
          // 导致校验失败 → return false → webview 执行默认跳转。
          // 只要 posAtDOM 返回 >= 0，就说明该 <a> 是文档内容渲染出来的，足够安全。
          const pos = view.posAtDOM(anchor, 0);
          if (pos < 0) return false;

          const isMod = event.metaKey || event.ctrlKey;
          const isExternalHttp = isHttpUrl(href);

          // 拦截策略：
          // - 外部 http/https 链接：任何点击都拦截（覆盖 webview 默认 <a> 跳转），
          //   走 navigateLink → handleExternalUrl → 弹确认框 → 浏览器打开
          // - 本地文件 / 锚点链接：仅 Cmd/Ctrl+点击 时拦截（保留编辑时光标定位的默认行为）
          if (!isExternalHttp && !isMod) {
            return false;
          }

          // 关键：阻止原生 click 事件的默认行为，避免 webview 自动跳转浏览器
          event.preventDefault();
          event.stopPropagation();
          navigateLink(href, view);

          return true;
        },
      },
    },
  });
});

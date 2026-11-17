/**
 * 图表导出 - 保存流程
 *
 * 统一「生成内容 → 选择保存路径 → 写入文件 → 结果提示」流程，供文本绘图（Mermaid）、
 * 思维导图、画板共用。先生成再弹窗：内容为空或生成失败时直接提示，不让用户白选路径。
 *
 * @changelog
 * | 版本   | 变更说明             | 关联                       |
 * | v1.0.0 | 初始实现：统一导出保存流程 | FEAT: 文本绘图/导图/画板导出 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

import { useFileStore } from '@/stores/file-store';
import { useUIStore } from '@/stores/ui-store';

/** 导出格式 */
export type DiagramExportFormat = 'png' | 'svg';

/** 导出参数 */
export interface DiagramExportOptions {
  /** 图表类型名，用于默认文件名，如「思维导图」 */
  label: string;
  /** 导出格式 */
  format: DiagramExportFormat;
  /** 生成文件内容：PNG 返回字节，SVG 返回文本 */
  render: () => Promise<Uint8Array | string>;
}

/** 可直接展示给用户的导出错误（如内容为空） */
export class DiagramExportError extends Error {}

const FORMAT_FILTERS: Record<DiagramExportFormat, { name: string; extensions: string[] }> = {
  png: { name: 'PNG 图片', extensions: ['png'] },
  svg: { name: 'SVG 矢量图', extensions: ['svg'] },
};

/**
 * 执行一次导出。用户取消保存时静默返回 false。
 *
 * @returns 是否成功写入文件
 */
export async function exportDiagram(options: DiagramExportOptions): Promise<boolean> {
  const { label, format, render } = options;

  let content: Uint8Array | string;
  try {
    content = await render();
  } catch (err) {
    notifyError(err);
    return false;
  }

  const savePath = await save({
    title: `导出${label}`,
    defaultPath: buildDefaultPath(label, format),
    filters: [FORMAT_FILTERS[format]],
  });
  if (!savePath) return false;

  try {
    if (typeof content === 'string') {
      await writeTextFile(savePath, content);
    } else {
      await writeFile(savePath, content);
    }
  } catch (err) {
    notifyError(err);
    return false;
  }

  const fileName = savePath.split(/[\\/]/).pop() ?? savePath;
  useUIStore
    .getState()
    .addToast({ type: 'success', message: `已导出：${fileName}`, duration: 3000 });
  return true;
}

/** 序列化为带 XML 声明的独立 SVG 文本 */
export function serializeSvg(svg: SVGSVGElement): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

/**
 * 解析元素实际呈现的背景色：沿祖先链取第一个非透明背景，均透明时回落 body / 白色。
 * 用于让导出图片的底色与编辑器中所见一致（暗色主题下浅色文字不至于落在白底上）。
 */
export function resolveBackgroundColor(element: Element | null): string {
  let current: Element | null = element;
  while (current) {
    const color = getComputedStyle(current).backgroundColor;
    if (color && color !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(color)) return color;
    current = current.parentElement;
  }
  return '#ffffff';
}

/** 默认保存到当前文档所在目录，文件名形如「文档名-思维导图.png」 */
function buildDefaultPath(label: string, format: DiagramExportFormat): string {
  const filePath = useFileStore.getState().currentFile?.filePath;
  if (!filePath) return `${label}.${format}`;

  const separatorIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const directory = filePath.slice(0, separatorIndex + 1);
  const stem = filePath.slice(separatorIndex + 1).replace(/\.[^.]+$/, '');
  return `${directory}${stem}-${label}.${format}`;
}

function notifyError(err: unknown): void {
  console.error('[diagram-export] 导出失败：', err);
  const reason =
    err instanceof DiagramExportError
      ? err.message
      : `导出失败：${err instanceof Error ? err.message : String(err)}`;
  useUIStore.getState().addToast({ type: 'error', message: reason });
}

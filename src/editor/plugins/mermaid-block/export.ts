/**
 * Mermaid Block - 导出功能
 *
 * 支持导出为 PNG 和 SVG 格式：
 * - PNG：通过 Canvas 渲染，2x 分辨率
 * - SVG：直接序列化 SVG DOM
 * - 使用 Tauri plugin-dialog 选择保存路径
 * - 使用 Tauri plugin-fs 写入文件
 */

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { ExportOptions } from './types';

// ---------------------------------------------------------------------------
// PNG 导出
// ---------------------------------------------------------------------------

/**
 * 将 SVG 字符串导出为 PNG
 * @param svgString SVG 字符串
 * @param options 导出选项
 */
export async function exportAsPng(
  svgString: string,
  options: ExportOptions = { format: 'png' },
): Promise<void> {
  const scale = options.scale ?? 2;
  const filename = options.filename ?? 'mermaid-diagram';

  // 解析 SVG 尺寸
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = svgDoc.querySelector('svg');
  if (!svgEl) {
    console.warn('导出 PNG 失败：无法解析 SVG');
    return;
  }

  // 获取尺寸
  let width = parseFloat(svgEl.getAttribute('width') || '0');
  let height = parseFloat(svgEl.getAttribute('height') || '0');

  // 如果没有 width/height，尝试从 viewBox 获取
  if (!width || !height) {
    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/);
      width = parseFloat(parts[2]) || 800;
      height = parseFloat(parts[3]) || 600;
    } else {
      width = 800;
      height = 600;
    }
  }

  // 选择保存路径
  const savePath = await save({
    defaultPath: `${filename}.png`,
    filters: [{
      name: 'PNG 图片',
      extensions: ['png'],
    }],
  });
  if (!savePath) return;

  // 创建 Canvas
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('导出 PNG 失败：无法创建 Canvas 上下文');
    return;
  }

  // 绘制白色背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 将 SVG 绘制到 Canvas
  const img = new Image();
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise<void>((resolve) => {
    img.onload = async () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      // 转换为二进制数据
      const dataUrl = canvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // 写入文件
      try {
        await writeFile(savePath, bytes);
      } catch (err) {
        console.error('导出 PNG 写入失败：', err);
      }

      resolve();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      console.warn('导出 PNG 失败：SVG 图片加载失败');
      resolve();
    };

    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// SVG 导出
// ---------------------------------------------------------------------------

/**
 * 将 SVG 字符串导出为 SVG 文件
 * @param svgString SVG 字符串
 * @param options 导出选项
 */
export async function exportAsSvg(
  svgString: string,
  options: ExportOptions = { format: 'svg' },
): Promise<void> {
  const filename = options.filename ?? 'mermaid-diagram';

  // 选择保存路径
  const savePath = await save({
    defaultPath: `${filename}.svg`,
    filters: [{
      name: 'SVG 文件',
      extensions: ['svg'],
    }],
  });
  if (!savePath) return;

  // 添加 XML 声明头
  const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const fullSvg = xmlDeclaration + svgString;

  // 写入文件
  try {
    await writeTextFile(savePath, fullSvg);
  } catch (err) {
    console.error('导出 SVG 写入失败：', err);
  }
}

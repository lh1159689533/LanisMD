/**
 * Image Inline Configuration
 *
 * 配置行内图片组件，主要处理本地相对路径到 Tauri asset 协议 URL 的转换。
 */

import { inlineImageConfig } from '@milkdown/kit/component/image-inline';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isRelativePath, isAbsolutePath, buildAbsolutePath } from '../image-block/types';
import type { Ctx } from '@milkdown/kit/ctx';

/**
 * Configure image-inline component (for inline images in paragraphs)
 */
export function configureImageInline(ctx: Ctx) {
  ctx.update(inlineImageConfig.key, (defaultConfig) => ({
    ...defaultConfig,
    // Proxy local paths (relative or absolute) to Tauri asset protocol URLs
    proxyDomURL: (url: string): string => {
      // 系统绝对路径：直接转换为 asset 协议 URL
      if (isAbsolutePath(url)) {
        return convertFileSrc(url);
      }
      // 相对路径：拼接文档目录后转换
      if (isRelativePath(url)) {
        const absolutePath = buildAbsolutePath(url);
        if (absolutePath) {
          return convertFileSrc(absolutePath);
        }
      }
      return url;
    },
  }));
}

/**
 * Image Inline Configuration
 *
 * 配置行内图片组件，主要处理本地相对路径到 Tauri asset 协议 URL 的转换。
 */

import { inlineImageConfig } from '@milkdown/kit/component/image-inline';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isRelativePath, buildAbsolutePath } from '../image-block/types';
import type { Ctx } from '@milkdown/kit/ctx';

/**
 * Configure image-inline component (for inline images in paragraphs)
 */
export function configureImageInline(ctx: Ctx) {
  ctx.update(inlineImageConfig.key, (defaultConfig) => ({
    ...defaultConfig,
    // Proxy local relative paths to Tauri asset protocol URLs
    proxyDomURL: (url: string): string => {
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

/**
 * GFM Alert Plugin
 *
 * 支持 GitHub Flavored Markdown Alert 语法：
 * > [!NOTE]
 * > This is a note
 *
 * 支持的类型：NOTE, TIP, IMPORTANT, WARNING, CAUTION
 */

export { remarkGfmAlertPlugin } from './remark-plugin';
export { gfmAlertSchema } from './schema';
export type { GfmAlertType } from './types';

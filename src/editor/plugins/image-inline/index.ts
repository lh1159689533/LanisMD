/**
 * Image Inline Plugins
 *
 * 为行内图片 (image-inline) 提供增强功能：
 * - 操作栏：编辑（弹窗选本地/URL）、对齐（左/中/右）、删除
 * - 四角拖拽缩放（等比例）
 * - 点击选中图片，不选中文字
 */

export { configureImageInline } from './config';
export { imageInlineToolbarPlugin, setOpenImageDialogForInlineEdit } from './toolbar';
export { imageInlineResizePlugin } from './resize';
export { imageInlineClickPlugin } from './click-handler';

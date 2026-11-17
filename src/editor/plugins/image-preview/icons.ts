/**
 * Image Preview - 图标
 *
 * 线性图标，stroke 使用 currentColor，跟随按钮文字颜色。
 *
 * @changelog
 * | 版本   | 变更说明 | 关联                                   |
 * | v1.0.0 | 初始实现 | REQ: 20261113-image-preview TECH: 图片预览方案 §三 |
 * /@changelog
 *
 * @author hhhuilli
 */

const svg = (size: number, body: string): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const previewIcons = {
  close: svg(18, '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  prev: svg(22, '<polyline points="15 18 9 12 15 6"/>'),
  next: svg(22, '<polyline points="9 18 15 12 9 6"/>'),
  zoomIn: svg(
    16,
    '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
  ),
  zoomOut: svg(
    16,
    '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>',
  ),
  fit: svg(
    16,
    '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
  ),
  actualSize: svg(
    16,
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 9v6"/><path d="M16 9v6"/><circle cx="12" cy="10.5" r="0.6" fill="currentColor"/><circle cx="12" cy="13.5" r="0.6" fill="currentColor"/>',
  ),
  rotate: svg(16, '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>'),
  preview: svg(
    16,
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  ),
};

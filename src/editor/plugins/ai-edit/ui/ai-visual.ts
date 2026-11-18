/**
 * AI 助手共享视觉元素：品牌 icon 与"点击外部区域"抖动反馈
 *
 * 转图表/转公式、翻译、解释、润色弹窗统一复用，保证视觉一致。
 *
 * @changelog
 * | 版本   | 变更说明                                          | 关联                  |
 * | v1.0.0 | 从 generator-popup 抽出 AI icon，新增抖动反馈工具 | REQ: AI 弹窗体验优化 |
 * | v1.1.0 | 图标常量移至 constants/ai-icon.ts 全局复用         | REQ: AI 图标统一      |
 * /@changelog
 *
 * @author hhhuilli
 */

import { AI_ICON_SVG } from '@/constants/ai-icon';

export { AI_ICON_SVG };

/** 创建 AI icon 元素（样式类 `.lanismd-ai-icon`） */
export function createAiIcon(): HTMLSpanElement {
  const iconEl = document.createElement('span');
  iconEl.className = 'lanismd-ai-icon';
  iconEl.innerHTML = AI_ICON_SVG;
  return iconEl;
}

/** 抖动动画类名 */
const SHAKE_CLASS = 'lanismd-ai-shake';

/**
 * 播放抖动动画，提示用户弹窗仍在进行中，需通过按钮或 Esc 显式关闭。
 * 先移除再添加类名并强制回流，保证连续点击时能重新触发动画。
 */
export function playShake(el: HTMLElement): void {
  el.classList.remove(SHAKE_CLASS);
  void el.offsetWidth;
  el.classList.add(SHAKE_CLASS);
}

/**
 * AI 弹窗底部的 token 用量标签（纯 DOM，各弹窗共用）
 *
 * @changelog
 * | 版本   | 变更说明                 | 关联             |
 * | v1.0.0 | 初始实现：用量标签组件 | REQ: AI 显示用量 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { formatTokenUsage, type AiTokenUsage } from '@/services/ai/usage';

export interface UsageLabel {
  el: HTMLSpanElement;
  /** 显示用量 */
  set: (usage: AiTokenUsage) => void;
  /** 清空（重新生成时） */
  clear: () => void;
}

/**
 * 创建用量标签；未设置用量前不占位。
 *
 * @param placement - end：推到按钮行最右侧；inline：紧跟前一个元素
 */
export function createUsageLabel(placement: 'end' | 'inline' = 'end'): UsageLabel {
  const el = document.createElement('span');
  el.className = `lanismd-ai-usage lanismd-ai-usage--${placement}`;
  el.hidden = true;
  return {
    el,
    set: (usage) => {
      el.textContent = formatTokenUsage(usage);
      el.title = usage.estimated
        ? '服务商未返回用量，按字数估算'
        : '服务商返回的实际用量（输出含思考过程）';
      el.hidden = false;
    },
    clear: () => {
      el.textContent = '';
      el.hidden = true;
    },
  };
}

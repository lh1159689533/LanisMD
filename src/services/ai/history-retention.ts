/**
 * AI 历史记录保留期
 *
 * 指令历史与对话历史统一按「保存天数」过期清理，不再限制条数。
 * 本模块只依赖设置 store，供 ai-store / ai-chat-store 共用，避免两者互相引用。
 *
 * @changelog
 * | 版本   | 变更说明                             | 关联                  |
 * | v1.0.0 | 初始实现：历史记录由条数上限改为保存天数 | REQ: AI 历史按时间保存 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useSettingsStore } from '@/stores/settings-store';

/** 默认保存天数 */
export const DEFAULT_HISTORY_RETENTION_DAYS = 30;
/** 最短保存天数 */
export const MIN_HISTORY_RETENTION_DAYS = 1;
/** 最长保存天数 */
export const MAX_HISTORY_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 把任意输入规整为合法天数（非数字回落默认值，越界夹到边界） */
export function normalizeRetentionDays(value: unknown): number {
  const days = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN;
  if (Number.isNaN(days)) return DEFAULT_HISTORY_RETENTION_DAYS;
  return Math.min(MAX_HISTORY_RETENTION_DAYS, Math.max(MIN_HISTORY_RETENTION_DAYS, days));
}

/** 读取当前配置的保存天数 */
export function getHistoryRetentionDays(): number {
  try {
    return normalizeRetentionDays(useSettingsStore.getState().config.ai?.historyRetentionDays);
  } catch {
    // 设置 store 尚未就绪时使用默认值
    return DEFAULT_HISTORY_RETENTION_DAYS;
  }
}

/** 过期分界时间戳：早于该时间的记录视为过期 */
export function getHistoryCutoff(now = Date.now()): number {
  return now - getHistoryRetentionDays() * DAY_MS;
}

/** 订阅保存天数变化（设置页调整后立即清理） */
export function onRetentionDaysChange(listener: () => void): () => void {
  return useSettingsStore.subscribe((state, prev) => {
    if (state.config.ai?.historyRetentionDays !== prev.config.ai?.historyRetentionDays) {
      listener();
    }
  });
}

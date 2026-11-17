/**
 * AI 生成结果历史记录写入
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联               |
 * | v1.0.0 | 从 generator.ts 抽出，供各模式复用 | REQ: AI 架构改造#3 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useAiStore } from '@/stores/ai-store';

/** 单条历史记录的最大保存长度（字符） */
const MAX_HISTORY_TEXT = 500;

/** 记录一次被采纳（或完成）的 AI 结果 */
export function recordAiHistory(
  command: { id: string; label: string },
  result: string,
  originalText?: string,
): void {
  useAiStore.getState().addHistory({
    commandId: command.id,
    commandLabel: command.label,
    result: result.slice(0, MAX_HISTORY_TEXT),
    originalText: originalText ? originalText.slice(0, MAX_HISTORY_TEXT) : undefined,
    timestamp: Date.now(),
  });
}

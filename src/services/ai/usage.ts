/**
 * 单次 AI 请求的 token 用量
 *
 * 优先使用服务商返回的真实用量（输出包含推理模型的思考 token）；
 * 少数 OpenAI 兼容服务不返回用量时，按字数估算并标记 estimated，界面上显示「约」。
 *
 * @changelog
 * | 版本   | 变更说明                    | 关联                |
 * | v1.0.0 | 初始实现：用量解析与格式化 | REQ: AI 显示用量    |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { StreamDoneInfo } from '@/services/ai-service';
import type { AiChatMessage } from '@/types/ai';

import { estimateTokens } from './token-budget';

/** 规范化后的用量 */
export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  /** 任一数值为估算值 */
  estimated: boolean;
}

/**
 * 合并服务商用量与本地估算：缺哪项补哪项。
 *
 * @param output - 本轮正文
 * @param reasoning - 本轮思考内容（同样计入输出）
 */
export function resolveTokenUsage(
  info: StreamDoneInfo,
  messages: AiChatMessage[],
  output: string,
  reasoning: string,
): AiTokenUsage {
  const prompt = info.promptTokens;
  const completion = info.completionTokens;
  return {
    promptTokens: prompt ?? estimateTokens(messages.map((m) => m.content).join('\n')),
    completionTokens: completion ?? estimateTokens(output + reasoning),
    estimated: prompt == null || completion == null,
  };
}

const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

/** 格式化为「输入 1,234 · 输出 567 tokens」，估算值前加「约」 */
export function formatTokenUsage(usage: AiTokenUsage): string {
  const text = `输入 ${NUMBER_FORMAT.format(usage.promptTokens)} · 输出 ${NUMBER_FORMAT.format(
    usage.completionTokens,
  )} tokens`;
  return usage.estimated ? `约 ${text}` : text;
}

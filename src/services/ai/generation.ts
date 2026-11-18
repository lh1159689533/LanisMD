/**
 * 生成参数：每个指令内置合适的 temperature 与输出上限，不再提供全局设置
 *
 * 为什么不用全局值：翻译、公式需要稳定输出（低温度），写作类可以稍有变化；
 * 输出长度也随任务差异很大（润色约等于原文，翻译可能膨胀数倍）。
 * 一个全局值对哪类任务都不合适，普通用户也很少去调。
 *
 * 输出上限按输入长度估算，并保留下限：推理模型的思考过程同样消耗输出 token，
 * 下限过低会导致思考尚未结束就被截断。
 *
 * @changelog
 * | 版本   | 变更说明                                | 关联                   |
 * | v1.0.0 | 初始实现：指令内置生成参数与输出估算 | REQ: AI 设置页简化     |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { AiCommand, AiGeneration, AiPromptInput } from '@/types/ai';

import type { AiSession } from './session';
import { estimateTokens } from './token-budget';

/** 输出上限的下限：给推理模型的思考过程留出余量 */
export const MIN_OUTPUT_TOKENS = 2048;
/** 输出上限的上限 */
export const MAX_OUTPUT_TOKENS = 8192;

/** 未声明生成参数的指令（如自定义指令）使用的默认值 */
export const DEFAULT_GENERATION: AiGeneration = { temperature: 0.7, maxTokens: 4096 };

/**
 * 按输入长度估算输出上限：输入 token × 倍数 + 固定余量，并夹在 [min, MAX_OUTPUT_TOKENS] 之间。
 *
 * @param factor - 输出相对输入的膨胀倍数（润色约 1.5，翻译约 3）
 */
export function proportionalOutput(
  text: string | undefined,
  factor: number,
  min = MIN_OUTPUT_TOKENS,
): number {
  const estimated = Math.ceil(estimateTokens(text ?? '') * factor) + 512;
  return Math.min(Math.max(estimated, min), MAX_OUTPUT_TOKENS);
}

/** 解析指令在本次输入下的生成参数 */
export function generationFor(command: AiCommand, input: AiPromptInput): AiGeneration {
  return command.generation?.(input) ?? DEFAULT_GENERATION;
}

/** 以指令的 prompt 与生成参数启动会话 */
export function startCommand(
  session: AiSession,
  command: AiCommand,
  input: AiPromptInput,
): Promise<void> {
  return session.start(command.buildPrompt(input), generationFor(command, input));
}

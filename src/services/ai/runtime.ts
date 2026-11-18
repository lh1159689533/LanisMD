/**
 * AI 运行时解析：得到「本次请求使用哪一条模型配置」
 *
 * 模型、地址、密钥都由后端按配置 id 解析，前端只需确认：
 * - AI 助手已启用
 * - 存在可用的模型配置（当前配置，或第一条）
 * - 该配置的密钥可用（本地已保存 / 环境变量已设置 / 无需密钥）
 *
 * @changelog
 * | 版本   | 变更说明                                | 关联                 |
 * | v1.0.0 | 初始实现：统一解析 AI 运行时            | REQ: AI 架构改造#2   |
 * | v2.0.0 | 改为按模型配置解析；生成参数移至各指令 | REQ: AI 模型配置重做 |
 * | v2.1.0 | 支持指定模型配置（AI 对话按会话选择模型） | REQ: AI 对话框       |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useAiStore } from '@/stores/ai-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiChatMessage, AiChatParams, AiGeneration, AiModelKind } from '@/types/ai';

import { DEFAULT_GENERATION } from './generation';

/** 单次 AI 请求所需的运行时信息 */
export interface AiRuntime {
  /** 模型配置 id */
  profileId: string;
  kind: AiModelKind;
  /** 显示名称 */
  name: string;
  /** 模型上下文窗口（tokens），配置未声明时为 undefined */
  contextLength?: number;
}

/** 运行时不可用的原因 */
export type AiRuntimeUnavailableReason = 'disabled' | 'no_key' | 'no_model';

export type AiRuntimeResult =
  { ok: true; runtime: AiRuntime } | { ok: false; reason: AiRuntimeUnavailableReason };

/**
 * 解析 AI 运行时。
 *
 * 会先从配置文件刷新（用户可能手动编辑过配置文件或修改了环境变量）。
 *
 * @param profileId - 指定模型配置 id；不传或该配置已被删除时使用当前模型
 */
export async function resolveAiRuntime(profileId?: string): Promise<AiRuntimeResult> {
  if (!useSettingsStore.getState().config.ai?.enabled) return { ok: false, reason: 'disabled' };

  await useAiStore.getState().refreshConfig();
  const { models, currentModelId } = useAiStore.getState();
  const profile =
    (profileId ? models.find((m) => m.id === profileId) : undefined) ??
    models.find((m) => m.id === currentModelId) ??
    models[0];
  if (!profile) return { ok: false, reason: 'no_model' };
  if (!profile.keyReady) return { ok: false, reason: 'no_key' };

  return {
    ok: true,
    runtime: {
      profileId: profile.id,
      kind: profile.kind,
      name: profile.name,
      contextLength: profile.contextLength > 0 ? profile.contextLength : undefined,
    },
  };
}

/** 由运行时 + 消息 + 生成参数构造一次请求的参数 */
export function buildChatParams(
  runtime: AiRuntime,
  messages: AiChatMessage[],
  generation: AiGeneration = DEFAULT_GENERATION,
): AiChatParams {
  return { profileId: runtime.profileId, messages, ...generation };
}

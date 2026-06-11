/**
 * AI 服务前端调用层
 *
 * 对 Tauri 命令的薄封装。Key 存储在本地配置文件中。
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import type {
  AiChatParams,
  AiProviderId,
  AiStreamChunk,
  AiStreamDone,
  AiStreamError,
} from '@/types/ai';

// ---------------------------------------------------------------------------
// Key 管理
// ---------------------------------------------------------------------------

/** 保存 API Key 到本地配置文件 */
export async function setApiKey(providerId: AiProviderId, apiKey: string): Promise<void> {
  await invoke('set_ai_api_key', { providerId, apiKey });
}

/** 查询所有 Provider 的 Key 配置状态（不返回 Key 本身） */
export async function getKeyStatus(): Promise<Record<AiProviderId, boolean>> {
  const raw = await invoke<Record<string, boolean>>('get_ai_key_status');
  return {
    zhipu: raw.zhipu ?? false,
    deepseek: raw.deepseek ?? false,
    siliconflow: raw.siliconflow ?? false,
    custom: raw.custom ?? false,
  };
}

// ---------------------------------------------------------------------------
// 配置文件操作
// ---------------------------------------------------------------------------

/** 配置文件中的模型配置 */
export interface ConfigFileModel {
  id: string;
  label: string;
  free: boolean;
  contextLength: number;
}

/** 配置文件中的 Provider 配置 */
export interface ConfigFileProvider {
  provider: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  apiKeyUrl: string;
  defaultModel: string;
  /** 是否为默认服务商（同一时刻只有一个为 true） */
  isDefault: boolean;
  models: ConfigFileModel[];
}

/** 读取完整 AI 配置文件 */
export async function readAiConfig(): Promise<ConfigFileProvider[]> {
  const raw = await invoke<string>('read_ai_config');
  return JSON.parse(raw) as ConfigFileProvider[];
}

/** 用系统文件管理器打开 AI 配置文件所在目录 */
export async function openAiConfig(): Promise<void> {
  await invoke('open_ai_config');
}

/** 设置默认服务商（将指定 Provider 的 isDefault 设为 true，其余设为 false） */
export async function setDefaultProvider(providerId: string): Promise<void> {
  await invoke('set_default_provider', { providerId });
}

/** 设置指定 Provider 的默认模型 */
export async function setDefaultModel(providerId: string, modelId: string): Promise<void> {
  await invoke('set_default_model', { providerId, modelId });
}

// ---------------------------------------------------------------------------
// 测试连接
// ---------------------------------------------------------------------------

export interface TestConnectionResult {
  ok: boolean;
  reply: string;
}

/** 非流式测试调用，用于"测试连接"按钮 */
export async function testConnection(
  providerId: AiProviderId,
  model: string,
  customBaseUrl?: string,
): Promise<TestConnectionResult> {
  return invoke<TestConnectionResult>('ai_test_connection', {
    args: { providerId, model, customBaseUrl },
  });
}

// ---------------------------------------------------------------------------
// 流式聊天
// ---------------------------------------------------------------------------

export interface StreamCallbacks {
  onDelta: (delta: string) => void;
  onDone: (usage: { promptTokens?: number; completionTokens?: number }) => void;
  onError: (err: { code: string; message: string }) => void;
}

/**
 * 发起流式 AI 请求。
 *
 * 返回一个控制对象：
 * - `requestId`：本次请求 ID
 * - `cancel()`：中止请求（会触发 onError("canceled")）
 *
 * 实现要点：
 * 1. 先订阅 event（stream/done/error），再 invoke 命令，避免错过首包
 * 2. done / error 任意到达时自动清理所有监听
 * 3. 调用 `cancel()` 时通知后端中止
 */
export async function startAiStream(
  params: AiChatParams,
  callbacks: StreamCallbacks,
): Promise<{ requestId: string; cancel: () => Promise<void> }> {
  const requestId = crypto.randomUUID();
  let finished = false;

  const unlisten: UnlistenFn[] = [];
  const cleanup = () => {
    finished = true;
    for (const fn of unlisten.splice(0)) fn();
  };

  // 先订阅，再发起
  const [offDelta, offDone, offError] = await Promise.all([
    listen<AiStreamChunk>(`ai:stream:${requestId}`, (e) => {
      if (finished) return;
      callbacks.onDelta(e.payload.delta);
    }),
    listen<AiStreamDone>(`ai:done:${requestId}`, (e) => {
      if (finished) return;
      cleanup();
      callbacks.onDone({
        promptTokens: e.payload.promptTokens,
        completionTokens: e.payload.completionTokens,
      });
    }),
    listen<AiStreamError>(`ai:error:${requestId}`, (e) => {
      if (finished) return;
      cleanup();
      callbacks.onError({ code: e.payload.code, message: e.payload.message });
    }),
  ]);
  unlisten.push(offDelta, offDone, offError);

  try {
    await invoke('ai_chat_stream', {
      request: {
        requestId,
        providerId: params.providerId,
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        customBaseUrl: params.customBaseUrl,
      },
    });
  } catch (err) {
    cleanup();
    throw err;
  }

  return {
    requestId,
    cancel: async () => {
      if (finished) return;
      try {
        await invoke('cancel_ai_stream', { requestId });
      } catch {
        // 忽略取消失败
      }
    },
  };
}

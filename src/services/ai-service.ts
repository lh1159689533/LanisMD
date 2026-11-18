/**
 * AI 服务前端调用层
 *
 * 对 Tauri 命令的薄封装。模型配置（一条配置 = 一个模型）存放在本地 AI 配置文件中，
 * 前端只能拿到 hasLocalKey / keyReady，拿不到 Key 原文。
 *
 * @changelog
 * | 版本   | 变更说明                                              | 关联                 |
 * | v1.1.0 | 支持思考增量与结束原因                                | REQ: AI 功能修复#2/7 |
 * | v2.0.0 | 服务商 id 字符串化；流式事件合并为单频道 ai:event:{id} | REQ: AI 架构改造#4/5 |
 * | v3.0.0 | 改为模型配置（profile）增删改；请求只携带配置 id      | REQ: AI 模型配置重做 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { AiChatParams, AiConfigSnapshot, AiModelDraft, AiStreamEvent } from '@/types/ai';

// ---------------------------------------------------------------------------
// 模型配置
// ---------------------------------------------------------------------------

/** 读取模型配置快照（旧版配置文件会在后端自动迁移） */
export async function readAiConfig(): Promise<AiConfigSnapshot> {
  const raw = await invoke<string>('read_ai_config');
  return JSON.parse(raw) as AiConfigSnapshot;
}

/** 新增或编辑模型配置，返回配置 id */
export async function saveAiModel(draft: AiModelDraft): Promise<string> {
  return invoke<string>('save_ai_model', { draft });
}

/** 删除模型配置 */
export async function deleteAiModel(id: string): Promise<void> {
  await invoke('delete_ai_model', { id });
}

/** 设置当前使用的模型 */
export async function setCurrentAiModel(id: string): Promise<void> {
  await invoke('set_current_ai_model', { id });
}

/** 用系统文件管理器打开 AI 配置文件所在目录 */
export async function openAiConfig(): Promise<void> {
  await invoke('open_ai_config');
}

// ---------------------------------------------------------------------------
// 测试连接
// ---------------------------------------------------------------------------

export interface TestConnectionResult {
  ok: boolean;
  reply: string;
}

/** 对指定模型配置发送一条非流式测试消息 */
export async function testConnection(profileId: string): Promise<TestConnectionResult> {
  return invoke<TestConnectionResult>('ai_test_connection', { args: { profileId } });
}

// ---------------------------------------------------------------------------
// 流式聊天
// ---------------------------------------------------------------------------

/** 流式结束信息 */
export interface StreamDoneInfo {
  promptTokens?: number;
  completionTokens?: number;
  /** 为 `length` 时表示输出触达 maxTokens 上限被截断 */
  finishReason?: string;
}

export interface StreamCallbacks {
  onDelta: (delta: string) => void;
  onDone: (info: StreamDoneInfo) => void;
  onError: (err: { code: string; message: string }) => void;
  /** 推理模型的思考过程增量（可选；不关心思考内容的调用方可不传） */
  onReasoning?: (delta: string) => void;
}

/**
 * 发起流式 AI 请求。
 *
 * 返回一个控制对象：
 * - `requestId`：本次请求 ID
 * - `cancel()`：中止请求（会触发 onError("canceled")）
 *
 * 实现要点：
 * 1. 先订阅 `ai:event:{requestId}`，再 invoke 命令，避免错过首包
 * 2. done / error 任意到达时自动取消订阅
 * 3. 调用 `cancel()` 时通知后端中止
 */
export async function startAiStream(
  params: AiChatParams,
  callbacks: StreamCallbacks,
): Promise<{ requestId: string; cancel: () => Promise<void> }> {
  const requestId = crypto.randomUUID();
  let finished = false;
  let unlisten: (() => void) | null = null;

  const finish = () => {
    finished = true;
    unlisten?.();
    unlisten = null;
  };

  unlisten = await listen<AiStreamEvent>(`ai:event:${requestId}`, ({ payload }) => {
    if (finished) return;
    switch (payload.kind) {
      case 'delta':
        callbacks.onDelta(payload.delta);
        break;
      case 'reasoning':
        callbacks.onReasoning?.(payload.delta);
        break;
      case 'done':
        finish();
        callbacks.onDone({
          promptTokens: payload.promptTokens,
          completionTokens: payload.completionTokens,
          finishReason: payload.finishReason,
        });
        break;
      case 'error':
        finish();
        callbacks.onError({ code: payload.code, message: payload.message });
        break;
    }
  });

  try {
    await invoke('ai_chat_stream', {
      request: {
        requestId,
        profileId: params.profileId,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      },
    });
  } catch (err) {
    finish();
    throw err;
  }

  return {
    requestId,
    cancel: async () => {
      if (finished) return;
      try {
        await invoke('cancel_ai_stream', { requestId });
      } catch {
        // 后端找不到该请求（已结束）时忽略
      }
    },
  };
}

/**
 * AI 会话：统一管理一次（或多轮）流式生成的生命周期
 *
 * 此前 generator.ts 的 6 种交互模式各自重复实现了同一套流程：
 * 发起请求 -> 登记到 ai-store（全局取消）-> 防止 done/error 重复触发 ->
 * 过滤 canceled -> 结束后注销 -> 截断提示 -> 错误文案转换。
 * 这里收口为 `createAiSession`，各模式只关心 UI 如何响应。
 *
 * 关键语义：
 * - `start()` 若已有请求在跑，会先静默丢弃旧请求（旧请求的回调不再触发）
 * - `cancel()` 主动取消，触发 `onCanceled`
 * - `dispose()` 静默取消，不触发任何回调（用于弹窗关闭、重新发起等场景）
 * - 在 invoke 尚未返回 requestId 时调用 cancel/dispose 也能生效（返回后立即取消）
 * - `followUp()` 携带上一轮问答继续追问，为多轮对话预留
 *
 * @changelog
 * | 版本   | 变更说明                        | 关联               |
 * | v1.0.0 | 初始实现：统一流式生成生命周期 | REQ: AI 架构改造#1 |
 * | v1.1.0 | 生成参数改为随每次 start 传入   | REQ: AI 设置页简化 |
 * | v1.2.0 | 完成回调携带 token 用量         | REQ: AI 显示用量   |
 * /@changelog
 *
 * @author hhhuilli
 */

import { startAiStream, type StreamDoneInfo } from '@/services/ai-service';
import { useAiStore } from '@/stores/ai-store';
import { useUIStore } from '@/stores/ui-store';
import type { AiChatMessage, AiGeneration } from '@/types/ai';

import { getAiErrorMessage } from './errors';
import { DEFAULT_GENERATION } from './generation';
import { buildChatParams, type AiRuntime } from './runtime';
import { resolveTokenUsage, type AiTokenUsage } from './usage';

/** 会话事件回调（均可选） */
export interface AiSessionHandlers {
  /** 正文增量；`full` 为本轮累计的完整正文 */
  onDelta?: (delta: string, full: string) => void;
  /** 推理模型的思考增量（尚未输出正文时可用于展示"思考中"） */
  onReasoning?: (delta: string) => void;
  /** 本轮生成完成；`usage` 为本轮 token 用量（服务商未返回时为估算值） */
  onDone?: (full: string, info: StreamDoneInfo, usage: AiTokenUsage) => void;
  /** 生成失败（不含主动取消）；`message` 已转换为用户可读文案 */
  onError?: (message: string, code: string) => void;
  /** 被 `cancel()` 主动取消 */
  onCanceled?: () => void;
}

export interface AiSession {
  /** 以给定消息与生成参数发起新一轮生成 */
  start: (messages: AiChatMessage[], generation?: AiGeneration) => Promise<void>;
  /** 在上一轮问答基础上追加用户指令继续生成；尚无上一轮结果时等同于不执行 */
  followUp: (instruction: string) => Promise<void>;
  /** 主动取消当前请求（触发 onCanceled） */
  cancel: () => void;
  /** 静默取消当前请求，不触发任何回调 */
  dispose: () => void;
  /** 是否有请求正在进行 */
  readonly running: boolean;
  /** 本轮累计的正文 */
  readonly text: string;
}

/** 截断提示：输出触达长度上限 */
function notifyIfTruncated(info: StreamDoneInfo): void {
  if (info.finishReason !== 'length') return;
  useUIStore.getState().addToast({
    type: 'warning',
    message: 'AI 输出已达到长度上限，结果可能不完整，可缩小选区后分段处理',
    duration: 5000,
  });
}

/**
 * 创建一个 AI 会话。
 *
 * @param runtime - 由 resolveAiRuntime 得到的运行时
 * @param handlers - UI 回调
 */
export function createAiSession(runtime: AiRuntime, handlers: AiSessionHandlers): AiSession {
  /** 每次 start/dispose 自增；回调中比对，丢弃过期请求的事件 */
  let epoch = 0;
  let running = false;
  let text = '';
  /** 本轮思考内容（用于服务商未返回用量时估算输出 token） */
  let reasoningText = '';
  let conversation: AiChatMessage[] = [];
  let lastReply = '';
  let lastGeneration: AiGeneration = DEFAULT_GENERATION;
  let requestId: string | null = null;
  let cancelRequest: (() => Promise<void>) | null = null;
  /** invoke 返回前就被要求取消 */
  let pendingCancel = false;

  function release() {
    running = false;
    if (requestId) useAiStore.getState().untrackRequest(requestId);
    requestId = null;
    cancelRequest = null;
    pendingCancel = false;
  }

  function abortBackend() {
    if (cancelRequest) void cancelRequest();
    else if (running) pendingCancel = true;
  }

  async function start(
    messages: AiChatMessage[],
    generation: AiGeneration = DEFAULT_GENERATION,
  ): Promise<void> {
    if (running) dispose();
    const current = ++epoch;
    const isCurrent = () => current === epoch;

    running = true;
    text = '';
    reasoningText = '';
    conversation = messages;
    lastGeneration = generation;

    try {
      const handle = await startAiStream(buildChatParams(runtime, messages, generation), {
        onDelta: (delta) => {
          if (!isCurrent()) return;
          text += delta;
          handlers.onDelta?.(delta, text);
        },
        onReasoning: (delta) => {
          if (!isCurrent()) return;
          reasoningText += delta;
          handlers.onReasoning?.(delta);
        },
        onDone: (info) => {
          if (!isCurrent()) return;
          release();
          lastReply = text;
          notifyIfTruncated(info);
          handlers.onDone?.(text, info, resolveTokenUsage(info, messages, text, reasoningText));
        },
        onError: (err) => {
          if (!isCurrent()) return;
          release();
          if (err.code === 'canceled') handlers.onCanceled?.();
          else handlers.onError?.(getAiErrorMessage(err.code, err.message), err.code);
        },
      });

      // 期间可能已被 dispose / 重新 start，旧请求直接取消
      if (!isCurrent()) {
        void handle.cancel();
        return;
      }
      // 事件可能在 invoke 返回前就已到达并结束了本轮
      if (!running) return;

      requestId = handle.requestId;
      cancelRequest = handle.cancel;
      useAiStore.getState().trackRequest({ requestId, cancel: handle.cancel });
      if (pendingCancel) void handle.cancel();
    } catch (e) {
      if (!isCurrent()) return;
      release();
      const msg = e instanceof Error ? e.message : String(e);
      handlers.onError?.(getAiErrorMessage('unknown', msg), 'unknown');
    }
  }

  function dispose() {
    abortBackend();
    epoch++;
    // 已失效的请求不会再回调，这里直接注销
    release();
  }

  return {
    start,
    followUp: async (instruction) => {
      if (!lastReply) return;
      await start(
        [
          ...conversation,
          { role: 'assistant', content: lastReply },
          { role: 'user', content: instruction },
        ],
        lastGeneration,
      );
    },
    cancel: abortBackend,
    dispose,
    get running() {
      return running;
    },
    get text() {
      return text;
    },
  };
}

/**
 * 一次性生成：返回完整正文的 Promise（不需要中途 UI 交互的场景，如提交说明）。
 *
 * @param generation - 生成参数
 * @param onDelta - 可选的流式回调，参数为累计正文
 */
export function generateOnce(
  runtime: AiRuntime,
  messages: AiChatMessage[],
  generation: AiGeneration,
  onDelta?: (full: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const session = createAiSession(runtime, {
      onDelta: (_delta, full) => onDelta?.(full),
      onDone: (full) => resolve(full),
      onError: (message) => reject(new Error(message)),
      onCanceled: () => reject(new Error(getAiErrorMessage('canceled', ''))),
    });
    void session.start(messages, generation);
  });
}

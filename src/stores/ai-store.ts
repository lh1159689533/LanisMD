/**
 * AI 运行时状态
 *
 * - 模型配置快照（来自 AI 配置文件，不持有 Key 原文）
 * - 正在进行的请求（requestId -> cancel 函数），用于全局取消
 * - AI 生成结果历史（localStorage 持久化）
 */

import { create } from 'zustand';

import { aiService } from '@/services';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiCommandId, AiModelProfile } from '@/types/ai';

export interface AiRunningRequest {
  requestId: string;
  cancel: () => Promise<void>;
}

/** 一次 AI 生成历史记录 */
export interface AiHistoryEntry {
  id: string;
  commandId: AiCommandId | string;
  commandLabel: string;
  result: string;
  /** 原文（操作前的选区文本，截取前 500 字符） */
  originalText?: string;
  timestamp: number;
}

/** addHistory 的输入参数（不含 id） */
export type AiHistoryInput = Omit<AiHistoryEntry, 'id'>;

/** 获取历史记录最大条数（从配置读取，默认 200） */
function getMaxHistory(): number {
  try {
    return useSettingsStore.getState().config.ai?.maxHistoryCount ?? 200;
  } catch {
    return 200;
  }
}

interface AiState {
  /** 已配置的模型列表 */
  models: AiModelProfile[];
  /** 当前使用的模型配置 id */
  currentModelId: string;
  /** 是否已从配置文件加载过 */
  configLoaded: boolean;
  /** 当前进行中的所有请求 */
  runningRequests: Record<string, AiRunningRequest>;
  /** AI 生成结果历史（localStorage 持久化） */
  history: AiHistoryEntry[];

  /** 从配置文件刷新模型列表（失败时保留旧值） */
  refreshConfig: () => Promise<void>;
  /** 记录一个新启动的请求 */
  trackRequest: (req: AiRunningRequest) => void;
  /** 标记请求完成（结束或出错后调用） */
  untrackRequest: (requestId: string) => void;
  /** 取消所有进行中的请求 */
  cancelAll: () => Promise<void>;
  /** 添加一条历史记录 */
  addHistory: (entry: AiHistoryInput) => void;
  /** 清除所有历史记录 */
  clearHistory: () => void;
}

/** 从 localStorage 恢复历史记录 */
function loadHistory(): AiHistoryEntry[] {
  try {
    const raw = localStorage.getItem('lanismd-ai-history');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 保存历史记录到 localStorage */
function saveHistory(history: AiHistoryEntry[]): void {
  try {
    localStorage.setItem('lanismd-ai-history', JSON.stringify(history));
  } catch {
    // localStorage 满或不可用时静默失败
  }
}

export const useAiStore = create<AiState>((set, get) => ({
  models: [],
  currentModelId: '',
  configLoaded: false,
  runningRequests: {},
  history: loadHistory(),

  refreshConfig: async () => {
    try {
      const { current, models } = await aiService.readAiConfig();
      set({ models, currentModelId: current, configLoaded: true });
    } catch (err) {
      console.error('[ai-store] refreshConfig failed', err);
      set({ configLoaded: true });
    }
  },

  trackRequest: (req) =>
    set((state) => ({
      runningRequests: { ...state.runningRequests, [req.requestId]: req },
    })),

  untrackRequest: (requestId) =>
    set((state) => {
      if (!state.runningRequests[requestId]) return state;
      const next = { ...state.runningRequests };
      delete next[requestId];
      return { runningRequests: next };
    }),

  cancelAll: async () => {
    const { runningRequests } = get();
    const entries = Object.values(runningRequests);
    await Promise.all(entries.map((r) => r.cancel().catch(() => {})));
    set({ runningRequests: {} });
  },

  addHistory: (input) =>
    set((state) => {
      const entry: AiHistoryEntry = {
        ...input,
        id: crypto.randomUUID(),
      };
      const maxHistory = getMaxHistory();
      const updated = [entry, ...state.history].slice(0, maxHistory);
      saveHistory(updated);
      return { history: updated };
    }),

  clearHistory: () => {
    saveHistory([]);
    set({ history: [] });
  },
}));

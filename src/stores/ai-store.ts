/**
 * AI 运行时状态
 *
 * - 模型配置快照（来自 AI 配置文件，不持有 Key 原文）
 * - 正在进行的请求（requestId -> cancel 函数），用于全局取消
 * - AI 生成结果历史（localStorage 持久化，按保存天数过期清理）
 *
 * @changelog
 * | 版本   | 变更说明                           | 关联                  |
 * | v1.1.0 | 历史记录由条数上限改为按保存天数清理 | REQ: AI 历史按时间保存 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { create } from 'zustand';

import { aiService } from '@/services';
import { getHistoryCutoff, onRetentionDaysChange } from '@/services/ai/history-retention';
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

/** 剔除超过保存天数的记录 */
function dropExpired(history: AiHistoryEntry[]): AiHistoryEntry[] {
  const cutoff = getHistoryCutoff();
  return history.filter((h) => h.timestamp >= cutoff);
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
  /** 删除一条历史记录 */
  removeHistory: (id: string) => void;
  /** 清除所有历史记录 */
  clearHistory: () => void;
  /** 清理超过保存天数的历史记录 */
  pruneHistory: () => void;
}

/** 从 localStorage 恢复历史记录（同时剔除已过期的记录） */
function loadHistory(): AiHistoryEntry[] {
  try {
    const raw = localStorage.getItem('lanismd-ai-history');
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const history = parsed as AiHistoryEntry[];
    const valid = dropExpired(history);
    if (valid.length !== history.length) saveHistory(valid);
    return valid;
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
      const updated = dropExpired([entry, ...state.history]);
      saveHistory(updated);
      return { history: updated };
    }),

  removeHistory: (id) =>
    set((state) => {
      const updated = state.history.filter((h) => h.id !== id);
      saveHistory(updated);
      return { history: updated };
    }),

  clearHistory: () => {
    saveHistory([]);
    set({ history: [] });
  },

  pruneHistory: () =>
    set((state) => {
      const updated = dropExpired(state.history);
      if (updated.length === state.history.length) return state;
      saveHistory(updated);
      return { history: updated };
    }),
}));

// 设置页调整保存天数后立即清理
onRetentionDaysChange(() => useAiStore.getState().pruneHistory());

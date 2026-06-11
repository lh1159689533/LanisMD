/**
 * AI 运行时状态
 *
 * - 记录各 Provider 的 Key 配置状态（hasKey，布尔值，不持有 Key 原文）
 * - 记录正在进行的请求（requestId -> cancel 函数），用于全局取消
 * - Key 状态的加载/刷新动作
 * - AI 生成结果历史（localStorage 持久化）
 * - 手动刷新配置文件，缓存到 sessionStorage
 */

import { create } from 'zustand';

import { aiService } from '@/services';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiProviderId, AiCommandId } from '@/types/ai';
import type { ConfigFileProvider } from '@/services/ai-service';

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

/** sessionStorage 缓存键 */
const CONFIG_CACHE_KEY = 'lanismd-ai-config-cache';

interface AiState {
  /** 各 Provider 是否已配置 Key（由配置文件同步） */
  keyStatus: Record<AiProviderId, boolean>;
  /** 是否已初始化过 keyStatus */
  keyStatusLoaded: boolean;
  /** 当前进行中的所有请求 */
  runningRequests: Record<string, AiRunningRequest>;
  /** AI 生成结果历史（localStorage 持久化） */
  history: AiHistoryEntry[];
  /** 配置文件中的 Provider 列表 */
  configProviders: ConfigFileProvider[];

  /** 从后端刷新 keyStatus */
  refreshKeyStatus: () => Promise<void>;
  /** 从配置文件刷新完整 Provider 配置（同时同步默认服务商/模型到 settings） */
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

const initialKeyStatus: Record<AiProviderId, boolean> = {
  zhipu: false,
  deepseek: false,
  siliconflow: false,
  custom: false,
};

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

/** 从 sessionStorage 恢复配置缓存 */
function loadConfigCache(): ConfigFileProvider[] {
  try {
    const raw = sessionStorage.getItem(CONFIG_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 保存配置到 sessionStorage */
function saveConfigCache(providers: ConfigFileProvider[]): void {
  try {
    sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(providers));
  } catch {
    // sessionStorage 满或不可用时静默失败
  }
}

/** 从 Provider 配置列表中提取 keyStatus */
function extractKeyStatus(providers: ConfigFileProvider[]): Record<AiProviderId, boolean> {
  const status = { ...initialKeyStatus };
  for (const p of providers) {
    const id = p.provider as AiProviderId;
    if (id in status) {
      status[id] = !!p.apiKey && p.apiKey.trim().length > 0;
    }
  }
  return status;
}

export const useAiStore = create<AiState>((set, get) => ({
  keyStatus: initialKeyStatus,
  keyStatusLoaded: false,
  runningRequests: {},
  history: loadHistory(),
  configProviders: loadConfigCache(),

  refreshKeyStatus: async () => {
    try {
      const status = await aiService.getKeyStatus();
      set({ keyStatus: status, keyStatusLoaded: true });
    } catch (err) {
      // 加载失败时给出空值，避免阻断后续交互
      console.error('[ai-store] refreshKeyStatus failed', err);
      set({ keyStatusLoaded: true });
    }
  },

  refreshConfig: async () => {
    try {
      const providers = await aiService.readAiConfig();
      const keyStatus = extractKeyStatus(providers);
      saveConfigCache(providers);
      set({ configProviders: providers, keyStatus, keyStatusLoaded: true });

      // 从配置文件同步默认服务商和默认模型到 settings store
      const defaultProvider = providers.find((p) => p.isDefault);
      if (defaultProvider) {
        const settingsStore = useSettingsStore.getState();
        const currentProvider = settingsStore.config.ai?.currentProvider;
        // 如果 settings 中尚未设置服务商，或与配置文件中的默认服务商不同，则同步
        if (!currentProvider || currentProvider !== defaultProvider.provider) {
          settingsStore.setNestedConfig(
            'ai.currentProvider',
            defaultProvider.provider as AiProviderId,
          );
        }
      }

      // 校验每个 provider 已选中的模型是否仍存在于配置文件的模型列表中
      // 如果不存在，回退到配置文件的 defaultModel 或第一个模型
      const settingsStore = useSettingsStore.getState();
      for (const p of providers) {
        const pid = p.provider as AiProviderId;
        const currentModel = settingsStore.config.ai?.selectedModels?.[pid] ?? '';
        const modelIds = p.models.map((m) => m.id);
        // 当前选中的模型不在最新模型列表中时，需要重新设置
        if (!currentModel || !modelIds.includes(currentModel)) {
          const fallback = p.defaultModel || modelIds[0] || '';
          settingsStore.setNestedConfig(`ai.selectedModels.${pid}`, fallback);
        }
      }
    } catch (err) {
      console.error('[ai-store] refreshConfig failed', err);
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

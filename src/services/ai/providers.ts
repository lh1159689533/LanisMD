/**
 * AI Provider 预设元数据
 *
 * 与 `src-tauri/src/services/ai/providers.rs` 的 base URL 保持一致。
 */

import type { AiProviderId, AiProviderMeta } from '@/types/ai';

export const PROVIDER_PRESETS: Record<
  Exclude<AiProviderId, 'custom'>,
  AiProviderMeta
> = {
  zhipu: {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyUrl: 'https://bigmodel.cn/usercenter/apikeys',
    models: [],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    models: [],
  },
  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    models: [],
  },
};

/** 获取指定 Provider 的预设元数据（Custom 无预设） */
export function getProviderMeta(id: AiProviderId): AiProviderMeta | null {
  if (id === 'custom') return null;
  return PROVIDER_PRESETS[id];
}

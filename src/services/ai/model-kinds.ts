/**
 * 模型类型元数据：设置页「添加模型」表单的分组、默认值与提示
 *
 * 后端只关心类型对应的协议与参数差异（见 src-tauri models/ai.rs ModelKind），
 * 名称、基础 URL、密钥来源等默认值只在前端表单中使用，用户可自由修改。
 *
 * @changelog
 * | 版本   | 变更说明                    | 关联                 |
 * | v1.0.0 | 初始实现：本地 / API 模型类型 | REQ: AI 模型配置重做 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { AiKeySource, AiModelKind } from '@/types/ai';

/** 模型分组 */
export type AiModelGroup = 'local' | 'api';

/** 单个模型类型的元数据 */
export interface AiModelKindMeta {
  kind: AiModelKind;
  group: AiModelGroup;
  /** 类型显示名 */
  label: string;
  /** 默认配置名称 */
  defaultName: string;
  /** 默认基础 URL；为空表示必须由用户填写 */
  defaultBaseUrl: string;
  /** 基础 URL 输入框占位 */
  baseUrlPlaceholder: string;
  /** 模型 ID 输入框占位（示例） */
  modelPlaceholder: string;
  /** 默认密钥来源 */
  defaultKeySource: AiKeySource;
  /** 默认环境变量名 */
  defaultEnvVar: string;
  /** 申请密钥的控制台地址 */
  apiKeyUrl?: string;
}

/** 环境变量名的通用默认值 */
export const DEFAULT_ENV_VAR = 'OPENAI_API_KEY';

/** 全部模型类型（顺序即表单中的展示顺序） */
export const MODEL_KINDS: AiModelKindMeta[] = [
  {
    kind: 'ollama',
    group: 'local',
    label: 'Ollama',
    defaultName: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
    baseUrlPlaceholder: 'http://localhost:11434/v1',
    modelPlaceholder: '例如 qwen3:8b（ollama list 查看）',
    defaultKeySource: 'none',
    defaultEnvVar: DEFAULT_ENV_VAR,
  },
  {
    kind: 'lmstudio',
    group: 'local',
    label: 'LM Studio',
    defaultName: 'LM Studio',
    defaultBaseUrl: 'http://localhost:1234/v1',
    baseUrlPlaceholder: 'http://localhost:1234/v1',
    modelPlaceholder: '例如 qwen/qwen3-8b',
    defaultKeySource: 'none',
    defaultEnvVar: DEFAULT_ENV_VAR,
  },
  {
    kind: 'openai',
    group: 'api',
    label: 'OpenAI',
    defaultName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    modelPlaceholder: '例如 gpt-4o-mini',
    defaultKeySource: 'local',
    defaultEnvVar: 'OPENAI_API_KEY',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    kind: 'anthropic',
    group: 'api',
    label: 'Anthropic',
    defaultName: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    baseUrlPlaceholder: 'https://api.anthropic.com/v1',
    modelPlaceholder: '例如 claude-sonnet-4-5',
    defaultKeySource: 'local',
    defaultEnvVar: 'ANTHROPIC_API_KEY',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    kind: 'gemini',
    group: 'api',
    label: 'Gemini',
    defaultName: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelPlaceholder: '例如 gemini-2.5-flash',
    defaultKeySource: 'local',
    defaultEnvVar: 'GEMINI_API_KEY',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    kind: 'openrouter',
    group: 'api',
    label: 'OpenRouter',
    defaultName: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
    modelPlaceholder: '例如 openai/gpt-4o-mini',
    defaultKeySource: 'local',
    defaultEnvVar: 'OPENROUTER_API_KEY',
    apiKeyUrl: 'https://openrouter.ai/keys',
  },
  {
    kind: 'openai-compatible',
    group: 'api',
    label: 'OpenAI 兼容',
    defaultName: 'OpenAI 兼容',
    defaultBaseUrl: '',
    baseUrlPlaceholder: '例如 https://api.deepseek.com',
    modelPlaceholder: '例如 deepseek-chat',
    defaultKeySource: 'local',
    defaultEnvVar: DEFAULT_ENV_VAR,
  },
];

/** 分组标题 */
export const MODEL_GROUP_LABELS: Record<AiModelGroup, string> = {
  local: '本地模型',
  api: 'API 模型',
};

/** 按类型取元数据（未知类型回退到 OpenAI 兼容） */
export function getModelKindMeta(kind: AiModelKind): AiModelKindMeta {
  return MODEL_KINDS.find((k) => k.kind === kind) ?? MODEL_KINDS[MODEL_KINDS.length - 1];
}

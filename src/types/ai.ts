/**
 * AI 相关类型定义
 *
 * 与 `src-tauri/src/models/ai.rs` 保持字段对齐。
 */

/** 支持的 AI 服务商 */
export type AiProviderId = 'zhipu' | 'deepseek' | 'siliconflow' | 'custom';

/** 单个 Provider 的可选模型 */
export interface AiModel {
  /** API 侧模型 id */
  id: string;
  /** 显示名称 */
  label: string;
  /** 是否免费 */
  free: boolean;
  /** 上下文长度（tokens） */
  contextLength: number;
}

/** Provider 的静态元数据（base URL / 模型清单 / 申请链接） */
export interface AiProviderMeta {
  id: AiProviderId;
  name: string;
  baseUrl: string;
  apiKeyUrl: string;
  models: AiModel[];
}

/** Provider 运行时状态：静态元数据 + 是否已配置 Key */
export interface AiProviderConfig extends AiProviderMeta {
  hasKey: boolean;
}

/** 聊天消息 */
export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 运行 AI 请求的参数 */
export interface AiChatParams {
  providerId: AiProviderId;
  model: string;
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** 自定义 base URL（仅 Provider = custom 时有效） */
  customBaseUrl?: string;
}

/** 内置指令类型 */
export type AiCommandId = 'polish' | 'translate' | 'explain' | 'mermaid' | 'latex';

/** 指令生成结果的插入策略 */
export type AiInsertMode =
  | 'replace-selection'
  | 'insert-after'
  | 'insert-as-mermaid'
  | 'insert-as-latex'
  | 'inline-diff'
  | 'popup-translate'
  | 'popup-explain';

/** 构造 prompt 时的输入 */
export interface AiPromptInput {
  /** 用户选中的文本（划词菜单场景） */
  selection?: string;
  /** 斜杠命令后的参数，例如 `/mermaid 登录流程` */
  arg?: string;
  /** 光标前 N 段上下文 */
  context?: string;
  /** 完整文档文本（润色"完整文档上下文"模式使用） */
  fullDocument?: string;
  /** 额外参数（如翻译目标语言） */
  options?: Record<string, string>;
}

/** 指令元数据 */
export interface AiCommand {
  id: AiCommandId;
  label: string;
  icon: string;
  keywords: string[];
  insertMode: AiInsertMode;
  /** 是否必须有选中文本才能执行 */
  requireSelection?: boolean;
  /** 是否需要用户输入参数（如 /mermaid <描述>） */
  requireArg?: boolean;
  /** 参数输入提示文本 */
  argPlaceholder?: string;
  buildPrompt: (input: AiPromptInput) => AiChatMessage[];
}

/** 前端监听到的流式数据块 */
export interface AiStreamChunk {
  requestId: string;
  delta: string;
}

/** 流式完成事件 */
export interface AiStreamDone {
  requestId: string;
  promptTokens?: number;
  completionTokens?: number;
}

/** 流式错误事件 */
export interface AiStreamError {
  requestId: string;
  code: string;
  message: string;
}

/** AppConfig 内的 AI 配置 */
export interface AiConfig {
  enabled: boolean;
  currentProvider: AiProviderId;
  /** 各 Provider 选中的模型 */
  selectedModels: Record<AiProviderId, string>;
  temperature: number;
  maxTokens: number;
  /** 划词浮层是否显示 AI 按钮 */
  showInTooltip: boolean;
  /** 斜杠菜单是否显示 AI 指令 */
  showInSlash: boolean;
  /** Custom Provider 的 base URL */
  customBaseUrl: string;
  /** 用户自定义 Prompt 模板 */
  customPrompts?: CustomPrompt[];
}

/** 自定义 Prompt 模板 */
export interface CustomPrompt {
  /** 唯一标识 */
  id: string;
  /** 显示名称（在 slash-menu 中展示） */
  label: string;
  /** system prompt 内容 */
  prompt: string;
}

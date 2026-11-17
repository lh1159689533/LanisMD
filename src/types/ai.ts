/**
 * AI 相关类型定义
 *
 * 与 `src-tauri/src/models/ai.rs` 保持字段对齐。
 */

/**
 * 模型类型
 * - 本地模型：ollama / lmstudio
 * - API 模型：openai / anthropic / gemini / openrouter / openai-compatible
 */
export type AiModelKind =
  'ollama' | 'lmstudio' | 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'openai-compatible';

/** API 密钥来源：本地保存 / 环境变量 / 无密钥 */
export type AiKeySource = 'local' | 'env' | 'none';

/** 一条模型配置（来自配置文件，不含 Key 原文） */
export interface AiModelProfile {
  id: string;
  kind: AiModelKind;
  name: string;
  baseUrl: string;
  /** 模型 ID（API 侧） */
  model: string;
  keySource: AiKeySource;
  /** 环境变量名（keySource = env 时有效） */
  envVar: string;
  /** 本地是否已保存密钥 */
  hasLocalKey: boolean;
  /** 密钥是否可用（按当前来源实际解析，环境变量未设置时为 false） */
  keyReady: boolean;
  /** 上下文窗口（tokens），0 表示未声明 */
  contextLength: number;
}

/** 配置快照 */
export interface AiConfigSnapshot {
  /** 当前使用的模型配置 id */
  current: string;
  models: AiModelProfile[];
}

/** 新增 / 编辑模型时提交的数据 */
export interface AiModelDraft {
  /** 为空表示新增 */
  id?: string;
  kind: AiModelKind;
  name: string;
  baseUrl: string;
  model: string;
  keySource: AiKeySource;
  /** 新密钥；不传或为空表示保持原值 */
  apiKey?: string;
  envVar: string;
}

/** 聊天消息 */
export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 单次请求的生成参数（由指令内置，不再提供全局设置） */
export interface AiGeneration {
  temperature: number;
  maxTokens: number;
}

/** 运行 AI 请求的参数 */
export interface AiChatParams extends AiGeneration {
  /** 模型配置 id */
  profileId: string;
  messages: AiChatMessage[];
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
  /**
   * 写作背景：front-matter 的标题/标签 + 当前位置的标题路径 + 当前章节内容，
   * 已按 token 预算裁剪（见 ai-edit/context/writing-context.ts）
   */
  context?: string;
  /** 文档标题：front-matter title > 首个一级标题 > 文件名 */
  title?: string;
  /** 完整文档文本（润色"完整文档上下文"模式、自定义指令 {{document}} 使用） */
  fullDocument?: string;
  /** 额外参数（如翻译目标语言、润色风格） */
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
  /** 生成参数；不提供时使用默认值（见 services/ai/generation.ts） */
  generation?: (input: AiPromptInput) => AiGeneration;
  /** 执行前需要构造（按预算裁剪的）完整文档上下文，例如模板中使用了 {{document}} */
  needsDocument?: boolean;
}

/**
 * 流式事件：后端统一推送到 `ai:event:{requestId}`，按 `kind` 区分
 */
export type AiStreamEvent =
  | { kind: 'delta'; delta: string }
  | { kind: 'reasoning'; delta: string }
  | {
      kind: 'done';
      promptTokens?: number;
      completionTokens?: number;
      /** 结束原因：stop（正常）| length（触达 maxTokens 被截断）| 其他 */
      finishReason?: string;
    }
  | { kind: 'error'; code: string; message: string };

/** AppConfig 内的 AI 配置（模型相关配置统一存放在 AI 配置文件中） */
export interface AiConfig {
  enabled: boolean;
  /** 划词浮层是否显示 AI 按钮 */
  showInTooltip: boolean;
  /** 斜杠菜单是否显示 AI 指令 */
  showInSlash: boolean;
  /** 用户自定义 Prompt 模板 */
  customPrompts?: CustomPrompt[];
  /** 上次在翻译弹窗中选择的目标语言 id；未记录时按原文自动判断 */
  translateLang?: string;
}

/** 润色风格 */
export type PolishStyle =
  'general' | 'proofread' | 'concise' | 'expand' | 'formal' | 'casual' | 'academic';

/** 自定义指令结果的写入方式 */
export type CustomPromptInsertMode = 'insert-after' | 'replace-selection';

/** 自定义指令的出现位置 */
export type CustomPromptPlacement = 'slash' | 'tooltip' | 'context-menu';

/**
 * 自定义 Prompt 模板
 *
 * 新增字段均为可选：旧配置缺省时等同于「斜杠菜单 + 插入到下方 + 默认生成参数」，行为不变。
 */
export interface CustomPrompt {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  label: string;
  /**
   * system prompt 内容；可使用 {{selection}} {{context}} {{document}} {{title}} {{input}} 变量，
   * 未使用任何变量时沿用旧行为（选区 / 输入作为 user 消息发送）
   */
  prompt: string;
  /** 写入方式，默认插入到下方 */
  insertMode?: CustomPromptInsertMode;
  /** 出现位置，默认仅斜杠菜单 */
  placements?: CustomPromptPlacement[];
  /** 温度；不填使用默认值 */
  temperature?: number;
  /** 输出 token 上限；不填使用默认值 */
  maxTokens?: number;
}

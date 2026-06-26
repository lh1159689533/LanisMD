# LanisMD AI 云端能力集成方案

> 创建日期：2026-04-23
> 分支：`feat/ai`
> 状态：设计阶段

## 1. 背景与目标

### 1.1 目标

在 LanisMD 中集成基于国内 LLM 云服务的 AI 辅助写作能力，让用户在编辑 Markdown 时可以就地调用 AI 完成：

- **润色**（`/polish`）：改写当前段落，保持原意但更通顺
- **翻译**（`/translate`）：中英互译或指定目标语言
- **续写**（`/continue`）：根据上下文续写下一段
- **解释**（`/explain`）：解释概念/代码
- **自然语言转 Mermaid**（`/mermaid`）：将描述转为流程图/时序图代码
- **自然语言转 LaTeX**（`/latex`）：将描述转为数学公式
- **生成大纲**（`/outline`）：根据主题生成文档大纲

### 1.2 非目标

- 不做云同步 / 图床 / 发布分享
- 不做 RAG 知识库
- 不做 MCP 工具协议集成
- 不做自定义 prompt 模板（Phase 3 可选）
- 不内置作者的免费 Key（避免被扒、被薅、被封号）

### 1.3 核心决策

| 维度 | 决策 | 理由 |
|---|---|---|
| 服务商 | 智谱 GLM / DeepSeek / 硅基流动 | 三家均 OpenAI 兼容，国内速度快，覆盖免费→付费档位 |
| 默认 Provider | 智谱 `glm-4-flash` | 永久免费、官方稳定、注册门槛低 |
| Key 管理 | 用户自填 + 一键跳转申请 | 桌面开源项目标准做法，零法律风险 |
| Key 存储 | OS Keychain（macOS Keychain / Win Credential Manager / Linux libsecret） | 安全性高于 localStorage |
| 请求架构 | Rust 后端发起 HTTP + SSE 流式 → Tauri Event 推送到前端 | 避免 CORS、统一错误处理、Key 不离开 Rust |
| 流式输出 | 必须支持 SSE | 边生成边渲染提升体感 |
| 交互入口 | 斜杠命令 `/ai` 系列 + 划词浮层菜单 | 轻量、就地生成、与 Typora 式写作一致 |

---

## 2. 三家服务商对比

| 维度 | 智谱 GLM | DeepSeek | SiliconFlow |
|---|---|---|---|
| 免费力度 | `glm-4-flash`/`glm-4.5-flash` 永久免费 | 无严格免费，百万 tokens ≈ ¥1–2 | 送 ¥14 额度，`Qwen2.5-7B` 等永久免费 |
| 接口 Base URL | `https://open.bigmodel.cn/api/paas/v4` | `https://api.deepseek.com` | `https://api.siliconflow.cn/v1` |
| Chat 路径 | `/chat/completions` | `/v1/chat/completions` | `/chat/completions` |
| 协议 | OpenAI 兼容 | OpenAI 兼容 | OpenAI 兼容 |
| 代表模型 | `glm-4-flash`、`glm-4-plus` | `deepseek-chat`、`deepseek-reasoner` | `Qwen/Qwen2.5-7B-Instruct`（免费）、`deepseek-ai/DeepSeek-V3` |
| 申请链接 | <https://bigmodel.cn/usercenter/apikeys> | <https://platform.deepseek.com/api_keys> | <https://cloud.siliconflow.cn/account/ak> |
| 生成 Mermaid/LaTeX 质量 | 良好 | 优秀（代码类任务最佳） | 视模型而定 |

由于三家协议统一，**Provider 抽象只需一套实现**，用户在设置页切换即可。

---

## 3. 架构总览

```
┌────────────────────────────────────────────────────────────────┐
│                         前端 (React + Milkdown)                 │
│                                                                 │
│   ┌─────────────────────┐       ┌──────────────────────┐       │
│   │  slash-menu/  (重构) │       │ tooltip-toolbar 扩展 │       │
│   │  - AI 指令菜单项     │       │  - 划词 AI 按钮      │       │
│   │  - /ai <prompt> 解析 │       │  - 快捷 AI 菜单      │       │
│   └──────────┬──────────┘       └──────────┬───────────┘       │
│              │                              │                   │
│              └──────────────┬───────────────┘                   │
│                             ▼                                   │
│              ┌──────────────────────────┐                       │
│              │   ai-inline 插件 (新增)   │                       │
│              │   - 流式 token 就地渲染  │                       │
│              │   - 占位符 / 取消按钮    │                       │
│              │   - 完成后替换/插入      │                       │
│              └──────────────┬───────────┘                       │
│                             │                                   │
│              ┌──────────────▼──────────────┐                    │
│              │  services/ai-service.ts      │                    │
│              │  - 调用 Tauri Command        │                    │
│              │  - 监听 ai-stream event      │                    │
│              └──────────────┬──────────────┘                    │
│                             │                                   │
│              ┌──────────────▼──────────────┐                    │
│              │  stores/ai-store.ts          │                    │
│              │  - 当前 Provider / Model     │                    │
│              │  - Key 是否已配置            │                    │
│              │  - 进行中的请求状态          │                    │
│              └──────────────┬──────────────┘                    │
└─────────────────────────────┼───────────────────────────────────┘
                              │ Tauri invoke / event
┌─────────────────────────────▼───────────────────────────────────┐
│                        Rust 后端 (Tauri)                         │
│                                                                  │
│   ┌────────────────────────────────────────────┐                 │
│   │  commands/ai_commands.rs                    │                 │
│   │  - set_ai_api_key (→ keyring)               │                 │
│   │  - get_ai_api_key_status                    │                 │
│   │  - ai_chat_stream (SSE → emit event)        │                 │
│   │  - ai_test_connection                       │                 │
│   │  - cancel_ai_stream                         │                 │
│   └──────────────┬─────────────────────────────┘                 │
│                  │                                                │
│   ┌──────────────▼─────────────────────────────┐                 │
│   │  services/ai/                               │                 │
│   │  - provider.rs (Provider trait)             │                 │
│   │  - providers/zhipu.rs                       │                 │
│   │  - providers/deepseek.rs                    │                 │
│   │  - providers/siliconflow.rs                 │                 │
│   │  - sse.rs (SSE 解析)                        │                 │
│   │  - keychain.rs (keyring 封装)               │                 │
│   └─────────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────┘
```

### 关键事件流（流式生成）

1. 用户在编辑器输入 `/polish` 并选择 → 斜杠插件回调
2. `ai-service.ts` 调用 `invoke('ai_chat_stream', { requestId, messages, model })`
3. Rust 端发起 `reqwest` 请求（`stream: true`），解析 SSE，对每个 delta：
   - `window.emit(&format!("ai:stream:{}", request_id), delta)`
4. 前端在 `ai-inline` 插件中监听该事件，将 token 追加到占位节点
5. Rust 端结束后 `emit("ai:done:{id}", usage)`，错误时 `emit("ai:error:{id}", msg)`
6. 用户可随时调 `cancel_ai_stream(requestId)` 中止

---

## 4. 类型与数据结构

### 4.1 前端类型扩展 `src/types/ai.ts`

```typescript
/** 支持的 AI 服务商 */
export type AiProviderId = 'zhipu' | 'deepseek' | 'siliconflow' | 'custom';

/** 单个 Provider 配置 */
export interface AiProviderConfig {
  id: AiProviderId;
  /** 显示名称 */
  name: string;
  /** OpenAI 兼容 base URL */
  baseUrl: string;
  /** 该 Provider 可用模型清单 */
  models: AiModel[];
  /** 申请 Key 的控制台地址 */
  apiKeyUrl: string;
  /** 是否已配置 Key（由 Rust 端 has_key 同步） */
  hasKey: boolean;
}

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

/** AI 运行参数 */
export interface AiChatParams {
  providerId: AiProviderId;
  model: string;
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 内置指令类型 */
export type AiCommandId =
  | 'polish'
  | 'translate'
  | 'continue'
  | 'explain'
  | 'mermaid'
  | 'latex'
  | 'outline';

/** 指令元数据 */
export interface AiCommand {
  id: AiCommandId;
  label: string;
  icon: string;
  keywords: string[];
  /** 生成后的插入策略 */
  insertMode: 'replace-selection' | 'insert-after' | 'insert-as-mermaid' | 'insert-as-latex';
  /** 构造 prompt */
  buildPrompt: (input: AiPromptInput) => AiChatMessage[];
}

export interface AiPromptInput {
  /** 用户选中的文本（划词菜单场景） */
  selection?: string;
  /** 用户斜杠命令后输入的参数，例如 /mermaid 登录流程 */
  arg?: string;
  /** 上下文（光标前 N 段，用于续写） */
  context?: string;
  /** 额外参数（如 translate 的目标语言） */
  options?: Record<string, string>;
}

/** AppConfig 扩展 */
export interface AiConfig {
  enabled: boolean;
  currentProvider: AiProviderId;
  /** 各 Provider 选中的模型 */
  selectedModels: Record<AiProviderId, string>;
  temperature: number;
  maxTokens: number;
  /** 划词菜单显示 AI 按钮 */
  showInTooltip: boolean;
  /** 斜杠菜单显示 AI 指令 */
  showInSlash: boolean;
}
```

### 4.2 Rust 类型 `src-tauri/src/models/ai.rs`

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ProviderId {
    Zhipu,
    Deepseek,
    Siliconflow,
    Custom,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChatRequest {
    pub request_id: String,
    pub provider_id: ProviderId,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    /// 允许前端传自定义 baseUrl（Custom Provider）
    pub custom_base_url: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunk {
    pub request_id: String,
    pub delta: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamDone {
    pub request_id: String,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamError {
    pub request_id: String,
    pub code: String,  // "auth_failed" | "rate_limit" | "network" | "canceled" | "unknown"
    pub message: String,
}
```

---

## 5. 目录结构

### 5.1 前端新增/变更

```
src/
├── types/
│   ├── ai.ts                           # 新增：AI 相关所有类型
│   └── index.ts                        # 修改：导出 ai 类型
├── services/
│   ├── ai-service.ts                   # 新增：前端统一调用入口
│   └── ai/
│       ├── providers.ts                # 新增：三家 Provider 预设元数据
│       └── commands.ts                 # 新增：7 个内置指令定义与 prompt 模板
├── stores/
│   ├── ai-store.ts                     # 新增：AI 运行时状态
│   └── index.ts                        # 修改：导出 useAiStore
├── editor/
│   └── plugins/
│       ├── slash-menu.ts               # 删除
│       ├── slash-menu/                 # 新增（重构）
│       │   ├── index.ts                # 插件入口（原 slash-menu.ts 主逻辑）
│       │   ├── commands-basic.ts       # 原有指令定义
│       │   ├── commands-ai.ts          # 新增：AI 指令菜单项
│       │   ├── ai-arg-input.ts         # 新增：/mermaid <参数> 输入交互
│       │   └── icons.ts                # SVG 图标集
│       ├── ai-inline/                  # 新增：AI 就地生成插件
│       │   ├── index.ts                # 插件入口
│       │   ├── generator.ts            # 流式生成器（调 ai-service）
│       │   ├── placeholder.ts          # 占位 widget Decoration
│       │   └── types.ts
│       └── tooltip-toolbar.ts          # 修改：增加 AI 菜单
├── components/
│   └── settings/
│       └── AiSettings.tsx              # 新增：设置页 AI 分类
└── styles/
    └── editor/
        ├── ai-inline.css               # 新增：.lanismd-ai-* 样式
        └── slash-menu-ai.css           # 新增：AI 菜单项高亮
```

### 5.2 Rust 后端新增/变更

```
src-tauri/
├── Cargo.toml                          # 修改：新增依赖
└── src/
    ├── lib.rs                          # 修改：注册 ai 命令、mod ai_commands
    ├── commands/
    │   ├── mod.rs                      # 修改：pub mod ai_commands
    │   └── ai_commands.rs              # 新增：Tauri 命令入口
    ├── services/
    │   └── ai/
    │       ├── mod.rs                  # 新增
    │       ├── provider.rs             # 新增：Provider trait
    │       ├── providers/
    │       │   ├── mod.rs
    │       │   ├── zhipu.rs
    │       │   ├── deepseek.rs
    │       │   └── siliconflow.rs
    │       ├── sse.rs                  # 新增：SSE 流解析
    │       ├── keychain.rs             # 新增：keyring 封装
    │       └── stream_manager.rs       # 新增：管理 request_id → CancelToken
    └── models/
        ├── mod.rs                      # 修改：pub mod ai
        └── ai.rs                       # 新增
```

### 5.3 Cargo 依赖新增

```toml
[dependencies]
# ... 现有依赖 ...
reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls"], default-features = false }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync"] }
tokio-stream = "0.1"
futures-util = "0.3"
keyring = "3"
uuid = { version = "1", features = ["v4"] }
eventsource-stream = "0.2"
dashmap = "6"
```

---

## 6. 核心接口设计

### 6.1 Rust Provider trait（`services/ai/provider.rs`）

```rust
use async_trait::async_trait;
use futures_util::stream::BoxStream;

#[async_trait]
pub trait AiProvider: Send + Sync {
    fn id(&self) -> ProviderId;
    fn base_url(&self) -> &str;

    /// 返回 chat/completions 完整 URL
    fn chat_url(&self) -> String {
        format!("{}/chat/completions", self.base_url().trim_end_matches('/'))
    }

    /// 发起流式聊天，返回 delta 字符串流
    async fn chat_stream(
        &self,
        api_key: &str,
        req: &ChatRequest,
    ) -> Result<BoxStream<'static, Result<String, AiError>>, AiError>;
}
```

三家 Provider 共享一个 `openai_compatible.rs` 基础实现，各家只需提供 `base_url()`。因为协议一致，实际上 `ZhipuProvider` / `DeepseekProvider` / `SiliconFlowProvider` 都是 `OpenAiCompatibleProvider` 的壳。

### 6.2 Tauri 命令（`commands/ai_commands.rs`）

```rust
/// 保存 API Key 到系统 Keychain
#[tauri::command]
pub async fn set_ai_api_key(provider_id: ProviderId, api_key: String) -> Result<(), String>;

/// 删除 Key
#[tauri::command]
pub async fn delete_ai_api_key(provider_id: ProviderId) -> Result<(), String>;

/// 检查每个 Provider 的 Key 是否已配置（不返回 Key 本身）
#[tauri::command]
pub async fn get_ai_key_status() -> Result<HashMap<ProviderId, bool>, String>;

/// 非流式测试连接（用于"测试连接"按钮）
#[tauri::command]
pub async fn ai_test_connection(provider_id: ProviderId, model: String) -> Result<String, String>;

/// 流式聊天：立即返回 request_id，结果通过 event 推送
/// 事件通道：
///   "ai:stream:{request_id}" → StreamChunk
///   "ai:done:{request_id}"   → StreamDone
///   "ai:error:{request_id}"  → StreamError
#[tauri::command]
pub async fn ai_chat_stream(
    app: tauri::AppHandle,
    request: ChatRequest,
) -> Result<(), String>;

/// 取消正在进行的流
#[tauri::command]
pub async fn cancel_ai_stream(request_id: String) -> Result<(), String>;
```

### 6.3 前端服务层（`services/ai-service.ts`）

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface StreamCallbacks {
  onDelta: (delta: string) => void;
  onDone: (usage: { promptTokens?: number; completionTokens?: number }) => void;
  onError: (err: { code: string; message: string }) => void;
}

/**
 * 发起流式 AI 请求，返回取消函数。
 */
export async function startAiStream(
  params: AiChatParams,
  callbacks: StreamCallbacks,
): Promise<() => Promise<void>> {
  const requestId = crypto.randomUUID();

  // 先订阅 event，再发起请求，避免错过首包
  const unlisten: UnlistenFn[] = await Promise.all([
    listen<StreamChunk>(`ai:stream:${requestId}`, (e) => callbacks.onDelta(e.payload.delta)),
    listen<StreamDone>(`ai:done:${requestId}`, (e) => {
      callbacks.onDone({
        promptTokens: e.payload.promptTokens,
        completionTokens: e.payload.completionTokens,
      });
      unlisten.forEach((fn) => fn());
    }),
    listen<StreamError>(`ai:error:${requestId}`, (e) => {
      callbacks.onError({ code: e.payload.code, message: e.payload.message });
      unlisten.forEach((fn) => fn());
    }),
  ]);

  try {
    await invoke('ai_chat_stream', { request: { ...params, requestId } });
  } catch (err) {
    unlisten.forEach((fn) => fn());
    throw err;
  }

  // 返回取消函数
  return async () => {
    await invoke('cancel_ai_stream', { requestId });
    unlisten.forEach((fn) => fn());
  };
}

export async function setApiKey(providerId: AiProviderId, apiKey: string) {
  return invoke<void>('set_ai_api_key', { providerId, apiKey });
}
// ... 其他命令包装
```

### 6.4 指令定义（`services/ai/commands.ts`）

```typescript
export const AI_COMMANDS: Record<AiCommandId, AiCommand> = {
  polish: {
    id: 'polish',
    label: '润色',
    icon: ICON_POLISH,
    keywords: ['polish', 'rewrite', '润色', '改写', 'rs'],
    insertMode: 'replace-selection',
    buildPrompt: ({ selection }) => [
      { role: 'system', content: '你是一位专业的中文写作编辑。请对下面这段文字进行润色，保持原意，让表达更通顺自然。只输出润色后的文本，不要任何解释。' },
      { role: 'user', content: selection ?? '' },
    ],
  },
  translate: {
    id: 'translate',
    label: '翻译',
    icon: ICON_TRANSLATE,
    keywords: ['translate', 'translation', '翻译', 'fy'],
    insertMode: 'insert-after',
    buildPrompt: ({ selection, options }) => {
      const target = options?.target ?? 'auto';
      return [
        { role: 'system', content: `你是一位专业翻译。如果输入是中文翻译为英文，否则翻译为中文（当 target="${target}" 非 auto 时翻译为 ${target}）。只输出译文。` },
        { role: 'user', content: selection ?? '' },
      ];
    },
  },
  continue: {
    id: 'continue',
    label: '续写',
    icon: ICON_CONTINUE,
    keywords: ['continue', '续写', 'xw'],
    insertMode: 'insert-after',
    buildPrompt: ({ context }) => [
      { role: 'system', content: '你是一位写作助手。基于上下文续写下一段内容，风格保持一致，只输出续写的段落。' },
      { role: 'user', content: context ?? '' },
    ],
  },
  explain: {
    id: 'explain',
    label: '解释',
    icon: ICON_EXPLAIN,
    keywords: ['explain', '解释', 'js'],
    insertMode: 'insert-after',
    buildPrompt: ({ selection }) => [
      { role: 'system', content: '请用通俗易懂的中文解释下面的内容。如果是代码，解释它做什么；如果是概念，解释它是什么。输出 Markdown 格式。' },
      { role: 'user', content: selection ?? '' },
    ],
  },
  mermaid: {
    id: 'mermaid',
    label: '转图表',
    icon: ICON_MERMAID,
    keywords: ['mermaid', 'diagram', '图表', '流程图', 'tb'],
    insertMode: 'insert-as-mermaid',
    buildPrompt: ({ arg }) => [
      {
        role: 'system',
        content: `你是 Mermaid 语法专家。根据用户描述生成 Mermaid 图表代码。只输出纯代码，不要包裹 \`\`\`mermaid\`\`\` 标记，不要解释。`,
      },
      { role: 'user', content: arg ?? '' },
    ],
  },
  latex: {
    id: 'latex',
    label: '转公式',
    icon: ICON_LATEX,
    keywords: ['latex', 'formula', '公式', 'gs'],
    insertMode: 'insert-as-latex',
    buildPrompt: ({ arg }) => [
      {
        role: 'system',
        content: '将用户描述转为 LaTeX 数学公式。只输出公式本身（不要 $$ 包裹），不要解释。',
      },
      { role: 'user', content: arg ?? '' },
    ],
  },
  outline: {
    id: 'outline',
    label: '生成大纲',
    icon: ICON_OUTLINE,
    keywords: ['outline', '大纲', 'dg'],
    insertMode: 'insert-after',
    buildPrompt: ({ arg }) => [
      { role: 'system', content: '根据用户主题生成文档大纲，使用 Markdown 标题层级，只输出大纲本身。' },
      { role: 'user', content: arg ?? '' },
    ],
  },
};
```

### 6.5 Provider 预设（`services/ai/providers.ts`）

```typescript
export const PROVIDER_PRESETS: Record<Exclude<AiProviderId, 'custom'>, Omit<AiProviderConfig, 'hasKey'>> = {
  zhipu: {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyUrl: 'https://bigmodel.cn/usercenter/apikeys',
    models: [
      { id: 'glm-4-flash', label: 'GLM-4-Flash（免费）', free: true, contextLength: 128_000 },
      { id: 'glm-4.5-flash', label: 'GLM-4.5-Flash（免费）', free: true, contextLength: 128_000 },
      { id: 'glm-4-plus', label: 'GLM-4-Plus', free: false, contextLength: 128_000 },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek-Chat（V3）', free: false, contextLength: 64_000 },
      { id: 'deepseek-reasoner', label: 'DeepSeek-Reasoner（R1）', free: false, contextLength: 64_000 },
    ],
  },
  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyUrl: 'https://cloud.siliconflow.cn/account/ak',
    models: [
      { id: 'Qwen/Qwen2.5-7B-Instruct', label: 'Qwen2.5-7B（免费）', free: true, contextLength: 32_000 },
      { id: 'THUDM/glm-4-9b-chat', label: 'GLM-4-9B（免费）', free: true, contextLength: 128_000 },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3', free: false, contextLength: 64_000 },
    ],
  },
};
```

---

## 7. 交互设计

### 7.1 斜杠菜单 AI 指令

输入 `/` 后，除了现有的标题、列表等，新增一个"AI 助手"分组（带 children 子菜单，复用现有 children 机制）：

```
/ai     AI 助手                  ▶
  ├─ 润色（需选中文本）
  ├─ 翻译                        ▶  中译英 / 英译中 / 翻译为日语...
  ├─ 续写
  ├─ 解释（需选中文本）
  ├─ 转图表     /mermaid <描述>
  ├─ 转公式     /latex <描述>
  └─ 生成大纲   /outline <主题>
```

**参数型指令**的交互（`/mermaid`、`/latex`、`/outline`）：

1. 用户选择 "转图表" → 斜杠菜单关闭
2. 弹出就地输入框（floating-ui 定位在原 `/` 位置），placeholder: `描述你想要的图表`
3. 用户输入 "用户登录流程" + Enter
4. 开始流式生成，输入框变为生成中的占位 widget

**非参数型指令**（`polish`、`explain`）在未选中文本时：
- 菜单项禁用，hint: "请先选中要操作的文本"

### 7.2 划词浮层菜单扩展

现有 `tooltip-toolbar.ts` 在选中文本时显示浮层（加粗/斜体/链接等）。新增"AI"按钮：

```
[B] [I] [U] [S] [<>] [🔗] [AI ▼]
                          │
                          ├─ 润色
                          ├─ 翻译 ▶
                          ├─ 解释
                          └─ 转图表（选中文本作为描述）
```

### 7.3 就地生成的视觉反馈

使用 Milkdown 插件 + ProseMirror Decoration 实现：

- **生成中**：
  - 触发位置显示一个浅灰色占位块，内容随 token 流式追加
  - 顶部小标签：`AI 生成中...` + `[取消] [重试]`
  - 禁止编辑该区域
- **完成**：
  - 按 `insertMode` 处理：
    - `replace-selection`：替换选区
    - `insert-after`：在当前块后插入新段落
    - `insert-as-mermaid`：插入 `code_block` with `language=mermaid`，自动进入预览
    - `insert-as-latex`：插入 `math_block`
  - 顶部操作条：`[接受] [重试] [丢弃]`
- **错误**：
  - 占位块变红，显示错误信息 + `[重试] [关闭]`

### 7.4 错误分类与文案

| code | 触发场景 | 用户文案 |
|---|---|---|
| `auth_failed` | 401 / invalid key | "API Key 无效，请在设置 > AI 助手 中检查" |
| `rate_limit` | 429 | "请求过于频繁，请稍后重试" |
| `network` | 连接失败 / 超时 | "网络请求失败，请检查网络" |
| `canceled` | 用户点击取消 | 不弹窗 |
| `no_key` | 未配置 Key | "请先在设置中配置 API Key"（附"去配置"按钮） |
| `unknown` | 其他 | "AI 服务出错：{详情}" |

### 7.5 设置页

`AiSettings.tsx` 分三个区块：

1. **Provider 选择**：三张卡片（智谱/DeepSeek/SiliconFlow）+ 选中状态，每张卡底部显示"已配置 Key ✓" 或 "未配置"
2. **当前 Provider 配置**：
   - API Key 输入框（type=password，支持粘贴，保存后显示"已保存 ✓ [清除]"）
   - 模型下拉（Provider 切换时刷新列表）
   - "申请 Key →" 按钮（`shell.open(apiKeyUrl)`）
   - "测试连接" 按钮（调 `ai_test_connection`）
3. **行为设置**：
   - `temperature` 滑块（0-2，默认 0.7）
   - `maxTokens` 输入（默认 2000）
   - `showInSlash`、`showInTooltip` 复选框

---

## 8. 关键实现细节

### 8.1 SSE 解析（Rust）

使用 `eventsource-stream` crate 直接在 `reqwest` 响应上解析：

```rust
use eventsource_stream::Eventsource;
use futures_util::StreamExt;

let resp = client.post(provider.chat_url())
    .bearer_auth(api_key)
    .json(&body)
    .send()
    .await?;

if !resp.status().is_success() {
    return Err(map_status_error(resp.status(), resp.text().await.ok()));
}

let mut stream = resp.bytes_stream().eventsource();

while let Some(event) = stream.next().await {
    let event = event?;
    if event.data == "[DONE]" { break; }
    let chunk: OpenAiStreamChunk = serde_json::from_str(&event.data)?;
    if let Some(delta) = chunk.choices.first().and_then(|c| c.delta.content.clone()) {
        // emit to front-end
        window.emit(&format!("ai:stream:{}", request_id), StreamChunk {
            request_id: request_id.clone(),
            delta,
        })?;
    }
}
```

### 8.2 取消机制

使用 `tokio::sync::watch` + `DashMap<String, CancellationToken>`：

```rust
static CANCEL_TOKENS: Lazy<DashMap<String, CancellationToken>> = Lazy::new(DashMap::new);

// ai_chat_stream 内
let token = CancellationToken::new();
CANCEL_TOKENS.insert(request_id.clone(), token.clone());

tokio::select! {
    result = process_stream(...) => { /* normal path */ }
    _ = token.cancelled() => {
        window.emit(&format!("ai:error:{}", request_id), StreamError {
            code: "canceled".into(),
            message: "已取消".into(),
            ..
        })?;
    }
}

CANCEL_TOKENS.remove(&request_id);

// cancel_ai_stream 命令内
if let Some((_, token)) = CANCEL_TOKENS.remove(&request_id) {
    token.cancel();
}
```

### 8.3 Keychain 封装

```rust
// services/ai/keychain.rs
const SERVICE: &str = "lanismd.ai";

fn account(id: ProviderId) -> String {
    format!("api-key:{:?}", id).to_lowercase()
}

pub fn save_key(id: ProviderId, key: &str) -> Result<(), AiError> {
    keyring::Entry::new(SERVICE, &account(id))?.set_password(key)?;
    Ok(())
}

pub fn load_key(id: ProviderId) -> Result<String, AiError> {
    keyring::Entry::new(SERVICE, &account(id))?
        .get_password()
        .map_err(|e| match e {
            keyring::Error::NoEntry => AiError::NoKey,
            other => AiError::Keychain(other.to_string()),
        })
}

pub fn has_key(id: ProviderId) -> bool {
    load_key(id).is_ok()
}

pub fn delete_key(id: ProviderId) -> Result<(), AiError> {
    keyring::Entry::new(SERVICE, &account(id))?.delete_credential()?;
    Ok(())
}
```

### 8.4 slash-menu 重构策略

按项目规范：**从单文件变为多文件时必须重构为目录**。重构步骤：

1. 新建 `src/editor/plugins/slash-menu/` 目录
2. 把现有 `slash-menu.ts` 按职责拆分：
   - `index.ts`：导出 `slash` / `configureSlash` + `SlashMenuView` 类
   - `commands-basic.ts`：导出现有 `slashCommands` 数组（标题、列表等）
   - `icons.ts`：导出 `icons` 对象
   - `commands-ai.ts`：**新增** AI 相关指令（作为带 children 的一项）
   - `ai-arg-input.ts`：**新增** 参数型指令的输入框交互
3. 删除 `slash-menu.ts`，更新 `editor-setup.ts` 的导入路径
4. 确认所有现有功能回归

### 8.5 AppConfig 扩展

`src/stores/settings-store.ts` 的 `DEFAULT_CONFIG` 新增：

```typescript
ai: {
  enabled: true,
  currentProvider: 'zhipu',
  selectedModels: {
    zhipu: 'glm-4-flash',
    deepseek: 'deepseek-chat',
    siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
    custom: '',
  },
  temperature: 0.7,
  maxTokens: 2000,
  showInTooltip: true,
  showInSlash: true,
},
```

因现有 `deepMergeDefaults` 机制，老用户升级后会自动填充默认值，无需写迁移。

### 8.6 安全 & 隐私

- **API Key 永不进入前端内存**：即使前端需要 Key 也不传；所有请求由 Rust 直连云服务
- **不记录请求内容日志**：Rust 端仅 debug 级别打印请求 meta（Provider / Model / 字节数），不打印消息内容
- **Key 不持久化到 zustand store**：只存"是否已配置"布尔值
- **Keychain 删除时一并清理**：`resetToDefaults` 不清 Key（用户配置应独立于设置重置）

---

## 9. 阶段规划

### Phase 1：基础链路（~1-2 天）

**目标**：端到端跑通一个指令，验证技术方案

- [ ] Cargo 依赖新增 + `models/ai.rs` + `services/ai/` 骨架
- [ ] Rust 实现 OpenAI 兼容 Provider（先只做智谱）
- [ ] Keychain 封装 + 3 个基础命令（`set/delete/get_status`）
- [ ] 非流式 `ai_test_connection`
- [ ] 流式 `ai_chat_stream` + `cancel_ai_stream`
- [ ] 前端 `types/ai.ts` + `services/ai-service.ts` + `stores/ai-store.ts`
- [ ] 设置页 `AiSettings.tsx`（仅智谱单 Provider 版本）
- [ ] 斜杠菜单重构为目录结构
- [ ] 实现 `/polish` 一个指令走通 → 验证流式可用
- [ ] 简易 `ai-inline` 插件（占位 + 流式追加 + 替换）

**验收**：用户能填智谱 Key，选中文本按 `/` → `AI 助手` → `润色` → 看到 token 逐字生成，完成后替换选区。

### Phase 2：完整能力与交互（~2-3 天）

**目标**：交付所有指令与两个交互入口

- [ ] 补齐 DeepSeek、SiliconFlow 两个 Provider
- [ ] 设置页支持三家切换、模型选择、"申请 Key"链接、测试连接
- [ ] 实现全部 7 个指令的 prompt 与 `insertMode`
  - 特别是 `/mermaid` 插入后立即进入 mermaid-block 预览
  - `/latex` 插入后立即进入 math-block 渲染
- [ ] 参数型指令的就地输入框（`ai-arg-input.ts`）
- [ ] 扩展 `tooltip-toolbar.ts`：AI 按钮 + 子菜单
- [ ] 错误分类与友好提示
- [ ] 取消按钮 + 进行中占位 UI
- [ ] 样式打磨（`.lanismd-ai-*` 类名前缀）

**验收**：所有指令可用；两个入口都能触发；错误场景有明确提示；取消能立即停止。

### Phase 3：体验打磨（可选，~1 天）

- [ ] 重试按钮（保留上次 prompt 重发）
- [ ] 最近使用的 AI 结果历史（Zustand + sessionStorage，不持久化到文件）
- [ ] Temperature / maxTokens 的细粒度控制（在 AI 菜单项右键"更多选项"）
- [ ] 可选的自定义 prompt 模板（用户可在设置页添加自己的 `/xxx` 指令）
- [ ] 首次使用引导（未配置 Key 时弹出一次性提示）

**验收**：完整产品形态，可以合并到 main。

---

## 10. 风险与取舍

| 风险 | 缓解措施 |
|---|---|
| 内网用户无法访问国外 Key 申请页 | 三家都是国内服务，无需翻墙 |
| Tauri 2 event payload 序列化性能 | token 增量短，每秒几百次 emit 无压力；测试中可合并小窗口 |
| SSE 跨平台差异 | `reqwest` + `eventsource-stream` 纯 Rust 实现，跨平台一致 |
| `keyring` crate 在某些 Linux 无 secret service | 降级到加密文件存储（`~/.config/lanismd/ai-keys.enc`，用机器 id 派生 key） |
| 用户填错 baseUrl 导致请求卡死 | 所有请求 30s 超时；"测试连接"按钮快速反馈 |
| Mermaid 生成语法错误 | mermaid-block 本身已有错误提示 UI；用户可"重试" |
| LaTeX 生成被包裹 `$$` | system prompt 明确要求不包；前端二次裁剪 `^\$+|\$+$` |
| Prompt 超出上下文窗口 | 续写/解释时截断到 N 字符 + 警告 |

---

## 11. 验收清单（最终交付时）

- [ ] 三家 Provider 都能配置、切换、测试连接
- [ ] 7 个指令全部可用
- [ ] 流式输出流畅，无卡顿
- [ ] 取消功能正常
- [ ] Key 存在 OS Keychain，重启后仍可用
- [ ] 删除 Key 后调用返回 `no_key` 错误
- [ ] 无 console error
- [ ] `pnpm build` + `cargo check` 通过
- [ ] 所有注释为中文
- [ ] 无 emoji 夹带
- [ ] 样式使用 `.lanismd-ai-` 前缀
- [ ] slash-menu 重构无功能回归

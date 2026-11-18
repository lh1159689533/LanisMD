//! AI 相关的数据结构定义
//!
//! 与前端 `src/types/ai.ts` 保持字段对齐（通过 serde rename_all = "camelCase"）。
//!
//! 模型配置采用「一条配置 = 一个模型」：类型 + 名称 + 基础 URL + 模型 ID + 密钥来源，
//! 请求只携带配置 id，模型 ID、地址、密钥都在后端按配置解析。

use serde::{Deserialize, Serialize};

/// 模型类型：决定协议与参数差异，默认值（名称、地址等）由前端表单提供
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum ModelKind {
    #[serde(rename = "ollama")]
    Ollama,
    #[serde(rename = "lmstudio")]
    LmStudio,
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "anthropic")]
    Anthropic,
    #[serde(rename = "gemini")]
    Gemini,
    #[serde(rename = "openrouter")]
    OpenRouter,
    #[serde(rename = "openai-compatible")]
    OpenAiCompatible,
}

/// 接口协议
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Protocol {
    /// OpenAI Chat Completions 及其兼容实现（Gemini 使用 Google 官方兼容端点）
    OpenAi,
    /// Anthropic Messages API
    Anthropic,
}

impl ModelKind {
    pub fn protocol(self) -> Protocol {
        match self {
            ModelKind::Anthropic => Protocol::Anthropic,
            _ => Protocol::OpenAi,
        }
    }

    /// 最大输出 token 的参数名：OpenAI 新模型（o 系列 / GPT-5）只接受 max_completion_tokens
    pub fn max_tokens_param(self) -> &'static str {
        match self {
            ModelKind::OpenAi => "max_completion_tokens",
            _ => "max_tokens",
        }
    }

    /// 是否下发 temperature：OpenAI 推理模型只接受默认值，传入会直接 400
    pub fn sends_temperature(self) -> bool {
        !matches!(self, ModelKind::OpenAi)
    }
}

/// API 密钥来源
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum KeySource {
    /// 保存在本地配置文件
    #[default]
    Local,
    /// 运行时从环境变量读取
    Env,
    /// 无需密钥（本地模型、免鉴权网关）
    None,
}

/// 聊天消息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// 前端发起 chat 请求的载荷
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    /// 由前端生成的唯一 ID，用于关联 event 频道
    pub request_id: String,
    /// 模型配置 id
    pub profile_id: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u32>,
}

/// 流式事件：统一通过 `ai:event:{request_id}` 频道推送，`kind` 区分类型
#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AiStreamEvent {
    /// 正文增量
    Delta { delta: String },
    /// 推理模型的思考过程增量
    Reasoning { delta: String },
    /// 正常结束
    #[serde(rename_all = "camelCase")]
    Done {
        prompt_tokens: Option<u32>,
        completion_tokens: Option<u32>,
        /// 结束原因：stop（正常）| length（触达输出上限被截断）| 其他
        finish_reason: Option<String>,
    },
    /// 出错或被取消
    Error {
        /// auth_failed | rate_limit | network | timeout | canceled | no_key | unknown
        code: String,
        message: String,
    },
}

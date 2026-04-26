//! AI Provider 统一错误类型与 SSE 流协议数据结构

use serde::Deserialize;
use thiserror::Error;

/// AI 服务统一错误
#[derive(Debug, Error, Clone)]
pub enum AiError {
    #[error("未配置 API Key")]
    NoKey,

    #[error("API Key 无效（401）")]
    AuthFailed,

    #[error("请求过于频繁（429）")]
    RateLimit,

    #[error("网络请求失败：{0}")]
    Network(String),

    #[error("请求已取消")]
    Canceled,

    #[error("Keychain 访问失败：{0}")]
    Keychain(String),

    #[error("解析 SSE 数据失败：{0}")]
    Parse(String),

    #[error("AI 服务错误：{0}")]
    Unknown(String),
}

impl AiError {
    /// 映射到前端的 error code
    pub fn code(&self) -> &'static str {
        match self {
            AiError::NoKey => "no_key",
            AiError::AuthFailed => "auth_failed",
            AiError::RateLimit => "rate_limit",
            AiError::Network(_) => "network",
            AiError::Canceled => "canceled",
            AiError::Keychain(_) => "unknown",
            AiError::Parse(_) => "unknown",
            AiError::Unknown(_) => "unknown",
        }
    }
}

impl From<reqwest::Error> for AiError {
    fn from(err: reqwest::Error) -> Self {
        AiError::Network(err.to_string())
    }
}

// ---------------------------------------------------------------------------
// OpenAI 兼容的 SSE 数据结构
// ---------------------------------------------------------------------------

/// OpenAI 兼容流式 chunk 的单条 JSON
#[derive(Debug, Deserialize)]
pub struct OpenAiStreamChunk {
    #[serde(default)]
    pub choices: Vec<OpenAiChoice>,
    #[serde(default)]
    pub usage: Option<OpenAiUsage>,
}

#[derive(Debug, Deserialize)]
pub struct OpenAiChoice {
    #[serde(default)]
    pub delta: OpenAiDelta,
    #[serde(default)]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
pub struct OpenAiDelta {
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub role: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
pub struct OpenAiUsage {
    #[serde(default)]
    pub prompt_tokens: Option<u32>,
    #[serde(default)]
    pub completion_tokens: Option<u32>,
}

/// 非流式调用的响应体
#[derive(Debug, Deserialize)]
pub struct OpenAiChatResponse {
    #[serde(default)]
    pub choices: Vec<OpenAiChoiceNonStream>,
}

#[derive(Debug, Deserialize)]
pub struct OpenAiChoiceNonStream {
    #[serde(default)]
    pub message: OpenAiMessage,
}

#[derive(Debug, Deserialize, Default)]
pub struct OpenAiMessage {
    #[serde(default)]
    pub content: String,
}

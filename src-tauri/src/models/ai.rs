//! AI 相关的数据结构定义
//!
//! 与前端 `src/types/ai.ts` 保持字段对齐（通过 serde rename_all = "camelCase"）。

use serde::{Deserialize, Serialize};

/// 支持的 AI 服务商标识
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ProviderId {
    Zhipu,
    Deepseek,
    Siliconflow,
    Custom,
}

impl ProviderId {
    /// 用于配置文件中的 Provider 标识字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            ProviderId::Zhipu => "zhipu",
            ProviderId::Deepseek => "deepseek",
            ProviderId::Siliconflow => "siliconflow",
            ProviderId::Custom => "custom",
        }
    }
}

/// 聊天消息（OpenAI 兼容格式）
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
    pub provider_id: ProviderId,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u32>,
    /// 允许前端传自定义 baseUrl（Custom Provider 使用）
    pub custom_base_url: Option<String>,
}

/// 单次流式增量
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunk {
    pub request_id: String,
    pub delta: String,
}

/// 流式完成事件
#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct StreamDone {
    pub request_id: String,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
}

/// 流式错误事件
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StreamError {
    pub request_id: String,
    /// 错误代码：auth_failed | rate_limit | network | canceled | no_key | unknown
    pub code: String,
    pub message: String,
}

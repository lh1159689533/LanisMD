//! AI 服务统一错误类型

use reqwest::StatusCode;
use thiserror::Error;

/// AI 服务统一错误
#[derive(Debug, Error, Clone)]
pub enum AiError {
    #[error("未配置 API Key")]
    NoKey,

    #[error("环境变量 {0} 未设置或为空")]
    EnvKeyMissing(String),

    #[error("API Key 无效（401）")]
    AuthFailed,

    #[error("请求过于频繁（429）")]
    RateLimit,

    #[error("网络请求失败：{0}")]
    Network(String),

    #[error("AI 服务响应超时")]
    Timeout,

    #[error("请求已取消")]
    Canceled,

    #[error("解析响应失败：{0}")]
    Parse(String),

    #[error("AI 服务错误：{0}")]
    Unknown(String),
}

impl AiError {
    /// 映射到前端的 error code
    pub fn code(&self) -> &'static str {
        match self {
            AiError::NoKey | AiError::EnvKeyMissing(_) => "no_key",
            AiError::AuthFailed => "auth_failed",
            AiError::RateLimit => "rate_limit",
            AiError::Network(_) => "network",
            AiError::Timeout => "timeout",
            AiError::Canceled => "canceled",
            AiError::Parse(_) | AiError::Unknown(_) => "unknown",
        }
    }
}

impl From<reqwest::Error> for AiError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            // reqwest 内部超时（连接超时 / 非流式总超时）统一归为 timeout
            return AiError::Timeout;
        }
        AiError::Network(err.to_string())
    }
}

/// 把非 2xx HTTP 状态码映射成 AiError
pub fn map_status(status: StatusCode, body: Option<String>) -> AiError {
    match status.as_u16() {
        401 | 403 => AiError::AuthFailed,
        429 => AiError::RateLimit,
        code => {
            let detail = body.unwrap_or_else(|| status.to_string());
            AiError::Unknown(format!("HTTP {}: {}", code, trim_body(&detail)))
        }
    }
}

/// 截断过长的 body，避免日志污染（按字符截断，避免切在 UTF-8 多字节中间导致 panic）
fn trim_body(s: &str) -> String {
    const MAX_CHARS: usize = 500;
    match s.char_indices().nth(MAX_CHARS) {
        Some((idx, _)) => format!("{}...", &s[..idx]),
        None => s.to_string(),
    }
}

//! AI Provider trait 定义
//!
//! 当前三家（智谱 / DeepSeek / SiliconFlow）都使用 OpenAI 兼容协议，
//! 因此实际只有一份 `openai_compatible` 实现，Provider 的区别仅为 base_url。

/// 获取指定 Provider 的 chat/completions URL
pub fn chat_url(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

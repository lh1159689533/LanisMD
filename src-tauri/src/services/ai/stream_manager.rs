//! 管理所有进行中的 AI 流请求：request_id → CancellationToken
//!
//! 前端调用 `cancel_ai_stream(requestId)` 时通过本模块找到对应的 token 并取消。

use dashmap::DashMap;
use once_cell::sync::Lazy;
use tokio_util::sync::CancellationToken;

static TOKENS: Lazy<DashMap<String, CancellationToken>> = Lazy::new(DashMap::new);

/// 注册一个新的流
pub fn register(request_id: &str) -> CancellationToken {
    let token = CancellationToken::new();
    TOKENS.insert(request_id.to_string(), token.clone());
    token
}

/// 流结束后清理
pub fn remove(request_id: &str) {
    TOKENS.remove(request_id);
}

/// 取消指定请求
pub fn cancel(request_id: &str) -> bool {
    if let Some((_, token)) = TOKENS.remove(request_id) {
        token.cancel();
        true
    } else {
        false
    }
}

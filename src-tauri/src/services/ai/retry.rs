//! 请求发送与退避重试
//!
//! 仅在「尚未开始接收正文」之前重试（发送请求 / 等待响应头阶段），
//! 流式输出开始后不重试，避免重复内容。
//!
//! 重试条件：
//! - HTTP 429 / 500 / 502 / 503 / 504 / 529（Anthropic 过载）
//! - 连接级网络错误（连接失败、连接被重置等）
//!
//! 等待时长：优先使用响应头 `Retry-After`（秒，上限 10 秒），否则依次 1 秒、3 秒。

use std::time::Duration;

use reqwest::header::RETRY_AFTER;
use reqwest::{RequestBuilder, Response, StatusCode};
use tokio_util::sync::CancellationToken;

use crate::services::ai::error::AiError;

/// 退避序列（秒），长度即最大重试次数
const BACKOFF_SECS: [u64; 2] = [1, 3];
/// Retry-After 的采纳上限，避免服务端要求过长等待导致界面长时间无响应
const MAX_RETRY_AFTER_SECS: u64 = 10;

/// 是否为可重试的 HTTP 状态
fn is_retryable_status(status: StatusCode) -> bool {
    matches!(status.as_u16(), 429 | 500 | 502 | 503 | 504 | 529)
}

/// 解析 `Retry-After`（仅支持秒数形式；HTTP 日期形式按未提供处理）
fn retry_after(resp: &Response) -> Option<Duration> {
    let secs: u64 = resp
        .headers()
        .get(RETRY_AFTER)?
        .to_str()
        .ok()?
        .trim()
        .parse()
        .ok()?;
    Some(Duration::from_secs(secs.min(MAX_RETRY_AFTER_SECS)))
}

/// 发送一次请求并等待响应头（受取消与超时控制）
async fn send_once(
    builder: RequestBuilder,
    cancel: &CancellationToken,
    response_timeout: Duration,
) -> Result<Response, AiError> {
    tokio::select! {
        result = tokio::time::timeout(response_timeout, builder.send()) => match result {
            Ok(Ok(resp)) => Ok(resp),
            Ok(Err(e)) => Err(AiError::from(e)),
            Err(_) => Err(AiError::Timeout),
        },
        _ = cancel.cancelled() => Err(AiError::Canceled),
    }
}

/// 可被取消的等待
async fn sleep_or_cancel(delay: Duration, cancel: &CancellationToken) -> Result<(), AiError> {
    tokio::select! {
        _ = tokio::time::sleep(delay) => Ok(()),
        _ = cancel.cancelled() => Err(AiError::Canceled),
    }
}

/// 发送请求，遇到可重试错误时退避重试。
///
/// `make` 每次调用都应构造一个全新的请求（RequestBuilder 不可复用）。
/// 返回最后一次拿到的响应（可能仍是非 2xx，由调用方映射错误），或最终的网络错误。
pub async fn send_with_retry(
    make: impl Fn() -> RequestBuilder,
    cancel: &CancellationToken,
    response_timeout: Duration,
) -> Result<Response, AiError> {
    let mut attempt = 0usize;
    loop {
        let result = send_once(make(), cancel, response_timeout).await;
        let Some(&backoff) = BACKOFF_SECS.get(attempt) else {
            return result;
        };
        let delay = match &result {
            Ok(resp) if is_retryable_status(resp.status()) => {
                retry_after(resp).unwrap_or(Duration::from_secs(backoff))
            }
            Err(AiError::Network(_)) => Duration::from_secs(backoff),
            _ => return result,
        };
        sleep_or_cancel(delay, cancel).await?;
        attempt += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retryable_statuses() {
        for code in [429u16, 500, 502, 503, 504, 529] {
            assert!(is_retryable_status(StatusCode::from_u16(code).unwrap()));
        }
        for code in [400u16, 401, 403, 404, 422] {
            assert!(!is_retryable_status(StatusCode::from_u16(code).unwrap()));
        }
    }
}

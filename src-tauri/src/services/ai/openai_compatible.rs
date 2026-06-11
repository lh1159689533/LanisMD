//! OpenAI 兼容协议的流式与非流式实现
//!
//! 三家（智谱 / DeepSeek / SiliconFlow）都走同一份实现，仅 base_url 不同。

use std::time::Duration;

use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use reqwest::StatusCode;
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use crate::models::ai::{ChatRequest, StreamChunk, StreamDone, StreamError};
use crate::services::ai::config_file;
use crate::services::ai::provider::chat_url;
use crate::services::ai::providers::resolve_base_url;
use crate::services::ai::sse::{AiError, OpenAiChatResponse, OpenAiStreamChunk};

/// HTTP 请求总超时
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
/// 连接建立超时
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

/// 构造 HTTP Client
fn build_client() -> Result<reqwest::Client, AiError> {
    reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(AiError::from)
}

/// 把 HTTP 状态码映射成 AiError
fn map_status(status: StatusCode, body: Option<String>) -> AiError {
    if status.as_u16() == 401 || status.as_u16() == 403 {
        AiError::AuthFailed
    } else if status.as_u16() == 429 {
        AiError::RateLimit
    } else {
        let detail = body.unwrap_or_else(|| status.to_string());
        AiError::Unknown(format!("HTTP {}: {}", status.as_u16(), trim_body(&detail)))
    }
}

/// 截断过长的 body，避免日志污染
fn trim_body(s: &str) -> String {
    const MAX: usize = 500;
    if s.len() > MAX {
        format!("{}...", &s[..MAX])
    } else {
        s.to_string()
    }
}

/// 非流式调用，用于"测试连接"按钮
pub async fn run_test_chat(req: &ChatRequest) -> Result<String, AiError> {
    let base_url = resolve_base_url(req.provider_id, req.custom_base_url.as_deref())
        .ok_or_else(|| AiError::Unknown("缺少 baseUrl".into()))?;
    let api_key = config_file::load_key(req.provider_id)?;

    let body = json!({
        "model": req.model,
        "messages": req.messages,
        "stream": false,
        "temperature": req.temperature.unwrap_or(0.7),
        "max_tokens": req.max_tokens.unwrap_or(64),
        "thinking": json!({
            "type": "disabled"
        })
    });

    let url = chat_url(&base_url);
    println!("[AI 测试连接] URL: {}", url);
    println!(
        "[AI 测试连接] body: {}",
        serde_json::to_string_pretty(&body).unwrap_or_default()
    );

    let client = build_client()?;
    let resp = client
        .post(&url)
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.ok();
        println!(
            "[AI 测试连接] 请求失败 status={}, body={:?}",
            status.as_u16(),
            &text
        );
        return Err(map_status(status, text));
    }

    let parsed: OpenAiChatResponse = resp
        .json()
        .await
        .map_err(|e| AiError::Parse(e.to_string()))?;
    let content = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .unwrap_or_default();
    Ok(content)
}

/// 流式调用：SSE 解析 → 通过 Tauri event 推送到前端
///
/// 事件频道：
/// - `ai:stream:{request_id}` → `StreamChunk`
/// - `ai:done:{request_id}`   → `StreamDone`
/// - `ai:error:{request_id}`  → `StreamError`
pub async fn run_stream_chat(app: AppHandle, req: ChatRequest, cancel_token: CancellationToken) {
    let request_id = req.request_id.clone();

    // 把异常统一转换为前端 error event
    let emit_error = |err: AiError| {
        let payload = StreamError {
            request_id: request_id.clone(),
            code: err.code().to_string(),
            message: err.to_string(),
        };
        let _ = app.emit(&format!("ai:error:{}", request_id), payload);
    };

    let base_url = match resolve_base_url(req.provider_id, req.custom_base_url.as_deref()) {
        Some(v) => v,
        None => {
            emit_error(AiError::Unknown("缺少 baseUrl".into()));
            return;
        }
    };

    let api_key = match config_file::load_key(req.provider_id) {
        Ok(v) => v,
        Err(e) => {
            emit_error(e);
            return;
        }
    };

    let client = match build_client() {
        Ok(c) => c,
        Err(e) => {
            emit_error(e);
            return;
        }
    };

    let body = json!({
        "model": req.model,
        "messages": req.messages,
        "stream": true,
        "temperature": req.temperature.unwrap_or(0.7),
        "max_tokens": req.max_tokens.unwrap_or(2000),
    });

    // 发起请求时也允许被取消
    let resp = tokio::select! {
        result = client
            .post(chat_url(&base_url))
            .bearer_auth(&api_key)
            .json(&body)
            .send() => {
                match result {
                    Ok(r) => r,
                    Err(e) => {
                        emit_error(AiError::from(e));
                        return;
                    }
                }
            }
        _ = cancel_token.cancelled() => {
            emit_error(AiError::Canceled);
            return;
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.ok();
        emit_error(map_status(status, text));
        return;
    }

    let mut stream = resp.bytes_stream().eventsource();
    let mut usage: Option<(Option<u32>, Option<u32>)> = None;

    loop {
        tokio::select! {
            biased;
            _ = cancel_token.cancelled() => {
                emit_error(AiError::Canceled);
                return;
            }
            maybe_event = stream.next() => {
                let event = match maybe_event {
                    Some(Ok(ev)) => ev,
                    Some(Err(e)) => {
                        emit_error(AiError::Network(e.to_string()));
                        return;
                    }
                    None => break,
                };

                if event.data == "[DONE]" {
                    break;
                }

                let chunk: OpenAiStreamChunk = match serde_json::from_str(&event.data) {
                    Ok(v) => v,
                    Err(_) => {
                        // 少数 Provider 会偶发下发非 JSON 注释行，跳过即可
                        continue;
                    }
                };

                if let Some(u) = chunk.usage {
                    usage = Some((u.prompt_tokens, u.completion_tokens));
                }

                if let Some(delta) = chunk
                    .choices
                    .first()
                    .and_then(|c| c.delta.content.clone())
                {
                    if !delta.is_empty() {
                        let payload = StreamChunk {
                            request_id: request_id.clone(),
                            delta,
                        };
                        let _ = app.emit(&format!("ai:stream:{}", request_id), payload);
                    }
                }
            }
        }
    }

    let done = StreamDone {
        request_id: request_id.clone(),
        prompt_tokens: usage.and_then(|u| u.0),
        completion_tokens: usage.and_then(|u| u.1),
    };
    let _ = app.emit(&format!("ai:done:{}", request_id), done);
}

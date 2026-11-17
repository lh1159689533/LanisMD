//! AI 请求传输层：与协议无关的发送、超时、SSE 读取与事件推送
//!
//! 超时策略：
//! - 流式请求不设总超时（长回答 / 推理模型可能持续数分钟），
//!   改为「等待响应头超时」+「两次 SSE 事件之间的空闲超时」
//! - 非流式测试连接保留总超时
//!
//! 事件统一推送到 `ai:event:{request_id}`，载荷为 `AiStreamEvent`（按 `kind` 区分）。

use std::time::Duration;

use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use reqwest::{Client, Response};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use crate::models::ai::{AiStreamEvent, ChatRequest};
use crate::services::ai::error::{map_status, AiError};
use crate::services::ai::provider::{create_provider, ChatProvider, ParsedEvent};
use crate::services::ai::retry::send_with_retry;

/// 连接建立超时
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
/// 非流式（测试连接）总超时
const TEST_REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
/// 流式：发出请求到收到响应头的最长等待（单次尝试）
const STREAM_RESPONSE_TIMEOUT: Duration = Duration::from_secs(90);
/// 流式：两次 SSE 事件之间允许的最长空闲（推理模型思考阶段也会持续推送 reasoning 增量）
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(120);

/// 构造 HTTP Client；`total_timeout` 为 None 时不限制总时长
fn build_client(total_timeout: Option<Duration>) -> Result<Client, AiError> {
    let mut builder = Client::builder().connect_timeout(CONNECT_TIMEOUT);
    if let Some(t) = total_timeout {
        builder = builder.timeout(t);
    }
    builder.build().map_err(AiError::from)
}

/// 在阻塞线程池中创建适配器：读取配置文件、解析环境变量（可能需启动登录 Shell）都是阻塞操作
async fn create_provider_blocking(req: &ChatRequest) -> Result<Box<dyn ChatProvider>, AiError> {
    let req = req.clone();
    tauri::async_runtime::spawn_blocking(move || create_provider(&req))
        .await
        .map_err(|e| AiError::Unknown(format!("内部任务失败：{}", e)))?
}

/// 非流式调用，用于"测试连接"按钮（不重试，尽快反馈配置问题）
pub async fn run_test_chat(req: &ChatRequest) -> Result<String, AiError> {
    let provider = create_provider_blocking(req).await?;
    let client = build_client(Some(TEST_REQUEST_TIMEOUT))?;
    let resp = provider.build_test_request(&client, req).send().await?;

    let status = resp.status();
    let text = resp.text().await.map_err(AiError::from)?;
    if !status.is_success() {
        return Err(map_status(status, Some(text)));
    }
    provider.parse_test_response(&text)
}

/// 发起流式请求并保证拿到 2xx 响应：
/// 先按服务商能力决定是否携带用量参数，若被服务端明确拒绝则去掉后再试一次
async fn open_stream(
    client: &Client,
    provider: &dyn ChatProvider,
    req: &ChatRequest,
    cancel: &CancellationToken,
) -> Result<Response, AiError> {
    let send = |with_usage: bool| {
        send_with_retry(
            move || provider.build_stream_request(client, req, with_usage),
            cancel,
            STREAM_RESPONSE_TIMEOUT,
        )
    };

    let with_usage = provider.supports_stream_usage();
    let resp = send(with_usage).await?;
    if resp.status().is_success() {
        return Ok(resp);
    }

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !(with_usage && provider.rejects_stream_usage(status, &text)) {
        return Err(map_status(status, Some(text)));
    }

    let resp = send(false).await?;
    if resp.status().is_success() {
        return Ok(resp);
    }
    let status = resp.status();
    Err(map_status(status, resp.text().await.ok()))
}

/// 读取 SSE 流直到结束，正文/思考增量实时推送；返回结束事件
async fn pump_stream(
    resp: Response,
    provider: &dyn ChatProvider,
    cancel: &CancellationToken,
    emit: &impl Fn(AiStreamEvent),
) -> Result<AiStreamEvent, AiError> {
    let mut stream = resp.bytes_stream().eventsource();
    let mut usage: Option<(Option<u32>, Option<u32>)> = None;
    let mut finish_reason: Option<String> = None;

    loop {
        let next = tokio::select! {
            biased;
            _ = cancel.cancelled() => return Err(AiError::Canceled),
            next = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()) => {
                next.map_err(|_| AiError::Timeout)?
            }
        };

        let event = match next {
            Some(Ok(ev)) => ev,
            Some(Err(e)) => return Err(AiError::Network(e.to_string())),
            None => break,
        };

        let piece = match provider.parse_stream_event(&event.event, &event.data) {
            ParsedEvent::Done => break,
            ParsedEvent::Skip => continue,
            ParsedEvent::Error(message) => return Err(AiError::Unknown(message)),
            ParsedEvent::Piece(p) => p,
        };

        // 部分协议（Anthropic）分别在开头和结尾给出输入/输出用量，逐项合并
        if let Some((prompt, completion)) = piece.usage {
            let (old_prompt, old_completion) = usage.unwrap_or((None, None));
            usage = Some((prompt.or(old_prompt), completion.or(old_completion)));
        }
        if piece.finish_reason.is_some() {
            finish_reason = piece.finish_reason;
        }
        if let Some(delta) = piece.reasoning {
            emit(AiStreamEvent::Reasoning { delta });
        }
        if let Some(delta) = piece.content {
            emit(AiStreamEvent::Delta { delta });
        }
    }

    Ok(AiStreamEvent::Done {
        prompt_tokens: usage.and_then(|u| u.0),
        completion_tokens: usage.and_then(|u| u.1),
        finish_reason,
    })
}

/// 流式调用全过程；出错（含取消）时返回 Err
async fn stream_chat(
    req: &ChatRequest,
    cancel: &CancellationToken,
    emit: &impl Fn(AiStreamEvent),
) -> Result<AiStreamEvent, AiError> {
    let provider = create_provider_blocking(req).await?;
    let client = build_client(None)?;
    let resp = open_stream(&client, provider.as_ref(), req, cancel).await?;
    pump_stream(resp, provider.as_ref(), cancel, emit).await
}

/// 流式调用入口：结果通过 `ai:event:{request_id}` 推送到前端
pub async fn run_stream_chat(app: AppHandle, req: ChatRequest, cancel: CancellationToken) {
    let channel = format!("ai:event:{}", req.request_id);
    let emit = |event: AiStreamEvent| {
        let _ = app.emit(&channel, event);
    };

    let last = match stream_chat(&req, &cancel, &emit).await {
        Ok(done) => done,
        Err(err) => AiStreamEvent::Error {
            code: err.code().to_string(),
            message: err.to_string(),
        },
    };
    emit(last);
}

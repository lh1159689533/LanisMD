//! Anthropic Messages API 原生适配器
//!
//! 与 OpenAI 协议的差异：
//! - 鉴权：`x-api-key` + `anthropic-version` 请求头
//! - system 提示词是顶层字段而非消息；`max_tokens` 必填
//! - 流式事件按类型区分：content_block_delta（text_delta / thinking_delta）、
//!   message_start（输入用量）、message_delta（结束原因 + 输出用量）、message_stop、error
//! - 结束原因 `max_tokens` 规范化为 `length`，与 OpenAI 协议保持一致

use reqwest::{Client, RequestBuilder, StatusCode};
use serde_json::{json, Map, Value};

use crate::models::ai::ChatRequest;
use crate::services::ai::error::AiError;
use crate::services::ai::provider::{ChatProvider, Endpoint, ParsedEvent, StreamPiece};

/// API 版本头
const ANTHROPIC_VERSION: &str = "2023-06-01";
/// 未指定时的默认 temperature
const DEFAULT_TEMPERATURE: f64 = 0.7;
/// 未指定时的默认最大输出 token（Anthropic 必填）
const DEFAULT_MAX_TOKENS: u32 = 4096;
/// 测试连接的最大输出 token
const TEST_MAX_TOKENS: u32 = 64;

pub struct Anthropic {
    endpoint: Endpoint,
}

impl Anthropic {
    pub fn new(endpoint: Endpoint) -> Self {
        Self { endpoint }
    }

    fn messages_url(&self) -> String {
        format!(
            "{}/messages",
            self.endpoint.profile.base_url.trim_end_matches('/')
        )
    }

    fn post(&self, client: &Client) -> RequestBuilder {
        let rb = client
            .post(self.messages_url())
            .header("anthropic-version", ANTHROPIC_VERSION);
        match &self.endpoint.api_key {
            Some(key) => rb.header("x-api-key", key),
            None => rb,
        }
    }

    /// 构造请求体：system 消息合并为顶层 system 字段，其余作为对话消息
    fn body(
        &self,
        req: &ChatRequest,
        stream: bool,
        max_tokens: u32,
        extra: &[&Option<Value>],
    ) -> Value {
        let system: Vec<&str> = req
            .messages
            .iter()
            .filter(|m| m.role == "system")
            .map(|m| m.content.as_str())
            .collect();
        let messages: Vec<Value> = req
            .messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| json!({ "role": m.role, "content": m.content }))
            .collect();

        let mut body = Map::new();
        body.insert("model".into(), json!(self.endpoint.profile.model));
        body.insert("max_tokens".into(), json!(max_tokens));
        body.insert("messages".into(), Value::Array(messages));
        body.insert("stream".into(), json!(stream));
        // Anthropic 的 temperature 取值范围为 0~1
        let temperature = req
            .temperature
            .unwrap_or(DEFAULT_TEMPERATURE)
            .clamp(0.0, 1.0);
        body.insert("temperature".into(), json!(temperature));
        if !system.is_empty() {
            body.insert("system".into(), json!(system.join("\n\n")));
        }
        for value in extra.iter().copied().flatten() {
            if let Value::Object(map) = value {
                for (k, v) in map {
                    body.insert(k.clone(), v.clone());
                }
            }
        }
        Value::Object(body)
    }
}

/// 结束原因规范化
fn normalize_stop_reason(reason: &str) -> String {
    match reason {
        "max_tokens" => "length".into(),
        "end_turn" | "stop_sequence" => "stop".into(),
        other => other.into(),
    }
}

fn as_u32(v: Option<&Value>) -> Option<u32> {
    v.and_then(Value::as_u64).map(|n| n as u32)
}

impl ChatProvider for Anthropic {
    fn build_stream_request(
        &self,
        client: &Client,
        req: &ChatRequest,
        _with_usage: bool,
    ) -> RequestBuilder {
        let max_tokens = req.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS);
        let body = self.body(req, true, max_tokens, &[&self.endpoint.profile.extra_body]);
        self.post(client).json(&body)
    }

    fn build_test_request(&self, client: &Client, req: &ChatRequest) -> RequestBuilder {
        let profile = &self.endpoint.profile;
        let max_tokens = req.max_tokens.unwrap_or(TEST_MAX_TOKENS);
        let body = self.body(
            req,
            false,
            max_tokens,
            &[&profile.extra_body, &profile.test_extra_body],
        );
        self.post(client).json(&body)
    }

    fn parse_stream_event(&self, event: &str, data: &str) -> ParsedEvent {
        let Ok(v) = serde_json::from_str::<Value>(data) else {
            return ParsedEvent::Skip;
        };
        // 事件类型以 data.type 为准，SSE event 名作为兜底
        let kind = v.get("type").and_then(Value::as_str).unwrap_or(event);
        let mut piece = StreamPiece::default();

        match kind {
            "message_start" => {
                let usage = v.pointer("/message/usage");
                piece.usage = Some((as_u32(usage.and_then(|u| u.get("input_tokens"))), None));
            }
            "content_block_delta" => {
                let delta = v.get("delta");
                let text = |key: &str| {
                    delta
                        .and_then(|d| d.get(key))
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                        .map(str::to_string)
                };
                match delta.and_then(|d| d.get("type")).and_then(Value::as_str) {
                    Some("text_delta") => piece.content = text("text"),
                    Some("thinking_delta") => piece.reasoning = text("thinking"),
                    _ => return ParsedEvent::Skip,
                }
            }
            "message_delta" => {
                piece.finish_reason = v
                    .pointer("/delta/stop_reason")
                    .and_then(Value::as_str)
                    .map(normalize_stop_reason);
                piece.usage = Some((None, as_u32(v.pointer("/usage/output_tokens"))));
            }
            "message_stop" => return ParsedEvent::Done,
            "error" => {
                let message = v
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or(data);
                return ParsedEvent::Error(message.to_string());
            }
            _ => return ParsedEvent::Skip,
        }
        ParsedEvent::Piece(piece)
    }

    fn parse_test_response(&self, body: &str) -> Result<String, AiError> {
        let v: Value = serde_json::from_str(body).map_err(|e| AiError::Parse(e.to_string()))?;
        let blocks = v.get("content").and_then(Value::as_array);
        let text: String = blocks
            .into_iter()
            .flatten()
            .filter(|b| b.get("type").and_then(Value::as_str) == Some("text"))
            .filter_map(|b| b.get("text").and_then(Value::as_str))
            .collect();
        if !text.trim().is_empty() {
            return Ok(text);
        }
        let has_thinking = blocks
            .into_iter()
            .flatten()
            .any(|b| b.get("type").and_then(Value::as_str) == Some("thinking"));
        Ok(if has_thinking {
            "（连接成功，模型仅返回了思考内容）".into()
        } else {
            "（连接成功，模型未返回正文）".into()
        })
    }

    fn supports_stream_usage(&self) -> bool {
        // Anthropic 流式事件始终携带用量，无需额外参数
        false
    }

    fn rejects_stream_usage(&self, _status: StatusCode, _body: &str) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ai::{ChatMessage, ModelKind};
    use crate::services::ai::openai_compatible::tests::{profile, request};

    fn adapter() -> Anthropic {
        let mut p = profile(ModelKind::Anthropic);
        p.base_url = "https://api.anthropic.com/v1".into();
        Anthropic::new(Endpoint {
            profile: p,
            api_key: Some("k".into()),
        })
    }

    fn piece(a: &Anthropic, data: &str) -> StreamPiece {
        match a.parse_stream_event("", data) {
            ParsedEvent::Piece(p) => p,
            other => panic!("期望 Piece，实际 {:?}", other),
        }
    }

    #[test]
    fn body_splits_system_and_clamps_temperature() {
        let a = adapter();
        let mut req = request();
        req.temperature = Some(1.5);
        req.messages = vec![
            ChatMessage {
                role: "system".into(),
                content: "S".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: "U".into(),
            },
        ];
        let body = a.body(&req, true, 100, &[]);
        assert_eq!(body["system"], "S");
        assert_eq!(body["messages"].as_array().unwrap().len(), 1);
        assert_eq!(body["messages"][0]["role"], "user");
        assert_eq!(body["max_tokens"], 100);
        assert_eq!(body["temperature"], 1.0);
        assert_eq!(a.messages_url(), "https://api.anthropic.com/v1/messages");
    }

    #[test]
    fn parses_stream_events() {
        let a = adapter();
        let p = piece(
            &a,
            r#"{"type":"message_start","message":{"usage":{"input_tokens":12}}}"#,
        );
        assert_eq!(p.usage, Some((Some(12), None)));

        let p = piece(
            &a,
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"想"}}"#,
        );
        assert_eq!(p.reasoning.as_deref(), Some("想"));

        let p = piece(
            &a,
            r#"{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"答"}}"#,
        );
        assert_eq!(p.content.as_deref(), Some("答"));

        let p = piece(
            &a,
            r#"{"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":7}}"#,
        );
        assert_eq!(p.finish_reason.as_deref(), Some("length"));
        assert_eq!(p.usage, Some((None, Some(7))));

        assert!(matches!(
            a.parse_stream_event("ping", r#"{"type":"ping"}"#),
            ParsedEvent::Skip
        ));
        assert!(matches!(
            a.parse_stream_event("", r#"{"type":"message_stop"}"#),
            ParsedEvent::Done
        ));
        assert!(matches!(
            a.parse_stream_event("", r#"{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}"#),
            ParsedEvent::Error(m) if m == "Overloaded"
        ));
    }

    #[test]
    fn parses_test_response_text_blocks() {
        let a = adapter();
        let body =
            r#"{"content":[{"type":"thinking","thinking":"x"},{"type":"text","text":"ok"}]}"#;
        assert_eq!(a.parse_test_response(body).unwrap(), "ok");
    }
}

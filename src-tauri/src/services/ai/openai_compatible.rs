//! OpenAI Chat Completions 兼容协议适配器
//!
//! OpenAI / Gemini（Google 官方兼容端点）/ OpenRouter / Ollama / LM Studio / 各类 OpenAI 兼容服务
//! 都走这一份实现。参数差异（max_tokens 参数名、是否下发 temperature）由 `ModelKind` 决定，
//! 服务商专有参数来自配置的 extraBody。

use reqwest::{Client, RequestBuilder, StatusCode};
use serde::Deserialize;
use serde_json::{json, Map, Value};

use crate::models::ai::ChatRequest;
use crate::services::ai::error::AiError;
use crate::services::ai::provider::{ChatProvider, Endpoint, ParsedEvent, StreamPiece};

/// 未指定时的默认 temperature
const DEFAULT_TEMPERATURE: f64 = 0.7;
/// 未指定时的默认最大输出 token
const DEFAULT_MAX_TOKENS: u32 = 4096;
/// 测试连接的最大输出 token
const TEST_MAX_TOKENS: u32 = 64;

pub struct OpenAiCompatible {
    endpoint: Endpoint,
}

impl OpenAiCompatible {
    pub fn new(endpoint: Endpoint) -> Self {
        Self { endpoint }
    }

    fn chat_url(&self) -> String {
        format!(
            "{}/chat/completions",
            self.endpoint.profile.base_url.trim_end_matches('/')
        )
    }

    fn post(&self, client: &Client) -> RequestBuilder {
        let rb = client.post(self.chat_url());
        match &self.endpoint.api_key {
            Some(key) => rb.bearer_auth(key),
            None => rb,
        }
    }

    /// 构造公共请求体，并合并配置中的专有参数（后者可覆盖前者）
    fn body(
        &self,
        req: &ChatRequest,
        stream: bool,
        max_tokens: u32,
        extra: &[&Option<Value>],
    ) -> Value {
        let kind = self.endpoint.profile.kind;
        let mut body = Map::new();
        body.insert("model".into(), json!(self.endpoint.profile.model));
        body.insert("messages".into(), json!(req.messages));
        body.insert("stream".into(), json!(stream));
        if kind.sends_temperature() {
            body.insert(
                "temperature".into(),
                json!(req.temperature.unwrap_or(DEFAULT_TEMPERATURE)),
            );
        }
        body.insert(kind.max_tokens_param().into(), json!(max_tokens));
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

impl ChatProvider for OpenAiCompatible {
    fn build_stream_request(
        &self,
        client: &Client,
        req: &ChatRequest,
        with_usage: bool,
    ) -> RequestBuilder {
        let max_tokens = req.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS);
        let mut body = self.body(req, true, max_tokens, &[&self.endpoint.profile.extra_body]);
        if with_usage {
            // OpenAI 规范：流式模式下只有显式声明才会在最后一个 chunk 返回 usage
            body["stream_options"] = json!({ "include_usage": true });
        }
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

    fn parse_stream_event(&self, _event: &str, data: &str) -> ParsedEvent {
        if data.trim() == "[DONE]" {
            return ParsedEvent::Done;
        }
        // 少数服务商会偶发下发非 JSON 注释行，跳过即可
        let Ok(chunk) = serde_json::from_str::<StreamChunk>(data) else {
            return ParsedEvent::Skip;
        };
        // OpenRouter 等聚合服务在流中途出错时下发 { "error": { "message": ... } }
        if let Some(err) = chunk.error {
            return ParsedEvent::Error(err.message.unwrap_or_else(|| data.to_string()));
        }

        let mut piece = StreamPiece {
            usage: chunk.usage.map(|u| (u.prompt_tokens, u.completion_tokens)),
            ..StreamPiece::default()
        };
        // include_usage 的末包 choices 为空，仅携带 usage
        if let Some(choice) = chunk.choices.into_iter().next() {
            piece.finish_reason = choice.finish_reason.filter(|s| !s.is_empty());
            let delta = choice.delta;
            piece.reasoning = delta
                .reasoning_content
                .filter(|s| !s.is_empty())
                .or(delta.reasoning.filter(|s| !s.is_empty()));
            piece.content = delta.content.filter(|s| !s.is_empty());
        }
        ParsedEvent::Piece(piece)
    }

    fn parse_test_response(&self, body: &str) -> Result<String, AiError> {
        let parsed: ChatResponse =
            serde_json::from_str(body).map_err(|e| AiError::Parse(e.to_string()))?;
        let message = parsed.choices.into_iter().next().map(|c| c.message);
        let content = message
            .as_ref()
            .and_then(|m| m.content.clone())
            .filter(|s| !s.trim().is_empty());
        let has_reasoning = message
            .as_ref()
            .is_some_and(|m| m.reasoning_content.is_some());
        Ok(match content {
            Some(c) => c,
            // 推理模型在 token 很少时可能只返回思考内容，仍视为连接成功
            None if has_reasoning => "（连接成功，模型仅返回了思考内容）".into(),
            None => "（连接成功，模型未返回正文）".into(),
        })
    }

    fn supports_stream_usage(&self) -> bool {
        true
    }

    fn rejects_stream_usage(&self, status: StatusCode, body: &str) -> bool {
        // 少数老旧兼容服务不认识 stream_options 字段
        (status == StatusCode::BAD_REQUEST || status == StatusCode::UNPROCESSABLE_ENTITY)
            && body.contains("stream_options")
    }
}

// ---------------------------------------------------------------------------
// OpenAI 兼容的响应数据结构
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct StreamChunk {
    #[serde(default)]
    choices: Vec<StreamChoice>,
    #[serde(default)]
    usage: Option<Usage>,
    #[serde(default)]
    error: Option<StreamErrorBody>,
}

#[derive(Debug, Deserialize)]
struct StreamErrorBody {
    #[serde(default)]
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    #[serde(default)]
    delta: Delta,
    /// 结束原因：stop | length | content_filter ...（仅最后一个 chunk 携带）
    #[serde(default)]
    finish_reason: Option<String>,
}

/// 流式增量
///
/// 推理模型（DeepSeek-R1 / Qwen3 thinking 等）会先输出思考过程，
/// 各家字段名不统一：多数为 `reasoning_content`，OpenRouter 等为 `reasoning`。
/// 两者分开声明而非用 serde alias，避免同时出现时触发 duplicate field 导致整包丢弃。
#[derive(Debug, Deserialize, Default)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    reasoning_content: Option<String>,
    #[serde(default)]
    reasoning: Option<String>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
struct Usage {
    #[serde(default)]
    prompt_tokens: Option<u32>,
    #[serde(default)]
    completion_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    #[serde(default)]
    choices: Vec<ResponseChoice>,
}

#[derive(Debug, Deserialize)]
struct ResponseChoice {
    #[serde(default)]
    message: ResponseMessage,
}

/// 非流式消息体：推理模型在 token 不足时 content 可能为 null
#[derive(Debug, Deserialize, Default)]
struct ResponseMessage {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    reasoning_content: Option<String>,
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::models::ai::{KeySource, ModelKind};
    use crate::services::ai::config_file::ModelProfile;

    /// 测试用模型配置
    pub fn profile(kind: ModelKind) -> ModelProfile {
        ModelProfile {
            id: "t".into(),
            kind,
            name: "t".into(),
            base_url: "http://x/v1/".into(),
            model: "m".into(),
            key_source: KeySource::None,
            api_key: String::new(),
            env_var: String::new(),
            context_length: 0,
            extra_body: None,
            test_extra_body: None,
        }
    }

    /// 测试用请求
    pub fn request() -> ChatRequest {
        ChatRequest {
            request_id: "r".into(),
            profile_id: "t".into(),
            messages: vec![],
            temperature: Some(0.3),
            max_tokens: Some(10),
        }
    }

    fn adapter(profile: ModelProfile) -> OpenAiCompatible {
        OpenAiCompatible::new(Endpoint {
            profile,
            api_key: None,
        })
    }

    fn piece(a: &OpenAiCompatible, data: &str) -> StreamPiece {
        match a.parse_stream_event("", data) {
            ParsedEvent::Piece(p) => p,
            other => panic!("期望 Piece，实际 {:?}", other),
        }
    }

    #[test]
    fn parses_reasoning_content_and_finish_reason() {
        let a = adapter(profile(ModelKind::OpenAiCompatible));
        let p = piece(
            &a,
            r#"{"choices":[{"delta":{"reasoning_content":"想","content":""},"finish_reason":null}]}"#,
        );
        assert_eq!(p.reasoning.as_deref(), Some("想"));
        assert!(p.content.is_none());

        let p = piece(
            &a,
            r#"{"choices":[{"delta":{"content":"答"},"finish_reason":"length"}]}"#,
        );
        assert_eq!(p.content.as_deref(), Some("答"));
        assert_eq!(p.finish_reason.as_deref(), Some("length"));
    }

    #[test]
    fn parses_usage_done_comment_and_error() {
        let a = adapter(profile(ModelKind::OpenRouter));
        let p = piece(
            &a,
            r#"{"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":5}}"#,
        );
        assert_eq!(p.usage, Some((Some(3), Some(5))));
        assert!(matches!(
            a.parse_stream_event("", "[DONE]"),
            ParsedEvent::Done
        ));
        assert!(matches!(
            a.parse_stream_event("", ": ping"),
            ParsedEvent::Skip
        ));
        assert!(matches!(
            a.parse_stream_event("", r#"{"error":{"message":"bad"}}"#),
            ParsedEvent::Error(m) if m == "bad"
        ));
    }

    #[test]
    fn openai_kind_uses_completion_tokens_and_omits_temperature() {
        let a = adapter(profile(ModelKind::OpenAi));
        let body = a.body(&request(), true, 10, &[]);
        assert_eq!(body["max_completion_tokens"], 10);
        assert!(body.get("max_tokens").is_none());
        assert!(body.get("temperature").is_none());
        assert_eq!(body["model"], "m");
        assert_eq!(a.chat_url(), "http://x/v1/chat/completions");
    }

    #[test]
    fn compatible_kind_uses_max_tokens_and_extra_body() {
        let mut p = profile(ModelKind::Gemini);
        p.extra_body = Some(json!({ "top_p": 0.9 }));
        let a = adapter(p);
        let body = a.body(&request(), true, 10, &[&a.endpoint.profile.extra_body]);
        assert_eq!(body["max_tokens"], 10);
        assert_eq!(body["temperature"], 0.3);
        assert_eq!(body["top_p"], 0.9);
    }
}

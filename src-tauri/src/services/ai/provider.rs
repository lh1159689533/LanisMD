//! 协议抽象
//!
//! `ChatProvider` 只负责「协议差异」：如何构造请求、如何解析响应。
//! 发送、重试、超时、SSE 读取循环、事件推送等「传输层」逻辑与协议无关，统一在 `transport` 中实现。
//! 新增协议时实现本 trait，并在 `create_provider` 中按 `ModelKind::protocol()` 注册。

use reqwest::{Client, RequestBuilder, StatusCode};

use crate::models::ai::{ChatRequest, Protocol};
use crate::services::ai::anthropic::Anthropic;
use crate::services::ai::config_file::{self, ModelProfile};
use crate::services::ai::error::AiError;
use crate::services::ai::key_resolver::resolve_key;
use crate::services::ai::openai_compatible::OpenAiCompatible;

/// 一次流式增量解析出的标准化数据
#[derive(Debug, Default)]
pub struct StreamPiece {
    /// 正文增量
    pub content: Option<String>,
    /// 思考过程增量
    pub reasoning: Option<String>,
    /// token 用量 (prompt, completion)；部分协议分两次给出，由传输层合并
    pub usage: Option<(Option<u32>, Option<u32>)>,
    /// 结束原因，已规范化为 stop / length / 其他
    pub finish_reason: Option<String>,
}

/// 单条 SSE 事件的解析结果
#[derive(Debug)]
pub enum ParsedEvent {
    /// 有效数据
    Piece(StreamPiece),
    /// 流结束标记
    Done,
    /// 服务端在流中返回的错误
    Error(String),
    /// 无关数据（注释行、心跳、无法识别的 JSON），跳过
    Skip,
}

/// 协议适配器
pub trait ChatProvider: Send + Sync {
    /// 构造流式请求；`with_usage` 为 true 时请求在末包返回 token 用量
    fn build_stream_request(
        &self,
        client: &Client,
        req: &ChatRequest,
        with_usage: bool,
    ) -> RequestBuilder;

    /// 构造「测试连接」用的非流式请求
    fn build_test_request(&self, client: &Client, req: &ChatRequest) -> RequestBuilder;

    /// 解析一条 SSE 事件（`event` 为 SSE 事件名，可能为空）
    fn parse_stream_event(&self, event: &str, data: &str) -> ParsedEvent;

    /// 解析非流式响应体，返回模型回复文本
    fn parse_test_response(&self, body: &str) -> Result<String, AiError>;

    /// 是否需要显式请求 token 用量
    fn supports_stream_usage(&self) -> bool;

    /// 判断一次失败是否由「用量参数」引起（返回 true 时传输层会去掉该参数重试一次）
    fn rejects_stream_usage(&self, status: StatusCode, body: &str) -> bool;
}

/// 解析后的端点：模型配置 + 实际使用的密钥
#[derive(Debug, Clone)]
pub struct Endpoint {
    pub profile: ModelProfile,
    /// 无密钥时为 None
    pub api_key: Option<String>,
}

/// 构造适配器（不读文件，便于测试）
pub fn provider_for(endpoint: Endpoint) -> Box<dyn ChatProvider> {
    match endpoint.profile.kind.protocol() {
        Protocol::OpenAi => Box::new(OpenAiCompatible::new(endpoint)),
        Protocol::Anthropic => Box::new(Anthropic::new(endpoint)),
    }
}

/// 按请求中的模型配置 id 创建适配器（会读取配置文件并解析密钥，可能阻塞）
pub fn create_provider(req: &ChatRequest) -> Result<Box<dyn ChatProvider>, AiError> {
    let profile = config_file::find_profile(&req.profile_id)?;
    let api_key = resolve_key(&profile)?;
    Ok(provider_for(Endpoint { profile, api_key }))
}

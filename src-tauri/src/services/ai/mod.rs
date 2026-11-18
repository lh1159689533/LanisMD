//! AI 服务模块
//!
//! - `config_file`：模型配置文件（v3，一条配置 = 一个模型）读写
//! - `legacy`：v1 / v2 旧配置迁移
//! - `key_resolver`：API 密钥解析（本地保存 / 环境变量 / 无密钥）
//! - `provider`：`ChatProvider` 协议抽象与适配器工厂
//! - `openai_compatible`：OpenAI Chat Completions 兼容协议
//! - `anthropic`：Anthropic Messages 原生协议
//! - `transport`：与协议无关的发送、超时、SSE 读取与事件推送
//! - `retry`：响应前阶段的退避重试
//! - `error`：统一错误类型
//! - `stream_manager`：request_id -> CancellationToken 映射

pub mod anthropic;
pub mod config_file;
pub mod error;
pub mod key_resolver;
pub mod legacy;
pub mod openai_compatible;
pub mod provider;
pub mod retry;
pub mod stream_manager;
pub mod transport;

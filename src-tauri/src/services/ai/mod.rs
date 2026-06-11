//! AI 服务模块
//!
//! - `provider`：定义 Provider trait
//! - `openai_compatible`：OpenAI 兼容 Provider 的统一实现（智谱/DeepSeek/SiliconFlow 共用）
//! - `providers`：各家 Provider 的元数据（base_url）
//! - `sse`：SSE 流解析与错误类型
//! - `config_file`：本地 JSON 配置文件读写（替代 Keychain）
//! - `stream_manager`：request_id → CancellationToken 映射

pub mod provider;
pub mod openai_compatible;
pub mod providers;
pub mod sse;
pub mod config_file;
pub mod stream_manager;



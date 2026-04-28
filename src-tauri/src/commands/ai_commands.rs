//! AI 相关的 Tauri 命令入口
//!
//! - `set_ai_api_key` / `get_ai_key_status`：配置文件中的 Key 管理
//! - `open_ai_config`：打开 AI 配置文件所在目录（用系统文件管理器）
//! - `read_ai_config`：读取完整 AI 配置（供前端定时轮询）
//! - `ai_test_connection`：非流式测试连接
//! - `ai_chat_stream`：流式聊天（通过 emit event 推送结果）
//! - `cancel_ai_stream`：取消正在进行的流

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::models::ai::{ChatMessage, ChatRequest, ProviderId};
use crate::services::ai::{config_file, openai_compatible, stream_manager};

/// 保存 API Key 到本地配置文件
#[tauri::command]
pub async fn set_ai_api_key(provider_id: ProviderId, api_key: String) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("API Key 不能为空".into());
    }
    config_file::save_key(provider_id, api_key.trim()).map_err(|e| e.to_string())
}

/// 检查每个 Provider 的 Key 是否已配置（不返回 Key 本身）
#[tauri::command]
pub async fn get_ai_key_status() -> Result<HashMap<String, bool>, String> {
    let mut map = HashMap::new();
    for id in [
        ProviderId::Zhipu,
        ProviderId::Deepseek,
        ProviderId::Siliconflow,
        ProviderId::Custom,
    ] {
        map.insert(id.as_str().to_string(), config_file::has_key(id));
    }
    Ok(map)
}

/// 读取完整 AI 配置文件内容（JSON 字符串，供前端定时轮询使用）
#[tauri::command]
pub async fn read_ai_config() -> Result<String, String> {
    config_file::read_config_raw().map_err(|e| e.to_string())
}

/// 设置默认服务商（将指定 Provider 的 isDefault 设为 true，其余设为 false）
#[tauri::command]
pub async fn set_default_provider(provider_id: String) -> Result<(), String> {
    config_file::set_default_provider(&provider_id).map_err(|e| e.to_string())
}

/// 设置指定 Provider 的默认模型
#[tauri::command]
pub async fn set_default_model(provider_id: String, model_id: String) -> Result<(), String> {
    config_file::set_default_model(&provider_id, &model_id).map_err(|e| e.to_string())
}

/// 打开 AI 配置文件所在目录：确保文件存在后用系统文件管理器打开目录
#[tauri::command]
pub async fn open_ai_config(app: AppHandle) -> Result<(), String> {
    let dir = config_file::get_config_dir().map_err(|e| e.to_string())?;
    let dir_str = dir.to_string_lossy().to_string();

    // 使用 tauri-plugin-opener 打开目录（系统文件管理器）
    app.opener().open_path(dir_str, None::<&str>)
        .map_err(|e| format!("打开配置目录失败：{}", e))?;

    Ok(())
}

/// "测试连接"按钮使用的非流式接口
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionArgs {
    pub provider_id: ProviderId,
    pub model: String,
    pub custom_base_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    pub ok: bool,
    pub reply: String,
}

#[tauri::command]
pub async fn ai_test_connection(args: TestConnectionArgs) -> Result<TestConnectionResult, String> {
    let req = ChatRequest {
        request_id: "test".into(),
        provider_id: args.provider_id,
        model: args.model,
        messages: vec![
            ChatMessage {
                role: "system".into(),
                content: "You are a helpful assistant.".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: "Reply with a single word: ok".into(),
            },
        ],
        temperature: Some(0.2),
        max_tokens: Some(64),
        custom_base_url: args.custom_base_url,
    };

    openai_compatible::run_test_chat(&req)
        .await
        .map(|reply| TestConnectionResult { ok: true, reply })
        .map_err(|e| e.to_string())
}

/// 流式聊天：立即返回，结果通过 event 推送
#[tauri::command]
pub async fn ai_chat_stream(app: AppHandle, request: ChatRequest) -> Result<(), String> {
    let token = stream_manager::register(&request.request_id);
    let request_id = request.request_id.clone();

    // 在独立任务里跑流，避免阻塞命令返回
    tauri::async_runtime::spawn(async move {
        openai_compatible::run_stream_chat(app, request, token).await;
        stream_manager::remove(&request_id);
    });

    Ok(())
}

/// 取消正在进行的流
#[tauri::command]
pub async fn cancel_ai_stream(request_id: String) -> Result<bool, String> {
    Ok(stream_manager::cancel(&request_id))
}

//! AI 相关的 Tauri 命令入口
//!
//! - `read_ai_config`：读取模型配置列表（不含 Key 原文）
//! - `save_ai_model` / `delete_ai_model` / `set_current_ai_model`：模型配置增删改
//! - `open_ai_config`：用系统文件管理器打开配置文件所在目录
//! - `ai_test_connection`：对指定模型配置发送一条非流式测试消息
//! - `ai_chat_stream`：流式聊天（通过 emit event 推送结果）
//! - `cancel_ai_stream`：取消正在进行的流

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::models::ai::{ChatMessage, ChatRequest};
use crate::services::ai::config_file::{self, ModelDraft};
use crate::services::ai::{stream_manager, transport};

/// 在阻塞线程池中执行（配置文件 IO、环境变量解析可能启动登录 Shell）
async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| format!("内部任务失败：{}", e))?
}

/// 读取模型配置快照（JSON 字符串：{ current, models }）
#[tauri::command]
pub async fn read_ai_config() -> Result<String, String> {
    blocking(|| {
        let view = config_file::read_config_view().map_err(|e| e.to_string())?;
        serde_json::to_string(&view).map_err(|e| e.to_string())
    })
    .await
}

/// 新增或编辑模型配置，返回配置 id
#[tauri::command]
pub async fn save_ai_model(draft: ModelDraft) -> Result<String, String> {
    blocking(move || config_file::save_profile(draft).map_err(|e| e.to_string())).await
}

/// 删除模型配置
#[tauri::command]
pub async fn delete_ai_model(id: String) -> Result<(), String> {
    blocking(move || config_file::delete_profile(&id).map_err(|e| e.to_string())).await
}

/// 设置当前使用的模型
#[tauri::command]
pub async fn set_current_ai_model(id: String) -> Result<(), String> {
    blocking(move || config_file::set_current(&id).map_err(|e| e.to_string())).await
}

/// 打开 AI 配置文件所在目录
#[tauri::command]
pub async fn open_ai_config(app: AppHandle) -> Result<(), String> {
    let dir = config_file::get_config_dir().map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("打开配置目录失败：{}", e))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    pub ok: bool,
    pub reply: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionArgs {
    pub profile_id: String,
}

/// "测试连接"：对指定模型配置发送一条非流式消息
#[tauri::command]
pub async fn ai_test_connection(args: TestConnectionArgs) -> Result<TestConnectionResult, String> {
    let req = ChatRequest {
        request_id: "test".into(),
        profile_id: args.profile_id,
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
        max_tokens: None,
    };

    transport::run_test_chat(&req)
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
        transport::run_stream_chat(app, request, token).await;
        stream_manager::remove(&request_id);
    });

    Ok(())
}

/// 取消正在进行的流
#[tauri::command]
pub async fn cancel_ai_stream(request_id: String) -> Result<bool, String> {
    Ok(stream_manager::cancel(&request_id))
}

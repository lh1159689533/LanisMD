// MCP 联动命令：前端推送当前文件夹、编辑中文档与最近文件夹；设置页获取 MCP 启动信息
//
// @changelog
// | 版本   | 变更说明                              | 关联                                  |
// | v1.0.0 | 初始实现：状态快照同步与最近文件夹落盘 | REQ: MCP 动态工作区 TECH: 磁盘共享状态 |
// | v1.1.0 | 新增 mcp_server_info：可执行文件路径    | REQ: 设置页复制 MCP 配置               |
// /@changelog
//
// @author hhhuilli

use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};

use crate::services::app_bridge::protocol::{AppSnapshot, OpenDocument};
use crate::services::app_bridge::server;
use crate::services::app_state::{self, RecentFolder};

/// 上次落盘的最近文件夹，内容没变时跳过写盘
static LAST_RECENT: Lazy<Mutex<Option<Vec<RecentFolder>>>> = Lazy::new(|| Mutex::new(None));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStateParams {
    pub current_folder: Option<String>,
    pub open_document: Option<OpenDocument>,
    pub recent_folders: Vec<RecentFolder>,
}

#[tauri::command]
pub async fn mcp_sync_state(params: SyncStateParams) -> Result<(), String> {
    server::update_snapshot(AppSnapshot {
        current_folder: params.current_folder,
        open_document: params.open_document,
    });

    let mut last = LAST_RECENT.lock().map_err(|e| e.to_string())?;
    if last.as_ref() != Some(&params.recent_folders) {
        app_state::write_recent_folders(&params.recent_folders)?;
        *last = Some(params.recent_folders);
    }
    Ok(())
}

/// MCP 客户端配置所需的启动信息
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerInfo {
    /// 当前 App 可执行文件的绝对路径，`<路径> mcp` 即可启动 MCP Server
    pub executable: String,
    /// 是否为开发构建（路径指向 target/debug，重新打包后会变化）
    pub dev_build: bool,
    /// 路径不稳定时的提示（如 macOS App 转移、从磁盘映像直接运行）
    pub warning: Option<String>,
}

#[tauri::command]
pub async fn mcp_server_info() -> Result<McpServerInfo, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法获取可执行文件路径: {}", e))?;
    let executable = exe.to_string_lossy().to_string();
    let warning = if executable.contains("/AppTranslocation/") {
        Some("LanisMD 正以 macOS 转移模式运行，路径每次启动都会变化。请先把 LanisMD 移到“应用程序”文件夹后重新打开".to_string())
    } else if executable.starts_with("/Volumes/") {
        Some("LanisMD 正从磁盘映像中运行，推出映像后路径会失效。请先安装到“应用程序”文件夹".to_string())
    } else {
        None
    };
    Ok(McpServerInfo {
        executable,
        dev_build: cfg!(debug_assertions),
        warning,
    })
}

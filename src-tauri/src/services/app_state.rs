// App 与 MCP 进程共享的磁盘状态：最近打开的文件夹、本地桥接端点
//
// App 运行时把这些信息写到应用数据目录，独立运行的 `lanismd mcp` 进程据此
// 找到 App（桥接端点）或在 App 未打开时向用户提供候选工作区（最近文件夹）。
//
// @changelog
// | 版本   | 变更说明                               | 关联                                  |
// | v1.0.0 | 初始实现：最近文件夹与桥接端点的读写    | REQ: MCP 动态工作区 TECH: 磁盘共享状态 |
// /@changelog
//
// @author hhhuilli

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// 应用数据目录名，与 tauri.conf.json 的 identifier 一致
const APP_DIR_NAME: &str = "com.lanis.md";
/// 测试或便携场景下覆盖数据目录的环境变量
const DATA_DIR_ENV: &str = "LANISMD_DATA_DIR";
const WORKSPACE_STATE_FILE: &str = "workspace-state.json";
const BRIDGE_FILE: &str = "mcp-bridge.json";

/// 最近打开的文件夹条目（字段与前端 recent-folders-store 对齐）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentFolder {
    pub path: String,
    pub name: String,
    /// 打开时间，Unix 毫秒
    pub timestamp: i64,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceStateFile {
    #[serde(default)]
    recent_folders: Vec<RecentFolder>,
}

/// App 本地桥接端点（仅监听 127.0.0.1，token 用于鉴权）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BridgeInfo {
    pub port: u16,
    pub token: String,
    pub pid: u32,
}

/// 共享状态所在目录
pub fn data_dir() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var(DATA_DIR_ENV) {
        if !dir.trim().is_empty() {
            return Ok(PathBuf::from(dir));
        }
    }
    dirs::data_dir()
        .map(|d| d.join(APP_DIR_NAME))
        .ok_or_else(|| "无法获取应用数据目录".to_string())
}

/// 读取最近打开的文件夹（按时间倒序，文件不存在时返回空列表）
pub fn read_recent_folders() -> Vec<RecentFolder> {
    let Ok(dir) = data_dir() else {
        return Vec::new();
    };
    fs::read_to_string(dir.join(WORKSPACE_STATE_FILE))
        .ok()
        .and_then(|s| serde_json::from_str::<WorkspaceStateFile>(&s).ok())
        .map(|state| state.recent_folders)
        .unwrap_or_default()
}

/// 覆盖写入最近打开的文件夹
pub fn write_recent_folders(folders: &[RecentFolder]) -> Result<(), String> {
    let state = WorkspaceStateFile {
        recent_folders: folders.to_vec(),
    };
    let json = serde_json::to_string_pretty(&state).map_err(|e| e.to_string())?;
    write_atomic(&data_dir()?.join(WORKSPACE_STATE_FILE), json.as_bytes())
}

/// 读取 App 桥接端点；App 未运行（或从未运行）时返回 None
pub fn read_bridge_info() -> Option<BridgeInfo> {
    let dir = data_dir().ok()?;
    let text = fs::read_to_string(dir.join(BRIDGE_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

/// 写入桥接端点，文件权限 0600，避免其他用户读取 token
pub fn write_bridge_info(info: &BridgeInfo) -> Result<(), String> {
    let json = serde_json::to_string(info).map_err(|e| e.to_string())?;
    write_atomic(&data_dir()?.join(BRIDGE_FILE), json.as_bytes())
}

/// App 退出时删除桥接端点；只删除自己写入的那份，避免误删新启动实例的文件
pub fn remove_bridge_info(token: &str) {
    if read_bridge_info().map(|i| i.token == token).unwrap_or(false) {
        if let Ok(dir) = data_dir() {
            let _ = fs::remove_file(dir.join(BRIDGE_FILE));
        }
    }
}

/// 临时文件 + rename 原子写入，读方不会读到半截 JSON
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("无效的状态文件路径")?;
    fs::create_dir_all(dir).map_err(|e| format!("创建数据目录失败: {}", e))?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(tmp.path(), fs::Permissions::from_mode(0o600));
    }
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    tmp.persist(path).map_err(|e| format!("写入 {} 失败: {}", path.display(), e))?;
    Ok(())
}

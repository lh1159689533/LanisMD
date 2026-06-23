// 同步模块公共类型定义

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 远程仓库平台枚举
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Github,
    Gitee,
}

/// 远程仓库配置（设置页面管理，存储在 sync-repos.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncRepoConfig {
    /// UUID
    pub id: String,
    /// 用户自定义名称
    pub name: String,
    /// 平台类型
    pub platform: Platform,
    /// Personal Access Token
    pub token: String,
    /// 仓库拥有者
    pub owner: String,
    /// 仓库名
    pub repo: String,
    /// 目标分支，默认 "main"
    pub branch: String,
    /// 绑定的本地文件夹路径
    pub local_path: Option<String>,
    /// 用户额外追加的白名单 glob 模式（不含硬编码默认值）
    #[serde(default)]
    pub include_patterns: Vec<String>,
    /// 创建时间 ISO 8601
    pub created_at: String,
    /// 更新时间 ISO 8601
    pub updated_at: String,
}

/// 同步清单中的仓库配置快照（脱敏，不含 token）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncManifestRepoConfig {
    /// 平台类型
    pub platform: Platform,
    /// 仓库拥有者
    pub owner: String,
    /// 仓库名
    pub repo: String,
    /// 引用 SyncRepoConfig.id（可反查 token）
    pub config_id: String,
}

/// 本地同步清单（lanismd-sync.json），拉取/推送完成后写入当前文件夹
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncManifest {
    /// 仓库连接信息快照（脱敏）
    pub repo_config: SyncManifestRepoConfig,
    /// 同步分支
    pub branch: String,
    /// 远程目录（为空或 "/" 表示仓库根目录）
    #[serde(default)]
    pub remote_dir: Option<String>,
    /// 白名单 glob（硬编码默认值 + 用户追加）
    #[serde(default)]
    pub include_patterns: Vec<String>,
    /// 上次同步时间 ISO 8601
    pub last_sync_at: Option<String>,
    /// 上次操作方向 "pull" | "push"
    pub sync_direction: String,
    /// 文件条目：相对路径 -> 文件信息
    pub file_entries: HashMap<String, SyncFileEntry>,
}

/// 单个文件的同步记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncFileEntry {
    /// 文件 MD5（始终与远端文件内容一致）
    pub md5: String,
    /// 远程文件 SHA（GitHub/Gitee API 需要）
    pub remote_sha: Option<String>,
    /// 文件大小(字节)
    pub size: u64,
    /// 该文件的同步时间
    pub synced_at: String,
}

/// 远程目录浏览条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    /// 文件/目录名
    pub name: String,
    /// 相对路径
    pub path: String,
    /// 类型: "file" | "dir"
    pub entry_type: String,
    /// 文件大小（目录为 0）
    pub size: u64,
    /// 文件 SHA
    pub sha: Option<String>,
}

/// 拉取请求参数
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    /// 仓库配置 ID
    pub config_id: String,
    /// 目标分支（覆盖配置中的默认分支）
    pub branch: String,
    /// 本地目标文件夹路径
    pub local_path: String,
    /// 远程目录（为空或 "/" 表示仓库根目录）
    pub remote_dir: Option<String>,
    /// 白名单 glob（硬编码默认值 + 用户追加）
    #[serde(default)]
    pub include_patterns: Vec<String>,
}

/// 推送请求参数
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushRequest {
    /// 本地文件夹路径
    pub local_path: String,
    /// 仓库配置 ID（无清单时必填）
    pub config_id: Option<String>,
    /// 目标分支（无清单时必填）
    pub branch: Option<String>,
    /// 远程目录（为空或 "/" 表示仓库根目录）
    pub remote_dir: Option<String>,
    /// 是否保持本地目录结构（推送专用，默认 true）
    pub keep_dir_structure: Option<bool>,
    /// 白名单 glob（硬编码默认值 + 用户追加）
    pub include_patterns: Option<Vec<String>>,
}

/// 同步操作结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    /// 是否成功
    pub success: bool,
    /// 操作类型 "pull" | "push"
    pub operation: String,
    /// 处理的文件数
    pub files_processed: usize,
    /// 跳过的文件数
    pub files_skipped: usize,
    /// 失败的文件数
    pub files_failed: usize,
    /// 错误信息（如果有）
    pub error_message: Option<String>,
}

/// 差异对比结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    /// 新增的文件（本地有，远程无）
    pub added: Vec<String>,
    /// 修改的文件（MD5 不同）
    pub modified: Vec<String>,
    /// 删除的文件（远程有，本地无）
    pub deleted: Vec<String>,
    /// 未变更的文件
    pub unchanged: Vec<String>,
}

/// 拉取预览结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullPreviewResult {
    /// 将要下载的文件列表（新增+更新）
    pub files: Vec<PullPreviewEntry>,
    /// 是否为全量同步（首次拉取或切换分支/平台）
    pub is_full_sync: bool,
}

/// 拉取预览中的单个文件条目
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullPreviewEntry {
    /// 文件相对路径
    pub path: String,
    /// 文件大小（字节）
    pub size: u64,
    /// 变更类型: "added" | "modified"
    pub change_type: String,
}

/// 同步进度事件（通过 Tauri Event 推送给前端）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgress {
    /// 仓库配置 ID
    pub repo_id: String,
    /// 阶段: "scanning" | "uploading" | "downloading" | "completed" | "error"
    pub phase: String,
    /// 当前进度
    pub current: usize,
    /// 总数
    pub total: usize,
    /// 当前处理的文件
    pub current_file: String,
    /// 附加信息
    pub message: Option<String>,
}

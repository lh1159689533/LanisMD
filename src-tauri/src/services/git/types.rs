// Git 模块公共类型定义（与前端 src/types/git.ts 字段对齐）
//
// @changelog
// | 版本   | 变更说明                         | 关联                         |
// | v1.0.0 | 初始实现：基于系统 git 的仓库能力 | REQ: Git 改造 TECH: 系统 git |
// /@changelog
//
// @author hhhuilli

use serde::{Deserialize, Serialize};

/// 系统 git 可用性
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitAvailability {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

/// 仓库概要信息（状态栏 / 视图显隐依据）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    /// 仓库根目录（git 返回的绝对路径）
    pub root: String,
    /// 打开的文件夹相对仓库根目录的路径，相同则为空串
    pub scope: String,
    /// 当前分支名，detached 时为 None
    pub branch: Option<String>,
    pub detached: bool,
    /// HEAD 短哈希，无提交时为 None
    pub head_short: Option<String>,
    pub has_commits: bool,
    /// 上游分支，如 origin/main
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub remote_name: Option<String>,
    pub remote_url: Option<String>,
    /// 远程仓库网页地址（用于提交外链）
    pub web_url: Option<String>,
    /// 是否处于合并中（存在 MERGE_HEAD）
    pub merging: bool,
    pub user_name: Option<String>,
    pub user_email: Option<String>,
}

/// 变更文件（工作区或某次提交）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    /// 相对仓库根目录的路径，统一使用 '/'
    pub path: String,
    /// 重命名前的路径
    pub old_path: Option<String>,
    /// added | modified | deleted | renamed | untracked | conflicted
    pub status: String,
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
    pub binary: bool,
}

/// 提交记录
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author_name: String,
    pub author_email: String,
    /// Unix 秒
    pub timestamp: i64,
    pub added: u32,
    pub modified: u32,
    pub deleted: u32,
}

/// 读取文件两个版本的请求参数
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileVersionsRequest {
    pub repo_path: String,
    pub file_path: String,
    pub old_path: Option<String>,
    pub status: String,
    /// 为空表示工作区变更（HEAD vs 工作区），否则为提交哈希（父提交 vs 该提交）
    pub commit: Option<String>,
}

/// 文件两个版本的内容（diff 面板使用）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileVersions {
    pub original: Option<String>,
    pub modified: Option<String>,
    pub binary: bool,
    pub original_data_url: Option<String>,
    pub modified_data_url: Option<String>,
}

/// 待处理文件条目（提交 / 放弃更改）
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntryRequest {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
}

/// Commit & Push 结果（推送失败时提交已回滚，以错误返回）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub commit_hash: String,
}

/// 拉取结果
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    /// HEAD 是否发生变化
    pub updated: bool,
    /// 冲突文件（相对仓库根目录）
    pub conflicts: Vec<String>,
    pub summary: String,
}

/// 分支条目
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    /// 本地分支为 main，远程分支为 origin/feature
    pub name: String,
    pub current: bool,
    pub remote: bool,
}

/// 远程仓库分支列表（克隆前查询）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBranches {
    pub default_branch: Option<String>,
    pub branches: Vec<String>,
}

/// 克隆进度事件
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneProgress {
    pub clone_id: String,
    pub phase: String,
    pub percent: Option<u32>,
    pub message: String,
}

/// 克隆请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneRequest {
    pub clone_id: String,
    pub url: String,
    pub target_dir: String,
    pub branch: Option<String>,
}

/// 本地存储的 HTTPS 凭据（含 token，仅后端可见）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCredential {
    pub id: String,
    /// 域名，如 github.com、git.example.com:8443
    pub host: String,
    pub username: String,
    pub token: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 返回给前端的凭据视图（不含 token）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCredentialView {
    pub id: String,
    pub host: String,
    pub username: String,
    pub has_token: bool,
    pub updated_at: String,
}

/// 保存凭据请求；token 为 None 表示保留原值
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveCredentialRequest {
    pub id: Option<String>,
    pub host: String,
    pub username: String,
    pub token: Option<String>,
}

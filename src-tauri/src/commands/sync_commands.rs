// 同步命令层定义

use tauri::AppHandle;

use crate::error::AppResult;
use crate::services::sync::config::SyncConfigService;
use crate::services::sync::gitee::GiteeProvider;
use crate::services::sync::github::{GitHubProvider, RemoteProvider};
use crate::services::sync::manifest::ManifestService;
use crate::services::sync::sync_engine::SyncEngine;
use crate::services::sync::types::*;

/// 获取所有仓库配置
#[tauri::command]
pub async fn sync_get_repos() -> AppResult<Vec<SyncRepoConfig>> {
    SyncConfigService::get_repos()
}

/// 保存仓库配置（新增或更新）
#[tauri::command]
pub async fn sync_save_repo(config: SyncRepoConfig) -> AppResult<SyncRepoConfig> {
    SyncConfigService::save_repo(config)
}

/// 删除仓库配置
#[tauri::command]
pub async fn sync_delete_repo(id: String) -> AppResult<()> {
    SyncConfigService::delete_repo(&id)
}

/// 测试连接结果
#[derive(serde::Serialize)]
pub struct TestConnectionResult {
    pub success: bool,
    pub error: Option<String>,
}

/// 测试仓库连接
#[tauri::command]
pub async fn sync_test_connection(config: SyncRepoConfig) -> AppResult<TestConnectionResult> {
    let provider: Box<dyn RemoteProvider> = match config.platform {
        Platform::Github => Box::new(GitHubProvider::new(
            &config.token,
            &config.owner,
            &config.repo,
            &config.branch,
        )),
        Platform::Gitee => Box::new(GiteeProvider::new(
            &config.token,
            &config.owner,
            &config.repo,
            &config.branch,
        )),
    };

    match provider.test_connection().await {
        Ok(()) => Ok(TestConnectionResult {
            success: true,
            error: None,
        }),
        Err(e) => Ok(TestConnectionResult {
            success: false,
            error: Some(e.to_string()),
        }),
    }
}

/// 获取远程仓库分支列表
#[tauri::command]
pub async fn sync_list_branches(config_id: String) -> AppResult<Vec<String>> {
    let config = SyncConfigService::get_repo_by_id(&config_id)?;
    let provider: Box<dyn RemoteProvider> = match config.platform {
        Platform::Github => Box::new(GitHubProvider::new(
            &config.token,
            &config.owner,
            &config.repo,
            &config.branch,
        )),
        Platform::Gitee => Box::new(GiteeProvider::new(
            &config.token,
            &config.owner,
            &config.repo,
            &config.branch,
        )),
    };

    provider.list_branches().await
}

/// 浏览远程目录
#[tauri::command]
pub async fn sync_browse_remote(
    config_id: String,
    branch: Option<String>,
    path: Option<String>,
) -> AppResult<Vec<RemoteEntry>> {
    let config = SyncConfigService::get_repo_by_id(&config_id)?;
    let effective_branch = branch.as_deref().unwrap_or(&config.branch);
    let provider: Box<dyn RemoteProvider> = match config.platform {
        Platform::Github => Box::new(GitHubProvider::new(
            &config.token,
            &config.owner,
            &config.repo,
            effective_branch,
        )),
        Platform::Gitee => Box::new(GiteeProvider::new(
            &config.token,
            &config.owner,
            &config.repo,
            effective_branch,
        )),
    };

    provider.get_tree(path.as_deref()).await
}

/// 预览拉取（返回将要下载的文件列表，不实际下载）
#[tauri::command]
pub async fn sync_preview_pull(request: PullRequest) -> AppResult<PullPreviewResult> {
    SyncEngine::preview_pull(request).await
}

/// 拉取（远程 -> 本地）
#[tauri::command]
pub async fn sync_pull(app: AppHandle, request: PullRequest) -> AppResult<SyncResult> {
    SyncEngine::pull(app, request).await
}

/// 推送（本地 -> 远程）
#[tauri::command]
pub async fn sync_push(app: AppHandle, request: PushRequest) -> AppResult<SyncResult> {
    SyncEngine::push(app, request).await
}

/// 对比差异
///
/// `include_patterns` 可选：
/// 若提供则使用调用方的实时白名单条件，否则回退到清单中持久化的白名单
#[tauri::command]
pub async fn sync_diff(
    local_path: String,
    sub_dir: Option<String>,
    include_patterns: Option<Vec<String>>,
) -> AppResult<DiffResult> {
    SyncEngine::diff(
        &local_path,
        sub_dir.as_deref(),
        include_patterns,
    )
    .await
}

/// 读取文件夹下的同步清单
#[tauri::command]
pub async fn sync_read_manifest(local_path: String) -> AppResult<Option<SyncManifest>> {
    ManifestService::read_manifest(&local_path)
}

// Git 命令层：所有命令在阻塞线程池中执行，避免阻塞 Tauri 异步运行时
//
// @changelog
// | 版本   | 变更说明                 | 关联                         |
// | v1.0.0 | 初始实现：Git 命令注册入口 | REQ: Git 改造 TECH: 系统 git |
// /@changelog
//
// @author hhhuilli

use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::services::git::types::*;
use crate::services::git::{clone, credentials::CredentialStore, ops, repo, runner::GitRunner};

/// AI 生成提交说明时 diff 文本上限
const AI_DIFF_MAX_BYTES: usize = 8 * 1024;

async fn blocking<T, F>(f: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::Git(format!("任务执行失败: {}", e)))?
}

#[tauri::command]
pub async fn git_check() -> AppResult<GitAvailability> {
    blocking(|| {
        Ok(match GitRunner::availability() {
            Some((path, version)) => GitAvailability {
                installed: true,
                version: Some(version),
                path: Some(path),
            },
            None => GitAvailability {
                installed: false,
                version: None,
                path: None,
            },
        })
    })
    .await
}

/// macOS 触发 Xcode 命令行工具安装；其他平台返回 false 由前端打开下载页
#[tauri::command]
pub async fn git_install_tools() -> AppResult<bool> {
    #[cfg(target_os = "macos")]
    {
        let ok = std::process::Command::new("xcode-select")
            .arg("--install")
            .spawn()
            .is_ok();
        return Ok(ok);
    }
    #[allow(unreachable_code)]
    Ok(false)
}

#[tauri::command]
pub async fn git_repo_info(path: String) -> AppResult<Option<RepoInfo>> {
    blocking(move || repo::repo_info(&path)).await
}

#[tauri::command]
pub async fn git_status(repo_path: String, scope: String) -> AppResult<Vec<ChangedFile>> {
    blocking(move || repo::status(&repo_path, &scope)).await
}

#[tauri::command]
pub async fn git_log(
    repo_path: String,
    scope: String,
    skip: u32,
    limit: u32,
) -> AppResult<Vec<CommitInfo>> {
    blocking(move || repo::log(&repo_path, &scope, skip, limit)).await
}

#[tauri::command]
pub async fn git_commit_files(
    repo_path: String,
    scope: String,
    hash: String,
) -> AppResult<Vec<ChangedFile>> {
    blocking(move || repo::commit_files(&repo_path, &scope, &hash)).await
}

#[tauri::command]
pub async fn git_file_versions(request: FileVersionsRequest) -> AppResult<FileVersions> {
    blocking(move || repo::file_versions(request)).await
}

#[tauri::command]
pub async fn git_diff_text(repo_path: String, files: Vec<FileEntryRequest>) -> AppResult<String> {
    blocking(move || repo::diff_text(&repo_path, &files, AI_DIFF_MAX_BYTES)).await
}

#[tauri::command]
pub async fn git_commit(
    repo_path: String,
    files: Vec<FileEntryRequest>,
    message: String,
) -> AppResult<CommitResult> {
    blocking(move || ops::commit_and_push(&repo_path, &files, &message)).await
}

#[tauri::command]
pub async fn git_push(repo_path: String) -> AppResult<()> {
    blocking(move || ops::push(&repo_path)).await
}

#[tauri::command]
pub async fn git_pull(repo_path: String) -> AppResult<PullResult> {
    blocking(move || ops::pull(&repo_path)).await
}

#[tauri::command]
pub async fn git_discard(repo_path: String, files: Vec<FileEntryRequest>) -> AppResult<()> {
    blocking(move || ops::discard(&repo_path, &files)).await
}

#[tauri::command]
pub async fn git_resolve_conflict(
    repo_path: String,
    file_path: String,
    strategy: String,
) -> AppResult<()> {
    blocking(move || ops::resolve_conflict(&repo_path, &file_path, &strategy)).await
}

#[tauri::command]
pub async fn git_abort_merge(repo_path: String) -> AppResult<()> {
    blocking(move || ops::abort_merge(&repo_path)).await
}

#[tauri::command]
pub async fn git_branches(repo_path: String) -> AppResult<Vec<BranchInfo>> {
    blocking(move || repo::branches(&repo_path)).await
}

#[tauri::command]
pub async fn git_checkout(repo_path: String, name: String, remote: bool) -> AppResult<()> {
    blocking(move || ops::checkout(&repo_path, &name, remote)).await
}

#[tauri::command]
pub async fn git_set_identity(
    repo_path: String,
    name: String,
    email: String,
    global: bool,
) -> AppResult<()> {
    blocking(move || ops::set_identity(&repo_path, &name, &email, global)).await
}

#[tauri::command]
pub async fn git_ls_remote(url: String) -> AppResult<RemoteBranches> {
    blocking(move || ops::ls_remote(&url)).await
}

#[tauri::command]
pub async fn git_clone(app: AppHandle, request: CloneRequest) -> AppResult<String> {
    blocking(move || clone::clone(&app, &request)).await
}

#[tauri::command]
pub async fn git_cancel_clone(clone_id: String) -> AppResult<()> {
    clone::cancel(&clone_id);
    Ok(())
}

#[tauri::command]
pub async fn git_get_credentials() -> AppResult<Vec<GitCredentialView>> {
    blocking(CredentialStore::list_views).await
}

#[tauri::command]
pub async fn git_save_credential(request: SaveCredentialRequest) -> AppResult<GitCredentialView> {
    blocking(move || CredentialStore::save(request)).await
}

#[tauri::command]
pub async fn git_delete_credential(id: String) -> AppResult<()> {
    blocking(move || CredentialStore::delete(&id)).await
}

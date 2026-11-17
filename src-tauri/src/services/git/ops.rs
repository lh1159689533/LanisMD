// 仓库写操作：提交推送、同步（pull）、放弃更改、冲突解决、分支切换、身份配置
//
// @changelog
// | 版本   | 变更说明                   | 关联                         |
// | v1.0.0 | 初始实现：仓库写操作与网络操作 | REQ: Git 改造 TECH: 系统 git |
// /@changelog
//
// @author hhhuilli

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use super::repo::{ensure_inside, has_head, is_merging, remote_name, remote_url, upstream};
use super::runner::GitRunner;
use super::types::*;
use crate::error::{AppError, AppResult};

/// git add 每批路径数，避免命令行过长
const ADD_CHUNK: usize = 100;

fn unmerged_files(dir: &Path) -> Vec<String> {
    GitRunner::try_run(dir, &["diff", "--name-only", "--diff-filter=U", "-z"])
        .unwrap_or_default()
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

fn head_hash(dir: &Path) -> Option<String> {
    GitRunner::try_run(dir, &["rev-parse", "HEAD"]).map(|s| s.trim().to_string())
}

fn require_remote(dir: &Path) -> AppResult<(String, Option<String>)> {
    let name =
        remote_name(dir).ok_or_else(|| AppError::Git("当前仓库未配置远程仓库".to_string()))?;
    let url = remote_url(dir, &name);
    Ok((name, url))
}

/// 推送当前分支；无上游时自动 -u 关联同名远程分支
pub fn push(repo: &str) -> AppResult<()> {
    let dir = Path::new(repo);
    let (remote, url) = require_remote(dir)?;
    if upstream(dir).is_some() {
        GitRunner::run_network(dir, &["push"], url.as_deref())?;
    } else {
        GitRunner::run_network(dir, &["push", "-u", &remote, "HEAD"], url.as_deref())?;
    }
    Ok(())
}

/// 合并进行中时 .git 下需要在回滚后恢复的状态文件
const MERGE_STATE_FILES: &[&str] = &["MERGE_HEAD", "MERGE_MSG", "MERGE_MODE"];

/// 提交前的仓库快照，用于推送失败时回滚
struct CommitSnapshot {
    /// 提交前的 HEAD；None 表示空仓库（首次提交）
    head: Option<String>,
    /// 合并状态文件 (绝对路径, 内容)
    merge_state: Vec<(PathBuf, Vec<u8>)>,
}

fn git_path(dir: &Path, name: &str) -> Option<PathBuf> {
    let rel = GitRunner::try_run(dir, &["rev-parse", "--git-path", name])?;
    let rel = rel.trim();
    if rel.is_empty() {
        return None;
    }
    let p = PathBuf::from(rel);
    Some(if p.is_absolute() { p } else { dir.join(p) })
}

fn take_snapshot(dir: &Path, merging: bool) -> CommitSnapshot {
    let mut merge_state = Vec::new();
    if merging {
        for name in MERGE_STATE_FILES {
            if let Some(path) = git_path(dir, name) {
                if let Ok(bytes) = fs::read(&path) {
                    merge_state.push((path, bytes));
                }
            }
        }
    }
    CommitSnapshot {
        head: head_hash(dir),
        merge_state,
    }
}

/// 提交是否已存在于任一远程跟踪分支（推送报错但实际已送达时不回滚）
fn reached_remote(dir: &Path, hash: &str) -> bool {
    GitRunner::try_run(
        dir,
        &[
            "for-each-ref",
            "--contains",
            hash,
            "--format=%(refname)",
            "refs/remotes",
        ],
    )
    .map(|s| !s.trim().is_empty())
    .unwrap_or(false)
}

/// 撤销刚创建的提交，恢复到提交前：工作区内容不变，普通提交恢复为未暂存，合并提交恢复合并状态
fn rollback_commit(dir: &Path, snapshot: &CommitSnapshot, commit_hash: &str) -> AppResult<()> {
    // HEAD 已被其他操作改变时不做任何处理，避免误伤
    if head_hash(dir).as_deref() != Some(commit_hash) {
        return Err(AppError::Git("HEAD 已变化，无法自动撤销提交".to_string()));
    }
    match &snapshot.head {
        Some(prev) if !snapshot.merge_state.is_empty() => {
            // 合并提交：保留已解决的暂存内容，并写回 MERGE_HEAD 等文件恢复「合并中」
            GitRunner::run(dir, &["reset", "-q", "--soft", prev])?;
            for (path, bytes) in &snapshot.merge_state {
                fs::write(path, bytes)?;
            }
        }
        Some(prev) => {
            GitRunner::run(dir, &["reset", "-q", "--mixed", prev])?;
        }
        None => {
            // 首次提交：删除分支引用回到未出生状态，并清空暂存区
            let branch_ref = GitRunner::run(dir, &["symbolic-ref", "-q", "HEAD"])?;
            GitRunner::run(dir, &["update-ref", "-d", branch_ref.trim()])?;
            GitRunner::run(dir, &["read-tree", "--empty"])?;
        }
    }
    Ok(())
}

/// Commit & Push 原子操作：仅提交选中的文件并推送；推送失败则撤销本次提交，恢复到提交前状态。
/// 非合并状态下先清空暂存区再精确暂存，保证提交内容与用户勾选一致。
pub fn commit_and_push(
    repo: &str,
    files: &[FileEntryRequest],
    message: &str,
) -> AppResult<CommitResult> {
    let dir = Path::new(repo);
    let merging = is_merging(dir);
    if message.trim().is_empty() && !merging {
        return Err(AppError::Git("提交说明不能为空".to_string()));
    }
    if files.is_empty() && !merging {
        return Err(AppError::Git("请至少选择一个文件".to_string()));
    }
    // 没有远程则无法推送，直接拒绝，不产生本地提交
    require_remote(dir)?;
    if GitRunner::try_run(dir, &["symbolic-ref", "-q", "HEAD"]).is_none() {
        return Err(AppError::Git(
            "当前处于游离 HEAD 状态，无法推送".to_string(),
        ));
    }

    let mut seen = HashSet::new();
    let mut paths: Vec<String> = Vec::new();
    for f in files {
        for p in std::iter::once(&f.path).chain(f.old_path.iter()) {
            ensure_inside(dir, p)?;
            if seen.insert(p.clone()) {
                paths.push(p.clone());
            }
        }
    }

    let snapshot = take_snapshot(dir, merging);
    if !merging && snapshot.head.is_some() {
        let _ = GitRunner::output(dir, &["reset", "-q"]);
    }
    for chunk in paths.chunks(ADD_CHUNK) {
        let mut args: Vec<&str> = vec!["add", "-A", "--"];
        args.extend(chunk.iter().map(|s| s.as_str()));
        GitRunner::run(dir, &args)?;
    }

    if merging && !unmerged_files(dir).is_empty() {
        return Err(AppError::Git(
            "仍有未解决的冲突文件，请先解决冲突".to_string(),
        ));
    }
    // diff --cached --quiet 退出码 0 表示暂存区无变化
    if !merging && GitRunner::try_run(dir, &["diff", "--cached", "--quiet"]).is_some() {
        return Err(AppError::Git("没有可提交的变更".to_string()));
    }
    if message.trim().is_empty() {
        GitRunner::run(dir, &["commit", "--no-edit"])?;
    } else {
        GitRunner::run(dir, &["commit", "-m", message.trim()])?;
    }
    let commit_hash = head_hash(dir).unwrap_or_default();

    let push_err = match push(repo) {
        Ok(()) => return Ok(CommitResult { commit_hash }),
        Err(AppError::Git(msg)) => msg,
        Err(e) => e.to_string(),
    };
    if reached_remote(dir, &commit_hash) {
        return Ok(CommitResult { commit_hash });
    }
    if let Err(e) = rollback_commit(dir, &snapshot, &commit_hash) {
        return Err(AppError::Git(format!(
            "推送失败，且自动撤销提交失败（提交 {} 仍在本地）：{}\n{}",
            &commit_hash[..commit_hash.len().min(7)],
            e,
            push_err
        )));
    }
    let hint = if merging {
        "推送失败，已撤销本次提交，仍处于合并中。远程如有新提交，可放弃合并后重新同步"
    } else {
        "推送失败，已撤销本次提交，更改仍保留在工作区"
    };
    Err(AppError::Git(format!("{}\n{}", hint, push_err)))
}

/// 同步：拉取远程到本地（merge + autostash），冲突时返回冲突文件而非报错
pub fn pull(repo: &str) -> AppResult<PullResult> {
    let dir = Path::new(repo);
    if is_merging(dir) {
        return Err(AppError::Git(
            "存在未完成的合并，请先解决冲突并提交".to_string(),
        ));
    }
    let (remote, url) = require_remote(dir)?;
    let before = head_hash(dir);
    // 空仓库无法设置上游，需显式指定 远程 + 分支
    let mut explicit_branch: Option<String> = None;

    if upstream(dir).is_none() {
        let branch = GitRunner::try_run(dir, &["symbolic-ref", "--short", "-q", "HEAD"])
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| AppError::Git("当前处于游离 HEAD 状态，无法同步".to_string()))?;
        GitRunner::run_network(dir, &["fetch", &remote], url.as_deref())?;
        let remote_ref = format!("refs/remotes/{}/{}", remote, branch);
        if GitRunner::try_run(dir, &["rev-parse", "--verify", "-q", &remote_ref]).is_none() {
            return Ok(PullResult {
                updated: false,
                conflicts: Vec::new(),
                summary: "远程尚无该分支，无需同步".to_string(),
            });
        }
        if before.is_some() {
            let set_up = format!("--set-upstream-to={}/{}", remote, branch);
            GitRunner::run(dir, &["branch", &set_up])?;
        } else {
            explicit_branch = Some(branch);
        }
    }

    let mut args = vec!["pull", "--no-rebase", "--no-edit"];
    let (major, minor) = GitRunner::version();
    if (major, minor) >= (2, 27) {
        args.push("--autostash");
    }
    if let Some(branch) = explicit_branch.as_deref() {
        args.push(&remote);
        args.push(branch);
    }
    let result = GitRunner::run_network(dir, &args, url.as_deref());
    let conflicts = unmerged_files(dir);
    let after = head_hash(dir);
    match result {
        Ok(_) => {
            let updated = before != after;
            let summary = if !conflicts.is_empty() {
                format!("同步完成，但有 {} 个文件存在冲突", conflicts.len())
            } else if updated {
                "已同步远程更新".to_string()
            } else {
                "已是最新".to_string()
            };
            Ok(PullResult {
                updated,
                conflicts,
                summary,
            })
        }
        Err(e) if !conflicts.is_empty() => {
            let _ = e;
            Ok(PullResult {
                updated: true,
                summary: format!(
                    "合并存在 {} 个冲突，请在「更改」视图中解决",
                    conflicts.len()
                ),
                conflicts,
            })
        }
        Err(e) => Err(e),
    }
}

/// 放弃更改：已跟踪文件恢复为 HEAD 版本，新文件移入回收站
pub fn discard(repo: &str, files: &[FileEntryRequest]) -> AppResult<()> {
    let dir = Path::new(repo);
    let head = has_head(dir);
    for f in files {
        let abs = ensure_inside(dir, &f.path)?;
        match f.status.as_str() {
            "untracked" => {
                if abs.exists() {
                    trash::delete(&abs)
                        .map_err(|e| AppError::Git(format!("移入回收站失败: {}", e)))?;
                }
            }
            "added" => {
                let _ = GitRunner::output(
                    dir,
                    &["rm", "--cached", "-q", "--ignore-unmatch", "--", &f.path],
                );
                if abs.exists() {
                    trash::delete(&abs)
                        .map_err(|e| AppError::Git(format!("移入回收站失败: {}", e)))?;
                }
            }
            "renamed" => {
                if let Some(old) = &f.old_path {
                    ensure_inside(dir, old)?;
                    GitRunner::run(dir, &["checkout", "HEAD", "--", old])?;
                }
                let _ = GitRunner::output(
                    dir,
                    &["rm", "--cached", "-q", "--ignore-unmatch", "--", &f.path],
                );
                if abs.exists() {
                    trash::delete(&abs)
                        .map_err(|e| AppError::Git(format!("移入回收站失败: {}", e)))?;
                }
            }
            "conflicted" => {
                return Err(AppError::Git("冲突文件请使用「解决冲突」操作".to_string()));
            }
            _ => {
                if !head {
                    continue;
                }
                GitRunner::run(dir, &["checkout", "HEAD", "--", &f.path])?;
            }
        }
    }
    Ok(())
}

/// 解决冲突：local=保留本地，remote=使用远程，mark=按当前文件内容标记已解决。
/// merge 冲突中 ours=本地；autostash 恢复冲突中 ours=远程合并结果、theirs=本地未提交修改。
pub fn resolve_conflict(repo: &str, path: &str, strategy: &str) -> AppResult<()> {
    let dir = Path::new(repo);
    let abs = ensure_inside(dir, path)?;
    let merging = is_merging(dir);
    let side = match (strategy, merging) {
        ("local", true) | ("remote", false) => Some("--ours"),
        ("remote", true) | ("local", false) => Some("--theirs"),
        _ => None,
    };
    if let Some(side) = side {
        let out = GitRunner::output(dir, &["checkout", side, "--", path])?;
        if !out.status.success() {
            // 该侧已删除此文件
            GitRunner::run(dir, &["rm", "-q", "--", path])?;
            return Ok(());
        }
    }
    if abs.exists() {
        GitRunner::run(dir, &["add", "--", path])?;
    } else {
        GitRunner::run(dir, &["rm", "-q", "--", path])?;
    }
    Ok(())
}

pub fn abort_merge(repo: &str) -> AppResult<()> {
    GitRunner::run(Path::new(repo), &["merge", "--abort"])?;
    Ok(())
}

/// 切换分支（不支持新建）；远程分支自动建立同名跟踪分支
pub fn checkout(repo: &str, name: &str, remote: bool) -> AppResult<()> {
    let dir = Path::new(repo);
    if remote {
        let short = name.split_once('/').map(|(_, n)| n).unwrap_or(name);
        let local_ref = format!("refs/heads/{}", short);
        if GitRunner::try_run(dir, &["rev-parse", "--verify", "-q", &local_ref]).is_some() {
            GitRunner::run(dir, &["checkout", short])?;
        } else {
            GitRunner::run(dir, &["checkout", "--track", name])?;
        }
    } else {
        GitRunner::run(dir, &["checkout", name])?;
    }
    Ok(())
}

pub fn set_identity(repo: &str, name: &str, email: &str, global: bool) -> AppResult<()> {
    let dir = Path::new(repo);
    let scope = if global { "--global" } else { "--local" };
    GitRunner::run(dir, &["config", scope, "user.name", name.trim()])?;
    GitRunner::run(dir, &["config", scope, "user.email", email.trim()])?;
    Ok(())
}

/// 查询远程仓库分支（克隆前使用），同时校验地址与权限
pub fn ls_remote(url: &str) -> AppResult<RemoteBranches> {
    let cwd = dirs::home_dir().unwrap_or_else(std::env::temp_dir);
    let out = GitRunner::run_network(
        &cwd,
        &["ls-remote", "--symref", url, "HEAD", "refs/heads/*"],
        Some(url),
    )?;
    let mut default_branch = None;
    let mut branches = Vec::new();
    for line in out.lines() {
        if let Some(rest) = line.strip_prefix("ref: refs/heads/") {
            default_branch = rest.split('\t').next().map(|s| s.to_string());
        } else if let Some((_, refname)) = line.split_once('\t') {
            if let Some(b) = refname.strip_prefix("refs/heads/") {
                branches.push(b.to_string());
            }
        }
    }
    Ok(RemoteBranches {
        default_branch,
        branches,
    })
}

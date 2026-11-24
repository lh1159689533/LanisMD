// 仓库只读查询：仓库信息、工作区状态、提交历史、文件版本、分支
//
// @changelog
// | 版本   | 变更说明                    | 关联                                    |
// | v1.0.0 | 初始实现：仓库只读查询能力    | REQ: Git 改造 TECH: 系统 git            |
// | v1.1.0 | 分支列表附带末端提交摘要      | REQ: 分支列表详情展示 TECH: for-each-ref |
// /@changelog
//
// @author hhhuilli

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;

use super::parser::{
    parse_log, parse_name_status_z, parse_numstat_z, parse_status_z, remote_to_web_url, LOG_FORMAT,
};
use super::runner::GitRunner;
use super::types::*;
use crate::error::{AppError, AppResult};

/// git 内置的空树对象，用于无 HEAD / 根提交时作为 diff 基准
pub const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// 单文件内容上限（超过则按二进制处理，避免 diff 面板卡顿）
const MAX_TEXT_BYTES: usize = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"];

fn pathspec(scope: &str) -> Vec<&str> {
    if scope.is_empty() {
        vec![]
    } else {
        vec!["--", scope]
    }
}

pub fn has_head(dir: &Path) -> bool {
    GitRunner::try_run(dir, &["rev-parse", "--verify", "-q", "HEAD"]).is_some()
}

pub fn is_merging(dir: &Path) -> bool {
    GitRunner::try_run(dir, &["rev-parse", "--verify", "-q", "MERGE_HEAD"]).is_some()
}

pub fn upstream(dir: &Path) -> Option<String> {
    GitRunner::try_run(
        dir,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    )
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

/// 选择用于同步的远程：优先上游所属远程，其次 origin，最后第一个远程
pub fn remote_name(dir: &Path) -> Option<String> {
    let remotes: Vec<String> = GitRunner::try_run(dir, &["remote"])?
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    if remotes.is_empty() {
        return None;
    }
    if let Some(up) = upstream(dir) {
        if let Some(r) = remotes.iter().find(|r| up.starts_with(&format!("{}/", r))) {
            return Some(r.clone());
        }
    }
    remotes
        .iter()
        .find(|r| r.as_str() == "origin")
        .cloned()
        .or_else(|| remotes.first().cloned())
}

pub fn remote_url(dir: &Path, remote: &str) -> Option<String> {
    GitRunner::try_run(dir, &["remote", "get-url", remote])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn config_value(dir: &Path, key: &str) -> Option<String> {
    GitRunner::try_run(dir, &["config", "--get", key])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 打开的文件夹相对仓库根目录的路径（统一 '/'），处理 macOS /var -> /private/var 等软链
fn compute_scope(root: &Path, dir: &Path) -> String {
    let root_c = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let dir_c = fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
    match dir_c.strip_prefix(&root_c) {
        Ok(rel) => rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join("/"),
        Err(_) => String::new(),
    }
}

/// 查询仓库信息；不是 Git 仓库时返回 None
pub fn repo_info(path: &str) -> AppResult<Option<RepoInfo>> {
    let dir = Path::new(path);
    if !dir.is_dir() || GitRunner::availability().is_none() {
        return Ok(None);
    }
    let Some(root) = GitRunner::try_run(dir, &["rev-parse", "--show-toplevel"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    else {
        return Ok(None);
    };
    let root_path = PathBuf::from(&root);
    let scope = compute_scope(&root_path, dir);
    let branch = GitRunner::try_run(&root_path, &["symbolic-ref", "--short", "-q", "HEAD"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let head_short = GitRunner::try_run(&root_path, &["rev-parse", "--short", "HEAD"])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let upstream = upstream(&root_path);
    let (mut ahead, mut behind) = (0, 0);
    if upstream.is_some() && head_short.is_some() {
        if let Some(out) = GitRunner::try_run(
            &root_path,
            &["rev-list", "--left-right", "--count", "HEAD...@{u}"],
        ) {
            let nums: Vec<u32> = out
                .split_whitespace()
                .filter_map(|s| s.parse().ok())
                .collect();
            ahead = nums.first().copied().unwrap_or(0);
            behind = nums.get(1).copied().unwrap_or(0);
        }
    }
    let remote_name = remote_name(&root_path);
    let remote_url = remote_name
        .as_deref()
        .and_then(|r| remote_url(&root_path, r));
    let web_url = remote_url.as_deref().and_then(remote_to_web_url);
    Ok(Some(RepoInfo {
        scope,
        detached: branch.is_none() && head_short.is_some(),
        has_commits: head_short.is_some(),
        branch,
        head_short,
        upstream,
        ahead,
        behind,
        remote_name,
        remote_url,
        web_url,
        merging: is_merging(&root_path),
        user_name: config_value(&root_path, "user.name"),
        user_email: config_value(&root_path, "user.email"),
        root,
    }))
}

/// 统计未跟踪文本文件的行数（作为新增行数）；二进制或过大返回 None
fn count_lines(path: &Path) -> (Option<u32>, bool) {
    let Ok(meta) = fs::metadata(path) else {
        return (None, false);
    };
    if meta.len() as usize > MAX_TEXT_BYTES {
        return (None, true);
    }
    let Ok(bytes) = fs::read(path) else {
        return (None, false);
    };
    if bytes.contains(&0) {
        return (None, true);
    }
    if bytes.is_empty() {
        return (Some(0), false);
    }
    let mut lines = bytes.iter().filter(|b| **b == b'\n').count() as u32;
    if bytes.last() != Some(&b'\n') {
        lines += 1;
    }
    (Some(lines), false)
}

/// 工作区变更（含未跟踪文件），scope 为相对仓库根目录的范围
pub fn status(repo: &str, scope: &str) -> AppResult<Vec<ChangedFile>> {
    let dir = Path::new(repo);
    let mut args = vec!["status", "--porcelain=v1", "-z", "--untracked-files=all"];
    args.extend(pathspec(scope));
    let mut files = parse_status_z(&GitRunner::run(dir, &args)?);

    let base = if has_head(dir) { "HEAD" } else { EMPTY_TREE };
    let mut num_args = vec!["diff", base, "--numstat", "-z", "-M"];
    num_args.extend(pathspec(scope));
    let stats = parse_numstat_z(&GitRunner::try_run(dir, &num_args).unwrap_or_default());

    for f in files.iter_mut() {
        if f.status == "untracked" {
            let (lines, binary) = count_lines(&dir.join(&f.path));
            f.additions = lines;
            f.deletions = lines.map(|_| 0);
            f.binary = binary;
        } else if let Some(ns) = stats.get(&f.path) {
            f.additions = ns.additions;
            f.deletions = ns.deletions;
            f.binary = ns.binary;
        }
    }
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

/// 提交历史（HEAD 起，分页）
pub fn log(repo: &str, scope: &str, skip: u32, limit: u32) -> AppResult<Vec<CommitInfo>> {
    let dir = Path::new(repo);
    if !has_head(dir) {
        return Ok(Vec::new());
    }
    let skip_arg = format!("--skip={}", skip);
    let limit_arg = format!("--max-count={}", limit);
    let mut args = vec![
        "log",
        LOG_FORMAT,
        "--name-status",
        "-M",
        &skip_arg,
        &limit_arg,
        "HEAD",
    ];
    args.extend(pathspec(scope));
    Ok(parse_log(&GitRunner::run(dir, &args)?))
}

fn parent_of(dir: &Path, hash: &str) -> Option<String> {
    let rev = format!("{}^", hash);
    GitRunner::try_run(dir, &["rev-parse", "--verify", "-q", &rev])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 某次提交的变更文件（相对第一个父提交；根提交相对空树）
pub fn commit_files(repo: &str, scope: &str, hash: &str) -> AppResult<Vec<ChangedFile>> {
    let dir = Path::new(repo);
    let parent = parent_of(dir, hash);
    let base = parent.as_deref().unwrap_or(EMPTY_TREE);
    let mut ns_args = vec!["diff", "--name-status", "-z", "-M", base, hash];
    ns_args.extend(pathspec(scope));
    let mut files = parse_name_status_z(&GitRunner::run(dir, &ns_args)?);
    let mut num_args = vec!["diff", "--numstat", "-z", "-M", base, hash];
    num_args.extend(pathspec(scope));
    let stats = parse_numstat_z(&GitRunner::try_run(dir, &num_args).unwrap_or_default());
    for f in files.iter_mut() {
        if let Some(ns) = stats.get(&f.path) {
            f.additions = ns.additions;
            f.deletions = ns.deletions;
            f.binary = ns.binary;
        }
    }
    Ok(files)
}

/// 读取某个版本的文件内容（rev:path）
fn show_blob(dir: &Path, rev: &str, path: &str) -> Option<Vec<u8>> {
    let spec = format!("{}:{}", rev, path);
    let out = GitRunner::output(dir, &["show", &spec]).ok()?;
    if out.status.success() {
        Some(out.stdout)
    } else {
        None
    }
}

fn is_image(path: &str) -> bool {
    let ext = Path::new(path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    IMAGE_EXTS.contains(&ext.as_str())
}

fn to_data_url(path: &str, bytes: &[u8]) -> Option<String> {
    if bytes.len() > MAX_IMAGE_BYTES {
        return None;
    }
    let ext = Path::new(path)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "ico" => "image/x-icon",
        other => {
            return Some(format!(
                "data:image/{};base64,{}",
                other,
                base64::engine::general_purpose::STANDARD.encode(bytes)
            ))
        }
    };
    Some(format!(
        "data:{};base64,{}",
        mime,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn is_binary(bytes: &[u8]) -> bool {
    bytes.len() > MAX_TEXT_BYTES || bytes.contains(&0) || std::str::from_utf8(bytes).is_err()
}

/// 读取文件变更前后两个版本，供 diff 面板使用
pub fn file_versions(req: FileVersionsRequest) -> AppResult<FileVersions> {
    let dir = Path::new(&req.repo_path);
    let old_path = req
        .old_path
        .clone()
        .unwrap_or_else(|| req.file_path.clone());
    let is_new = req.status == "added" || req.status == "untracked";
    let is_deleted = req.status == "deleted";

    let (original, modified): (Option<Vec<u8>>, Option<Vec<u8>>) = match &req.commit {
        None => {
            let original = if is_new {
                None
            } else {
                show_blob(dir, "HEAD", &old_path)
            };
            let modified = if is_deleted {
                None
            } else {
                fs::read(dir.join(&req.file_path)).ok()
            };
            (original, modified)
        }
        Some(hash) => {
            let original = if is_new {
                None
            } else {
                parent_of(dir, hash).and_then(|p| show_blob(dir, &p, &old_path))
            };
            let modified = if is_deleted {
                None
            } else {
                show_blob(dir, hash, &req.file_path)
            };
            (original, modified)
        }
    };

    let binary = original.as_deref().map(is_binary).unwrap_or(false)
        || modified.as_deref().map(is_binary).unwrap_or(false);
    if binary {
        let image = is_image(&req.file_path);
        return Ok(FileVersions {
            original: None,
            modified: None,
            binary: true,
            original_data_url: if image {
                original.as_deref().and_then(|b| to_data_url(&old_path, b))
            } else {
                None
            },
            modified_data_url: if image {
                modified
                    .as_deref()
                    .and_then(|b| to_data_url(&req.file_path, b))
            } else {
                None
            },
        });
    }
    let to_text = |b: Vec<u8>| String::from_utf8(b).unwrap_or_default();
    Ok(FileVersions {
        original: original.map(to_text),
        modified: modified.map(to_text),
        binary: false,
        original_data_url: None,
        modified_data_url: None,
    })
}

/// 截断到不超过 max 字节的字符边界
fn truncate_utf8(text: &mut String, max: usize) {
    if text.len() <= max {
        return;
    }
    let mut cut = max;
    while !text.is_char_boundary(cut) {
        cut -= 1;
    }
    text.truncate(cut);
    text.push_str("\n...（内容过长已截断）");
}

/// 生成供 AI 撰写提交说明的 diff 文本
pub fn diff_text(repo: &str, files: &[FileEntryRequest], max_bytes: usize) -> AppResult<String> {
    let dir = Path::new(repo);
    let base = if has_head(dir) { "HEAD" } else { EMPTY_TREE };
    let mut tracked: Vec<&str> = Vec::new();
    let mut untracked: Vec<&str> = Vec::new();
    for f in files {
        if f.status == "untracked" {
            untracked.push(&f.path);
        } else {
            tracked.push(&f.path);
            if let Some(old) = &f.old_path {
                tracked.push(old);
            }
        }
    }
    let mut text = String::new();
    if !tracked.is_empty() {
        let mut stat_args = vec!["diff", base, "--stat", "-M", "--"];
        stat_args.extend(tracked.iter().copied());
        text.push_str(&GitRunner::try_run(dir, &stat_args).unwrap_or_default());
        text.push('\n');
        let mut diff_args = vec!["diff", base, "-M", "--unified=2", "--"];
        diff_args.extend(tracked.iter().copied());
        text.push_str(&GitRunner::try_run(dir, &diff_args).unwrap_or_default());
    }
    for path in untracked {
        text.push_str(&format!("\n新文件: {}\n", path));
        if let Ok(bytes) = fs::read(dir.join(path)) {
            if !is_binary(&bytes) {
                let mut content = String::from_utf8_lossy(&bytes).to_string();
                truncate_utf8(&mut content, 1500);
                text.push_str(&content);
                text.push('\n');
            }
        }
        if text.len() > max_bytes {
            break;
        }
    }
    truncate_utf8(&mut text, max_bytes);
    Ok(text)
}

/// 将 for-each-ref 输出的空字段视为缺失
fn optional_ref_field(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// 分支列表：本地分支 + 尚无本地对应的远程分支，同时返回末端提交摘要
pub fn branches(repo: &str) -> AppResult<Vec<BranchInfo>> {
    let dir = Path::new(repo);
    // 用控制字符分隔字段，避免提交标题中的空格或制表符破坏解析
    let out = GitRunner::run(
        dir,
        &[
            "for-each-ref",
            "--format=%(refname)%1f%(HEAD)%1f%(objectname:short)%1f%(authorname)%1f%(authordate:unix)%1f%(contents:subject)",
            "refs/heads",
            "refs/remotes",
        ],
    )?;
    let mut local: Vec<BranchInfo> = Vec::new();
    let mut remote: Vec<BranchInfo> = Vec::new();
    for line in out.lines() {
        let mut cols = line.splitn(6, '\x1f');
        let refname = cols.next().unwrap_or("");
        let current = cols.next().map(|s| s.trim() == "*").unwrap_or(false);
        let short_hash = optional_ref_field(cols.next());
        let author_name = optional_ref_field(cols.next());
        let timestamp = cols.next().and_then(|s| s.trim().parse::<i64>().ok());
        let subject = optional_ref_field(cols.next());
        let (name, is_remote) = if let Some(name) = refname.strip_prefix("refs/heads/") {
            (name, false)
        } else if let Some(name) = refname.strip_prefix("refs/remotes/") {
            if name.ends_with("/HEAD") {
                continue;
            }
            (name, true)
        } else {
            continue;
        };
        let info = BranchInfo {
            name: name.to_string(),
            current: current && !is_remote,
            remote: is_remote,
            short_hash,
            author_name,
            timestamp,
            subject,
        };
        if is_remote {
            remote.push(info);
        } else {
            local.push(info);
        }
    }
    let local_names: HashSet<String> = local.iter().map(|b| b.name.clone()).collect();
    remote.retain(|b| {
        let short = b.name.split_once('/').map(|(_, n)| n).unwrap_or(&b.name);
        !local_names.contains(short)
    });
    // 当前分支置顶，其余按末端提交时间倒序，便于定位近期活跃的分支
    let by_recency = |a: &BranchInfo, b: &BranchInfo| {
        b.current
            .cmp(&a.current)
            .then_with(|| b.timestamp.unwrap_or(0).cmp(&a.timestamp.unwrap_or(0)))
            .then_with(|| a.name.cmp(&b.name))
    };
    local.sort_by(|a, b| by_recency(a, b));
    remote.sort_by(|a, b| by_recency(a, b));
    local.extend(remote);
    Ok(local)
}

/// 校验路径位于仓库内，防止前端传入 ../ 越界路径
pub fn ensure_inside(repo: &Path, rel: &str) -> AppResult<PathBuf> {
    if rel.split('/').any(|seg| seg == "..") || Path::new(rel).is_absolute() {
        return Err(AppError::InvalidPath(rel.to_string()));
    }
    Ok(repo.join(rel))
}

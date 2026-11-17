// 克隆远程仓库：流式解析进度并通过 Tauri Event 推送，支持取消
//
// @changelog
// | 版本   | 变更说明                   | 关联                               |
// | v1.0.0 | 初始实现：克隆进度与取消能力 | REQ: Git 改造 TECH: 打开远程仓库方案A |
// /@changelog
//
// @author hhhuilli

use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::Child;
use std::sync::{Arc, Mutex};

use dashmap::{DashMap, DashSet};
use once_cell::sync::Lazy;
use tauri::{AppHandle, Emitter};

use super::runner::{humanize_error, GitRunner};
use super::types::{CloneProgress, CloneRequest};
use crate::error::{AppError, AppResult};

type ChildHolder = Arc<Mutex<Option<Child>>>;

static RUNNING: Lazy<DashMap<String, ChildHolder>> = Lazy::new(DashMap::new);
static CANCELLED: Lazy<DashSet<String>> = Lazy::new(DashSet::new);

pub const CLONE_PROGRESS_EVENT: &str = "git-clone-progress";

fn phase_label(phase: &str) -> &str {
    match phase {
        "Counting objects" | "Enumerating objects" => "统计对象",
        "Compressing objects" => "压缩对象",
        "Receiving objects" => "接收对象",
        "Resolving deltas" => "处理差异",
        "Updating files" | "Checking out files" => "检出文件",
        _ => phase,
    }
}

/// 解析单段进度文本，如 "Receiving objects:  45% (450/1000), 1.2 MiB | 500 KiB/s"
fn parse_progress(clone_id: &str, segment: &str) -> Option<CloneProgress> {
    let text = segment.trim().trim_start_matches("remote:").trim();
    let (phase, rest) = text.split_once(':')?;
    let percent = rest
        .split('%')
        .next()
        .and_then(|s| s.trim().rsplit(' ').next())
        .and_then(|s| s.parse::<u32>().ok());
    Some(CloneProgress {
        clone_id: clone_id.to_string(),
        phase: phase_label(phase.trim()).to_string(),
        percent,
        message: text.to_string(),
    })
}

pub fn clone(app: &AppHandle, req: &CloneRequest) -> AppResult<String> {
    let target = PathBuf::from(&req.target_dir);
    let existed = target.exists();
    if existed && fs::read_dir(&target)?.next().is_some() {
        return Err(AppError::Git("目标目录已存在且不为空".to_string()));
    }
    let parent = target
        .parent()
        .ok_or_else(|| AppError::InvalidPath(req.target_dir.clone()))?
        .to_path_buf();
    fs::create_dir_all(&parent)?;

    let mut cmd = GitRunner::command(&parent)?;
    GitRunner::inject_credentials(&mut cmd, Some(&req.url));
    cmd.args(["clone", "--progress"]);
    if let Some(branch) = req.branch.as_deref().filter(|b| !b.is_empty()) {
        cmd.args(["--branch", branch]);
    }
    cmd.arg("--").arg(&req.url).arg(&target);

    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Git(format!("启动 git 失败: {}", e)))?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Git("无法读取克隆输出".to_string()))?;
    let holder: ChildHolder = Arc::new(Mutex::new(Some(child)));
    RUNNING.insert(req.clone_id.clone(), holder.clone());

    // git 以 \r 刷新同一行进度，按 \r / \n 切分
    let mut log = String::new();
    let mut pending = String::new();
    let mut buf = [0u8; 4096];
    let mut last_percent: Option<(String, u32)> = None;
    loop {
        let n = match stderr.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        pending.push_str(&String::from_utf8_lossy(&buf[..n]));
        while let Some(idx) = pending.find(|c| c == '\r' || c == '\n') {
            let segment: String = pending.drain(..=idx).collect();
            let segment = segment.trim();
            if segment.is_empty() {
                continue;
            }
            log.push_str(segment);
            log.push('\n');
            if let Some(p) = parse_progress(&req.clone_id, segment) {
                let key = (p.phase.clone(), p.percent.unwrap_or(0));
                if last_percent.as_ref() != Some(&key) {
                    last_percent = Some(key);
                    let _ = app.emit(CLONE_PROGRESS_EVENT, &p);
                }
            }
        }
    }

    let status = holder
        .lock()
        .ok()
        .and_then(|mut g| g.take())
        .and_then(|mut c| c.wait().ok());
    RUNNING.remove(&req.clone_id);
    let cancelled = CANCELLED.remove(&req.clone_id).is_some();

    if status.map(|s| s.success()).unwrap_or(false) && !cancelled {
        return Ok(target.to_string_lossy().to_string());
    }
    // 被强制终止时 git 来不及清理：仅删除本次克隆新建且确为仓库的目录
    if cancelled && !existed && target.join(".git").exists() {
        let _ = fs::remove_dir_all(&target);
    }
    if cancelled {
        return Err(AppError::Git("已取消克隆".to_string()));
    }
    Err(AppError::Git(humanize_error(&log)))
}

pub fn cancel(clone_id: &str) {
    if let Some(holder) = RUNNING.get(clone_id) {
        CANCELLED.insert(clone_id.to_string());
        if let Ok(mut guard) = holder.lock() {
            if let Some(child) = guard.as_mut() {
                let _ = child.kill();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_parsing() {
        let p = parse_progress(
            "x",
            "Receiving objects:  45% (450/1000), 1.2 MiB | 500 KiB/s",
        )
        .unwrap();
        assert_eq!(p.phase, "接收对象");
        assert_eq!(p.percent, Some(45));
        let p = parse_progress("x", "remote: Counting objects: 100% (5/5), done.").unwrap();
        assert_eq!(p.percent, Some(100));
        assert!(parse_progress("x", "Cloning into 'abc'...").is_none());
    }
}

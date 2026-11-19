/**
 * 系统集成：外部文件关联打开
 *
 * 两类来源统一收敛到本模块：
 * - macOS：Finder 的「打开方式」通过 LaunchServices 投递 `RunEvent::Opened { urls }`；
 * - Windows / Linux：系统把文件路径作为命令行参数传入，应用已运行时由单实例插件转发参数。
 *
 * 冷启动时前端尚未加载，路径先暂存到 `PendingOpenFiles`，前端加载完成后调用
 * `take_pending_open_files` 取走；应用运行中则通过事件实时推送，两条通道由前端去重。
 *
 * @changelog
 * | 版本   | 变更说明                                     | 关联                                    |
 * | v1.0.0 | 初始实现：文件关联路径解析、冷启动暂存与广播 | REQ: 系统集成-文件关联 TECH: Tauri 事件通道 |
 * /@changelog
 *
 * @author hhhuilli
 */

use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// 前端监听的事件名，payload 为待打开的文件绝对路径列表
pub const OPEN_FILES_EVENT: &str = "system:open-files";

/// 与 tauri.conf.json 的 bundle.fileAssociations 保持一致的扩展名
const SUPPORTED_EXTENSIONS: [&str; 3] = ["md", "markdown", "mdx"];

/// 冷启动阶段系统投递、尚未被前端取走的文件路径
pub struct PendingOpenFiles(Mutex<Vec<String>>);

impl Default for PendingOpenFiles {
    fn default() -> Self {
        Self(Mutex::new(Vec::new()))
    }
}

impl PendingOpenFiles {
    /// 追加去重后的路径
    pub fn push_paths(&self, paths: &[String]) {
        if let Ok(mut pending) = self.0.lock() {
            for path in paths {
                if !pending.contains(path) {
                    pending.push(path.clone());
                }
            }
        }
    }

    /// 取出并清空队列
    pub fn take(&self) -> Vec<String> {
        let mut guard = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        std::mem::take(&mut *guard)
    }
}

/// 判断路径是否为已存在的受支持文档
pub fn is_supported_document(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            SUPPORTED_EXTENSIONS
                .iter()
                .any(|item| item.eq_ignore_ascii_case(ext))
        })
        .unwrap_or(false)
}

/// 从命令行参数中提取文档路径；相对路径按启动目录补全，过滤开关与非文档参数
#[cfg(not(target_os = "macos"))]
pub fn extract_paths_from_args(args: &[String], cwd: Option<&Path>) -> Vec<String> {
    use std::path::PathBuf;

    let mut result: Vec<String> = Vec::new();
    for raw in args.iter().skip(1) {
        if raw.starts_with('-') {
            continue;
        }
        let candidate = PathBuf::from(raw);
        let full = if candidate.is_absolute() {
            candidate
        } else {
            match cwd {
                Some(dir) => dir.join(candidate),
                None => continue,
            }
        };
        if !is_supported_document(&full) {
            continue;
        }
        let path = full.to_string_lossy().to_string();
        if !result.contains(&path) {
            result.push(path);
        }
    }
    result
}

/// 统一投递：同时写入冷启动队列并向已运行的前端广播
pub fn deliver_paths<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<PendingOpenFiles>() {
        state.push_paths(&paths);
    }
    let _ = app.emit(OPEN_FILES_EVENT, paths);
}

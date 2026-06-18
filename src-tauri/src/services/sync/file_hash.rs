// MD5 计算 + glob 过滤

use std::fs;
use std::io::Read;
use std::path::Path;

use glob::Pattern;
use md5::{Digest, Md5};
use walkdir::WalkDir;

use crate::error::{AppError, AppResult};

/// 文件哈希与过滤服务
pub struct FileHashService;

impl FileHashService {
    /// 计算文件的 MD5 值
    pub fn compute_md5(file_path: &str) -> AppResult<String> {
        let mut file = fs::File::open(file_path).map_err(|e| AppError::Io(e))?;

        let mut hasher = Md5::new();
        let mut buffer = [0u8; 8192];

        loop {
            let bytes_read = file.read(&mut buffer).map_err(|e| AppError::Io(e))?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }

        let result = hasher.finalize();
        Ok(format!("{:x}", result))
    }

    /// 扫描本地文件夹，返回符合过滤条件的文件列表（相对路径）
    /// 返回值: Vec<(相对路径, 绝对路径)>
    pub fn scan_local_files(
        local_path: &str,
        include_patterns: &[String],
        exclude_patterns: &[String],
    ) -> AppResult<Vec<(String, String)>> {
        let base = Path::new(local_path);
        if !base.exists() || !base.is_dir() {
            return Err(AppError::InvalidPath(format!(
                "路径不存在或非目录: {}",
                local_path
            )));
        }

        let mut files = Vec::new();

        for entry in WalkDir::new(base).into_iter().filter_map(|e| e.ok()) {
            // 跳过目录
            if entry.file_type().is_dir() {
                continue;
            }

            let abs_path = entry.path().to_string_lossy().to_string();
            let rel_path = entry
                .path()
                .strip_prefix(base)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            // 跳过 lanismd-sync.json 本身
            if rel_path == "lanismd-sync.json" {
                continue;
            }

            // 跳过隐藏文件/目录（以 . 开头的路径段）
            if rel_path.split('/').any(|seg| seg.starts_with('.')) {
                continue;
            }

            // 应用 glob 过滤
            if Self::should_include(&rel_path, include_patterns, exclude_patterns) {
                files.push((rel_path, abs_path));
            }
        }

        Ok(files)
    }

    /// 判断文件是否应该包含在同步范围内
    fn should_include(
        rel_path: &str,
        include_patterns: &[String],
        exclude_patterns: &[String],
    ) -> bool {
        // 如果有白名单，文件必须匹配至少一个白名单模式
        if !include_patterns.is_empty() {
            let included = include_patterns.iter().any(|pattern| {
                Pattern::new(pattern)
                    .map(|p| p.matches(rel_path))
                    .unwrap_or(false)
            });
            if !included {
                return false;
            }
        }

        // 如果匹配任何黑名单模式，排除
        let excluded = exclude_patterns.iter().any(|pattern| {
            Pattern::new(pattern)
                .map(|p| p.matches(rel_path))
                .unwrap_or(false)
        });

        !excluded
    }
}

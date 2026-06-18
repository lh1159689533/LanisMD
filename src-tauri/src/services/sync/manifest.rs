// lanismd-sync.json 读写

use std::fs;
use std::path::{Path, PathBuf};

use super::types::SyncManifest;
use crate::error::{AppError, AppResult};

/// 同步清单文件名
const MANIFEST_FILENAME: &str = "lanismd-sync.json";

/// 同步清单读写服务
pub struct ManifestService;

impl ManifestService {
    /// 获取清单文件的完整路径
    fn manifest_path(local_path: &str) -> PathBuf {
        Path::new(local_path).join(MANIFEST_FILENAME)
    }

    /// 读取文件夹下的同步清单
    /// 如果文件不存在，返回 None
    pub fn read_manifest(local_path: &str) -> AppResult<Option<SyncManifest>> {
        let path = Self::manifest_path(local_path);
        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| AppError::Config(format!("读取同步清单失败: {}", e)))?;

        let manifest: SyncManifest = serde_json::from_str(&content)
            .map_err(|e| AppError::Config(format!("解析同步清单失败: {}", e)))?;

        Ok(Some(manifest))
    }

    /// 写入同步清单到文件夹
    pub fn write_manifest(local_path: &str, manifest: &SyncManifest) -> AppResult<()> {
        let path = Self::manifest_path(local_path);
        let content = serde_json::to_string_pretty(manifest)
            .map_err(|e| AppError::Config(format!("序列化同步清单失败: {}", e)))?;
        fs::write(&path, content)
            .map_err(|e| AppError::Config(format!("写入同步清单失败: {}", e)))?;
        Ok(())
    }
}

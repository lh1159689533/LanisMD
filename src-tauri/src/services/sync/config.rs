// 同步仓库配置文件读写

use std::fs;
use std::path::PathBuf;

use super::types::SyncRepoConfig;
use crate::error::{AppError, AppResult};

/// 同步配置服务，负责管理 sync-repos.json 文件
pub struct SyncConfigService;

impl SyncConfigService {
    /// 获取配置文件路径: {data_dir}/com.lanis.md/sync-repos.json
    fn config_path() -> AppResult<PathBuf> {
        let data_dir =
            dirs::data_dir().ok_or_else(|| AppError::Config("无法获取系统数据目录".to_string()))?;
        Ok(data_dir.join("com.lanis.md").join("sync-repos.json"))
    }

    /// 确保配置目录和文件存在
    fn ensure_config_file() -> AppResult<PathBuf> {
        let path = Self::config_path()?;
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| AppError::Config(format!("创建配置目录失败: {}", e)))?;
            }
        }
        if !path.exists() {
            fs::write(&path, "[]")
                .map_err(|e| AppError::Config(format!("创建配置文件失败: {}", e)))?;
        }
        Ok(path)
    }

    /// 获取所有仓库配置
    pub fn get_repos() -> AppResult<Vec<SyncRepoConfig>> {
        let path = Self::ensure_config_file()?;
        let content = fs::read_to_string(&path)
            .map_err(|e| AppError::Config(format!("读取配置文件失败: {}", e)))?;
        let repos: Vec<SyncRepoConfig> = serde_json::from_str(&content)
            .map_err(|e| AppError::Config(format!("解析配置文件失败: {}", e)))?;
        Ok(repos)
    }

    /// 保存仓库配置（新增或更新）
    pub fn save_repo(config: SyncRepoConfig) -> AppResult<SyncRepoConfig> {
        let mut repos = Self::get_repos()?;

        // 查找是否已存在相同 ID 的配置
        if let Some(existing) = repos.iter_mut().find(|r| r.id == config.id) {
            *existing = config.clone();
        } else {
            repos.push(config.clone());
        }

        Self::write_repos(&repos)?;
        Ok(config)
    }

    /// 删除仓库配置
    pub fn delete_repo(id: &str) -> AppResult<()> {
        let mut repos = Self::get_repos()?;
        let original_len = repos.len();
        repos.retain(|r| r.id != id);

        if repos.len() == original_len {
            return Err(AppError::Config(format!("未找到 ID 为 {} 的配置", id)));
        }

        Self::write_repos(&repos)?;
        Ok(())
    }

    /// 根据 ID 获取单个仓库配置
    pub fn get_repo_by_id(id: &str) -> AppResult<SyncRepoConfig> {
        let repos = Self::get_repos()?;
        repos
            .into_iter()
            .find(|r| r.id == id)
            .ok_or_else(|| AppError::Config(format!("未找到 ID 为 {} 的配置", id)))
    }

    /// 将配置列表写入文件
    fn write_repos(repos: &[SyncRepoConfig]) -> AppResult<()> {
        let path = Self::config_path()?;
        let content = serde_json::to_string_pretty(repos)
            .map_err(|e| AppError::Config(format!("序列化配置失败: {}", e)))?;
        fs::write(&path, content)
            .map_err(|e| AppError::Config(format!("写入配置文件失败: {}", e)))?;
        Ok(())
    }
}

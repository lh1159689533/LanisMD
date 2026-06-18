// 同步模块导出

//! 远程文档同步服务模块
//!
//! - `types`：公共类型定义（SyncRepoConfig、SyncManifest 等）
//! - `config`：仓库配置文件读写（sync-repos.json）
//! - `github`：GitHub REST API v3 封装
//! - `gitee`：Gitee API v5 封装
//! - `file_hash`：MD5 计算 + glob 过滤
//! - `sync_engine`：统一同步引擎（diff/pull/push 核心逻辑）
//! - `manifest`：lanismd-sync.json 清单读写

pub mod config;
pub mod file_hash;
pub mod gitee;
pub mod github;
pub mod manifest;
pub mod sync_engine;
pub mod types;

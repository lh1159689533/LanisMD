// 统一同步引擎（骨架结构）

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use tauri::{AppHandle, Emitter};

use super::config::SyncConfigService;
use super::file_hash::FileHashService;
use super::gitee::GiteeProvider;
use super::github::{GitHubProvider, RemoteProvider};
use super::manifest::ManifestService;
use super::types::*;
use crate::error::{AppError, AppResult};

/// 单文件大小上限: 25MB
const MAX_FILE_SIZE: u64 = 25 * 1024 * 1024;

/// 同步引擎: 统一管理 pull/push/diff 操作
pub struct SyncEngine;

impl SyncEngine {
    /// 根据配置创建对应平台的 Provider
    fn create_provider(config: &SyncRepoConfig, branch: &str) -> Box<dyn RemoteProvider> {
        match config.platform {
            Platform::Github => Box::new(GitHubProvider::new(
                &config.token,
                &config.owner,
                &config.repo,
                branch,
            )),
            Platform::Gitee => Box::new(GiteeProvider::new(
                &config.token,
                &config.owner,
                &config.repo,
                branch,
            )),
        }
    }

    /// 发送同步进度事件
    fn emit_progress(app: &AppHandle, progress: &SyncProgress) {
        let _ = app.emit("sync-progress", progress);
    }

    /// 执行拉取操作（远程 -> 本地）
    pub async fn pull(app: AppHandle, request: PullRequest) -> AppResult<SyncResult> {
        // 1. 获取仓库配置
        let config = SyncConfigService::get_repo_by_id(&request.config_id)?;
        let provider = Self::create_provider(&config, &request.branch);

        // 2. 读取已有清单（用于增量拉取）
        let existing_manifest = ManifestService::read_manifest(&request.local_path)?;

        // 3. 源+分支变更检测
        let should_full_sync = match &existing_manifest {
            Some(manifest) => {
                manifest.repo_config.platform != config.platform
                    || manifest.branch != request.branch
            }
            None => true, // 无清单时全量拉取
        };

        // 4. 发送扫描进度
        Self::emit_progress(
            &app,
            &SyncProgress {
                repo_id: config.id.clone(),
                phase: "scanning".to_string(),
                current: 0,
                total: 0,
                current_file: String::new(),
                message: Some("正在扫描远程文件...".to_string()),
            },
        );

        // 5. 获取远程文件列表（固定从仓库根目录开始）
        let remote_entries = Self::get_remote_files_recursive(&*provider, None).await?;

        // 6. 按 include/exclude 过滤远程文件
        let filtered_entries: Vec<&RemoteEntry> = remote_entries
            .iter()
            .filter(|entry| entry.entry_type == "file")
            .filter(|entry| {
                Self::should_include_file(
                    &entry.path,
                    &request.include_patterns,
                    &request.exclude_patterns,
                )
            })
            .collect();

        // 7. 确保本地目录存在
        let local_base = Path::new(&request.local_path);
        if !local_base.exists() {
            fs::create_dir_all(local_base)
                .map_err(|e| AppError::Config(format!("创建本地目录失败: {}", e)))?;
        }

        // 8. 确定需要下载的文件
        let existing_entries = if should_full_sync {
            HashMap::new()
        } else {
            existing_manifest
                .as_ref()
                .map(|m| m.file_entries.clone())
                .unwrap_or_default()
        };

        let total = filtered_entries.len();
        let mut files_processed = 0;
        let mut files_skipped = 0;
        let mut files_failed = 0;
        let mut new_entries: HashMap<String, SyncFileEntry> = existing_entries.clone();

        // 9. 逐文件下载
        for (idx, entry) in filtered_entries.iter().enumerate() {
            // 同步固定使用仓库根目录，远程路径即为相对路径
            let rel_path = entry.path.clone();

            // 增量检测：如果清单中已有该文件且 SHA 未变，跳过
            if !should_full_sync {
                if let Some(existing_entry) = existing_entries.get(&rel_path) {
                    if existing_entry.remote_sha.as_deref() == entry.sha.as_deref()
                        && existing_entry.status == "synced"
                    {
                        files_skipped += 1;
                        continue;
                    }
                }
            }

            // 发送下载进度
            Self::emit_progress(
                &app,
                &SyncProgress {
                    repo_id: config.id.clone(),
                    phase: "downloading".to_string(),
                    current: idx + 1,
                    total,
                    current_file: rel_path.clone(),
                    message: None,
                },
            );

            // 下载文件
            match provider.get_file_content(&entry.path).await {
                Ok(content) => {
                    // 写入本地文件
                    let local_file_path = local_base.join(&rel_path);
                    if let Some(parent) = local_file_path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }

                    if let Err(e) = fs::write(&local_file_path, &content) {
                        files_failed += 1;
                        new_entries.insert(
                            rel_path.clone(),
                            SyncFileEntry {
                                md5: String::new(),
                                remote_sha: entry.sha.clone(),
                                size: entry.size,
                                synced_at: chrono::Utc::now().to_rfc3339(),
                                status: "error".to_string(),
                            },
                        );
                        // 本地写入失败事件
                        Self::emit_progress(
                            &app,
                            &SyncProgress {
                                repo_id: config.id.clone(),
                                phase: "file_failed".to_string(),
                                current: files_processed,
                                total,
                                current_file: rel_path.clone(),
                                message: Some(format!("写入本地文件失败: {}", e)),
                            },
                        );
                        continue;
                    }

                    // 计算本地文件 MD5
                    let md5 = FileHashService::compute_md5(&local_file_path.to_string_lossy())
                        .unwrap_or_default();

                    // 更新清单条目
                    new_entries.insert(
                        rel_path.clone(),
                        SyncFileEntry {
                            md5,
                            remote_sha: entry.sha.clone(),
                            size: entry.size,
                            synced_at: chrono::Utc::now().to_rfc3339(),
                            status: "synced".to_string(),
                        },
                    );

                    files_processed += 1;

                    // 单文件下载成功事件
                    Self::emit_progress(
                        &app,
                        &SyncProgress {
                            repo_id: config.id.clone(),
                            phase: "file_done".to_string(),
                            current: files_processed,
                            total,
                            current_file: rel_path.clone(),
                            message: None,
                        },
                    );
                }
                Err(_e) => {
                    files_failed += 1;
                    new_entries.insert(
                        rel_path.clone(),
                        SyncFileEntry {
                            md5: String::new(),
                            remote_sha: entry.sha.clone(),
                            size: entry.size,
                            synced_at: chrono::Utc::now().to_rfc3339(),
                            status: "error".to_string(),
                        },
                    );

                    // 单文件下载失败事件
                    Self::emit_progress(
                        &app,
                        &SyncProgress {
                            repo_id: config.id.clone(),
                            phase: "file_failed".to_string(),
                            current: files_processed,
                            total,
                            current_file: rel_path.clone(),
                            message: Some(format!("下载失败: {}", _e)),
                        },
                    );
                }
            }

            // 实时写入清单（保证中断可恢复）
            let manifest = SyncManifest {
                repo_config: SyncManifestRepoConfig {
                    platform: config.platform.clone(),
                    owner: config.owner.clone(),
                    repo: config.repo.clone(),
                    config_id: config.id.clone(),
                },
                branch: request.branch.clone(),
                include_patterns: request.include_patterns.clone(),
                exclude_patterns: request.exclude_patterns.clone(),
                last_sync_at: Some(chrono::Utc::now().to_rfc3339()),
                sync_direction: "pull".to_string(),
                file_entries: new_entries.clone(),
            };
            let _ = ManifestService::write_manifest(&request.local_path, &manifest);
        }

        // 10. 发送完成进度
        Self::emit_progress(
            &app,
            &SyncProgress {
                repo_id: config.id.clone(),
                phase: "completed".to_string(),
                current: total,
                total,
                current_file: String::new(),
                message: Some(format!(
                    "拉取完成: {} 文件已更新, {} 跳过, {} 失败",
                    files_processed, files_skipped, files_failed
                )),
            },
        );

        Ok(SyncResult {
            success: files_failed == 0,
            operation: "pull".to_string(),
            files_processed,
            files_skipped,
            files_failed,
            error_message: if files_failed > 0 {
                Some(format!("{} 个文件拉取失败", files_failed))
            } else {
                None
            },
        })
    }

    /// 执行推送操作（本地 -> 远程）
    pub async fn push(app: AppHandle, request: PushRequest) -> AppResult<SyncResult> {
        // 1. 读取已有清单，判断推送模式
        let existing_manifest = ManifestService::read_manifest(&request.local_path)?;

        // 2. 确定推送目标配置
        // 优先级：request 中明确传入的 configId > manifest 中锁定的配置
        // 这样用户在弹窗中选择的配置能正确生效
        let (config, branch, include_patterns, exclude_patterns) =
            if let Some(config_id) = request.config_id.as_ref() {
                // 请求中明确指定了配置 ID，使用请求参数（用户在弹窗中选择的配置）
                let branch = request
                    .branch
                    .as_ref()
                    .ok_or_else(|| AppError::Config("未指定目标分支".to_string()))?;
                let config = SyncConfigService::get_repo_by_id(config_id)?;
                (
                    config,
                    branch.clone(),
                    request.include_patterns.clone().unwrap_or_default(),
                    request.exclude_patterns.clone().unwrap_or_default(),
                )
            } else if let Some(manifest) = &existing_manifest {
                // 请求未指定配置，回退到清单中锁定的配置
                let config = SyncConfigService::get_repo_by_id(&manifest.repo_config.config_id)?;
                (
                    config,
                    manifest.branch.clone(),
                    manifest.include_patterns.clone(),
                    manifest.exclude_patterns.clone(),
                )
            } else {
                // 既没有请求参数也没有清单，无法推送
                return Err(AppError::Config("无同步清单且未指定仓库配置".to_string()));
            };

        let provider = Self::create_provider(&config, &branch);

        // 3. 发送扫描进度
        Self::emit_progress(
            &app,
            &SyncProgress {
                repo_id: config.id.clone(),
                phase: "scanning".to_string(),
                current: 0,
                total: 0,
                current_file: String::new(),
                message: Some("正在扫描本地文件...".to_string()),
            },
        );

        // 4. 扫描本地文件
        let local_files = FileHashService::scan_local_files(
            &request.local_path,
            &include_patterns,
            &exclude_patterns,
        )?;

        // 5. 确定需要推送的文件
        let existing_entries = existing_manifest
            .as_ref()
            .map(|m| m.file_entries.clone())
            .unwrap_or_default();

        let mut files_to_push: Vec<(String, String, String)> = Vec::new(); // (相对路径, 绝对路径, md5)

        for (rel_path, abs_path) in &local_files {
            // 检查文件大小
            let metadata = fs::metadata(abs_path)
                .map_err(|e| AppError::Config(format!("读取文件元数据失败: {}", e)))?;
            if metadata.len() > MAX_FILE_SIZE {
                continue; // 跳过超大文件
            }

            let md5 = FileHashService::compute_md5(abs_path)?;

            // 对比清单中的 hash，判断是否需要推送
            let needs_push = match existing_entries.get(rel_path) {
                Some(entry) => entry.md5 != md5, // MD5 不同，需要推送
                None => true,                    // 清单中不存在，需要推送
            };

            if needs_push {
                files_to_push.push((rel_path.clone(), abs_path.clone(), md5));
            }
        }

        let total = files_to_push.len();
        let mut files_processed = 0;
        let mut files_failed = 0;
        let mut new_entries: HashMap<String, SyncFileEntry> = existing_entries;

        // 6. 逐文件上传
        for (idx, (rel_path, abs_path, md5)) in files_to_push.iter().enumerate() {
            Self::emit_progress(
                &app,
                &SyncProgress {
                    repo_id: config.id.clone(),
                    phase: "uploading".to_string(),
                    current: idx + 1,
                    total,
                    current_file: rel_path.clone(),
                    message: None,
                },
            );

            // 读取文件内容
            let content = match fs::read(abs_path) {
                Ok(c) => c,
                Err(e) => {
                    files_failed += 1;
                    // 本地文件读取失败事件
                    Self::emit_progress(
                        &app,
                        &SyncProgress {
                            repo_id: config.id.clone(),
                            phase: "file_failed".to_string(),
                            current: files_processed,
                            total,
                            current_file: rel_path.clone(),
                            message: Some(format!("读取文件失败: {}", e)),
                        },
                    );
                    continue;
                }
            };

            // 同步固定使用仓库根目录，远程路径即为相对路径
            let remote_file_path = rel_path.clone();

            // 获取远程文件 SHA（更新时需要）
            let existing_sha = provider.get_file_sha(&remote_file_path).await?;

            // 上传文件
            let message = format!(
                "sync: {} - update {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                rel_path
            );

            match provider
                .put_file(
                    &remote_file_path,
                    &content,
                    existing_sha.as_deref(),
                    &message,
                )
                .await
            {
                Ok(()) => {
                    let file_size = content.len() as u64;
                    // 获取上传后的新 SHA
                    let new_sha = provider
                        .get_file_sha(&remote_file_path)
                        .await
                        .ok()
                        .flatten();

                    new_entries.insert(
                        rel_path.clone(),
                        SyncFileEntry {
                            md5: md5.clone(),
                            remote_sha: new_sha,
                            size: file_size,
                            synced_at: chrono::Utc::now().to_rfc3339(),
                            status: "synced".to_string(),
                        },
                    );
                    files_processed += 1;

                    // 单文件上传成功事件
                    Self::emit_progress(
                        &app,
                        &SyncProgress {
                            repo_id: config.id.clone(),
                            phase: "file_done".to_string(),
                            current: files_processed,
                            total,
                            current_file: rel_path.clone(),
                            message: None,
                        },
                    );
                }
                Err(_e) => {
                    files_failed += 1;
                    new_entries.insert(
                        rel_path.clone(),
                        SyncFileEntry {
                            md5: md5.clone(),
                            remote_sha: None,
                            size: 0,
                            synced_at: chrono::Utc::now().to_rfc3339(),
                            status: "error".to_string(),
                        },
                    );

                    // 单文件上传失败事件
                    Self::emit_progress(
                        &app,
                        &SyncProgress {
                            repo_id: config.id.clone(),
                            phase: "file_failed".to_string(),
                            current: files_processed,
                            total,
                            current_file: rel_path.clone(),
                            message: Some(format!("上传失败: {}", _e)),
                        },
                    );
                }
            }

            // 实时写入清单
            let manifest = SyncManifest {
                repo_config: SyncManifestRepoConfig {
                    platform: config.platform.clone(),
                    owner: config.owner.clone(),
                    repo: config.repo.clone(),
                    config_id: config.id.clone(),
                },
                branch: branch.clone(),
                include_patterns: include_patterns.clone(),
                exclude_patterns: exclude_patterns.clone(),
                last_sync_at: Some(chrono::Utc::now().to_rfc3339()),
                sync_direction: "push".to_string(),
                file_entries: new_entries.clone(),
            };
            let _ = ManifestService::write_manifest(&request.local_path, &manifest);
        }

        // 7. 删除远程上已在本地删除的文件
        // 找出清单中有但本地已不存在的文件（仅在已有清单时才执行）
        let local_paths: std::collections::HashSet<&String> =
            local_files.iter().map(|(rel, _)| rel).collect();
        let files_to_delete: Vec<String> = new_entries
            .keys()
            .filter(|k| !local_paths.contains(k))
            .filter(|k| Self::should_include_file(k, &include_patterns, &exclude_patterns))
            .cloned()
            .collect();

        let delete_total = files_to_delete.len();
        let mut files_deleted = 0;

        if !files_to_delete.is_empty() {
            Self::emit_progress(
                &app,
                &SyncProgress {
                    repo_id: config.id.clone(),
                    phase: "uploading".to_string(),
                    current: 0,
                    total: delete_total,
                    current_file: String::new(),
                    message: Some(format!("正在删除远程文件 (共 {} 个)...", delete_total)),
                },
            );

            for (idx, rel_path) in files_to_delete.iter().enumerate() {
                Self::emit_progress(
                    &app,
                    &SyncProgress {
                        repo_id: config.id.clone(),
                        phase: "uploading".to_string(),
                        current: idx + 1,
                        total: delete_total,
                        current_file: rel_path.clone(),
                        message: None,
                    },
                );

                // 获取远程文件 SHA（删除时需要）
                let sha = match provider.get_file_sha(rel_path).await {
                    Ok(Some(sha)) => sha,
                    Ok(None) => {
                        // 远程文件已不存在，直接从清单中移除即可
                        new_entries.remove(rel_path);
                        files_deleted += 1;
                        Self::emit_progress(
                            &app,
                            &SyncProgress {
                                repo_id: config.id.clone(),
                                phase: "file_done".to_string(),
                                current: files_deleted,
                                total: delete_total,
                                current_file: rel_path.clone(),
                                message: None,
                            },
                        );
                        continue;
                    }
                    Err(_e) => {
                        files_failed += 1;
                        Self::emit_progress(
                            &app,
                            &SyncProgress {
                                repo_id: config.id.clone(),
                                phase: "file_failed".to_string(),
                                current: files_deleted,
                                total: delete_total,
                                current_file: rel_path.clone(),
                                message: Some(format!("获取文件SHA失败: {}", _e)),
                            },
                        );
                        continue;
                    }
                };

                let message = format!(
                    "sync: {} - delete {}",
                    chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                    rel_path
                );

                match provider.delete_file(rel_path, &sha, &message).await {
                    Ok(()) => {
                        // 从清单中移除已删除文件的条目
                        new_entries.remove(rel_path);
                        files_deleted += 1;
                        files_processed += 1;

                        Self::emit_progress(
                            &app,
                            &SyncProgress {
                                repo_id: config.id.clone(),
                                phase: "file_done".to_string(),
                                current: files_deleted,
                                total: delete_total,
                                current_file: rel_path.clone(),
                                message: None,
                            },
                        );
                    }
                    Err(_e) => {
                        files_failed += 1;

                        Self::emit_progress(
                            &app,
                            &SyncProgress {
                                repo_id: config.id.clone(),
                                phase: "file_failed".to_string(),
                                current: files_deleted,
                                total: delete_total,
                                current_file: rel_path.clone(),
                                message: Some(format!("删除远程文件失败: {}", _e)),
                            },
                        );
                    }
                }

                // 每次删除后实时更新清单
                let manifest = SyncManifest {
                    repo_config: SyncManifestRepoConfig {
                        platform: config.platform.clone(),
                        owner: config.owner.clone(),
                        repo: config.repo.clone(),
                        config_id: config.id.clone(),
                    },
                    branch: branch.clone(),
                    include_patterns: include_patterns.clone(),
                    exclude_patterns: exclude_patterns.clone(),
                    last_sync_at: Some(chrono::Utc::now().to_rfc3339()),
                    sync_direction: "push".to_string(),
                    file_entries: new_entries.clone(),
                };
                let _ = ManifestService::write_manifest(&request.local_path, &manifest);
            }
        }

        // 8. 发送完成进度
        let files_skipped = local_files.len() - total;
        Self::emit_progress(
            &app,
            &SyncProgress {
                repo_id: config.id.clone(),
                phase: "completed".to_string(),
                current: total + delete_total,
                total: total + delete_total,
                current_file: String::new(),
                message: Some(format!(
                    "推送完成: {} 文件已上传, {} 文件已删除, {} 跳过, {} 失败",
                    files_processed - files_deleted,
                    files_deleted,
                    files_skipped,
                    files_failed
                )),
            },
        );

        Ok(SyncResult {
            success: files_failed == 0,
            operation: "push".to_string(),
            files_processed,
            files_skipped,
            files_failed,
            error_message: if files_failed > 0 {
                Some(format!("{} 个文件推送失败", files_failed))
            } else {
                None
            },
        })
    }

    /// 执行差异对比
    ///
    /// `include_patterns` / `exclude_patterns` 为可选项：
    /// - 传入 `Some` 时优先使用调用方提供的过滤条件（用于推送弹窗中实时调整过滤后重新扫描）
    /// - 传入 `None` 时回退到清单中持久化的过滤条件
    ///
    /// 首次推送场景（无 manifest）：
    /// - 必须由调用方提供 `include_patterns` / `exclude_patterns`
    /// - 所有匹配的本地文件均视为 `added`，`modified` / `deleted` / `unchanged` 为空
    pub async fn diff(
        local_path: &str,
        include_patterns: Option<Vec<String>>,
        exclude_patterns: Option<Vec<String>>,
    ) -> AppResult<DiffResult> {
        let manifest_opt = ManifestService::read_manifest(local_path)?;

        // 首次推送：无 manifest 时，所有匹配文件均为新增
        if manifest_opt.is_none() {
            let effective_include = include_patterns
                .ok_or_else(|| AppError::Config("首次扫描需要提供白名单过滤条件".to_string()))?;
            let effective_exclude = exclude_patterns.unwrap_or_default();

            let local_files = FileHashService::scan_local_files(
                local_path,
                &effective_include,
                &effective_exclude,
            )?;

            let added: Vec<String> = local_files.into_iter().map(|(rel, _)| rel).collect();

            return Ok(DiffResult {
                added,
                modified: Vec::new(),
                deleted: Vec::new(),
                unchanged: Vec::new(),
            });
        }

        let manifest = manifest_opt.unwrap();

        // 优先使用调用方传入的过滤条件，未传则回退到清单中的过滤条件
        let effective_include =
            include_patterns.unwrap_or_else(|| manifest.include_patterns.clone());
        let effective_exclude =
            exclude_patterns.unwrap_or_else(|| manifest.exclude_patterns.clone());

        let local_files =
            FileHashService::scan_local_files(local_path, &effective_include, &effective_exclude)?;

        let mut added = Vec::new();
        let mut modified = Vec::new();
        let mut unchanged = Vec::new();

        // 对比本地文件与清单
        for (rel_path, abs_path) in &local_files {
            match manifest.file_entries.get(rel_path) {
                Some(entry) => {
                    let current_md5 = FileHashService::compute_md5(abs_path)?;
                    if current_md5 != entry.md5 {
                        modified.push(rel_path.clone());
                    } else {
                        unchanged.push(rel_path.clone());
                    }
                }
                None => {
                    added.push(rel_path.clone());
                }
            }
        }

        // 找出被删除的文件（清单中有但本地没有）
        // 注意：若清单条目在新的过滤条件下已被排除（例如用户新增了黑名单匹配），
        // 不应将其计入 deleted，否则会误报"用户没有删除的文件被标记为待删除"
        let local_paths: std::collections::HashSet<&String> =
            local_files.iter().map(|(rel, _)| rel).collect();
        let deleted: Vec<String> = manifest
            .file_entries
            .keys()
            .filter(|k| !local_paths.contains(k))
            .filter(|k| Self::should_include_file(k, &effective_include, &effective_exclude))
            .cloned()
            .collect();

        Ok(DiffResult {
            added,
            modified,
            deleted,
            unchanged,
        })
    }

    /// 递归获取远程文件列表（使用 Box::pin 避免无限大小 future）
    fn get_remote_files_recursive<'a>(
        provider: &'a dyn RemoteProvider,
        path: Option<&'a str>,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = AppResult<Vec<RemoteEntry>>> + Send + 'a>>
    {
        Box::pin(async move {
            let entries = provider.get_tree(path).await?;
            let mut all_files = Vec::new();

            for entry in entries {
                if entry.entry_type == "dir" {
                    // 递归获取子目录
                    let sub_entries =
                        Self::get_remote_files_recursive(provider, Some(&entry.path)).await?;
                    all_files.extend(sub_entries);
                } else {
                    all_files.push(entry);
                }
            }

            Ok(all_files)
        })
    }

    /// 判断文件是否应该包含在同步范围内（glob 过滤）
    fn should_include_file(
        path: &str,
        include_patterns: &[String],
        exclude_patterns: &[String],
    ) -> bool {
        use glob::Pattern;

        // 白名单检查
        if !include_patterns.is_empty() {
            let included = include_patterns.iter().any(|pattern| {
                Pattern::new(pattern)
                    .map(|p| p.matches(path))
                    .unwrap_or(false)
            });
            if !included {
                return false;
            }
        }

        // 黑名单检查
        let excluded = exclude_patterns.iter().any(|pattern| {
            Pattern::new(pattern)
                .map(|p| p.matches(path))
                .unwrap_or(false)
        });

        !excluded
    }
}

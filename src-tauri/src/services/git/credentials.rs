// HTTPS 凭据存储：{data_dir}/com.lanis.md/git-credentials.json
//
// 仅在远程地址为 HTTP(S) 且命中域名时，通过临时 credential.helper 注入，
// SSH 地址及未配置凭据的域名完全交给系统 git（ssh-agent / 钥匙串 / credential helper）。
//
// @changelog
// | 版本   | 变更说明                                   | 关联                         |
// | v1.0.0 | 初始实现：凭据 CRUD + 旧同步配置 Token 迁移 | REQ: Git 改造 TECH: 凭据注入 |
// /@changelog
//
// @author hhhuilli

use std::fs;
use std::path::PathBuf;

use serde::Deserialize;

use super::types::{GitCredential, GitCredentialView, SaveCredentialRequest};
use crate::error::{AppError, AppResult};

pub struct CredentialStore;

/// 旧版同步配置中迁移所需的字段
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySyncRepo {
    platform: String,
    token: String,
    owner: String,
}

impl CredentialStore {
    fn app_dir() -> AppResult<PathBuf> {
        let data_dir =
            dirs::data_dir().ok_or_else(|| AppError::Config("无法获取系统数据目录".to_string()))?;
        Ok(data_dir.join("com.lanis.md"))
    }

    fn file_path() -> AppResult<PathBuf> {
        Ok(Self::app_dir()?.join("git-credentials.json"))
    }

    /// 读取全部凭据；首次读取时尝试从旧版 sync-repos.json 迁移
    pub fn load() -> AppResult<Vec<GitCredential>> {
        let path = Self::file_path()?;
        if !path.exists() {
            let migrated = Self::migrate_legacy().unwrap_or_default();
            Self::write(&migrated)?;
            return Ok(migrated);
        }
        let content = fs::read_to_string(&path)
            .map_err(|e| AppError::Config(format!("读取凭据文件失败: {}", e)))?;
        serde_json::from_str(&content)
            .map_err(|e| AppError::Config(format!("解析凭据文件失败: {}", e)))
    }

    fn write(list: &[GitCredential]) -> AppResult<()> {
        let dir = Self::app_dir()?;
        if !dir.exists() {
            fs::create_dir_all(&dir)
                .map_err(|e| AppError::Config(format!("创建配置目录失败: {}", e)))?;
        }
        let content = serde_json::to_string_pretty(list)
            .map_err(|e| AppError::Config(format!("序列化凭据失败: {}", e)))?;
        fs::write(Self::file_path()?, content)
            .map_err(|e| AppError::Config(format!("写入凭据文件失败: {}", e)))
    }

    /// 旧版「远程同步」使用 GitHub/Gitee API + Token，迁移为对应域名的 HTTPS 凭据。
    /// 迁移后将旧文件重命名为 .migrated，避免重复迁移。
    fn migrate_legacy() -> AppResult<Vec<GitCredential>> {
        let legacy_path = Self::app_dir()?.join("sync-repos.json");
        if !legacy_path.exists() {
            return Ok(Vec::new());
        }
        let content = fs::read_to_string(&legacy_path)?;
        let repos: Vec<LegacySyncRepo> = serde_json::from_str(&content).unwrap_or_default();
        let now = chrono::Utc::now().to_rfc3339();
        let mut result: Vec<GitCredential> = Vec::new();
        for repo in repos {
            if repo.token.is_empty() {
                continue;
            }
            let host = match repo.platform.as_str() {
                "github" => "github.com",
                "gitee" => "gitee.com",
                _ => continue,
            };
            let exists = result
                .iter()
                .any(|c| c.host == host && c.username == repo.owner);
            if exists {
                continue;
            }
            result.push(GitCredential {
                id: uuid::Uuid::new_v4().to_string(),
                host: host.to_string(),
                username: repo.owner.clone(),
                token: repo.token.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            });
        }
        let _ = fs::rename(&legacy_path, legacy_path.with_extension("json.migrated"));
        Ok(result)
    }

    pub fn list_views() -> AppResult<Vec<GitCredentialView>> {
        Ok(Self::load()?
            .into_iter()
            .map(|c| GitCredentialView {
                has_token: !c.token.is_empty(),
                id: c.id,
                host: c.host,
                username: c.username,
                updated_at: c.updated_at,
            })
            .collect())
    }

    pub fn save(req: SaveCredentialRequest) -> AppResult<GitCredentialView> {
        let host = normalize_host(&req.host);
        if host.is_empty() {
            return Err(AppError::Config("域名不能为空".to_string()));
        }
        let mut list = Self::load()?;
        let now = chrono::Utc::now().to_rfc3339();
        let saved = match req
            .id
            .as_ref()
            .and_then(|id| list.iter_mut().find(|c| &c.id == id))
        {
            Some(existing) => {
                existing.host = host;
                existing.username = req.username.trim().to_string();
                if let Some(token) = req.token.filter(|t| !t.is_empty()) {
                    existing.token = token;
                }
                existing.updated_at = now;
                existing.clone()
            }
            None => {
                let token = req.token.unwrap_or_default();
                if token.is_empty() {
                    return Err(AppError::Config("访问令牌不能为空".to_string()));
                }
                let cred = GitCredential {
                    id: uuid::Uuid::new_v4().to_string(),
                    host,
                    username: req.username.trim().to_string(),
                    token,
                    created_at: now.clone(),
                    updated_at: now,
                };
                list.push(cred.clone());
                cred
            }
        };
        Self::write(&list)?;
        Ok(GitCredentialView {
            has_token: !saved.token.is_empty(),
            id: saved.id,
            host: saved.host,
            username: saved.username,
            updated_at: saved.updated_at,
        })
    }

    pub fn delete(id: &str) -> AppResult<()> {
        let mut list = Self::load()?;
        list.retain(|c| c.id != id);
        Self::write(&list)
    }

    /// 根据远程地址查找凭据：仅 HTTP(S) 地址生效，优先匹配 URL 中携带的用户名
    pub fn find_for_url(url: &str) -> Option<GitCredential> {
        let (user, host) = parse_http_url(url)?;
        let list = Self::load().ok()?;
        let mut candidates = list
            .into_iter()
            .filter(|c| c.host.eq_ignore_ascii_case(&host) && !c.token.is_empty());
        match user {
            Some(u) => {
                let all: Vec<GitCredential> = candidates.collect();
                all.iter()
                    .find(|c| c.username == u)
                    .cloned()
                    .or_else(|| all.into_iter().next())
            }
            None => candidates.next(),
        }
    }
}

/// 去掉协议、路径与用户名，只保留 host[:port]
fn normalize_host(input: &str) -> String {
    let s = input.trim();
    let s = s.split("://").last().unwrap_or(s);
    let s = s.split('/').next().unwrap_or(s);
    let s = s.rsplit('@').next().unwrap_or(s);
    s.to_lowercase()
}

/// 解析 http(s)://[user@]host[:port]/path，返回 (user, host[:port])
fn parse_http_url(url: &str) -> Option<(Option<String>, String)> {
    let lower = url.to_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return None;
    }
    let rest = url.split("://").nth(1)?;
    let authority = rest.split('/').next()?;
    let (user, host) = match authority.rsplit_once('@') {
        Some((u, h)) => (Some(u.split(':').next().unwrap_or(u).to_string()), h),
        None => (None, authority),
    };
    Some((user, host.to_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_http_urls() {
        assert_eq!(
            parse_http_url("https://github.com/a/b.git"),
            Some((None, "github.com".to_string()))
        );
        assert_eq!(
            parse_http_url("https://bob@Git.Example.com:8443/a/b"),
            Some((Some("bob".to_string()), "git.example.com:8443".to_string()))
        );
        assert_eq!(parse_http_url("git@github.com:a/b.git"), None);
    }

    #[test]
    fn normalize_hosts() {
        assert_eq!(normalize_host("https://GitHub.com/x"), "github.com");
        assert_eq!(normalize_host("u@gitee.com"), "gitee.com");
    }
}

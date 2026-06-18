// GitHub REST API 封装

use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;

use super::types::RemoteEntry;
use crate::error::{AppError, AppResult};

/// GitHub API 允许的域名白名单
const GITHUB_API_BASE: &str = "https://api.github.com";

/// RemoteProvider Trait: 远程仓库操作抽象
#[async_trait]
pub trait RemoteProvider: Send + Sync {
    /// 测试连接
    async fn test_connection(&self) -> AppResult<bool>;

    /// 获取远程目录树
    async fn get_tree(&self, path: Option<&str>) -> AppResult<Vec<RemoteEntry>>;

    /// 获取单个文件内容（原始字节）
    async fn get_file_content(&self, path: &str) -> AppResult<Vec<u8>>;

    /// 获取文件的 SHA（用于更新 API）
    async fn get_file_sha(&self, path: &str) -> AppResult<Option<String>>;

    /// 创建或更新单个文件，返回新文件的 SHA
    async fn put_file(
        &self,
        path: &str,
        content: &[u8],
        sha: Option<&str>,
        message: &str,
    ) -> AppResult<Option<String>>;

    /// 删除文件
    async fn delete_file(&self, path: &str, sha: &str, message: &str) -> AppResult<()>;

    /// 获取分支列表
    async fn list_branches(&self) -> AppResult<Vec<String>>;
}

/// GitHub API 响应：目录内容项
#[derive(Debug, Deserialize)]
struct GitHubContentItem {
    name: String,
    path: String,
    #[serde(rename = "type")]
    item_type: String,
    size: Option<u64>,
    sha: String,
    content: Option<String>,
}

/// GitHub API 响应：分支
#[derive(Debug, Deserialize)]
struct GitHubBranch {
    name: String,
}

/// GitHub 远程仓库 Provider
pub struct GitHubProvider {
    client: Client,
    token: String,
    owner: String,
    repo: String,
    branch: String,
}

impl GitHubProvider {
    /// 创建 GitHub Provider 实例
    pub fn new(token: &str, owner: &str, repo: &str, branch: &str) -> Self {
        let client = Client::builder()
            .user_agent("LanisMD/1.0")
            .build()
            .expect("Failed to build HTTP client");

        Self {
            client,
            token: token.to_string(),
            owner: owner.to_string(),
            repo: repo.to_string(),
            branch: branch.to_string(),
        }
    }

    /// 构建 API URL（限制只允许 api.github.com 域名，防止 SSRF）
    fn api_url(&self, endpoint: &str) -> String {
        format!(
            "{}/repos/{}/{}/{}",
            GITHUB_API_BASE, self.owner, self.repo, endpoint
        )
    }

    /// 构建通用请求 headers
    fn auth_headers(&self) -> Vec<(&str, String)> {
        vec![
            ("Authorization", format!("Bearer {}", self.token)),
            ("Accept", "application/vnd.github.v3+json".to_string()),
            ("X-GitHub-Api-Version", "2022-11-28".to_string()),
        ]
    }
}

#[async_trait]
impl RemoteProvider for GitHubProvider {
    async fn test_connection(&self) -> AppResult<bool> {
        let url = format!("{}/repos/{}/{}", GITHUB_API_BASE, self.owner, self.repo);
        let mut request = self.client.get(&url);
        for (key, value) in self.auth_headers() {
            request = request.header(key, value);
        }

        let response = request
            .send()
            .await
            .map_err(|e| AppError::Config(format!("GitHub 连接测试失败: {}", e)))?;

        Ok(response.status().is_success())
    }

    async fn get_tree(&self, path: Option<&str>) -> AppResult<Vec<RemoteEntry>> {
        let endpoint = match path {
            Some(p) => format!("contents/{}?ref={}", p, self.branch),
            None => format!("contents?ref={}", self.branch),
        };
        let url = self.api_url(&endpoint);

        let mut request = self.client.get(&url);
        for (key, value) in self.auth_headers() {
            request = request.header(key, value);
        }

        let response = request
            .send()
            .await
            .map_err(|e| AppError::Config(format!("获取目录树失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Config(format!(
                "GitHub API 错误 ({}): {}",
                status, body
            )));
        }

        let items: Vec<GitHubContentItem> = response
            .json()
            .await
            .map_err(|e| AppError::Config(format!("解析目录树响应失败: {}", e)))?;

        let entries = items
            .into_iter()
            .map(|item| RemoteEntry {
                name: item.name,
                path: item.path,
                entry_type: item.item_type,
                size: item.size.unwrap_or(0),
                sha: Some(item.sha),
            })
            .collect();

        Ok(entries)
    }

    async fn get_file_content(&self, path: &str) -> AppResult<Vec<u8>> {
        let url = self.api_url(&format!("contents/{}?ref={}", path, self.branch));
        let mut request = self.client.get(&url);
        for (key, value) in self.auth_headers() {
            request = request.header(key, value);
        }

        let response = request
            .send()
            .await
            .map_err(|e| AppError::Config(format!("获取文件内容失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Config(format!(
                "GitHub API 错误 ({}): {}",
                status, body
            )));
        }

        let item: GitHubContentItem = response
            .json()
            .await
            .map_err(|e| AppError::Config(format!("解析文件内容响应失败: {}", e)))?;

        let content_b64 = item
            .content
            .ok_or_else(|| AppError::Config("文件内容为空".to_string()))?;

        // GitHub 返回的 Base64 内容包含换行符，需要清理
        let cleaned = content_b64.replace('\n', "").replace('\r', "");
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&cleaned)
            .map_err(|e| AppError::Config(format!("Base64 解码失败: {}", e)))?;

        Ok(bytes)
    }

    async fn get_file_sha(&self, path: &str) -> AppResult<Option<String>> {
        let url = self.api_url(&format!("contents/{}?ref={}", path, self.branch));
        let mut request = self.client.get(&url);
        for (key, value) in self.auth_headers() {
            request = request.header(key, value);
        }

        let response = request
            .send()
            .await
            .map_err(|e| AppError::Config(format!("获取文件 SHA 失败: {}", e)))?;

        if response.status().as_u16() == 404 {
            return Ok(None);
        }

        if !response.status().is_success() {
            // 非成功状态码视为文件不存在（兼容空仓库等返回非标准响应的场景）
            return Ok(None);
        }

        // 尝试解析 JSON；如果响应体不是合法 JSON，视为文件不存在而非致命错误
        let body_text = response.text().await.unwrap_or_default();
        match serde_json::from_str::<GitHubContentItem>(&body_text) {
            Ok(item) => Ok(Some(item.sha)),
            Err(_) => Ok(None),
        }
    }

    async fn put_file(
        &self,
        path: &str,
        content: &[u8],
        sha: Option<&str>,
        message: &str,
    ) -> AppResult<Option<String>> {
        let url = self.api_url(&format!("contents/{}", path));

        use base64::Engine;
        let content_b64 = base64::engine::general_purpose::STANDARD.encode(content);

        let mut body = serde_json::json!({
            "message": message,
            "content": content_b64,
            "branch": self.branch,
        });

        if let Some(sha_val) = sha {
            body["sha"] = serde_json::Value::String(sha_val.to_string());
        }

        let mut request = self.client.put(&url);
        for (key, value) in self.auth_headers() {
            request = request.header(key, value);
        }
        request = request.json(&body);

        let response = request
            .send()
            .await
            .map_err(|e| AppError::Config(format!("上传文件失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let resp_body = response.text().await.unwrap_or_default();
            return Err(AppError::Config(format!(
                "GitHub 上传文件失败 ({}): {}",
                status, resp_body
            )));
        }

        // 从响应中提取新文件的 SHA
        let resp_text = response.text().await.unwrap_or_default();
        let new_sha = serde_json::from_str::<serde_json::Value>(&resp_text)
            .ok()
            .and_then(|v| v["content"]["sha"].as_str().map(|s| s.to_string()));

        Ok(new_sha)
    }

    async fn delete_file(&self, path: &str, sha: &str, message: &str) -> AppResult<()> {
        let url = self.api_url(&format!("contents/{}", path));

        let body = serde_json::json!({
            "message": message,
            "sha": sha,
            "branch": self.branch,
        });

        let mut request = self.client.delete(&url);
        for (key, value) in self.auth_headers() {
            request = request.header(key, value);
        }
        request = request.json(&body);

        let response = request
            .send()
            .await
            .map_err(|e| AppError::Config(format!("删除文件失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let resp_body = response.text().await.unwrap_or_default();
            return Err(AppError::Config(format!(
                "GitHub 删除文件失败 ({}): {}",
                status, resp_body
            )));
        }

        Ok(())
    }

    async fn list_branches(&self) -> AppResult<Vec<String>> {
        let url = self.api_url("branches?per_page=100");
        let mut request = self.client.get(&url);
        for (key, value) in self.auth_headers() {
            request = request.header(key, value);
        }

        let response = request
            .send()
            .await
            .map_err(|e| AppError::Config(format!("获取分支列表失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Config(format!(
                "GitHub API 错误 ({}): {}",
                status, body
            )));
        }

        let branches: Vec<GitHubBranch> = response
            .json()
            .await
            .map_err(|e| AppError::Config(format!("解析分支列表响应失败: {}", e)))?;

        Ok(branches.into_iter().map(|b| b.name).collect())
    }
}

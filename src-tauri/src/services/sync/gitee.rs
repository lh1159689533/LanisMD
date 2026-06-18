// Gitee API v5 封装

use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;

use super::github::RemoteProvider;
use super::types::RemoteEntry;
use crate::error::{AppError, AppResult};

/// Gitee API 允许的域名白名单
const GITEE_API_BASE: &str = "https://gitee.com/api/v5";

/// Gitee API 响应：目录内容项
#[derive(Debug, Deserialize)]
struct GiteeContentItem {
    name: String,
    path: String,
    #[serde(rename = "type")]
    item_type: String,
    size: Option<u64>,
    sha: String,
    content: Option<String>,
}

/// Gitee API 响应：分支
#[derive(Debug, Deserialize)]
struct GiteeBranch {
    name: String,
}

/// Gitee 远程仓库 Provider
pub struct GiteeProvider {
    client: Client,
    token: String,
    owner: String,
    repo: String,
    branch: String,
}

impl GiteeProvider {
    /// 创建 Gitee Provider 实例
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

    /// 构建 API URL（限制只允许 gitee.com 域名，防止 SSRF）
    fn api_url(&self, endpoint: &str) -> String {
        format!(
            "{}/repos/{}/{}/{}",
            GITEE_API_BASE, self.owner, self.repo, endpoint
        )
    }
}

#[async_trait]
impl RemoteProvider for GiteeProvider {
    async fn test_connection(&self) -> AppResult<bool> {
        let url = format!(
            "{}/repos/{}/{}?access_token={}",
            GITEE_API_BASE, self.owner, self.repo, self.token
        );

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::Config(format!("Gitee 连接测试失败: {}", e)))?;

        Ok(response.status().is_success())
    }

    async fn get_tree(&self, path: Option<&str>) -> AppResult<Vec<RemoteEntry>> {
        let endpoint = match path {
            Some(p) => format!(
                "contents/{}?access_token={}&ref={}",
                p, self.token, self.branch
            ),
            None => format!("contents?access_token={}&ref={}", self.token, self.branch),
        };
        let url = self.api_url(&endpoint);

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::Config(format!("获取目录树失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Config(format!(
                "Gitee API 错误 ({}): {}",
                status, body
            )));
        }

        let items: Vec<GiteeContentItem> = response
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
        let url = self.api_url(&format!(
            "contents/{}?access_token={}&ref={}",
            path, self.token, self.branch
        ));

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::Config(format!("获取文件内容失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Config(format!(
                "Gitee API 错误 ({}): {}",
                status, body
            )));
        }

        let item: GiteeContentItem = response
            .json()
            .await
            .map_err(|e| AppError::Config(format!("解析文件内容响应失败: {}", e)))?;

        let content_b64 = item
            .content
            .ok_or_else(|| AppError::Config("文件内容为空".to_string()))?;

        // 清理 Base64 中的换行符
        let cleaned = content_b64.replace('\n', "").replace('\r', "");
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&cleaned)
            .map_err(|e| AppError::Config(format!("Base64 解码失败: {}", e)))?;

        Ok(bytes)
    }

    async fn get_file_sha(&self, path: &str) -> AppResult<Option<String>> {
        let url = self.api_url(&format!(
            "contents/{}?access_token={}&ref={}",
            path, self.token, self.branch
        ));

        let response = self
            .client
            .get(&url)
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

        // 尝试解析 JSON；如果响应体不是合法 JSON（空仓库可能返回非标准格式），
        // 视为文件不存在而非致命错误
        let body_text = response.text().await.unwrap_or_default();
        match serde_json::from_str::<GiteeContentItem>(&body_text) {
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
            "access_token": self.token,
            "message": message,
            "content": content_b64,
            "branch": self.branch,
        });

        if let Some(sha_val) = sha {
            body["sha"] = serde_json::Value::String(sha_val.to_string());
        }

        // Gitee 创建文件用 POST，更新文件用 PUT
        let response = if sha.is_some() {
            self.client.put(&url).json(&body).send().await
        } else {
            self.client.post(&url).json(&body).send().await
        };

        let response = response.map_err(|e| AppError::Config(format!("上传文件失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let resp_body = response.text().await.unwrap_or_default();
            return Err(AppError::Config(format!(
                "Gitee 上传文件失败 ({}): {}",
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
            "access_token": self.token,
            "message": message,
            "sha": sha,
            "branch": self.branch,
        });

        let response = self
            .client
            .delete(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Config(format!("删除文件失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let resp_body = response.text().await.unwrap_or_default();
            return Err(AppError::Config(format!(
                "Gitee 删除文件失败 ({}): {}",
                status, resp_body
            )));
        }

        Ok(())
    }

    async fn list_branches(&self) -> AppResult<Vec<String>> {
        let url = self.api_url(&format!(
            "branches?access_token={}&per_page=100",
            self.token
        ));

        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| AppError::Config(format!("获取分支列表失败: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Config(format!(
                "Gitee API 错误 ({}): {}",
                status, body
            )));
        }

        let branches: Vec<GiteeBranch> = response
            .json()
            .await
            .map_err(|e| AppError::Config(format!("解析分支列表响应失败: {}", e)))?;

        Ok(branches.into_iter().map(|b| b.name).collect())
    }
}

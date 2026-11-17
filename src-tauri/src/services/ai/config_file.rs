//! AI 模型配置文件读写
//!
//! 文件路径：`{data_dir}/com.lanis.md/ai-providers.json`
//!
//! 格式（v3，一条配置 = 一个模型）：
//! ```json
//! {
//!   "version": 3,
//!   "current": "<当前使用的配置 id>",
//!   "models": [
//!     { "id": "...", "kind": "openai", "name": "OpenAI", "baseUrl": "https://api.openai.com/v1",
//!       "model": "gpt-4o-mini", "keySource": "env", "envVar": "OPENAI_API_KEY" }
//!   ]
//! }
//! ```
//! v1 / v2（按服务商 + 模型列表组织）在首次读取时自动迁移，原文件备份为 `ai-providers.v2.bak.json`。
//!
//! 安全约束：
//! - 本地保存的 Key 只存在此文件中，不打印到日志，也不返回给前端（前端只拿到 hasLocalKey / keyReady）

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::models::ai::{KeySource, ModelKind};
use crate::services::ai::error::AiError;
use crate::services::ai::key_resolver::{is_valid_env_name, resolve_key};
use crate::services::ai::legacy;

/// 配置文件名（沿用旧文件名，"打开配置目录"等行为不变）
const CONFIG_FILE_NAME: &str = "ai-providers.json";
/// 迁移前旧文件的备份名
const LEGACY_BACKUP_NAME: &str = "ai-providers.v2.bak.json";
/// 当前配置文件版本
pub const CONFIG_VERSION: u32 = 3;

fn is_zero(v: &u64) -> bool {
    *v == 0
}

/// 单个模型配置
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    /// 唯一 id
    pub id: String,
    /// 模型类型（决定协议与参数差异）
    pub kind: ModelKind,
    /// 显示名称
    pub name: String,
    /// 基础 URL
    pub base_url: String,
    /// 模型 ID（API 侧）
    pub model: String,
    /// 密钥来源
    #[serde(default)]
    pub key_source: KeySource,
    /// 本地保存的密钥（keySource = local 时有效）
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub api_key: String,
    /// 环境变量名（keySource = env 时有效）
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub env_var: String,
    /// 上下文窗口（tokens），0 表示未声明（仅配置文件可填，用于长文档上下文裁剪）
    #[serde(default, skip_serializing_if = "is_zero")]
    pub context_length: u64,
    /// 高级：合并进每次请求体的额外字段（仅配置文件可填）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_body: Option<Value>,
    /// 高级：仅合并进「测试连接」请求体的额外字段（仅配置文件可填）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub test_extra_body: Option<Value>,
}

/// 配置文件结构
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AiConfigFile {
    pub version: u32,
    #[serde(default)]
    pub current: String,
    #[serde(default)]
    pub models: Vec<ModelProfile>,
}

/// 返回给前端的模型视图（不含 Key 原文）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelView {
    pub id: String,
    pub kind: ModelKind,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub key_source: KeySource,
    pub env_var: String,
    /// 本地是否已保存密钥
    pub has_local_key: bool,
    /// 密钥是否可用（按当前来源实际解析）
    pub key_ready: bool,
    pub context_length: u64,
}

impl From<&ModelProfile> for ModelView {
    fn from(p: &ModelProfile) -> Self {
        Self {
            id: p.id.clone(),
            kind: p.kind,
            name: p.name.clone(),
            base_url: p.base_url.clone(),
            model: p.model.clone(),
            key_source: p.key_source,
            env_var: p.env_var.clone(),
            has_local_key: !p.api_key.trim().is_empty(),
            key_ready: resolve_key(p).is_ok(),
            context_length: p.context_length,
        }
    }
}

/// 返回给前端的配置快照
#[derive(Debug, Serialize)]
pub struct ConfigView {
    pub current: String,
    pub models: Vec<ModelView>,
}

/// 前端保存（新增 / 编辑）模型时提交的数据
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDraft {
    /// 为空表示新增
    pub id: Option<String>,
    pub kind: ModelKind,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub key_source: KeySource,
    /// 新密钥；为空表示保持原值不变
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub env_var: String,
}

// ---------------------------------------------------------------------------
// 文件 IO
// ---------------------------------------------------------------------------

fn io_err(action: &str, e: impl std::fmt::Display) -> AiError {
    AiError::Unknown(format!("{}失败：{}", action, e))
}

fn config_dir() -> Result<PathBuf, AiError> {
    let data_dir =
        dirs::data_dir().ok_or_else(|| AiError::Unknown("无法获取应用数据目录".into()))?;
    Ok(data_dir.join("com.lanis.md"))
}

fn write_config(config: &AiConfigFile) -> Result<(), AiError> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|e| io_err("创建配置目录", e))?;
    let json = serde_json::to_string_pretty(config).map_err(|e| io_err("序列化配置", e))?;
    fs::write(dir.join(CONFIG_FILE_NAME), json).map_err(|e| io_err("写入配置文件", e))
}

/// 读取配置；文件不存在时返回空配置，旧版本自动迁移并写回
pub fn read_config() -> Result<AiConfigFile, AiError> {
    let path = config_dir()?.join(CONFIG_FILE_NAME);
    if !path.exists() {
        return Ok(AiConfigFile {
            version: CONFIG_VERSION,
            ..AiConfigFile::default()
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| io_err("读取配置文件", e))?;
    let root: Value = serde_json::from_str(&content).map_err(|e| io_err("解析配置文件", e))?;

    let version = root.get("version").and_then(Value::as_u64).unwrap_or(1) as u32;
    if version >= CONFIG_VERSION {
        return serde_json::from_value(root).map_err(|e| io_err("解析配置文件", e));
    }

    // 旧格式：先备份原文件再迁移，避免迁移逻辑有误时丢失用户的 Key
    fs::write(path.with_file_name(LEGACY_BACKUP_NAME), &content)
        .map_err(|e| io_err("备份旧配置文件", e))?;
    let migrated = legacy::migrate(&root)?;
    write_config(&migrated)?;
    Ok(migrated)
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

/// 按 id 查找模型配置
pub fn find_profile(id: &str) -> Result<ModelProfile, AiError> {
    read_config()?
        .models
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| AiError::Unknown("未找到该模型配置，可能已被删除".into()))
}

/// 配置快照（前端视图）
pub fn read_config_view() -> Result<ConfigView, AiError> {
    let config = read_config()?;
    Ok(ConfigView {
        current: config.current.clone(),
        models: config.models.iter().map(ModelView::from).collect(),
    })
}

/// 校验并规整草稿
fn validate(draft: &ModelDraft) -> Result<(), AiError> {
    let invalid = |msg: &str| Err(AiError::Unknown(msg.into()));
    if draft.name.trim().is_empty() {
        return invalid("名称不能为空");
    }
    let url = draft.base_url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return invalid("基础 URL 需以 http:// 或 https:// 开头");
    }
    if draft.model.trim().is_empty() {
        return invalid("模型 ID 不能为空");
    }
    if draft.key_source == KeySource::Env && !is_valid_env_name(draft.env_var.trim()) {
        return invalid("环境变量名只能包含字母、数字和下划线，且不能以数字开头");
    }
    Ok(())
}

/// 保存模型配置（新增或编辑），返回配置 id
pub fn save_profile(draft: ModelDraft) -> Result<String, AiError> {
    validate(&draft)?;
    let mut config = read_config()?;
    let existing = draft
        .id
        .as_deref()
        .and_then(|id| config.models.iter().position(|m| m.id == id));

    let mut profile = match existing {
        Some(idx) => config.models[idx].clone(),
        None => ModelProfile {
            id: uuid::Uuid::new_v4().to_string(),
            kind: draft.kind,
            name: String::new(),
            base_url: String::new(),
            model: String::new(),
            key_source: draft.key_source,
            api_key: String::new(),
            env_var: String::new(),
            context_length: 0,
            extra_body: None,
            test_extra_body: None,
        },
    };

    profile.kind = draft.kind;
    profile.name = draft.name.trim().to_string();
    profile.base_url = draft.base_url.trim().trim_end_matches('/').to_string();
    profile.model = draft.model.trim().to_string();
    profile.key_source = draft.key_source;
    if let Some(key) = draft
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|k| !k.is_empty())
    {
        profile.api_key = key.to_string();
    }
    // 不再使用本地保存时清掉明文 Key，避免残留在配置文件中
    if profile.key_source != KeySource::Local {
        profile.api_key.clear();
    }
    profile.env_var = if profile.key_source == KeySource::Env {
        draft.env_var.trim().to_string()
    } else {
        String::new()
    };

    let id = profile.id.clone();
    match existing {
        Some(idx) => config.models[idx] = profile,
        None => config.models.push(profile),
    }
    // 第一条配置自动成为当前模型
    if config.current.is_empty() || !config.models.iter().any(|m| m.id == config.current) {
        config.current = id.clone();
    }
    config.version = CONFIG_VERSION;
    write_config(&config)?;
    Ok(id)
}

/// 删除模型配置；删除的是当前模型时自动切换到第一条
pub fn delete_profile(id: &str) -> Result<(), AiError> {
    let mut config = read_config()?;
    config.models.retain(|m| m.id != id);
    if config.current == id {
        config.current = config
            .models
            .first()
            .map(|m| m.id.clone())
            .unwrap_or_default();
    }
    write_config(&config)
}

/// 设置当前使用的模型
pub fn set_current(id: &str) -> Result<(), AiError> {
    let mut config = read_config()?;
    if !config.models.iter().any(|m| m.id == id) {
        return Err(AiError::Unknown("未找到该模型配置".into()));
    }
    config.current = id.to_string();
    write_config(&config)
}

/// 配置文件所在目录（确保存在，用于"打开配置文件目录"命令）
pub fn get_config_dir() -> Result<PathBuf, AiError> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|e| io_err("创建配置目录", e))?;
    Ok(dir)
}

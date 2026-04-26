//! AI 配置文件读写：将 Provider 配置（含 API Key）存储到本地 JSON 文件
//!
//! 文件路径：`{app_data_dir}/ai-providers.json`
//! 格式：JSON 数组，每项为一个 Provider 配置
//!
//! 安全约束：
//! - Key 仅存在此 JSON 文件中，运行时直接从文件读取
//! - 不将 Key 打印到日志

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::models::ai::ProviderId;
use crate::services::ai::sse::AiError;

/// 配置文件名
const CONFIG_FILE_NAME: &str = "ai-providers.json";

/// 单个模型的配置
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
    /// 模型 ID（API 侧）
    pub id: String,
    /// 显示名称
    pub label: String,
    /// 是否免费
    #[serde(default)]
    pub free: bool,
    /// 上下文长度（tokens）
    #[serde(default)]
    pub context_length: u64,
}

/// 单个 Provider 的配置
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    /// 服务商标识
    pub provider: String,
    /// 显示名称
    pub name: String,
    /// API Key（可为空）
    #[serde(default)]
    pub api_key: String,
    /// OpenAI 兼容的 base URL
    pub base_url: String,
    /// 申请 Key 的控制台地址
    #[serde(default)]
    pub api_key_url: String,
    /// 默认模型（可为空，为空时使用 models 列表第一个）
    #[serde(default)]
    pub default_model: String,
    /// 是否为默认服务商（同一时刻只有一个为 true）
    #[serde(default)]
    pub is_default: bool,
    /// 可用模型列表
    #[serde(default)]
    pub models: Vec<ModelConfig>,
}

/// 生成默认配置（包含所有内置 Provider）
fn default_providers() -> Vec<ProviderConfig> {
    vec![
        ProviderConfig {
            provider: "zhipu".into(),
            name: "智谱 GLM".into(),
            api_key: String::new(),
            base_url: "https://open.bigmodel.cn/api/paas/v4".into(),
            api_key_url: "https://bigmodel.cn/usercenter/apikeys".into(),
            default_model: String::new(),
            is_default: true,
            models: vec![],
        },
        ProviderConfig {
            provider: "deepseek".into(),
            name: "DeepSeek".into(),
            api_key: String::new(),
            base_url: "https://api.deepseek.com".into(),
            api_key_url: "https://platform.deepseek.com/api_keys".into(),
            default_model: String::new(),
            is_default: false,
            models: vec![],
        },
        ProviderConfig {
            provider: "siliconflow".into(),
            name: "硅基流动".into(),
            api_key: String::new(),
            base_url: "https://api.siliconflow.cn/v1".into(),
            api_key_url: "https://cloud.siliconflow.cn/account/ak".into(),
            default_model: String::new(),
            is_default: false,
            models: vec![],
        },
    ]
}

/// 获取配置文件路径
fn config_path() -> Result<PathBuf, AiError> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| AiError::Unknown("无法获取应用数据目录".into()))?;
    Ok(data_dir.join("com.lanis.md").join(CONFIG_FILE_NAME))
}

/// 确保配置文件存在，若不存在则生成默认配置
fn ensure_config_file() -> Result<PathBuf, AiError> {
    let path = config_path()?;
    if !path.exists() {
        // 确保父目录存在
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AiError::Unknown(format!("创建配置目录失败：{}", e)))?;
        }
        let defaults = default_providers();
        let json = serde_json::to_string_pretty(&defaults)
            .map_err(|e| AiError::Unknown(format!("序列化默认配置失败：{}", e)))?;
        fs::write(&path, json)
            .map_err(|e| AiError::Unknown(format!("写入配置文件失败：{}", e)))?;
    }
    Ok(path)
}

/// 读取完整配置文件内容
pub fn read_config() -> Result<Vec<ProviderConfig>, AiError> {
    let path = ensure_config_file()?;
    let content = fs::read_to_string(&path)
        .map_err(|e| AiError::Unknown(format!("读取配置文件失败：{}", e)))?;
    let providers: Vec<ProviderConfig> = serde_json::from_str(&content)
        .map_err(|e| AiError::Unknown(format!("解析配置文件失败：{}", e)))?;
    Ok(providers)
}

/// 写入完整配置
fn write_config(providers: &[ProviderConfig]) -> Result<(), AiError> {
    let path = ensure_config_file()?;
    let json = serde_json::to_string_pretty(providers)
        .map_err(|e| AiError::Unknown(format!("序列化配置失败：{}", e)))?;
    fs::write(&path, json)
        .map_err(|e| AiError::Unknown(format!("写入配置文件失败：{}", e)))?;
    Ok(())
}

/// 读取指定 Provider 的 API Key
pub fn load_key(id: ProviderId) -> Result<String, AiError> {
    let providers = read_config()?;
    let provider_str = id.as_str();
    let provider = providers.iter().find(|p| p.provider == provider_str);
    match provider {
        Some(p) if !p.api_key.is_empty() => Ok(p.api_key.clone()),
        _ => Err(AiError::NoKey),
    }
}

/// 保存 API Key 到配置文件（更新指定 Provider 的 apiKey 字段）
pub fn save_key(id: ProviderId, key: &str) -> Result<(), AiError> {
    let mut providers = read_config()?;
    let provider_str = id.as_str();
    let found = providers.iter_mut().find(|p| p.provider == provider_str);
    match found {
        Some(p) => {
            p.api_key = key.to_string();
        }
        None => {
            return Err(AiError::Unknown(format!("未找到 Provider：{}", provider_str)));
        }
    }
    write_config(&providers)
}

/// 检查指定 Provider 是否已配置 Key
pub fn has_key(id: ProviderId) -> bool {
    load_key(id).is_ok()
}

/// 获取配置文件所在目录路径（公开，用于"打开配置文件目录"命令）
pub fn get_config_dir() -> Result<PathBuf, AiError> {
    let path = ensure_config_file()?;
    path.parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| AiError::Unknown("无法获取配置文件目录".into()))
}

/// 读取配置文件的原始 JSON 字符串（用于返回给前端）
pub fn read_config_raw() -> Result<String, AiError> {
    let path = ensure_config_file()?;
    fs::read_to_string(&path)
        .map_err(|e| AiError::Unknown(format!("读取配置文件失败：{}", e)))
}

/// 设置默认服务商（将指定 Provider 的 isDefault 设为 true，其余设为 false）
pub fn set_default_provider(provider_id: &str) -> Result<(), AiError> {
    let mut providers = read_config()?;
    let found = providers.iter().any(|p| p.provider == provider_id);
    if !found {
        return Err(AiError::Unknown(format!("未找到 Provider：{}", provider_id)));
    }
    for p in providers.iter_mut() {
        p.is_default = p.provider == provider_id;
    }
    write_config(&providers)
}

/// 设置指定 Provider 的默认模型
pub fn set_default_model(provider_id: &str, model_id: &str) -> Result<(), AiError> {
    let mut providers = read_config()?;
    let found = providers.iter_mut().find(|p| p.provider == provider_id);
    match found {
        Some(p) => {
            p.default_model = model_id.to_string();
        }
        None => {
            return Err(AiError::Unknown(format!("未找到 Provider：{}", provider_id)));
        }
    }
    write_config(&providers)
}

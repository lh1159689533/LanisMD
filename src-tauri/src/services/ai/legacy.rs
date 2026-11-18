//! 旧版配置（v1 / v2：按服务商 + 模型列表组织）迁移到 v3（一条配置 = 一个模型）
//!
//! 迁移规则：
//! - 只迁移「可用」的服务商：已填 Key，或标记为无需 Key；且模型列表非空
//! - 每个模型生成一条配置：服务商 id 为 openai / ollama / lmstudio 时保留对应类型，其余一律为「OpenAI 兼容」
//! - Key 迁移为「本地保存」；无需 Key 的迁移为「无密钥」
//! - 原默认服务商的默认模型（或其第一个模型）成为当前模型
//! - 智谱测试连接时关闭深度思考的专有参数随配置一起迁移
//! - 未配置 Key 的预设服务商直接丢弃

use serde::Deserialize;
use serde_json::{json, Value};

use crate::models::ai::{KeySource, ModelKind};
use crate::services::ai::config_file::{AiConfigFile, ModelProfile, CONFIG_VERSION};
use crate::services::ai::error::AiError;

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyModel {
    id: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    context_length: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyProvider {
    provider: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    base_url: String,
    #[serde(default)]
    default_model: String,
    #[serde(default)]
    is_default: bool,
    #[serde(default)]
    models: Vec<LegacyModel>,
    #[serde(default = "default_true")]
    requires_key: bool,
    #[serde(default)]
    extra_body: Option<Value>,
    #[serde(default)]
    test_extra_body: Option<Value>,
}

impl LegacyProvider {
    fn usable(&self) -> bool {
        let has_key = !self.api_key.trim().is_empty() || !self.requires_key;
        has_key && !self.models.is_empty() && !self.base_url.trim().is_empty()
    }

    fn kind(&self) -> ModelKind {
        match self.provider.as_str() {
            "openai" => ModelKind::OpenAi,
            "ollama" => ModelKind::Ollama,
            "lmstudio" => ModelKind::LmStudio,
            _ => ModelKind::OpenAiCompatible,
        }
    }

    /// 迁移后的显示名：单模型直接用服务商名，多模型追加模型名区分
    fn display_name(&self, model: &LegacyModel) -> String {
        let provider_name = if self.name.trim().is_empty() {
            self.provider.as_str()
        } else {
            self.name.trim()
        };
        if self.models.len() == 1 {
            return provider_name.to_string();
        }
        let model_name = if model.label.trim().is_empty() {
            model.id.as_str()
        } else {
            model.label.trim()
        };
        format!("{} · {}", provider_name, model_name)
    }

    fn test_extra_body(&self) -> Option<Value> {
        self.test_extra_body.clone().or_else(|| {
            (self.provider == "zhipu").then(|| json!({ "thinking": { "type": "disabled" } }))
        })
    }

    fn to_profiles(&self) -> Vec<ModelProfile> {
        let key_source = if self.requires_key {
            KeySource::Local
        } else {
            KeySource::None
        };
        self.models
            .iter()
            .map(|m| ModelProfile {
                id: format!("{}-{}", self.provider, m.id),
                kind: self.kind(),
                name: self.display_name(m),
                base_url: self.base_url.trim().trim_end_matches('/').to_string(),
                model: m.id.clone(),
                key_source,
                api_key: if self.requires_key {
                    self.api_key.trim().to_string()
                } else {
                    String::new()
                },
                env_var: String::new(),
                context_length: m.context_length,
                extra_body: self.extra_body.clone(),
                test_extra_body: self.test_extra_body(),
            })
            .collect()
    }

    /// 该服务商在旧配置中作为默认时，对应的当前模型 id
    fn current_profile_id(&self) -> Option<String> {
        let model = self
            .models
            .iter()
            .find(|m| m.id == self.default_model)
            .or(self.models.first())?;
        Some(format!("{}-{}", self.provider, model.id))
    }
}

/// 将 v1（顶层数组）/ v2（{ version, providers }）配置迁移为 v3
pub fn migrate(root: &Value) -> Result<AiConfigFile, AiError> {
    let entries = match root {
        Value::Array(arr) => arr.clone(),
        Value::Object(obj) => match obj.get("providers") {
            Some(Value::Array(arr)) => arr.clone(),
            _ => vec![],
        },
        _ => return Err(AiError::Unknown("配置文件格式错误".into())),
    };
    // 单个条目解析失败不影响其他条目
    let providers: Vec<LegacyProvider> = entries
        .into_iter()
        .filter_map(|v| serde_json::from_value(v).ok())
        .filter(LegacyProvider::usable)
        .collect();

    let models: Vec<ModelProfile> = providers.iter().flat_map(|p| p.to_profiles()).collect();
    let current = providers
        .iter()
        .find(|p| p.is_default)
        .and_then(LegacyProvider::current_profile_id)
        .filter(|id| models.iter().any(|m| &m.id == id))
        .or_else(|| models.first().map(|m| m.id.clone()))
        .unwrap_or_default();

    Ok(AiConfigFile {
        version: CONFIG_VERSION,
        current,
        models,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_usable_providers_only() {
        let v2 = json!({ "version": 2, "providers": [
            { "provider": "zhipu", "name": "智谱 GLM", "apiKey": "k1",
              "baseUrl": "https://open.bigmodel.cn/api/paas/v4/", "isDefault": false,
              "models": [{ "id": "glm-4-flash", "label": "GLM-4-Flash", "contextLength": 128000 }] },
            { "provider": "deepseek", "name": "DeepSeek", "apiKey": "k2", "baseUrl": "https://api.deepseek.com",
              "isDefault": true, "defaultModel": "deepseek-reasoner",
              "models": [{ "id": "deepseek-chat", "label": "V3" }, { "id": "deepseek-reasoner", "label": "R1" }] },
            { "provider": "siliconflow", "name": "硅基流动", "apiKey": "", "baseUrl": "u",
              "models": [{ "id": "x", "label": "x" }] },
            { "provider": "ollama", "name": "Ollama", "baseUrl": "http://localhost:11434/v1",
              "requiresKey": false, "models": [{ "id": "qwen3:8b", "label": "Qwen3" }] },
            { "provider": "openai", "name": "OpenAI", "apiKey": "k3", "baseUrl": "https://api.openai.com/v1", "models": [] }
        ]});
        let config = migrate(&v2).unwrap();
        let ids: Vec<&str> = config.models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "zhipu-glm-4-flash",
                "deepseek-deepseek-chat",
                "deepseek-deepseek-reasoner",
                "ollama-qwen3:8b"
            ]
        );
        assert_eq!(config.current, "deepseek-deepseek-reasoner");

        let zhipu = &config.models[0];
        assert_eq!(zhipu.kind, ModelKind::OpenAiCompatible);
        assert_eq!(zhipu.name, "智谱 GLM");
        assert_eq!(zhipu.base_url, "https://open.bigmodel.cn/api/paas/v4");
        assert_eq!(zhipu.key_source, KeySource::Local);
        assert_eq!(zhipu.api_key, "k1");
        assert_eq!(zhipu.context_length, 128000);
        assert!(zhipu.test_extra_body.is_some());

        assert_eq!(config.models[1].name, "DeepSeek · V3");
        let ollama = &config.models[3];
        assert_eq!(ollama.kind, ModelKind::Ollama);
        assert_eq!(ollama.key_source, KeySource::None);
        assert!(ollama.api_key.is_empty());
    }

    #[test]
    fn migrates_v1_array_and_falls_back_current() {
        let v1 = json!([
            { "provider": "deepseek", "name": "DeepSeek", "apiKey": "k", "baseUrl": "https://api.deepseek.com",
              "isDefault": false, "models": [{ "id": "deepseek-chat", "label": "V3" }] }
        ]);
        let config = migrate(&v1).unwrap();
        assert_eq!(config.models.len(), 1);
        assert_eq!(config.current, "deepseek-deepseek-chat");
    }
}

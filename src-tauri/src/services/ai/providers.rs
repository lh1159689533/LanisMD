//! Provider 元数据预设
//!
//! 与前端 `src/services/ai/providers.ts` 中的 baseUrl 保持一致。

use crate::models::ai::ProviderId;

/// 获取指定 Provider 的默认 base URL
pub fn default_base_url(id: ProviderId) -> Option<&'static str> {
    match id {
        ProviderId::Zhipu => Some("https://open.bigmodel.cn/api/paas/v4"),
        ProviderId::Deepseek => Some("https://api.deepseek.com"),
        ProviderId::Siliconflow => Some("https://api.siliconflow.cn/v1"),
        ProviderId::Custom => None,
    }
}

/// 解析最终使用的 base URL：Custom 必须由前端提供，其他用预设
pub fn resolve_base_url(id: ProviderId, custom: Option<&str>) -> Option<String> {
    if let Some(url) = custom.filter(|s| !s.trim().is_empty()) {
        return Some(url.trim().to_string());
    }
    default_base_url(id).map(|s| s.to_string())
}

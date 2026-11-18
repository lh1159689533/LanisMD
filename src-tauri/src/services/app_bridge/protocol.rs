// App 桥接协议：一行 JSON 请求 + 一行 JSON 响应，每个连接只处理一次请求
//
// @changelog
// | 版本   | 变更说明                   | 关联                                |
// | v1.0.0 | 初始实现：桥接请求与响应格式 | REQ: MCP 界面联动 TECH: 本地 TCP 桥接 |
// /@changelog
//
// @author hhhuilli

use serde::{Deserialize, Serialize};

/// MCP 发给 App 的请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeRequest {
    pub token: String,
    #[serde(flatten)]
    pub action: BridgeAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "method", content = "params", rename_all = "snake_case")]
pub enum BridgeAction {
    /// 查询 App 当前状态（打开的文件夹、正在编辑的文档）
    GetState,
    /// MCP 修改了文档，通知 App 刷新
    DocumentsChanged(DocumentsChanged),
    /// 在 App 中打开文档
    OpenDocument { path: String },
}

/// 文档变更通知（同时作为发给前端的事件载荷）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentsChanged {
    /// created | modified | moved | trashed
    pub kind: String,
    /// 变更后的文档路径（moved 时为新路径）
    pub path: String,
    /// moved 时的原路径
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
}

/// App 当前状态快照
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    /// App 中打开的根文件夹
    pub current_folder: Option<String>,
    /// 编辑器中打开的文档
    pub open_document: Option<OpenDocument>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenDocument {
    pub path: String,
    /// 是否有尚未保存到磁盘的修改
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeResponse {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<AppSnapshot>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl BridgeResponse {
    pub fn ok() -> Self {
        Self { ok: true, state: None, error: None }
    }

    pub fn with_state(state: AppSnapshot) -> Self {
        Self { ok: true, state: Some(state), error: None }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self { ok: false, state: None, error: Some(msg.into()) }
    }
}

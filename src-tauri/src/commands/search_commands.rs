use crate::services::search_service::{self, SearchParams, SearchResponse};

/// 全局搜索命令（核心逻辑位于 search_service，与 MCP Server 共用）
#[tauri::command]
pub async fn global_search(params: SearchParams) -> Result<SearchResponse, String> {
    search_service::search(&params)
}

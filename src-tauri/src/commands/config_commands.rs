use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::error::AppResult;
use crate::models::RecentFile;

fn get_config_service(app: &AppHandle) -> crate::services::config_service::ConfigService {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    crate::services::config_service::ConfigService::new(app_data_dir)
}

#[tauri::command]
pub async fn get_config(app: AppHandle, key: Option<String>) -> AppResult<Value> {
    let service = get_config_service(&app);
    service.get_config(key.as_deref())
}

#[tauri::command]
pub async fn set_config(app: AppHandle, key: String, value: Value) -> AppResult<()> {
    let service = get_config_service(&app);
    service.set_config(&key, value)
}

#[tauri::command]
pub async fn get_recent_files(app: AppHandle, limit: Option<u32>) -> AppResult<Vec<RecentFile>> {
    let service = get_config_service(&app);
    service.get_recent_files(limit)
}

#[tauri::command]
pub async fn add_recent_file(app: AppHandle, path: String) -> AppResult<()> {
    let service = get_config_service(&app);
    service.add_recent_file(&path)
}

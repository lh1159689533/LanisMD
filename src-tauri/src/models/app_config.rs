use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub theme: String,
    pub language: String,
    pub auto_save: AutoSaveConfig,
    pub editor: EditorConfig,
    pub recent_files: RecentFilesConfig,
    pub restore_session: bool,
    pub sidebar: SidebarConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoSaveConfig {
    pub enabled: bool,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorConfig {
    pub font_size: u32,
    pub font_family: String,
    pub max_width: u32,
    pub line_height: f64,
    pub word_wrap: String,
    pub show_line_numbers: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFilesConfig {
    pub max_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarConfig {
    pub position: String,
    pub width: u32,
}

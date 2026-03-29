use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_time: Option<i64>,
    pub created_time: Option<i64>,
    pub is_readonly: bool,
    pub encoding: Option<String>,
}

use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::error::AppResult;
use crate::models::FileMetadata;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileParams {
    pub path: String,
    pub encoding: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub encoding: String,
    pub metadata: FileMetadata,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileParams {
    pub path: String,
    pub content: String,
    pub encoding: Option<String>,
    pub create_parents: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFileParams {
    pub path: String,
    pub trash: Option<bool>,
}

#[tauri::command]
pub async fn read_file(params: ReadFileParams) -> AppResult<FileContent> {
    let (content, encoding, metadata) = crate::services::fs_service::FileSystemService::read_file(
        &params.path,
        params.encoding.as_deref(),
    )?;
    Ok(FileContent {
        content,
        encoding,
        metadata,
    })
}

#[tauri::command]
pub async fn write_file(params: WriteFileParams) -> AppResult<FileMetadata> {
    crate::services::fs_service::FileSystemService::write_file(
        &params.path,
        &params.content,
        params.encoding.as_deref(),
        params.create_parents.unwrap_or(false),
    )
}

#[tauri::command]
pub async fn read_file_meta(path: String) -> AppResult<FileMetadata> {
    crate::services::fs_service::FileSystemService::read_file_meta(&path)
}

#[tauri::command]
pub async fn delete_file(params: DeleteFileParams) -> AppResult<()> {
    crate::services::fs_service::FileSystemService::delete_file(
        &params.path,
        params.trash.unwrap_or(true),
    )
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileTreeNode>>,
    /// File modified time as Unix timestamp in milliseconds (None for directories)
    pub modified_time: Option<f64>,
}

/// Markdown file extensions
const MD_EXTENSIONS: &[&str] = &["md", "markdown", "mdx"];

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| MD_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn build_file_tree(dir: &Path) -> AppResult<Vec<FileTreeNode>> {
    let mut entries: Vec<FileTreeNode> = Vec::new();

    let read_dir = std::fs::read_dir(dir).map_err(|e| crate::error::AppError::Io(e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| crate::error::AppError::Io(e))?;
        let path = entry.path();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Skip hidden files/dirs
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            // Recursively build children
            let children = build_file_tree(&path)?;
            // Include all directories (even empty ones, so newly created folders are visible)
            entries.push(FileTreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                children: Some(children),
                modified_time: None,
            });
        } else if is_markdown_file(&path) {
            // Read file modified time
            let modified_time = std::fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as f64);

            entries.push(FileTreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
                modified_time,
            });
        }
    }

    // Sort: directories first, then files; alphabetically within each group
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

#[tauri::command]
pub async fn list_directory(path: String) -> AppResult<Vec<FileTreeNode>> {
    let dir = Path::new(&path);
    if !dir.exists() {
        return Err(crate::error::AppError::FileNotFound(path));
    }
    if !dir.is_dir() {
        return Err(crate::error::AppError::InvalidPath(
            "Path is not a directory".to_string(),
        ));
    }
    build_file_tree(dir)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntryParams {
    /// Parent directory path
    pub parent_dir: String,
    /// Base name (e.g. "未命名.md" or "未命名文件夹")
    pub base_name: String,
    /// Whether to create a directory (true) or file (false)
    pub is_dir: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntryResult {
    /// The final path of the created entry
    pub path: String,
    /// The final name (may have been incremented)
    pub name: String,
}

/// Create a new file or directory with auto-incrementing name on conflict.
#[tauri::command]
pub async fn create_entry(params: CreateEntryParams) -> AppResult<CreateEntryResult> {
    let parent = Path::new(&params.parent_dir);
    if !parent.exists() || !parent.is_dir() {
        return Err(crate::error::AppError::InvalidPath(
            "Parent directory does not exist".to_string(),
        ));
    }

    // Split base_name into stem and extension for files
    let (stem, ext) = if !params.is_dir {
        let p = Path::new(&params.base_name);
        let stem = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let ext = p.extension().map(|e| e.to_string_lossy().to_string());
        (stem, ext)
    } else {
        (params.base_name.clone(), None)
    };

    // Find a non-conflicting name
    let mut counter = 1u32;
    let mut final_name = params.base_name.clone();
    let mut final_path = parent.join(&final_name);

    while final_path.exists() {
        counter += 1;
        final_name = if let Some(ref e) = ext {
            format!("{} {}.{}", stem, counter, e)
        } else {
            format!("{} {}", stem, counter)
        };
        final_path = parent.join(&final_name);
    }

    // Create the entry
    if params.is_dir {
        std::fs::create_dir(&final_path).map_err(crate::error::AppError::Io)?;
    } else {
        // Create an empty file
        std::fs::File::create(&final_path).map_err(crate::error::AppError::Io)?;
    }

    Ok(CreateEntryResult {
        path: final_path.to_string_lossy().to_string(),
        name: final_name,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameEntryParams {
    pub old_path: String,
    pub new_name: String,
}

/// Rename a file or directory
#[tauri::command]
pub async fn rename_entry(params: RenameEntryParams) -> AppResult<String> {
    crate::services::fs_service::FileSystemService::rename_entry(&params.old_path, &params.new_name)
}

/// Duplicate a file with "副本" naming convention
#[tauri::command]
pub async fn duplicate_file(path: String) -> AppResult<String> {
    crate::services::fs_service::FileSystemService::duplicate_file(&path)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveFileParams {
    /// 源文件的完整路径
    pub source_path: String,
    /// 目标目录的完整路径
    pub target_dir: String,
}

/// 将文件移动到目标目录
#[tauri::command]
pub async fn move_file(params: MoveFileParams) -> AppResult<String> {
    crate::services::fs_service::FileSystemService::move_file(
        &params.source_path,
        &params.target_dir,
    )
}

/// Move a file or directory to the system trash
#[tauri::command]
pub async fn move_to_trash(path: String) -> AppResult<()> {
    crate::services::fs_service::FileSystemService::move_to_trash(&path)
}

/// Copy an image to the assets directory next to the document
#[tauri::command]
pub async fn copy_image_to_assets(image_path: String, doc_path: String) -> AppResult<String> {
    crate::services::fs_service::FileSystemService::copy_image_to_assets(&image_path, &doc_path)
}

/// Save image bytes to the assets directory next to the document
#[tauri::command]
pub async fn save_image_bytes_to_assets(data: Vec<u8>, file_name: String, doc_path: String) -> AppResult<String> {
    crate::services::fs_service::FileSystemService::save_image_bytes_to_assets(&data, &file_name, &doc_path)
}

/// Reveal file in system file manager (Finder on macOS)
#[tauri::command]
pub async fn reveal_in_finder(path: String) -> AppResult<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| crate::error::AppError::Io(e))?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", &path))
            .spawn()
            .map_err(|e| crate::error::AppError::Io(e))?;
    }
    #[cfg(target_os = "linux")]
    {
        // Try xdg-open on the parent directory
        let parent = std::path::Path::new(&path)
            .parent()
            .unwrap_or(std::path::Path::new(&path));
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| crate::error::AppError::Io(e))?;
    }
    Ok(())
}

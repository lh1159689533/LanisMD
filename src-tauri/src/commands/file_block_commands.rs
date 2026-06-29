use std::path::Path;

use crate::error::AppResult;

/// 复制文件到附件目录，返回目标文件完整路径。
/// 重名时自动在文件名后追加递增数字。
#[tauri::command]
pub async fn copy_file_to_attachments(file_path: String, storage_dir: String) -> AppResult<String> {
    let source = Path::new(&file_path);
    if !source.exists() {
        return Err(crate::error::AppError::FileNotFound(file_path));
    }

    let target_dir = Path::new(&storage_dir);
    // 确保目标目录存在
    if !target_dir.exists() {
        std::fs::create_dir_all(target_dir).map_err(crate::error::AppError::Io)?;
    }

    let file_name = source
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let stem = source
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = source
        .extension()
        .map(|e| e.to_string_lossy().to_string());

    // 处理同名冲突：自增后缀
    let mut final_name = file_name.clone();
    let mut target_path = target_dir.join(&final_name);
    let mut counter = 1u32;

    while target_path.exists() {
        counter += 1;
        final_name = if let Some(ref e) = ext {
            format!("{} {}.{}", stem, counter, e)
        } else {
            format!("{} {}", stem, counter)
        };
        target_path = target_dir.join(&final_name);
    }

    std::fs::copy(source, &target_path).map_err(crate::error::AppError::Io)?;

    Ok(target_path.to_string_lossy().to_string())
}

/// 获取文件大小并格式化为人类可读格式
#[tauri::command]
pub async fn get_file_size_formatted(path: String) -> AppResult<String> {
    let meta = std::fs::metadata(&path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            crate::error::AppError::FileNotFound(path.clone())
        } else {
            crate::error::AppError::Io(e)
        }
    })?;

    let size = meta.len();
    let formatted = format_file_size(size);
    Ok(formatted)
}

/// 永久删除本地文件（不进回收站）
#[tauri::command]
pub async fn delete_file_permanent(path: String) -> AppResult<()> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(crate::error::AppError::FileNotFound(path));
    }
    std::fs::remove_file(file_path).map_err(crate::error::AppError::Io)?;
    Ok(())
}

/// 用系统默认程序打开文件
#[tauri::command]
pub async fn open_file_with_system(path: String) -> AppResult<()> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(crate::error::AppError::FileNotFound(path));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(crate::error::AppError::Io)?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(crate::error::AppError::Io)?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(crate::error::AppError::Io)?;
    }
    Ok(())
}

/// 检查文件是否存在
#[tauri::command]
pub async fn check_file_exists(path: String) -> AppResult<bool> {
    Ok(Path::new(&path).exists())
}

// 格式化文件大小
fn format_file_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * 1024;
    const GB: u64 = 1024 * 1024 * 1024;

    if bytes < KB {
        format!("{} B", bytes)
    } else if bytes < MB {
        format!("{} KB", bytes / KB)
    } else if bytes < GB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    }
}

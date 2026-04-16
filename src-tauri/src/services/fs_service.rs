use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

use crate::error::{AppError, AppResult};
use crate::models::FileMetadata;
use super::encoding_service::EncodingService;

pub struct FileSystemService;

impl FileSystemService {
    pub fn read_file(
        path: &str,
        encoding: Option<&str>,
    ) -> AppResult<(String, String, FileMetadata)> {
        let path = Path::new(path);

        if !path.exists() {
            return Err(AppError::FileNotFound(path.to_string_lossy().to_string()));
        }

        let bytes = fs::read(path).map_err(|e| AppError::Io(e))?;

        let (content, detected_encoding) = if let Some(enc) = encoding {
            if enc == "auto" || enc.is_empty() {
                EncodingService::detect_and_decode(&bytes)?
            } else {
                EncodingService::decode_with(&bytes, enc)?
            }
        } else {
            match String::from_utf8(bytes.clone()) {
                Ok(s) => (s, "utf-8".to_string()),
                Err(_) => EncodingService::detect_and_decode(&bytes)?,
            }
        };

        let metadata = Self::read_file_meta(&path.to_string_lossy())?;

        Ok((content, detected_encoding, metadata))
    }

    pub fn write_file(
        path: &str,
        content: &str,
        encoding: Option<&str>,
        create_parents: bool,
    ) -> AppResult<FileMetadata> {
        let path = Path::new(path);

        if create_parents {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| AppError::Io(e))?;
            }
        }

        let encoding = encoding.unwrap_or("utf-8");
        let bytes = EncodingService::encode(content, encoding)?;

        let dir = path.parent().unwrap_or(Path::new("."));
        let mut temp_file = NamedTempFile::new_in(dir)
            .map_err(|e| AppError::WriteFailed(e.to_string()))?;

        temp_file
            .write_all(&bytes)
            .map_err(|e| AppError::WriteFailed(e.to_string()))?;

        temp_file
            .flush()
            .map_err(|e| AppError::WriteFailed(e.to_string()))?;

        temp_file
            .persist(path)
            .map_err(|e| AppError::WriteFailed(e.to_string()))?;

        Self::read_file_meta(&path.to_string_lossy())
    }

    pub fn read_file_meta(path: &str) -> AppResult<FileMetadata> {
        let path = Path::new(path);
        let metadata = fs::metadata(path)
            .map_err(|e| AppError::FileNotFound(e.to_string()))?;

        Ok(FileMetadata {
            path: path.to_string_lossy().to_string(),
            file_name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            size_bytes: metadata.len(),
            modified_time: metadata
                .modified()
                .ok()
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64),
            created_time: metadata
                .created()
                .ok()
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64),
            is_readonly: metadata.permissions().readonly(),
            encoding: None,
        })
    }

    pub fn delete_file(path: &str, _trash: bool) -> AppResult<()> {
        let path = Path::new(path);
        if !path.exists() {
            return Err(AppError::FileNotFound(path.to_string_lossy().to_string()));
        }
        fs::remove_file(path).map_err(|e| AppError::Io(e))?;
        Ok(())
    }

    /// Rename (move) a file or directory
    pub fn rename_entry(old_path: &str, new_name: &str) -> AppResult<String> {
        let old = Path::new(old_path);
        if !old.exists() {
            return Err(AppError::FileNotFound(old_path.to_string()));
        }
        let parent = old.parent().ok_or_else(|| AppError::InvalidPath("No parent directory".to_string()))?;
        let new_path = parent.join(new_name);
        if new_path.exists() {
            return Err(AppError::InvalidPath(format!("'{}' already exists", new_name)));
        }
        fs::rename(old, &new_path).map_err(|e| AppError::Io(e))?;
        Ok(new_path.to_string_lossy().to_string())
    }

    /// Duplicate a file with "副本" naming convention
    pub fn duplicate_file(path: &str) -> AppResult<String> {
        let src = Path::new(path);
        if !src.exists() {
            return Err(AppError::FileNotFound(path.to_string()));
        }
        if src.is_dir() {
            return Err(AppError::InvalidPath("Cannot duplicate a directory".to_string()));
        }

        let parent = src.parent().ok_or_else(|| AppError::InvalidPath("No parent directory".to_string()))?;
        let stem = src.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let ext = src.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();

        // Try "stem 副本.ext" first, then "stem 副本1.ext", "stem 副本2.ext", ...
        let first_candidate = parent.join(format!("{} 副本{}", stem, ext));
        if !first_candidate.exists() {
            fs::copy(src, &first_candidate).map_err(|e| AppError::Io(e))?;
            return Ok(first_candidate.to_string_lossy().to_string());
        }

        let mut counter = 1u32;
        loop {
            let candidate = parent.join(format!("{} 副本{}{}", stem, counter, ext));
            if !candidate.exists() {
                fs::copy(src, &candidate).map_err(|e| AppError::Io(e))?;
                return Ok(candidate.to_string_lossy().to_string());
            }
            counter += 1;
            if counter > 9999 {
                return Err(AppError::WriteFailed("Too many copies".to_string()));
            }
        }
    }

    /// Copy a local image file into the `assets` folder next to the document.
    /// Returns the relative path (e.g. `./assets/image.png`) for Markdown usage.
    pub fn copy_image_to_assets(image_path: &str, doc_path: &str) -> AppResult<String> {
        let src = Path::new(image_path);
        if !src.exists() {
            return Err(AppError::FileNotFound(image_path.to_string()));
        }
        if !src.is_file() {
            return Err(AppError::InvalidPath("Source is not a file".to_string()));
        }

        let doc = Path::new(doc_path);
        let doc_dir = doc
            .parent()
            .ok_or_else(|| AppError::InvalidPath("Cannot determine document directory".to_string()))?;

        let assets_dir = doc_dir.join("assets");

        // Create assets directory if it doesn't exist
        if !assets_dir.exists() {
            fs::create_dir_all(&assets_dir).map_err(|e| AppError::Io(e))?;
        }

        let original_name = src
            .file_name()
            .ok_or_else(|| AppError::InvalidPath("Cannot determine file name".to_string()))?
            .to_string_lossy()
            .to_string();

        let stem = src
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let ext = src
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();

        // Find a non-conflicting name
        let mut final_name = original_name.clone();
        let mut dest = assets_dir.join(&final_name);
        let mut counter = 1u32;

        while dest.exists() {
            final_name = format!("{}-{}{}", stem, counter, ext);
            dest = assets_dir.join(&final_name);
            counter += 1;
            if counter > 9999 {
                return Err(AppError::WriteFailed("Too many copies with same name".to_string()));
            }
        }

        fs::copy(src, &dest).map_err(|e| AppError::Io(e))?;

        Ok(format!("./assets/{}", final_name))
    }

    /// Save raw image bytes into the `assets` folder next to the document.
    /// Returns the relative path (e.g. `./assets/image_1234.png`) for Markdown usage.
    pub fn save_image_bytes_to_assets(data: &[u8], file_name: &str, doc_path: &str) -> AppResult<String> {
        let doc = Path::new(doc_path);
        let doc_dir = doc
            .parent()
            .ok_or_else(|| AppError::InvalidPath("Cannot determine document directory".to_string()))?;

        let assets_dir = doc_dir.join("assets");

        // Create assets directory if it doesn't exist
        if !assets_dir.exists() {
            fs::create_dir_all(&assets_dir).map_err(|e| AppError::Io(e))?;
        }

        let p = Path::new(file_name);
        let stem = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_else(|| ".png".to_string());

        // Find a non-conflicting name
        let mut final_name = file_name.to_string();
        let mut dest = assets_dir.join(&final_name);
        let mut counter = 1u32;

        while dest.exists() {
            final_name = format!("{}-{}{}", stem, counter, ext);
            dest = assets_dir.join(&final_name);
            counter += 1;
            if counter > 9999 {
                return Err(AppError::WriteFailed("Too many copies with same name".to_string()));
            }
        }

        fs::write(&dest, data).map_err(|e| AppError::Io(e))?;

        Ok(format!("./assets/{}", final_name))
    }

    /// 将文件移动到目标目录，返回移动后的新路径
    pub fn move_file(source_path: &str, target_dir: &str) -> AppResult<String> {
        let source = Path::new(source_path);
        let target = Path::new(target_dir);

        if !source.exists() {
            return Err(AppError::FileNotFound(source_path.to_string()));
        }
        if !source.is_file() {
            return Err(AppError::InvalidPath("Only files can be moved".to_string()));
        }
        if !target.exists() || !target.is_dir() {
            return Err(AppError::InvalidPath("Target directory does not exist".to_string()));
        }

        let file_name = source.file_name()
            .ok_or_else(|| AppError::InvalidPath("Cannot determine file name".to_string()))?;

        // 同目录无需移动
        if source.parent() == Some(target) {
            return Ok(source_path.to_string());
        }

        let new_path = target.join(file_name);
        if new_path.exists() {
            return Err(AppError::InvalidPath(format!(
                "目标文件夹已存在同名文件 \"{}\"",
                file_name.to_string_lossy()
            )));
        }

        fs::rename(source, &new_path).map_err(AppError::Io)?;
        Ok(new_path.to_string_lossy().to_string())
    }

    /// Move file or directory to system trash
    pub fn move_to_trash(path: &str) -> AppResult<()> {
        let p = Path::new(path);
        if !p.exists() {
            return Err(AppError::FileNotFound(path.to_string()));
        }
        trash::delete(p).map_err(|e| AppError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;
        Ok(())
    }
}

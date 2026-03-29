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

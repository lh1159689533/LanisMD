use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Encoding error: {0}")]
    Encoding(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Write failed: {0}")]
    WriteFailed(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Export failed: {0}")]
    ExportFailed(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        #[derive(Serialize)]
        struct ErrorInfo {
            code: String,
            message: String,
        }

        let (code, message) = match self {
            Self::FileNotFound(msg) => ("FILE_NOT_FOUND".to_string(), msg.clone()),
            Self::PermissionDenied(msg) => ("PERMISSION_DENIED".to_string(), msg.clone()),
            Self::Io(msg) => ("IO_ERROR".to_string(), msg.to_string()),
            Self::Encoding(msg) => ("ENCODING_ERROR".to_string(), msg.clone()),
            Self::InvalidPath(msg) => ("INVALID_PATH".to_string(), msg.clone()),
            Self::WriteFailed(msg) => ("WRITE_FAILED".to_string(), msg.clone()),
            Self::Config(msg) => ("CONFIG_ERROR".to_string(), msg.clone()),
            Self::ExportFailed(msg) => ("EXPORT_FAILED".to_string(), msg.clone()),
        };

        ErrorInfo {
            code,
            message,
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;

use crate::error::{AppError, AppResult};

pub struct EncodingService;

impl EncodingService {
    pub fn detect_and_decode(bytes: &[u8]) -> AppResult<(String, String)> {
        if let Ok(s) = String::from_utf8(bytes.to_vec()) {
            return Ok((s, "utf-8".to_string()));
        }

        // Basic fallback: try common encodings
        // In production, use chardet or encoding_rs crate for proper detection
        match encoding_rs::SHIFT_JIS.decode(bytes) {
            (cow, _, true) => Ok((cow.into_owned(), "shift_jis".to_string())),
            _ => Err(AppError::Encoding("Unable to detect encoding".into())),
        }
    }

    pub fn decode_with(bytes: &[u8], encoding: &str) -> AppResult<(String, String)> {
        match encoding.to_lowercase().as_str() {
            "utf-8" | "utf8" => {
                String::from_utf8(bytes.to_vec())
                    .map(|s| (s, "utf-8".to_string()))
                    .map_err(|_| AppError::Encoding("Invalid UTF-8".into()))
            }
            "gbk" | "gb2312" | "gb18030" => {
                let (cow, _, had_errors) = encoding_rs::GBK.decode(bytes);
                if had_errors {
                    Err(AppError::Encoding("GBK decoding errors".into()))
                } else {
                    Ok((cow.into_owned(), encoding.to_string()))
                }
            }
            "shift_jis" | "shift-jis" => {
                let (cow, _, had_errors) = encoding_rs::SHIFT_JIS.decode(bytes);
                if had_errors {
                    Err(AppError::Encoding("Shift_JIS decoding errors".into()))
                } else {
                    Ok((cow.into_owned(), "shift_jis".to_string()))
                }
            }
            _ => Err(AppError::Encoding(format!(
                "Unsupported encoding: {}",
                encoding
            ))),
        }
    }

    pub fn encode(content: &str, encoding: &str) -> AppResult<Vec<u8>> {
        match encoding.to_lowercase().as_str() {
            "utf-8" | "utf8" => Ok(content.as_bytes().to_vec()),
            "gbk" | "gb2312" | "gb18030" => {
                let (cow, _, had_errors) = encoding_rs::GBK.encode(content);
                if had_errors {
                    Err(AppError::Encoding("GBK encoding errors".into()))
                } else {
                    Ok(cow.into_owned())
                }
            }
            "shift_jis" | "shift-jis" => {
                let (cow, _, had_errors) = encoding_rs::SHIFT_JIS.encode(content);
                if had_errors {
                    Err(AppError::Encoding("Shift_JIS encoding errors".into()))
                } else {
                    Ok(cow.into_owned())
                }
            }
            _ => Err(AppError::Encoding(format!(
                "Unsupported encoding: {}",
                encoding
            ))),
        }
    }
}

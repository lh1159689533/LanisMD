// MCP 文档读写：编码保持、原子写入、内容版本号（乐观锁）与废纸篓
//
// version 取磁盘原始字节的 FNV-1a 64 位哈希：不依赖 mtime 精度，
// 任何内容变化都会改变版本号，且跨进程、跨版本稳定。
//
// @changelog
// | 版本   | 变更说明                             | 关联                                |
// | v1.0.0 | 从 server.rs 拆出读写辅助，新增 version | REQ: MCP 乐观锁 TECH: 内容哈希版本号 |
// /@changelog
//
// @author hhhuilli

use std::path::Path;

use super::workspace::Workspace;
use crate::services::encoding_service::EncodingService;
use crate::services::fs_service::FileSystemService;

/// 单次读取的文件大小上限，防止把超大文件整个塞进模型上下文
const MAX_READ_BYTES: u64 = 4 * 1024 * 1024;

/// 读取到的文本文件
pub struct TextFile {
    pub content: String,
    pub encoding: String,
    pub version: String,
}

/// 计算内容版本号
pub fn version_of(bytes: &[u8]) -> String {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0100_0000_01b3;
    let hash = bytes
        .iter()
        .fold(OFFSET, |h, b| (h ^ u64::from(*b)).wrapping_mul(PRIME));
    format!("{:016x}", hash)
}

/// 读取文本文件（自动识别编码）
pub fn read_text(path: &Path, ws: &Workspace) -> Result<TextFile, String> {
    if !path.is_file() {
        return Err(format!("文件不存在: {}", ws.relative(path)));
    }
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if size > MAX_READ_BYTES {
        return Err(format!(
            "文件过大（{} KB），超过 {} MB 上限",
            size / 1024,
            MAX_READ_BYTES / 1024 / 1024
        ));
    }
    let bytes = std::fs::read(path).map_err(|e| format!("读取失败: {}", e))?;
    let version = version_of(&bytes);
    let (content, encoding) = match String::from_utf8(bytes) {
        Ok(s) => (s, "utf-8".to_string()),
        // 非 UTF-8 时先按 GBK 严格解码（中文笔记最常见），失败再走通用探测
        Err(e) => EncodingService::decode_with(e.as_bytes(), "gbk")
            .or_else(|_| EncodingService::detect_and_decode(e.as_bytes()))
            .map_err(|e| e.to_string())?,
    };
    Ok(TextFile { content, encoding, version })
}

/// 乐观锁校验：传了 expected 且与当前版本不同则拒绝
pub fn check_version(current: &str, expected: Option<&str>, ws: &Workspace, path: &Path) -> Result<(), String> {
    match expected.map(str::trim).filter(|v| !v.is_empty()) {
        Some(v) if v != current => Err(format!(
            "版本冲突：{} 在读取后已被修改（期望 version={}，当前 version={}）。\
             请重新 read_document 获取最新内容后再修改",
            ws.relative(path),
            v,
            current
        )),
        _ => Ok(()),
    }
}

/// 原子写入文本（临时文件 + rename），自动创建父目录，返回写入后的版本号
pub fn write_text(path: &Path, content: &str, encoding: &str) -> Result<String, String> {
    let bytes = EncodingService::encode(content, encoding).map_err(|e| e.to_string())?;
    FileSystemService::write_file(&path.to_string_lossy(), content, Some(encoding), true)
        .map_err(|e| e.to_string())?;
    Ok(version_of(&bytes))
}

/// 移到系统废纸篓。macOS 默认的 Finder 方式依赖 osascript，
/// 在被 MCP 客户端拉起的无界面子进程中会触发自动化授权弹窗并阻塞，因此改用 NSFileManager
pub fn move_to_trash(path: &Path) -> Result<(), String> {
    #[allow(unused_mut)]
    let mut ctx = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        ctx.set_delete_method(DeleteMethod::NsFileManager);
    }
    ctx.delete(path).map_err(|e| format!("移到废纸篓失败: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_stable_and_sensitive() {
        assert_eq!(version_of(b""), "cbf29ce484222325");
        assert_eq!(version_of(b"a"), version_of(b"a"));
        assert_ne!(version_of(b"a"), version_of(b"b"));
    }

    #[test]
    fn check_version_rejects_mismatch_only() {
        let dir = tempfile::tempdir().unwrap();
        let ws = Workspace::new(dir.path()).unwrap();
        let p = dir.path().join("a.md");
        assert!(check_version("x", None, &ws, &p).is_ok());
        assert!(check_version("x", Some(""), &ws, &p).is_ok());
        assert!(check_version("x", Some("x"), &ws, &p).is_ok());
        assert!(check_version("x", Some("y"), &ws, &p).is_err());
    }

    #[test]
    fn write_returns_version_of_disk_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let ws = Workspace::new(dir.path()).unwrap();
        let p = dir.path().join("a.md");
        let v = write_text(&p, "中文", "gbk").unwrap();
        let read = read_text(&p, &ws).unwrap();
        assert_eq!(v, read.version);
        assert_eq!(v, version_of(&std::fs::read(&p).unwrap()));
    }
}

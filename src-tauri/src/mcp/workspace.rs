// MCP 工作区沙箱：所有工具的路径都必须解析到工作区根目录之内
//
// @changelog
// | 版本   | 变更说明                           | 关联                            |
// | v1.0.0 | 初始实现：路径解析、越界与隐藏目录校验 | REQ: MCP Server TECH: 路径沙箱 |
// /@changelog
//
// @author hhhuilli

use std::path::{Component, Path, PathBuf};

/// Markdown 文件扩展名（写入类工具只允许操作这些文件）
pub const MD_EXTENSIONS: &[&str] = &["md", "markdown", "mdx"];

/// 判断路径是否为 Markdown 文件
pub fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| MD_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// MCP Server 绑定的工作区
#[derive(Debug, Clone)]
pub struct Workspace {
    /// 规范化后的绝对根路径（已解析符号链接）
    root: PathBuf,
}

impl Workspace {
    /// 创建工作区；根目录必须存在且为目录
    pub fn new(root: &Path) -> Result<Self, String> {
        let root = root
            .canonicalize()
            .map_err(|e| format!("工作区目录不可用 {}: {}", root.display(), e))?;
        if !root.is_dir() {
            return Err(format!("工作区路径不是目录: {}", root.display()));
        }
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn root_str(&self) -> String {
        self.root.to_string_lossy().to_string()
    }

    /// 把调用方传入的路径（相对工作区或绝对路径）解析为工作区内的绝对路径。
    /// 拒绝越界路径与隐藏路径段（如 .git），避免外部 AI 读到凭证等敏感文件。
    pub fn resolve(&self, input: &str) -> Result<PathBuf, String> {
        let input = input.trim();
        let raw = if input.is_empty() || input == "." {
            self.root.clone()
        } else {
            let p = Path::new(input);
            if p.is_absolute() {
                p.to_path_buf()
            } else {
                self.root.join(p)
            }
        };

        let normalized = lexical_normalize(&raw);
        // 先解析已存在的最深祖先的符号链接，再拼回不存在的尾部，
        // 这样既能校验新建文件，也能识别指向工作区外的符号链接
        let resolved = canonicalize_existing_prefix(&normalized);

        let rel = resolved
            .strip_prefix(&self.root)
            .map_err(|_| format!("路径不在工作区内: {}", input))?;
        if rel
            .components()
            .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
        {
            return Err(format!("不允许访问隐藏文件或目录: {}", input));
        }
        Ok(resolved)
    }

    /// 用户在 MCP 中指定的工作区目录：必须是绝对路径，不存在则创建；
    /// 拒绝根目录、用户主目录、系统目录与隐藏目录，避免把整个磁盘暴露给 AI
    pub fn from_user_choice(input: &str) -> Result<Self, String> {
        let path = expand_home(input.trim());
        if !path.is_absolute() {
            return Err(format!("请提供绝对路径: {}", input));
        }
        let path = lexical_normalize(&path);
        if path
            .components()
            .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
        {
            return Err(format!("不能使用隐藏目录作为工作区: {}", input));
        }
        if !path.exists() {
            std::fs::create_dir_all(&path).map_err(|e| format!("创建目录失败 {}: {}", path.display(), e))?;
        }
        let ws = Self::new(&path)?;
        if is_forbidden_root(ws.root()) {
            return Err(format!("范围过大，不能把 {} 作为工作区，请选择具体的笔记文件夹", ws.root.display()));
        }
        Ok(ws)
    }

    /// 解析并要求目标为 Markdown 文件路径（文件本身可以尚不存在）
    pub fn resolve_markdown(&self, input: &str) -> Result<PathBuf, String> {
        let path = self.resolve(input)?;
        if !is_markdown(&path) {
            return Err(format!(
                "只允许操作 Markdown 文件（{}）: {}",
                MD_EXTENSIONS.join(" / "),
                input
            ));
        }
        Ok(path)
    }

    /// 绝对路径转为相对工作区的展示路径，统一使用 '/'
    pub fn relative(&self, path: &Path) -> String {
        let rel = path.strip_prefix(&self.root).unwrap_or(path);
        let s = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join("/");
        if s.is_empty() {
            ".".to_string()
        } else {
            s
        }
    }
}

/// 展开 `~` 前缀（部分 MCP 客户端与用户输入不会做 shell 展开）
pub fn expand_home(input: &str) -> PathBuf {
    if input == "~" || input.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(input.trim_start_matches('~').trim_start_matches('/'));
        }
    }
    PathBuf::from(input)
}

/// 是否为不允许作为工作区的大范围目录
fn is_forbidden_root(root: &Path) -> bool {
    if root.parent().is_none() {
        return true;
    }
    let home = dirs::home_dir().and_then(|h| h.canonicalize().ok());
    if let Some(home) = &home {
        if root == home || root.starts_with(home.join("Library")) {
            return true;
        }
    }
    const SYSTEM_DIRS: &[&str] = &[
        "/System", "/Library", "/Applications", "/usr", "/bin", "/sbin", "/etc", "/var",
        "/private/etc", "/private/var", "/opt", "/Users", "/home",
    ];
    // /tmp、/var/folders 下的临时目录允许使用（测试与临时笔记）
    let s = root.to_string_lossy();
    if s.starts_with("/private/tmp") || s.starts_with("/private/var/folders") || s.starts_with("/tmp") {
        return false;
    }
    SYSTEM_DIRS.iter().any(|d| root == Path::new(d) || root.starts_with(d))
        && !home.map(|h| root.starts_with(&h)).unwrap_or(false)
}

/// 纯词法地消解 `.` 与 `..`，不访问文件系统
fn lexical_normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// 对路径中已存在的最长前缀做 canonicalize，剩余部分原样拼接
fn canonicalize_existing_prefix(path: &Path) -> PathBuf {
    let mut existing = path.to_path_buf();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    loop {
        if let Ok(canon) = existing.canonicalize() {
            let mut result = canon;
            for seg in tail.iter().rev() {
                result.push(seg);
            }
            return result;
        }
        match existing.file_name() {
            Some(name) => {
                tail.push(name.to_os_string());
                if !existing.pop() {
                    return path.to_path_buf();
                }
            }
            None => return path.to_path_buf(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> (tempfile::TempDir, Workspace) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("notes")).unwrap();
        std::fs::write(dir.path().join("notes/a.md"), "# A").unwrap();
        let ws = Workspace::new(dir.path()).unwrap();
        (dir, ws)
    }

    #[test]
    fn resolves_relative_and_absolute_paths() {
        let (_dir, ws) = setup();
        let rel = ws.resolve("notes/a.md").unwrap();
        assert!(rel.ends_with("notes/a.md"));
        let abs = ws.resolve(&rel.to_string_lossy()).unwrap();
        assert_eq!(rel, abs);
        assert_eq!(ws.relative(&rel), "notes/a.md");
    }

    #[test]
    fn allows_not_yet_existing_files() {
        let (_dir, ws) = setup();
        let p = ws.resolve_markdown("new/dir/b.md").unwrap();
        assert!(p.starts_with(ws.root()));
    }

    #[test]
    fn rejects_escape_and_hidden() {
        let (_dir, ws) = setup();
        assert!(ws.resolve("../outside.md").is_err());
        assert!(ws.resolve("notes/../../outside.md").is_err());
        assert!(ws.resolve("/etc/passwd").is_err());
        assert!(ws.resolve(".git/config").is_err());
        assert!(ws.resolve_markdown("notes/a.txt").is_err());
    }

    #[test]
    fn user_choice_creates_dir_and_rejects_broad_roots() {
        // 默认临时目录名以 .tmp 开头，会被隐藏目录规则拒绝
        let dir = tempfile::Builder::new().prefix("lanis").tempdir().unwrap();
        let target = dir.path().join("new/notes");
        let ws = Workspace::from_user_choice(&target.to_string_lossy()).unwrap();
        assert!(ws.root().is_dir());
        assert!(Workspace::from_user_choice("relative/dir").is_err());
        assert!(Workspace::from_user_choice("/").is_err());
        assert!(Workspace::from_user_choice("~").is_err());
        assert!(Workspace::from_user_choice("/etc").is_err());
        assert!(Workspace::from_user_choice(&dir.path().join(".secret").to_string_lossy()).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let (dir, ws) = setup();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), dir.path().join("link")).unwrap();
        assert!(ws.resolve("link/x.md").is_err());
    }
}

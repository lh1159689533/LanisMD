//! API 密钥解析：本地保存 / 环境变量 / 无密钥
//!
//! 环境变量的坑：macOS 从 Finder / Dock 启动的 GUI 应用不会继承 `~/.zshrc` 等
//! Shell 配置中 export 的变量。因此先查进程环境，查不到时再起一个登录交互 Shell 读取，
//! 并缓存结果（命中永久缓存，未命中缓存 60 秒，避免每次请求都启动 Shell）。

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;

use crate::models::ai::KeySource;
use crate::services::ai::config_file::ModelProfile;
use crate::services::ai::error::AiError;

/// 未命中结果的缓存时长
const MISS_TTL: Duration = Duration::from_secs(60);

static CACHE: Lazy<Mutex<HashMap<String, (Option<String>, Instant)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// 环境变量名是否合法（同时防止拼进 Shell 命令时的注入）
pub fn is_valid_env_name(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// 读取环境变量（带缓存），空值视为未设置
pub fn read_env(name: &str) -> Option<String> {
    if !is_valid_env_name(name) {
        return None;
    }
    if let Ok(cache) = CACHE.lock() {
        if let Some((value, at)) = cache.get(name) {
            if value.is_some() || at.elapsed() < MISS_TTL {
                return value.clone();
            }
        }
    }

    let value = std::env::var(name)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| read_from_login_shell(name))
        .map(|v| v.trim().to_string());

    if let Ok(mut cache) = CACHE.lock() {
        cache.insert(name.to_string(), (value.clone(), Instant::now()));
    }
    value
}

/// 通过登录交互 Shell 读取变量（仅 Unix）
#[cfg(unix)]
fn read_from_login_shell(name: &str) -> Option<String> {
    use std::io::Read;
    use std::process::{Command, Stdio};

    const BEGIN: &str = "__LANISMD_ENV_BEGIN__";
    const END: &str = "__LANISMD_ENV_END__";
    // oh-my-zsh 等较重的 rc 配置冷启动可能需要数秒
    const TIMEOUT: Duration = Duration::from_secs(5);

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    // 变量名作为位置参数传入而非拼接进脚本；用标记包裹，忽略 rc 文件可能打印的其他内容
    let script = format!(r#"printf '{}%s{}' "$(printenv "$1")""#, BEGIN, END);
    let mut child = Command::new(shell)
        .args(["-ilc", &script, "lanismd", name])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() < TIMEOUT => {
                std::thread::sleep(Duration::from_millis(30))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }

    let mut output = String::new();
    child.stdout.take()?.read_to_string(&mut output).ok()?;
    let start = output.rfind(BEGIN)? + BEGIN.len();
    let end = start + output[start..].find(END)?;
    Some(output[start..end].to_string()).filter(|v| !v.trim().is_empty())
}

#[cfg(not(unix))]
fn read_from_login_shell(_name: &str) -> Option<String> {
    None
}

/// 按配置解析最终使用的密钥；`KeySource::None` 返回 Ok(None)
pub fn resolve_key(profile: &ModelProfile) -> Result<Option<String>, AiError> {
    match profile.key_source {
        KeySource::None => Ok(None),
        KeySource::Local => {
            let key = profile.api_key.trim();
            if key.is_empty() {
                Err(AiError::NoKey)
            } else {
                Ok(Some(key.to_string()))
            }
        }
        KeySource::Env => read_env(&profile.env_var)
            .map(Some)
            .ok_or_else(|| AiError::EnvKeyMissing(profile.env_var.clone())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_name_validation() {
        assert!(is_valid_env_name("OPENAI_API_KEY"));
        assert!(is_valid_env_name("_x1"));
        assert!(!is_valid_env_name("1ABC"));
        assert!(!is_valid_env_name("A-B"));
        assert!(!is_valid_env_name("A;rm -rf"));
        assert!(!is_valid_env_name(""));
    }

    #[cfg(unix)]
    #[test]
    fn reads_variable_from_login_shell() {
        // HOME 在任何登录 Shell 中都存在；验证标记解析能剥离 rc 文件可能输出的杂项
        let home = read_from_login_shell("HOME").expect("登录 Shell 应能读到 HOME");
        assert!(home.starts_with('/'));
        assert!(read_from_login_shell("LANISMD_SURELY_NOT_SET_42").is_none());
    }

    #[test]
    fn reads_process_env_first() {
        std::env::set_var("LANISMD_TEST_KEY_X", " secret ");
        assert_eq!(read_env("LANISMD_TEST_KEY_X").as_deref(), Some("secret"));
    }
}

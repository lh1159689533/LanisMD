// 系统 git 进程执行器
//
// 统一负责：定位 git 可执行文件、设置非交互环境变量、HTTPS 凭据注入、错误信息本地化。
//
// @changelog
// | 版本   | 变更说明                   | 关联                         |
// | v1.0.0 | 初始实现：系统 git 调用封装 | REQ: Git 改造 TECH: 系统 git |
// /@changelog
//
// @author hhhuilli

use std::path::Path;
use std::process::{Command, Output, Stdio};
use std::sync::Mutex;

use once_cell::sync::{Lazy, OnceCell};

use super::credentials::CredentialStore;
use crate::error::{AppError, AppResult};

/// 解析到的 git 可执行文件路径与版本；仅缓存成功结果，未安装时下次调用重新探测（便于安装后无需重启）
static GIT_BIN: Lazy<Mutex<Option<(String, String)>>> = Lazy::new(|| Mutex::new(None));
/// 用户是否自行配置了 core.sshCommand（配置了则不覆盖 SSH 行为）
static USER_SSH_COMMAND: OnceCell<bool> = OnceCell::new();

pub struct GitRunner;

impl GitRunner {
    /// GUI 应用的 PATH 往往不含 Homebrew 目录，按常见位置依次探测
    fn candidates() -> Vec<String> {
        let mut list: Vec<String> = Vec::new();
        #[cfg(target_os = "macos")]
        {
            list.push("/opt/homebrew/bin/git".into());
            list.push("/usr/local/bin/git".into());
            list.push("/usr/bin/git".into());
        }
        #[cfg(target_os = "linux")]
        {
            list.push("/usr/bin/git".into());
            list.push("/usr/local/bin/git".into());
        }
        #[cfg(target_os = "windows")]
        {
            list.push("C:\\Program Files\\Git\\cmd\\git.exe".into());
            list.push("C:\\Program Files (x86)\\Git\\cmd\\git.exe".into());
        }
        list.push("git".into());
        list
    }

    fn probe() -> Option<(String, String)> {
        for bin in Self::candidates() {
            if bin != "git" && !Path::new(&bin).exists() {
                continue;
            }
            let mut cmd = Command::new(&bin);
            cmd.arg("--version")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            Self::hide_window(&mut cmd);
            if let Ok(out) = cmd.output() {
                if out.status.success() {
                    let version = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    return Some((bin, version));
                }
            }
        }
        None
    }

    /// 返回 (路径, 版本描述)
    pub fn availability() -> Option<(String, String)> {
        let mut guard = GIT_BIN.lock().ok()?;
        if guard.is_none() {
            *guard = Self::probe();
        }
        guard.clone()
    }

    fn bin() -> AppResult<String> {
        Self::availability()
            .map(|(b, _)| b)
            .ok_or_else(|| AppError::Git("未检测到 Git，请先安装 Git 后重试".to_string()))
    }

    /// 版本号 (major, minor)，用于判断 --autostash 等参数是否可用
    pub fn version() -> (u32, u32) {
        let text = Self::availability().map(|(_, v)| v).unwrap_or_default();
        let nums: Vec<u32> = text
            .split_whitespace()
            .find(|s| {
                s.chars()
                    .next()
                    .map(|c| c.is_ascii_digit())
                    .unwrap_or(false)
            })
            .unwrap_or("0.0")
            .split('.')
            .filter_map(|s| s.parse().ok())
            .collect();
        (
            nums.first().copied().unwrap_or(0),
            nums.get(1).copied().unwrap_or(0),
        )
    }

    #[allow(unused_variables)]
    fn hide_window(cmd: &mut Command) {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW，避免每次调用闪出控制台窗口
            cmd.creation_flags(0x0800_0000);
        }
    }

    fn user_has_ssh_command() -> bool {
        *USER_SSH_COMMAND.get_or_init(|| {
            if std::env::var_os("GIT_SSH_COMMAND").is_some()
                || std::env::var_os("GIT_SSH").is_some()
            {
                return true;
            }
            let Ok(bin) = Self::bin() else { return false };
            let mut cmd = Command::new(bin);
            cmd.args(["config", "--global", "--get", "core.sshCommand"]);
            Self::hide_window(&mut cmd);
            cmd.output()
                .map(|o| o.status.success() && !o.stdout.is_empty())
                .unwrap_or(false)
        })
    }

    /// 构造带非交互环境的 git 命令
    pub fn command(cwd: &Path) -> AppResult<Command> {
        let mut cmd = Command::new(Self::bin()?);
        cmd.current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // 禁止任何交互提示，避免进程挂起
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_EDITOR", "true")
            .env("GIT_MERGE_AUTOEDIT", "no")
            .env("GIT_LITERAL_PATHSPECS", "1")
            .env("LC_ALL", "C")
            .args(["-c", "core.quotePath=false", "-c", "color.ui=false"]);
        if !Self::user_has_ssh_command() {
            // BatchMode 禁止密码/口令交互（ssh-agent 中的密钥仍可用），首次连接自动信任主机
            cmd.env(
                "GIT_SSH_COMMAND",
                "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new",
            );
        }
        Self::hide_window(&mut cmd);
        Ok(cmd)
    }

    /// 如远程地址命中已保存的 HTTPS 凭据，则注入临时 credential.helper
    pub fn inject_credentials(cmd: &mut Command, remote_url: Option<&str>) {
        let Some(url) = remote_url else { return };
        let Some(cred) = CredentialStore::find_for_url(url) else {
            return;
        };
        // 先清空已有 helper，保证使用应用内配置的令牌
        let helper = r#"!f() { test "$1" = get && printf 'username=%s\npassword=%s\n' "$LANISMD_GIT_USERNAME" "$LANISMD_GIT_PASSWORD"; }; f"#;
        cmd.args(["-c", "credential.helper=", "-c"])
            .arg(format!("credential.helper={}", helper))
            .env(
                "LANISMD_GIT_USERNAME",
                if cred.username.is_empty() {
                    "oauth2".to_string()
                } else {
                    cred.username
                },
            )
            .env("LANISMD_GIT_PASSWORD", cred.token);
    }

    /// 执行并返回原始输出（不判断退出码）
    pub fn output(cwd: &Path, args: &[&str]) -> AppResult<Output> {
        let mut cmd = Self::command(cwd)?;
        cmd.args(args);
        cmd.output()
            .map_err(|e| AppError::Git(format!("启动 git 失败: {}", e)))
    }

    /// 执行并返回 stdout 文本，非 0 退出码转为本地化错误
    pub fn run(cwd: &Path, args: &[&str]) -> AppResult<String> {
        let out = Self::output(cwd, args)?;
        Self::check(out)
    }

    /// 执行网络命令（fetch/pull/push/ls-remote/clone）
    pub fn run_network(cwd: &Path, args: &[&str], remote_url: Option<&str>) -> AppResult<String> {
        let mut cmd = Self::command(cwd)?;
        Self::inject_credentials(&mut cmd, remote_url);
        cmd.args(args);
        let out = cmd
            .output()
            .map_err(|e| AppError::Git(format!("启动 git 失败: {}", e)))?;
        Self::check(out)
    }

    /// 成功返回 stdout，失败返回 None（用于探测类命令）
    pub fn try_run(cwd: &Path, args: &[&str]) -> Option<String> {
        let out = Self::output(cwd, args).ok()?;
        if out.status.success() {
            Some(String::from_utf8_lossy(&out.stdout).to_string())
        } else {
            None
        }
    }

    pub fn check(out: Output) -> AppResult<String> {
        if out.status.success() {
            return Ok(String::from_utf8_lossy(&out.stdout).to_string());
        }
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
        let raw = if stderr.trim().is_empty() {
            stdout
        } else {
            stderr
        };
        Err(AppError::Git(humanize_error(&raw)))
    }
}

/// 将常见 git 错误转换为可读提示，并保留原始输出的末尾几行便于排查
pub fn humanize_error(raw: &str) -> String {
    let lower = raw.to_lowercase();
    let hint = if lower.contains("authentication failed")
        || lower.contains("could not read username")
        || lower.contains("terminal prompts disabled")
        || lower.contains("invalid username or password")
        || lower.contains("http basic: access denied")
    {
        Some("认证失败：请在「设置 > Git」中为该域名配置访问令牌，或改用 SSH 地址")
    } else if lower.contains("permission denied (publickey") {
        Some("SSH 认证失败：请确认 SSH 密钥已添加到 ssh-agent 且已在远程平台登记")
    } else if lower.contains("host key verification failed") {
        Some("SSH 主机校验失败：请在终端中执行一次 ssh 连接确认主机指纹")
    } else if lower.contains("could not resolve host") || lower.contains("connection timed out") {
        Some("无法连接远程服务器，请检查网络或代理设置")
    } else if lower.contains("repository not found")
        || lower.contains("does not appear to be a git repository")
        || lower.contains("not found") && lower.contains("remote")
    {
        Some("仓库不存在或没有访问权限")
    } else if lower.contains("[rejected]")
        || lower.contains("non-fast-forward")
        || lower.contains("fetch first")
    {
        Some("推送被拒绝：远程有新的提交，请先同步后再提交")
    } else if lower.contains("there is no tracking information") || lower.contains("no upstream") {
        Some("当前分支没有关联远程分支")
    } else if lower.contains("please tell me who you are") || lower.contains("empty ident") {
        Some("未配置提交者身份（user.name / user.email）")
    } else if lower.contains("would be overwritten by") {
        Some("本地未提交的修改会被覆盖，请先提交或放弃这些修改")
    } else if lower.contains("not a git repository") {
        Some("当前目录不是 Git 仓库")
    } else if lower.contains("already exists and is not an empty directory") {
        Some("目标目录已存在且不为空")
    } else {
        None
    };
    let tail: Vec<&str> = raw
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();
    let start = tail.len().saturating_sub(6);
    let detail = tail[start..].join("\n");
    match hint {
        Some(h) if !detail.is_empty() => format!("{}\n{}", h, detail),
        Some(h) => h.to_string(),
        None if detail.is_empty() => "Git 命令执行失败".to_string(),
        None => detail,
    }
}

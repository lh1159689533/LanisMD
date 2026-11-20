// MCP 工作区解析：每次工具调用时确定要操作的文件夹
//
// 优先级：命令行 --root > 本次会话中用户明确选择的文件夹 > App 当前打开的文件夹 > 询问用户。
// 用户明确指定的目录代表本次意图，必须高于 App 中恰好打开的文件夹，否则 AI 会把文档写错位置。
// 询问优先走 MCP elicitation（由客户端弹出表单，用户直接作答）；客户端不支持时
// 返回候选列表，由模型询问用户后调用 select_workspace。
//
// @changelog
// | 版本   | 变更说明                                      | 关联                                  |
// | v1.0.0 | 初始实现：跟随 App、会话选择、elicitation 询问 | REQ: MCP 动态工作区 TECH: 方案 A + 询问 |
// | v1.1.0 | 会话选择优先于 App；支持工作区外 Markdown 绝对路径 | REQ: MCP 指定写入路径 TECH: 外部路径校验 |
// /@changelog
//
// @author hhhuilli

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use rmcp::model::{
    ElicitRequestParams, ElicitationAction, ElicitationSchema, EnumSchema,
    PrimitiveSchemaDefinition, StringSchema,
};
use rmcp::service::{ElicitationMode, RequestContext};
use rmcp::RoleServer;
use serde::Serialize;

use super::workspace::{resolve_external_markdown, Workspace};
use crate::services::app_bridge::client;
use crate::services::app_bridge::protocol::{AppSnapshot, DocumentsChanged};
use crate::services::app_state::{self, RecentFolder};

/// 等待用户在客户端表单中作答的时长
const ELICIT_TIMEOUT: Duration = Duration::from_secs(300);
/// 询问时最多列出的最近文件夹
const MAX_CANDIDATES: usize = 10;

/// 工作区来源
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceSource {
    /// 命令行 --root / LANISMD_WORKSPACE
    Fixed,
    /// LanisMD 当前打开的文件夹
    App,
    /// 本次会话中用户选择的文件夹
    Session,
}

/// 单次工具调用的上下文
pub struct ToolContext {
    pub ws: Workspace,
    pub source: WorkspaceSource,
    /// App 状态；None 表示 App 未运行
    pub app: Option<AppSnapshot>,
}

impl ToolContext {
    /// 解析 Markdown 文档路径。用户给出工作区外的绝对路径时直接使用该路径
    /// （--root 固定工作区时除外），避免 AI 退回相对路径而写进别的文件夹
    pub fn resolve_markdown(&self, input: &str) -> Result<PathBuf, String> {
        if self.allows_external(input) {
            return resolve_external_markdown(input);
        }
        self.ws.resolve_markdown(input)
    }

    /// 解析读取类工具的路径：工作区内可读任意文本，工作区外仅允许 Markdown
    pub fn resolve_readable(&self, input: &str) -> Result<PathBuf, String> {
        if self.allows_external(input) {
            return resolve_external_markdown(input);
        }
        self.ws.resolve(input)
    }

    fn allows_external(&self, input: &str) -> bool {
        self.source != WorkspaceSource::Fixed && self.ws.is_outside(input)
    }

    /// 用户正在 App 中编辑该文档且有未保存修改时拒绝写入，避免双方互相覆盖
    pub fn ensure_not_editing(&self, path: &Path) -> Result<(), String> {
        let Some(doc) = self.app.as_ref().and_then(|a| a.open_document.as_ref()) else {
            return Ok(());
        };
        if doc.dirty && same_file(Path::new(&doc.path), path) {
            return Err(format!(
                "用户正在 LanisMD 中编辑 {} 且有未保存的修改，为避免覆盖已拒绝本次写入。\
                 请稍后重试（编辑器会自动保存），或请用户保存后再继续",
                self.ws.relative(path)
            ));
        }
        Ok(())
    }

    /// 通知 App 刷新（App 未运行时跳过）
    pub fn notify(&self, kind: &str, path: &Path, from: Option<&Path>) {
        if self.app.is_none() {
            return;
        }
        client::notify_changed(DocumentsChanged {
            kind: kind.to_string(),
            path: self.app_path(path),
            from: from.map(|p| self.app_path(p)),
        });
    }

    /// 转为 App 侧使用的路径写法。工作区根目录经过 canonicalize（如 /tmp -> /private/tmp），
    /// 跟随 App 时按 App 的文件夹路径拼接，前端才能与自身记录的路径直接比较
    pub fn app_path(&self, path: &Path) -> String {
        let folder = self.app.as_ref().and_then(|a| a.current_folder.as_deref());
        let inside = path.starts_with(self.ws.root());
        match (self.source, folder) {
            (WorkspaceSource::App, Some(folder)) if inside => {
                let rel = self.ws.relative(path);
                if rel == "." {
                    folder.to_string()
                } else {
                    Path::new(folder).join(rel).to_string_lossy().to_string()
                }
            }
            _ => path.to_string_lossy().to_string(),
        }
    }
}

pub struct WorkspaceResolver {
    fixed: Option<Workspace>,
    session: Mutex<Option<Workspace>>,
    /// 并发调用同时缺少工作区时只询问一次
    ask_lock: tokio::sync::Mutex<()>,
}

impl WorkspaceResolver {
    pub fn new(fixed: Option<Workspace>) -> Self {
        Self {
            fixed,
            session: Mutex::new(None),
            ask_lock: tokio::sync::Mutex::new(()),
        }
    }

    /// 解析工作区，必要时询问用户。
    /// hint 为本次调用的目标路径：尚无工作区且 hint 是绝对路径时，以其所在目录作为本次工作区，
    /// 用户已明确给出位置，不必再询问
    pub async fn resolve(
        &self,
        rc: &RequestContext<RoleServer>,
        hint: Option<&str>,
    ) -> Result<ToolContext, String> {
        let app = query_app().await;
        if let Some((ws, source)) = self.peek(&app) {
            return Ok(ToolContext { ws, source, app });
        }
        if let Some(ws) = hint.and_then(workspace_from_hint) {
            return Ok(ToolContext { ws, source: WorkspaceSource::Session, app });
        }

        let _guard = self.ask_lock.lock().await;
        if let Some(ws) = self.session() {
            return Ok(ToolContext { ws, source: WorkspaceSource::Session, app });
        }
        let ws = ask_user(rc, app.is_some()).await?;
        self.set_session(ws.clone());
        Ok(ToolContext { ws, source: WorkspaceSource::Session, app })
    }

    /// 不询问用户，仅返回当前可确定的工作区
    pub fn peek(&self, app: &Option<AppSnapshot>) -> Option<(Workspace, WorkspaceSource)> {
        if let Some(ws) = &self.fixed {
            return Some((ws.clone(), WorkspaceSource::Fixed));
        }
        if let Some(ws) = self.session() {
            return Some((ws, WorkspaceSource::Session));
        }
        let folder = app.as_ref().and_then(|a| a.current_folder.as_deref())?;
        Workspace::new(Path::new(folder))
            .ok()
            .map(|ws| (ws, WorkspaceSource::App))
    }

    pub fn set_session(&self, ws: Workspace) {
        if let Ok(mut guard) = self.session.lock() {
            *guard = Some(ws);
        }
    }

    /// 清除会话选择，恢复跟随 App 当前打开的文件夹
    pub fn clear_session(&self) {
        if let Ok(mut guard) = self.session.lock() {
            *guard = None;
        }
    }

    pub fn is_fixed(&self) -> bool {
        self.fixed.is_some()
    }

    fn session(&self) -> Option<Workspace> {
        self.session.lock().ok().and_then(|g| g.clone())
    }
}

/// 由绝对路径的 Markdown 文件推导临时工作区（其所在目录，不存在则创建）。
/// 不写入会话选择，避免一次调用悄悄改变后续调用的工作区
fn workspace_from_hint(hint: &str) -> Option<Workspace> {
    let path = resolve_external_markdown(hint).ok()?;
    let parent = path.parent()?;
    Workspace::from_user_choice(&parent.to_string_lossy()).ok()
}

/// 查询 App 状态（桥接为阻塞 IO，放到阻塞线程池）
pub async fn query_app() -> Option<AppSnapshot> {
    tokio::task::spawn_blocking(client::get_state).await.ok().flatten()
}

/// 仍然存在的最近文件夹（去重，按最近打开排序）
pub fn recent_candidates() -> Vec<RecentFolder> {
    let mut seen: Vec<PathBuf> = Vec::new();
    let mut result = Vec::new();
    for folder in app_state::read_recent_folders() {
        let Ok(canon) = Path::new(&folder.path).canonicalize() else {
            continue;
        };
        if !canon.is_dir() || seen.contains(&canon) {
            continue;
        }
        seen.push(canon);
        result.push(folder);
        if result.len() >= MAX_CANDIDATES {
            break;
        }
    }
    result
}

async fn ask_user(rc: &RequestContext<RoleServer>, app_running: bool) -> Result<Workspace, String> {
    let candidates = recent_candidates();
    let situation = if app_running {
        "LanisMD 当前没有打开文件夹"
    } else {
        "LanisMD 未运行"
    };
    if !rc.peer.supported_elicitation_modes().contains(&ElicitationMode::Form) {
        return Err(fallback_message(situation, &candidates));
    }

    let Ok((message, schema)) = build_form(situation, &candidates) else {
        return Err(fallback_message(situation, &candidates));
    };
    let response = rc
        .peer
        .create_elicitation_with_timeout(
            ElicitRequestParams::FormElicitationParams {
                meta: None,
                message,
                requested_schema: schema,
            },
            Some(ELICIT_TIMEOUT),
        )
        .await;

    let result = match response {
        Ok(r) => r,
        // 客户端声明支持却请求失败（超时、协议版本不允许等），退回由模型询问
        Err(_) => return Err(fallback_message(situation, &candidates)),
    };
    match result.action {
        ElicitationAction::Accept => {
            let content = result.content.unwrap_or_default();
            let pick = |key: &str| {
                content
                    .get(key)
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string)
            };
            let chosen = pick("otherPath")
                .or_else(|| pick("folder"))
                .or_else(|| pick("path"))
                .ok_or("没有选择工作区，本次操作已取消")?;
            Workspace::from_user_choice(&chosen)
        }
        // Decline / Cancel 以及协议后续新增的动作都视为未选择
        _ => Err("用户未选择工作区，本次操作已取消".to_string()),
    }
}

/// 构建询问表单：有最近文件夹时给下拉选项 + 自定义目录，否则只要求输入目录
fn build_form(situation: &str, candidates: &[RecentFolder]) -> Result<(String, ElicitationSchema), String> {
    if candidates.is_empty() {
        let schema = ElicitationSchema::builder()
            .required_string_property("path", |s: StringSchema| {
                s.title("写入目录")
                    .description("文档要保存到的文件夹绝对路径，不存在会自动创建")
            })
            .build()?;
        let message = format!("{}，也没有最近打开的文件夹。请指定 AI 读写文档的目录。", situation);
        return Ok((message, schema));
    }

    let values: Vec<String> = candidates.iter().map(|c| c.path.clone()).collect();
    let titles: Vec<String> = candidates
        .iter()
        .map(|c| format!("{}（{}）", c.name, c.path))
        .collect();
    let base = || {
        EnumSchema::builder(values.clone())
            .title("最近打开的文件夹")
            .description("AI 将在该文件夹内读写 Markdown 文档")
    };
    // 标题数与选项数、默认值都由候选列表构造，正常不会失败；失败时退回无标题选项
    let builder = base().enum_titles(titles).unwrap_or_else(|_| base());
    let builder = match builder.with_default(values[0].clone()) {
        Ok(b) => b,
        Err(_) => base(),
    };
    let schema = ElicitationSchema::builder()
        .property("folder", PrimitiveSchemaDefinition::Enum(builder.build()))
        .string_property("otherPath", |s: StringSchema| {
            s.title("或使用其他目录")
                .description("填写后优先使用；绝对路径，不存在会自动创建")
        })
        .build()?;
    let message = format!("{}。请选择 AI 本次要访问的工作区。", situation);
    Ok((message, schema))
}

/// 客户端不支持 elicitation 时的提示：交给模型询问用户
fn fallback_message(situation: &str, candidates: &[RecentFolder]) -> String {
    let mut msg = format!(
        "尚未确定工作区：{}。请先询问用户要使用哪个文件夹，得到用户明确答复后调用 \
         select_workspace(path)，再重试本操作。不要替用户做选择。\n",
        situation
    );
    if candidates.is_empty() {
        msg.push_str("没有最近打开的文件夹，请询问用户文档要写入的目录（绝对路径，不存在会自动创建）。");
    } else {
        msg.push_str("最近打开的文件夹：\n");
        for (i, c) in candidates.iter().enumerate() {
            msg.push_str(&format!("{}. {}：{}\n", i + 1, c.name, c.path));
        }
        msg.push_str("用户也可以指定其他目录。");
    }
    msg
}

/// 比较两个路径是否指向同一文件（解析符号链接，如 /tmp 与 /private/tmp）
fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(x), Ok(y)) => x == y,
        _ => a == b,
    }
}

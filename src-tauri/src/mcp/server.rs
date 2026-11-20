// LanisMD MCP Server：向外部 AI 客户端开放工作区文档读写、搜索与 Git 查询能力
//
// @changelog
// | 版本   | 变更说明                                             | 关联                                   |
// | v1.0.0 | 初始实现：文档读写/大纲/搜索 + Git 只读查询工具       | REQ: MCP Server TECH: rmcp + stdio     |
// | v1.1.0 | 工作区按调用动态解析；version 乐观锁；App 界面联动     | REQ: MCP 动态工作区 TECH: 桥接 + 询问 |
// | v1.2.0 | 文档工具支持工作区外绝对路径；会话选择优先于 App       | REQ: MCP 指定写入路径 TECH: 外部路径校验 |
// /@changelog
//
// @author hhhuilli

use std::path::{Path, PathBuf};
use std::sync::Arc;

use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock, Implementation, ServerCapabilities, ServerConfig};
use rmcp::service::RequestContext;
use rmcp::{tool, tool_handler, tool_router, RoleServer, ServerHandler};
use serde::Serialize;
use serde_json::json;
use walkdir::WalkDir;

use super::args::*;
use super::document::{self, check_version, read_text, write_text};
use super::markdown;
use super::resolver::{self, ToolContext, WorkspaceResolver};
use super::workspace::{is_markdown, Workspace};
use crate::services::app_bridge::client;
use crate::services::git::{repo, types::FileEntryRequest};
use crate::services::search_service::{self, SearchParams};

/// 工具返回值：成功为文本内容，失败为错误说明（会以 isError 结果回给客户端）
type ToolResult = Result<String, String>;

/// 只读模式下需要移除的写入类工具
const WRITE_TOOLS: &[&str] = &[
    "write_document",
    "edit_document",
    "append_document",
    "move_document",
    "trash_document",
];

/// list_documents 最多返回的条目数
const MAX_LIST_ENTRIES: usize = 2000;
/// 搜索结果中单行内容的最大字符数
const MAX_LINE_CHARS: usize = 300;
/// git_diff 输出上限
const MAX_DIFF_BYTES: usize = 64 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentEntry {
    path: String,
    size_bytes: u64,
    modified: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchHit {
    line: u32,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchFileHit {
    path: String,
    matches: Vec<SearchHit>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CommitView {
    hash: String,
    subject: String,
    author: String,
    date: String,
    added: u32,
    modified: u32,
    deleted: u32,
}

/// 当前工作区对应的 Git 仓库上下文
struct GitContext {
    /// 仓库根目录（规范化绝对路径）
    root: PathBuf,
    info: crate::services::git::types::RepoInfo,
}

#[derive(Clone)]
pub struct LanisMdServer {
    resolver: Arc<WorkspaceResolver>,
    read_only: bool,
    tool_router: ToolRouter<Self>,
}

impl LanisMdServer {
    pub fn new(fixed: Option<Workspace>, read_only: bool) -> Self {
        let mut tool_router = Self::tool_router();
        if read_only {
            for name in WRITE_TOOLS {
                tool_router.remove_route(name);
            }
        }
        Self {
            resolver: Arc::new(WorkspaceResolver::new(fixed)),
            read_only,
            tool_router,
        }
    }

    /// 解析工作区后在阻塞线程池中执行同步逻辑，避免阻塞 stdio 事件循环
    /// hint 为本次操作的目标路径，用于在尚无工作区时直接采用用户给出的绝对路径
    async fn run<T, F>(&self, rc: &RequestContext<RoleServer>, hint: Option<&str>, f: F) -> Result<T, String>
    where
        T: Send + 'static,
        F: FnOnce(&ToolContext) -> Result<T, String> + Send + 'static,
    {
        let cx = self.resolver.resolve(rc, hint).await?;
        tokio::task::spawn_blocking(move || f(&cx))
            .await
            .map_err(|e| format!("工具执行失败: {}", e))?
    }
}

#[tool_router]
impl LanisMdServer {
    /// 查看当前工作区：路径、来源（App 当前文件夹 / 会话中用户选择 / 命令行指定）、LanisMD 是否运行、最近打开的文件夹。不会触发询问
    #[tool(annotations(read_only_hint = true))]
    async fn get_workspace(&self) -> ToolResult {
        let app = resolver::query_app().await;
        let current = self.resolver.peek(&app);
        let recent: Vec<serde_json::Value> = resolver::recent_candidates()
            .into_iter()
            .map(|f| json!({ "name": f.name, "path": f.path }))
            .collect();
        to_json(&json!({
            "workspace": current.as_ref().map(|(ws, _)| ws.root_str()),
            "source": current.as_ref().map(|(_, s)| *s),
            "appRunning": app.is_some(),
            "appFolder": app.as_ref().and_then(|a| a.current_folder.clone()),
            "recentFolders": recent,
            "hint": if current.is_none() {
                "尚未确定工作区：调用任意文档工具时会询问用户，也可在用户明确选择后调用 select_workspace"
            } else {
                "用户指定了其他目录时，直接给文档工具传绝对路径，或调用 select_workspace 切换"
            },
        }))
    }

    /// 设定本次会话的工作区，优先于 LanisMD 当前打开的文件夹。只能使用用户明确选择或提供的文件夹，禁止自行挑选。传空字符串恢复跟随 App
    #[tool(annotations(read_only_hint = false, destructive_hint = false))]
    async fn select_workspace(&self, Parameters(args): Parameters<SelectWorkspaceArgs>) -> ToolResult {
        if self.resolver.is_fixed() {
            return Err("工作区已由启动参数 --root 固定，不能切换".to_string());
        }
        if args.path.trim().is_empty() {
            self.resolver.clear_session();
            return Ok("已清除会话工作区，后续工具调用跟随 LanisMD 当前打开的文件夹".to_string());
        }
        let ws = tokio::task::spawn_blocking(move || Workspace::from_user_choice(&args.path))
            .await
            .map_err(|e| e.to_string())??;
        let root = ws.root_str();
        self.resolver.set_session(ws);
        Ok(format!("已选择工作区 {}，后续工具调用都会使用该文件夹", root))
    }

    /// 列出工作区内的 Markdown 文档（自动跳过隐藏目录）
    #[tool(annotations(read_only_hint = true))]
    async fn list_documents(
        &self,
        Parameters(args): Parameters<ListDocumentsArgs>,
        rc: RequestContext<RoleServer>,
    ) -> ToolResult {
        self.run(&rc, None, move |cx| {
            let ws = &cx.ws;
            let dir = ws.resolve(args.dir.as_deref().unwrap_or("."))?;
            if !dir.is_dir() {
                return Err(format!("不是目录: {}", ws.relative(&dir)));
            }
            let depth = if args.recursive.unwrap_or(true) { usize::MAX } else { 1 };
            let mut entries = Vec::new();
            let mut truncated = false;
            let walker = WalkDir::new(&dir)
                .max_depth(depth)
                .follow_links(false)
                .sort_by_file_name()
                .into_iter()
                .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'));
            for entry in walker.filter_map(|e| e.ok()) {
                let path = entry.path();
                if !entry.file_type().is_file() || !is_markdown(path) {
                    continue;
                }
                if entries.len() >= MAX_LIST_ENTRIES {
                    truncated = true;
                    break;
                }
                let meta = entry.metadata().ok();
                entries.push(DocumentEntry {
                    path: ws.relative(path),
                    size_bytes: meta.as_ref().map(|m| m.len()).unwrap_or(0),
                    modified: meta.and_then(|m| m.modified().ok()).map(|t| {
                        chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%d %H:%M").to_string()
                    }),
                });
            }
            to_json(&json!({
                "workspace": ws.root_str(),
                "workspaceSource": cx.source,
                "dir": ws.relative(&dir),
                "count": entries.len(),
                "truncated": truncated,
                "documents": entries,
            }))
        })
        .await
    }

    /// 读取文档。返回两段内容：第一段是元信息（含 version，修改时传给 expected_version 防止覆盖他人改动），第二段是正文。可用 start_line / end_line 只读部分行
    #[tool(annotations(read_only_hint = true))]
    async fn read_document(
        &self,
        Parameters(args): Parameters<ReadDocumentArgs>,
        rc: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, String> {
        let hint = args.path.clone();
        self.run(&rc, Some(&hint), move |cx| {
            let path = cx.resolve_readable(&args.path)?;
            let file = read_text(&path, &cx.ws)?;
            let (text, start, end, total) =
                markdown::slice_lines(&file.content, args.start_line, args.end_line)?;
            let meta = json!({
                "path": cx.ws.relative(&path),
                "version": file.version,
                "totalLines": total,
                "startLine": start,
                "endLine": end,
                "editingInApp": cx.ensure_not_editing(&path).is_err(),
            });
            let body = if args.start_line.is_none() && args.end_line.is_none() { file.content } else { text };
            Ok(CallToolResult::success(vec![
                ContentBlock::text(meta.to_string()),
                ContentBlock::text(body),
            ]))
        })
        .await
    }

    /// 获取文档的标题大纲（级别、标题文本、行号）与 version，适合在读取长文档前快速了解结构
    #[tool(annotations(read_only_hint = true))]
    async fn get_outline(&self, Parameters(args): Parameters<PathArgs>, rc: RequestContext<RoleServer>) -> ToolResult {
        let hint = args.path.clone();
        self.run(&rc, Some(&hint), move |cx| {
            let path = cx.resolve_readable(&args.path)?;
            let file = read_text(&path, &cx.ws)?;
            to_json(&json!({
                "path": cx.ws.relative(&path),
                "version": file.version,
                "totalLines": file.content.lines().count(),
                "headings": markdown::outline(&file.content),
            }))
        })
        .await
    }

    /// 在工作区所有 Markdown 文档中全文搜索，返回匹配的文件与行
    #[tool(annotations(read_only_hint = true))]
    async fn search_documents(
        &self,
        Parameters(args): Parameters<SearchDocumentsArgs>,
        rc: RequestContext<RoleServer>,
    ) -> ToolResult {
        self.run(&rc, None, move |cx| {
            let ws = &cx.ws;
            let dir = ws.resolve(args.dir.as_deref().unwrap_or("."))?;
            let params = SearchParams {
                root_path: dir.to_string_lossy().to_string(),
                query: args.query,
                case_sensitive: args.case_sensitive.unwrap_or(false),
                whole_word: args.whole_word.unwrap_or(false),
                use_regex: args.use_regex.unwrap_or(false),
                include_folders: Vec::new(),
                exclude_folders: Vec::new(),
            };
            let resp = search_service::search(&params)?;
            let limit = args.max_results.unwrap_or(100).clamp(1, 1000);
            let mut remaining = limit;
            let mut files = Vec::new();
            for file in resp.results {
                if remaining == 0 {
                    break;
                }
                let matches: Vec<SearchHit> =
                    dedup_lines(file.matches.iter().map(|m| (m.line_number, &m.line_content)))
                        .into_iter()
                        .take(remaining)
                        .collect();
                remaining -= matches.len();
                files.push(SearchFileHit {
                    path: ws.relative(Path::new(&file.file_path)),
                    matches,
                });
            }
            to_json(&json!({
                "totalMatches": resp.total_matches,
                "totalFiles": resp.total_files,
                "truncated": remaining == 0 && resp.total_matches as usize > limit,
                "results": files,
            }))
        })
        .await
    }

    /// 创建 Markdown 文档或整体覆盖已有文档。覆盖时必须带 read_document 返回的 expected_version；局部修改请用 edit_document
    #[tool(annotations(destructive_hint = true, idempotent_hint = true))]
    async fn write_document(
        &self,
        Parameters(args): Parameters<WriteDocumentArgs>,
        rc: RequestContext<RoleServer>,
    ) -> ToolResult {
        let hint = args.path.clone();
        self.run(&rc, Some(&hint), move |cx| {
            let ws = &cx.ws;
            let path = cx.resolve_markdown(&args.path)?;
            if path.is_dir() {
                return Err(format!("目标是目录: {}", args.path));
            }
            let exists = path.exists();
            let encoding = if exists {
                if !args.overwrite.unwrap_or(false) {
                    return Err(format!(
                        "文件已存在: {}。如需整体覆盖请设置 overwrite=true 并传入 expected_version，局部修改请用 edit_document",
                        ws.relative(&path)
                    ));
                }
                let expected = args
                    .expected_version
                    .as_deref()
                    .filter(|v| !v.trim().is_empty())
                    .ok_or("覆盖已有文件必须传入 expected_version（先调用 read_document 获取），避免覆盖他人的改动")?;
                cx.ensure_not_editing(&path)?;
                let current = read_text(&path, ws)?;
                check_version(&current.version, Some(expected), ws, &path)?;
                // 沿用原文件编码，避免 GBK 等文件被改写成 UTF-8
                current.encoding
            } else {
                "utf-8".to_string()
            };
            let version = write_text(&path, &args.content, &encoding)?;
            cx.notify(if exists { "modified" } else { "created" }, &path, None);
            to_json(&json!({
                "message": format!("{} {}", if exists { "已覆盖" } else { "已创建" }, ws.relative(&path)),
                "path": ws.relative(&path),
                "version": version,
            }))
        })
        .await
    }

    /// 精确替换文档中的一段文本。old_text 需与原文逐字一致且唯一，否则报错不做修改；建议带上 expected_version
    #[tool(annotations(destructive_hint = true))]
    async fn edit_document(
        &self,
        Parameters(args): Parameters<EditDocumentArgs>,
        rc: RequestContext<RoleServer>,
    ) -> ToolResult {
        let hint = args.path.clone();
        self.run(&rc, Some(&hint), move |cx| {
            let ws = &cx.ws;
            let path = cx.resolve_markdown(&args.path)?;
            cx.ensure_not_editing(&path)?;
            let file = read_text(&path, ws)?;
            check_version(&file.version, args.expected_version.as_deref(), ws, &path)?;
            let (updated, count) = markdown::replace_exact(
                &file.content,
                &args.old_text,
                &args.new_text,
                args.replace_all.unwrap_or(false),
            )?;
            let version = write_text(&path, &updated, &file.encoding)?;
            cx.notify("modified", &path, None);
            to_json(&json!({
                "message": format!("已修改 {}，替换 {} 处", ws.relative(&path), count),
                "path": ws.relative(&path),
                "replacements": count,
                "version": version,
            }))
        })
        .await
    }

    /// 在文档末尾追加内容，文档不存在时自动创建（适合日记、会议记录等场景）
    #[tool(annotations(destructive_hint = false))]
    async fn append_document(
        &self,
        Parameters(args): Parameters<AppendDocumentArgs>,
        rc: RequestContext<RoleServer>,
    ) -> ToolResult {
        let hint = args.path.clone();
        self.run(&rc, Some(&hint), move |cx| {
            let ws = &cx.ws;
            let path = cx.resolve_markdown(&args.path)?;
            let (content, encoding, kind) = if path.exists() {
                cx.ensure_not_editing(&path)?;
                let file = read_text(&path, ws)?;
                check_version(&file.version, args.expected_version.as_deref(), ws, &path)?;
                let mut content = file.content;
                if !content.is_empty() && !content.ends_with('\n') {
                    content.push('\n');
                }
                content.push_str(&args.content);
                (content, file.encoding, "modified")
            } else {
                (args.content, "utf-8".to_string(), "created")
            };
            let version = write_text(&path, &content, &encoding)?;
            cx.notify(kind, &path, None);
            let verb = if kind == "created" { "已创建" } else { "已追加到" };
            to_json(&json!({
                "message": format!("{} {}", verb, ws.relative(&path)),
                "path": ws.relative(&path),
                "version": version,
            }))
        })
        .await
    }

    /// 重命名或移动 Markdown 文档（目标不能已存在，目标目录不存在时自动创建）
    #[tool(annotations(destructive_hint = false))]
    async fn move_document(
        &self,
        Parameters(args): Parameters<MoveDocumentArgs>,
        rc: RequestContext<RoleServer>,
    ) -> ToolResult {
        let hint = args.to.clone();
        self.run(&rc, Some(&hint), move |cx| {
            let ws = &cx.ws;
            let from = cx.resolve_markdown(&args.from)?;
            let to = cx.resolve_markdown(&args.to)?;
            if !from.is_file() {
                return Err(format!("源文件不存在: {}", args.from));
            }
            if to.exists() {
                return Err(format!("目标已存在: {}", ws.relative(&to)));
            }
            cx.ensure_not_editing(&from)?;
            if let Some(parent) = to.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::rename(&from, &to).map_err(|e| format!("移动失败: {}", e))?;
            cx.notify("moved", &to, Some(&from));
            Ok(format!("已移动 {} -> {}", ws.relative(&from), ws.relative(&to)))
        })
        .await
    }

    /// 把 Markdown 文档移到系统废纸篓（可在废纸篓中恢复，不会永久删除）
    #[tool(annotations(destructive_hint = true))]
    async fn trash_document(&self, Parameters(args): Parameters<PathArgs>, rc: RequestContext<RoleServer>) -> ToolResult {
        let hint = args.path.clone();
        self.run(&rc, Some(&hint), move |cx| {
            let path = cx.resolve_markdown(&args.path)?;
            if !path.is_file() {
                return Err(format!("文件不存在: {}", args.path));
            }
            cx.ensure_not_editing(&path)?;
            document::move_to_trash(&path)?;
            cx.notify("trashed", &path, None);
            Ok(format!("已移到废纸篓: {}", cx.ws.relative(&path)))
        })
        .await
    }

    /// 在 LanisMD 编辑器中打开文档，让用户看到 AI 创建或修改的内容（需要 LanisMD 正在运行）
    #[tool(annotations(read_only_hint = true))]
    async fn open_document(&self, Parameters(args): Parameters<PathArgs>, rc: RequestContext<RoleServer>) -> ToolResult {
        let hint = args.path.clone();
        self.run(&rc, Some(&hint), move |cx| {
            let path = cx.resolve_markdown(&args.path)?;
            if !path.is_file() {
                return Err(format!("文件不存在: {}", args.path));
            }
            if cx.app.is_none() {
                return Err("LanisMD 未运行，无法打开文档。请用户先启动 LanisMD".to_string());
            }
            client::open_document(&cx.app_path(&path))?;
            Ok(format!("已在 LanisMD 中打开 {}", cx.ws.relative(&path)))
        })
        .await
    }

    /// 查看工作区的 Git 状态：当前分支、与远程的领先/落后数、未提交的改动文件
    #[tool(annotations(read_only_hint = true))]
    async fn git_status(&self, rc: RequestContext<RoleServer>) -> ToolResult {
        self.run(&rc, None, |cx| {
            let ws = &cx.ws;
            let git = git_context(ws)?;
            let files = repo::status(&git.root.to_string_lossy(), &git.info.scope).map_err(|e| e.to_string())?;
            let files: Vec<serde_json::Value> = files
                .into_iter()
                .map(|f| {
                    json!({
                        "path": ws.relative(&git.root.join(&f.path)),
                        "status": f.status,
                        "additions": f.additions,
                        "deletions": f.deletions,
                    })
                })
                .collect();
            to_json(&json!({
                "branch": git.info.branch,
                "head": git.info.head_short,
                "upstream": git.info.upstream,
                "ahead": git.info.ahead,
                "behind": git.info.behind,
                "merging": git.info.merging,
                "changes": files,
            }))
        })
        .await
    }

    /// 查看提交历史，可限定某个文件或目录
    #[tool(annotations(read_only_hint = true))]
    async fn git_log(&self, Parameters(args): Parameters<GitLogArgs>, rc: RequestContext<RoleServer>) -> ToolResult {
        self.run(&rc, None, move |cx| {
            let ws = &cx.ws;
            let git = git_context(ws)?;
            let scope = match &args.path {
                Some(p) => repo_relative(&git.root, &ws.resolve(p)?)?,
                None => git.info.scope.clone(),
            };
            let limit = args.limit.unwrap_or(20).clamp(1, 200);
            let commits = repo::log(&git.root.to_string_lossy(), &scope, args.skip.unwrap_or(0), limit)
                .map_err(|e| e.to_string())?;
            let commits: Vec<CommitView> = commits
                .into_iter()
                .map(|c| CommitView {
                    hash: c.short_hash,
                    subject: c.subject,
                    author: c.author_name,
                    date: chrono::DateTime::from_timestamp(c.timestamp, 0)
                        .map(|t| t.with_timezone(&chrono::Local).format("%Y-%m-%d %H:%M").to_string())
                        .unwrap_or_default(),
                    added: c.added,
                    modified: c.modified,
                    deleted: c.deleted,
                })
                .collect();
            to_json(&commits)
        })
        .await
    }

    /// 查看未提交改动的 diff 文本（相对 HEAD），可只看指定文件
    #[tool(annotations(read_only_hint = true))]
    async fn git_diff(&self, Parameters(args): Parameters<GitDiffArgs>, rc: RequestContext<RoleServer>) -> ToolResult {
        self.run(&rc, None, move |cx| {
            let ws = &cx.ws;
            let git = git_context(ws)?;
            let repo_root = git.root.to_string_lossy().to_string();
            let mut files = repo::status(&repo_root, &git.info.scope).map_err(|e| e.to_string())?;
            if let Some(paths) = &args.paths {
                let wanted = paths
                    .iter()
                    .map(|p| ws.resolve(p).and_then(|abs| repo_relative(&git.root, &abs)))
                    .collect::<Result<Vec<_>, _>>()?;
                files.retain(|f| wanted.iter().any(|w| f.path == *w || f.path.starts_with(&format!("{}/", w))));
            }
            if files.is_empty() {
                return Ok("没有未提交的改动".to_string());
            }
            let entries: Vec<FileEntryRequest> = files
                .into_iter()
                .map(|f| FileEntryRequest {
                    path: f.path,
                    old_path: f.old_path,
                    status: f.status,
                })
                .collect();
            repo::diff_text(&repo_root, &entries, MAX_DIFF_BYTES).map_err(|e| e.to_string())
        })
        .await
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for LanisMdServer {
    fn get_info(&self) -> ServerConfig {
        let mode = if self.read_only {
            "当前为只读模式，只能读取、搜索与查询 Git，不能修改文件。"
        } else {
            "可读写工作区内的 Markdown 文档；删除操作会移到系统废纸篓。"
        };
        let instructions = format!(
            "LanisMD Markdown 工作区。{}\n\
             工作区：优先使用 select_workspace 选择的文件夹，其次是 LanisMD 当前打开的文件夹，\
             都没有时会询问用户（列出最近打开的文件夹）；可用 get_workspace 查看当前工作区。\
             相对路径基于工作区根目录；用户指定了具体目录或文件位置时，必须原样传入绝对路径\
             （如 /Users/me/docs/需求.md，可在工作区之外），禁止改写成相对路径。隐藏目录（如 .git）不可访问。\n\
             修改流程：read_document 取得 version -> edit_document / write_document 带上 expected_version；\
             版本冲突或用户正在编辑时会拒绝写入，此时重新读取后再改。修改完成后可调用 open_document 让用户查看。",
            mode
        );
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(
                Implementation::new("lanismd", env!("CARGO_PKG_VERSION"))
                    .with_title("LanisMD")
                    .with_description("LanisMD Markdown 工作区"),
            )
            .with_instructions(instructions)
    }
}

fn to_json<T: Serialize>(value: &T) -> ToolResult {
    serde_json::to_string_pretty(value).map_err(|e| e.to_string())
}

/// 同一行有多处匹配时只保留一条，并截断过长的行
fn dedup_lines<'a>(items: impl Iterator<Item = (u32, &'a String)>) -> Vec<SearchHit> {
    let mut hits: Vec<SearchHit> = Vec::new();
    for (line, text) in items {
        if hits.last().map(|h| h.line) == Some(line) {
            continue;
        }
        let mut text: String = text.chars().take(MAX_LINE_CHARS).collect();
        if text.chars().count() == MAX_LINE_CHARS {
            text.push_str("...");
        }
        hits.push(SearchHit { line, text });
    }
    hits
}

/// 定位工作区所属的 Git 仓库
fn git_context(ws: &Workspace) -> Result<GitContext, String> {
    let info = repo::repo_info(&ws.root_str())
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "工作区不是 Git 仓库，或系统未安装 git".to_string())?;
    let root = PathBuf::from(&info.root)
        .canonicalize()
        .map_err(|e| format!("仓库路径不可用: {}", e))?;
    Ok(GitContext { root, info })
}

/// 绝对路径转为相对仓库根目录的路径（git pathspec 使用 '/'）
fn repo_relative(repo_root: &Path, abs: &Path) -> Result<String, String> {
    let rel = abs
        .strip_prefix(repo_root)
        .map_err(|_| format!("路径不在 Git 仓库内: {}", abs.display()))?;
    Ok(rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/"))
}

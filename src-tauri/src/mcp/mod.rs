// MCP 入口：`lanismd mcp` 以 stdio 方式运行 MCP Server，不启动 GUI
//
// @changelog
// | 版本   | 变更说明                                   | 关联                                  |
// | v1.0.0 | 初始实现：命令行解析 + stdio 服务          | REQ: MCP Server TECH: rmcp + stdio    |
// | v1.1.0 | --root 改为可选覆盖，默认跟随 App 动态解析 | REQ: MCP 动态工作区 TECH: 方案 A      |
// /@changelog
//
// @author hhhuilli

mod args;
mod document;
mod markdown;
mod resolver;
mod server;
mod workspace;

use rmcp::ServiceExt;

use server::LanisMdServer;
use workspace::{expand_home, Workspace};

/// 命令行中触发 MCP 模式的子命令
pub const SUBCOMMAND: &str = "mcp";

const USAGE: &str = "\
用法: lanismd mcp [--root <目录>] [--read-only]

以 stdio 方式运行 LanisMD MCP Server，供 Claude Desktop / Cursor / WorkBuddy 等客户端调用。

工作区默认跟随 LanisMD 当前打开的文件夹；LanisMD 未运行或未打开文件夹时，
会在首次使用时询问用户（列出最近打开的文件夹，或让用户指定写入目录）。

选项:
  --root <目录>   固定工作区，不再跟随 App（也可用环境变量 LANISMD_WORKSPACE）
  --read-only     只读模式，不暴露写入类工具
  -h, --help      显示帮助
";

/// 命令行参数
struct McpOptions {
    root: Option<String>,
    read_only: bool,
}

/// 判断进程参数是否要求进入 MCP 模式
pub fn is_mcp_invocation(args: &[String]) -> bool {
    args.get(1).map(|s| s == SUBCOMMAND).unwrap_or(false)
}

/// 运行 MCP Server 直到客户端断开，返回进程退出码。
/// 注意：stdout 是协议通道，所有日志只能写 stderr。
pub fn run_cli(args: &[String]) -> i32 {
    let opts = match parse_args(&args[2..]) {
        Ok(Some(opts)) => opts,
        Ok(None) => {
            eprint!("{}", USAGE);
            return 0;
        }
        Err(msg) => {
            eprintln!("lanismd mcp: {}\n\n{}", msg, USAGE);
            return 2;
        }
    };

    let fixed = match opts.root.as_deref() {
        Some(root) => match Workspace::new(&expand_home(root)) {
            Ok(ws) => Some(ws),
            Err(msg) => {
                eprintln!("lanismd mcp: {}", msg);
                return 1;
            }
        },
        None => None,
    };

    let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("lanismd mcp: 无法创建异步运行时: {}", e);
            return 1;
        }
    };

    eprintln!(
        "lanismd mcp: 工作区 {}{}",
        fixed
            .as_ref()
            .map(|ws| ws.root_str())
            .unwrap_or_else(|| "跟随 LanisMD".to_string()),
        if opts.read_only { "（只读）" } else { "" }
    );

    let result = runtime.block_on(async move {
        let service = LanisMdServer::new(fixed, opts.read_only)
            .serve(rmcp::transport::stdio())
            .await?;
        service.waiting().await?;
        Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
    });

    // stdin 上未完成的阻塞读无法取消，直接结束运行时避免退出时卡住
    runtime.shutdown_background();

    match result {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("lanismd mcp: {}", e);
            1
        }
    }
}

/// 解析 `mcp` 之后的参数；返回 Ok(None) 表示请求帮助
fn parse_args(args: &[String]) -> Result<Option<McpOptions>, String> {
    let mut root: Option<String> = None;
    let mut read_only = false;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "-h" | "--help" => return Ok(None),
            "--read-only" => read_only = true,
            "--root" => {
                let value = iter.next().ok_or("--root 缺少目录参数")?;
                root = Some(value.clone());
            }
            other if other.starts_with("--root=") => {
                root = Some(other["--root=".len()..].to_string());
            }
            other => return Err(format!("未知参数: {}", other)),
        }
    }
    let root = root.or_else(|| {
        std::env::var("LANISMD_WORKSPACE")
            .ok()
            .filter(|v| !v.trim().is_empty())
    });
    Ok(Some(McpOptions { root, read_only }))
}

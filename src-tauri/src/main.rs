// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `lanismd mcp ...` 以 MCP Server 模式运行（stdio），不启动窗口
    let args: Vec<String> = std::env::args().collect();
    if lanismd_lib::mcp::is_mcp_invocation(&args) {
        std::process::exit(lanismd_lib::mcp::run_cli(&args));
    }
    lanismd_lib::run()
}

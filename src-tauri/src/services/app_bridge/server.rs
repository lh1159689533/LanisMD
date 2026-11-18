// App 侧桥接服务：在 127.0.0.1 随机端口监听，供 `lanismd mcp` 查询 App 状态、通知刷新
//
// 前端通过 mcp_sync_state 命令推送状态到内存快照，桥接请求直接读快照，
// 无需往返 WebView；文档变更与打开文档请求转为 Tauri 事件交给前端处理。
//
// @changelog
// | 版本   | 变更说明                             | 关联                                |
// | v1.0.0 | 初始实现：token 鉴权、状态快照、事件转发 | REQ: MCP 界面联动 TECH: 本地 TCP 桥接 |
// /@changelog
//
// @author hhhuilli

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use once_cell::sync::{Lazy, OnceCell};
use tauri::{AppHandle, Emitter, Manager};

use super::protocol::*;
use crate::services::app_state::{self, BridgeInfo};

/// 前端监听的事件名
pub const EVENT_DOCUMENTS_CHANGED: &str = "mcp:documents-changed";
pub const EVENT_OPEN_DOCUMENT: &str = "mcp:open-document";

/// 单个请求的读写超时，防止异常客户端占住监听线程
const IO_TIMEOUT: Duration = Duration::from_secs(2);
/// 单条请求的最大字节数
const MAX_REQUEST_BYTES: u64 = 64 * 1024;

static SNAPSHOT: Lazy<Mutex<AppSnapshot>> = Lazy::new(|| Mutex::new(AppSnapshot::default()));
static TOKEN: OnceCell<String> = OnceCell::new();

/// 更新前端推送的状态快照
pub fn update_snapshot(snapshot: AppSnapshot) {
    if let Ok(mut guard) = SNAPSHOT.lock() {
        *guard = snapshot;
    }
}

fn current_snapshot() -> AppSnapshot {
    SNAPSHOT.lock().map(|g| g.clone()).unwrap_or_default()
}

/// 启动桥接监听线程并写入端点文件；失败只记录日志，不影响 App 启动
pub fn start(app: AppHandle) {
    let listener = match TcpListener::bind(("127.0.0.1", 0)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[app-bridge] 监听失败: {}", e);
            return;
        }
    };
    let port = match listener.local_addr() {
        Ok(addr) => addr.port(),
        Err(e) => {
            eprintln!("[app-bridge] 获取端口失败: {}", e);
            return;
        }
    };
    let token = uuid::Uuid::new_v4().simple().to_string();
    let info = BridgeInfo {
        port,
        token: token.clone(),
        pid: std::process::id(),
    };
    if let Err(e) = app_state::write_bridge_info(&info) {
        eprintln!("[app-bridge] 写入端点文件失败: {}", e);
        return;
    }
    let _ = TOKEN.set(token.clone());

    std::thread::Builder::new()
        .name("lanismd-app-bridge".into())
        .spawn(move || {
            for stream in listener.incoming().flatten() {
                handle_connection(stream, &token, &app);
            }
        })
        .map_err(|e| eprintln!("[app-bridge] 启动线程失败: {}", e))
        .ok();
}

/// App 退出时清理端点文件
pub fn shutdown() {
    if let Some(token) = TOKEN.get() {
        app_state::remove_bridge_info(token);
    }
}

fn handle_connection(stream: TcpStream, token: &str, app: &AppHandle) {
    // 只监听回环地址，这里再校验一次来源
    if !stream.peer_addr().map(|a| a.ip().is_loopback()).unwrap_or(false) {
        return;
    }
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));

    let mut line = String::new();
    let read = BufReader::new((&stream).take(MAX_REQUEST_BYTES)).read_line(&mut line);
    let response = match read {
        Ok(0) | Err(_) => return,
        Ok(_) => match serde_json::from_str::<BridgeRequest>(&line) {
            Ok(req) if constant_time_eq(req.token.as_bytes(), token.as_bytes()) => {
                dispatch(req.action, app)
            }
            Ok(_) => BridgeResponse::error("token 无效"),
            Err(e) => BridgeResponse::error(format!("请求格式错误: {}", e)),
        },
    };
    if let Ok(mut text) = serde_json::to_string(&response) {
        text.push('\n');
        let _ = (&stream).write_all(text.as_bytes());
    }
}

fn dispatch(action: BridgeAction, app: &AppHandle) -> BridgeResponse {
    match action {
        BridgeAction::GetState => BridgeResponse::with_state(current_snapshot()),
        BridgeAction::DocumentsChanged(change) => match app.emit(EVENT_DOCUMENTS_CHANGED, change) {
            Ok(()) => BridgeResponse::ok(),
            Err(e) => BridgeResponse::error(e.to_string()),
        },
        BridgeAction::OpenDocument { path } => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            match app.emit(EVENT_OPEN_DOCUMENT, serde_json::json!({ "path": path })) {
                Ok(()) => BridgeResponse::ok(),
                Err(e) => BridgeResponse::error(e.to_string()),
            }
        }
    }
}

/// 常量时间比较，避免通过响应耗时逐字节猜测 token
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

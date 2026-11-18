// MCP 侧桥接客户端：按端点文件连接 App，连接失败即视为 App 未运行
//
// @changelog
// | 版本   | 变更说明                       | 关联                                |
// | v1.0.0 | 初始实现：同步短连接请求 App 状态 | REQ: MCP 界面联动 TECH: 本地 TCP 桥接 |
// /@changelog
//
// @author hhhuilli

use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

use super::protocol::*;
use crate::services::app_state;

/// App 不在时应尽快失败，避免拖慢每次工具调用
const CONNECT_TIMEOUT: Duration = Duration::from_millis(300);
const IO_TIMEOUT: Duration = Duration::from_secs(2);

/// 查询 App 状态；App 未运行时返回 None
pub fn get_state() -> Option<AppSnapshot> {
    request(BridgeAction::GetState).ok().and_then(|r| r.state)
}

/// 通知 App 文档已变更（尽力而为，失败忽略）
pub fn notify_changed(change: DocumentsChanged) {
    let _ = request(BridgeAction::DocumentsChanged(change));
}

/// 请 App 打开文档
pub fn open_document(path: &str) -> Result<(), String> {
    request(BridgeAction::OpenDocument { path: path.to_string() }).map(|_| ())
}

fn request(action: BridgeAction) -> Result<BridgeResponse, String> {
    let info = app_state::read_bridge_info().ok_or("LanisMD 未运行")?;
    let addr = SocketAddr::from(([127, 0, 0, 1], info.port));
    let stream =
        TcpStream::connect_timeout(&addr, CONNECT_TIMEOUT).map_err(|_| "LanisMD 未运行".to_string())?;
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));

    let mut line = serde_json::to_string(&BridgeRequest { token: info.token, action })
        .map_err(|e| e.to_string())?;
    line.push('\n');
    (&stream).write_all(line.as_bytes()).map_err(|e| e.to_string())?;

    let mut reply = String::new();
    BufReader::new(&stream)
        .read_line(&mut reply)
        .map_err(|e| format!("读取 LanisMD 响应失败: {}", e))?;
    let resp: BridgeResponse =
        serde_json::from_str(&reply).map_err(|e| format!("LanisMD 响应格式错误: {}", e))?;
    if resp.ok {
        Ok(resp)
    } else {
        Err(resp.error.unwrap_or_else(|| "LanisMD 返回错误".to_string()))
    }
}

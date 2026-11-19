/**
 * 系统集成相关命令
 *
 * 目前仅提供冷启动阶段的待打开文档队列，供前端在挂载完成后一次性取走。
 *
 * @changelog
 * | 版本   | 变更说明                             | 关联                                    |
 * | v1.0.0 | 初始实现：取出冷启动文件打开请求队列 | REQ: 系统集成-文件关联 TECH: Tauri 命令通道 |
 * /@changelog
 *
 * @author hhhuilli
 */

use crate::services::file_open_service::PendingOpenFiles;
use tauri::State;

/// 取出并清空冷启动阶段系统投递的文件路径（前端只调用一次）
#[tauri::command]
pub fn take_pending_open_files(pending: State<'_, PendingOpenFiles>) -> Vec<String> {
    pending.take()
}

/// 返回当前应用版本号，供「关于」与更新对话框展示
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

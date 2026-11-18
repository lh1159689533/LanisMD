mod commands;
mod error;
mod models;
mod services;
pub mod mcp;

use commands::file_commands;
use commands::file_block_commands;
use commands::config_commands;
use commands::search_commands;
use commands::ai_commands;
use commands::git_commands;
use commands::mcp_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // 本地桥接：供 `lanismd mcp` 查询当前文件夹、通知界面刷新
            services::app_bridge::server::start(app.handle().clone());

            // macOS: 恢复窗口装饰（红绿灯）+ 设置 Overlay 标题栏样式
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                use objc2::{AnyThread, MainThreadMarker};
                use objc2_app_kit::{
                    NSApplication, NSImage, NSWindow, NSWindowStyleMask,
                    NSWindowTitleVisibility,
                };
                use objc2_foundation::NSData;

                // 恢复窗口装饰和 Overlay 标题栏
                if let Some(window) = app.get_webview_window("main") {
                    let ns_window_ptr = window.ns_window().unwrap() as *const NSWindow;
                    // 安全性：Tauri 保证 ns_window() 在 macOS 上返回有效的 NSWindow 指针
                    let ns_window: &NSWindow = unsafe { &*ns_window_ptr };

                    // 显示窗口阴影
                    ns_window.setHasShadow(true);
                    // 设置标题栏透明 + 全尺寸内容视图（Overlay 效果）
                    let masks = ns_window.styleMask()
                        | NSWindowStyleMask::FullSizeContentView
                        | NSWindowStyleMask::Titled
                        | NSWindowStyleMask::Closable
                        | NSWindowStyleMask::Miniaturizable
                        | NSWindowStyleMask::Resizable;
                    ns_window.setStyleMask(masks);
                    ns_window.setTitlebarAppearsTransparent(true);
                    ns_window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
                }

                // 设置 Dock 图标（仅开发期：路径为 build 时的绝对路径，
                // 打包后该路径不存在会静默 fallback 到 bundle 默认图标）
                let icon_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("icons/128x128@2x.png");

                if let Ok(icon_data) = std::fs::read(&icon_path) {
                    // setup 闭包默认在主线程执行，此处必然成立
                    let mtm = MainThreadMarker::new()
                        .expect("setup must run on main thread");
                    // 用 NSData 包装 PNG 字节并构造 NSImage
                    let data = NSData::with_bytes(&icon_data);
                    if let Some(nsimage) = NSImage::initWithData(NSImage::alloc(), &data) {
                        let app_instance = NSApplication::sharedApplication(mtm);
                        // 安全性：nsimage 为有效的非空 Retained<NSImage>
                        unsafe {
                            app_instance.setApplicationIconImage(Some(&nsimage));
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            file_commands::read_file,
            file_commands::write_file,
            file_commands::read_file_meta,
            file_commands::delete_file,
            file_commands::list_directory,
            file_commands::create_entry,
            file_commands::rename_entry,
            file_commands::duplicate_file,
            file_commands::move_file,
            file_commands::move_to_trash,
            file_commands::copy_image_to_assets,
            file_commands::save_image_bytes_to_assets,
            file_commands::reveal_in_finder,
            file_commands::resolve_link_path,
            config_commands::get_config,
            config_commands::set_config,
            config_commands::get_recent_files,
            config_commands::add_recent_file,
            search_commands::global_search,
            ai_commands::read_ai_config,
            ai_commands::save_ai_model,
            ai_commands::delete_ai_model,
            ai_commands::set_current_ai_model,
            ai_commands::open_ai_config,
            ai_commands::ai_test_connection,
            ai_commands::ai_chat_stream,
            ai_commands::cancel_ai_stream,
            git_commands::git_check,
            git_commands::git_install_tools,
            git_commands::git_repo_info,
            git_commands::git_status,
            git_commands::git_log,
            git_commands::git_commit_files,
            git_commands::git_file_versions,
            git_commands::git_diff_text,
            git_commands::git_commit,
            git_commands::git_push,
            git_commands::git_pull,
            git_commands::git_discard,
            git_commands::git_resolve_conflict,
            git_commands::git_abort_merge,
            git_commands::git_branches,
            git_commands::git_checkout,
            git_commands::git_set_identity,
            git_commands::git_ls_remote,
            git_commands::git_clone,
            git_commands::git_cancel_clone,
            git_commands::git_get_credentials,
            git_commands::git_save_credential,
            git_commands::git_delete_credential,
            file_block_commands::copy_file_to_attachments,
            file_block_commands::get_file_size_formatted,
            file_block_commands::delete_file_permanent,
            file_block_commands::open_file_with_system,
            file_block_commands::check_file_exists,
            mcp_commands::mcp_sync_state,
            mcp_commands::mcp_server_info,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                services::app_bridge::server::shutdown();
            }
        });
}

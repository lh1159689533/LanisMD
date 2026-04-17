mod commands;
mod error;
mod models;
mod services;

use commands::file_commands;
use commands::config_commands;
use commands::search_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // macOS: 恢复窗口装饰（红绿灯）+ 设置 Overlay 标题栏样式
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                use cocoa::appkit::{NSApp, NSApplication, NSImage, NSWindow, NSWindowTitleVisibility};
                use cocoa::base::{nil, YES};
                use cocoa::foundation::NSData;
                use objc::runtime::Object;

                // 恢复窗口装饰和 Overlay 标题栏
                if let Some(window) = app.get_webview_window("main") {
                    let ns_window = window.ns_window().unwrap() as cocoa::base::id;
                    unsafe {
                        // 显示窗口装饰（红绿灯按钮）
                        ns_window.setHasShadow_(YES);
                        // 设置标题栏透明 + 全尺寸内容视图（Overlay 效果）
                        let masks = ns_window.styleMask()
                            | cocoa::appkit::NSWindowStyleMask::NSFullSizeContentViewWindowMask
                            | cocoa::appkit::NSWindowStyleMask::NSTitledWindowMask
                            | cocoa::appkit::NSWindowStyleMask::NSClosableWindowMask
                            | cocoa::appkit::NSWindowStyleMask::NSMiniaturizableWindowMask
                            | cocoa::appkit::NSWindowStyleMask::NSResizableWindowMask;
                        ns_window.setStyleMask_(masks);
                        ns_window.setTitlebarAppearsTransparent_(YES);
                        ns_window.setTitleVisibility_(NSWindowTitleVisibility::NSWindowTitleHidden);
                    }
                }

                // 设置 Dock 图标
                let icon_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("icons/128x128@2x.png");
                
                if let Ok(icon_data) = std::fs::read(&icon_path) {
                    unsafe {
                        let data = NSData::dataWithBytes_length_(
                            nil,
                            icon_data.as_ptr() as *const std::os::raw::c_void,
                            icon_data.len() as u64,
                        );
                        let nsimage: *mut Object = NSImage::initWithData_(NSImage::alloc(nil), data);
                        let app_instance = NSApp();
                        app_instance.setApplicationIconImage_(nsimage);
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
            config_commands::get_config,
            config_commands::set_config,
            config_commands::get_recent_files,
            config_commands::add_recent_file,
            search_commands::global_search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

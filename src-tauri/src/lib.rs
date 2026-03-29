mod commands;
mod error;
mod models;
mod services;

use commands::file_commands;
use commands::config_commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|_app| {
            // macOS: 在 dev 模式下设置 Dock 图标
            #[cfg(target_os = "macos")]
            {
                use cocoa::appkit::{NSApp, NSApplication, NSImage};
                use cocoa::base::nil;
                use cocoa::foundation::NSData;
                use objc::runtime::Object;

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
                        let app = NSApp();
                        app.setApplicationIconImage_(nsimage);
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
            file_commands::move_to_trash,
            file_commands::reveal_in_finder,
            config_commands::get_config,
            config_commands::set_config,
            config_commands::get_recent_files,
            config_commands::add_recent_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

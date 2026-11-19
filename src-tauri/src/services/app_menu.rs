/**
 * 系统集成：原生应用菜单
 *
 * macOS 上菜单显示在系统顶部菜单栏；Windows / Linux 上窗口为无边框自绘标题栏，
 * 原生菜单栏不可见，因此这些平台不注册快捷键，快捷键仍由 WebView 负责处理。
 * 菜单点击统一以 `system:menu-action` 事件发给前端，复用现有的界面动作。
 *
 * @changelog
 * | 版本   | 变更说明                                     | 关联                                  |
 * | v1.0.0 | 初始实现：跨平台原生菜单与菜单动作事件转发   | REQ: 系统集成-原生菜单 TECH: tauri::menu |
 * /@changelog
 *
 * @author hhhuilli
 */

use tauri::menu::{
    IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};
use tauri::{AppHandle, Emitter, Runtime};

/// 原生菜单动作事件名，payload 为动作 ID 字符串
pub const MENU_ACTION_EVENT: &str = "system:menu-action";

/// 菜单动作 ID：必须与前端 `src/services/tauri/system-service.ts` 中的常量保持一致
pub mod action {
    pub const NEW_FILE: &str = "new-file";
    pub const OPEN_FILE: &str = "open-file";
    pub const OPEN_FOLDER: &str = "open-folder";
    pub const SAVE_FILE: &str = "save-file";
    pub const QUICK_OPEN: &str = "quick-open";
    pub const FIND: &str = "find";
    pub const GLOBAL_SEARCH: &str = "global-search";
    pub const TOGGLE_SIDEBAR: &str = "toggle-sidebar";
    pub const TOGGLE_OUTLINE: &str = "toggle-outline";
    pub const TOGGLE_TYPEWRITER: &str = "toggle-typewriter";
    pub const TOGGLE_IMMERSIVE: &str = "toggle-immersive";
    pub const PREFERENCES: &str = "preferences";
    pub const CHECK_UPDATE: &str = "check-update";
    pub const ABOUT: &str = "about";
}

/// 只有自定义动作需要转发给前端；预定义菜单项由系统自行处理
const APP_ACTIONS: [&str; 14] = [
    action::NEW_FILE,
    action::OPEN_FILE,
    action::OPEN_FOLDER,
    action::SAVE_FILE,
    action::QUICK_OPEN,
    action::FIND,
    action::GLOBAL_SEARCH,
    action::TOGGLE_SIDEBAR,
    action::TOGGLE_OUTLINE,
    action::TOGGLE_TYPEWRITER,
    action::TOGGLE_IMMERSIVE,
    action::PREFERENCES,
    action::CHECK_UPDATE,
    action::ABOUT,
];

/// 把菜单点击转发给前端
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if APP_ACTIONS.contains(&id) {
        let _ = app.emit(MENU_ACTION_EVENT, id.to_string());
    }
}

/// macOS 由原生菜单接管快捷键；其它平台返回 None，避免与 WebView 快捷键重复触发
#[cfg(target_os = "macos")]
fn accel(key: &'static str) -> Option<&'static str> {
    if key.is_empty() {
        None
    } else {
        Some(key)
    }
}

#[cfg(not(target_os = "macos"))]
fn accel(_key: &'static str) -> Option<&'static str> {
    None
}

/// 创建自定义菜单项；加速键格式不被平台接受时退化为无快捷键项，避免阻塞应用启动
fn action_item<R: Runtime>(
    app: &AppHandle<R>,
    id: &'static str,
    text: &str,
    key: &'static str,
) -> tauri::Result<MenuItem<R>> {
    match MenuItem::with_id(app, id, text, true, accel(key)) {
        Ok(item) => Ok(item),
        Err(_) => MenuItem::with_id(app, id, text, true, None::<&str>),
    }
}

/// macOS 应用子菜单：包含系统标准的关于、服务、隐藏与退出项
#[cfg(target_os = "macos")]
fn build_app_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let about = PredefinedMenuItem::about(app, Some("关于 LanisMD"), None)?;
    let check_update = action_item(app, action::CHECK_UPDATE, "检查更新…", "")?;
    let separator = PredefinedMenuItem::separator(app)?;
    let preferences = action_item(app, action::PREFERENCES, "偏好设置…", "CmdOrCtrl+,")?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let services = PredefinedMenuItem::services(app, Some("服务"))?;
    let separator3 = PredefinedMenuItem::separator(app)?;
    let hide = PredefinedMenuItem::hide(app, Some("隐藏 LanisMD"))?;
    let hide_others = PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?;
    let show_all = PredefinedMenuItem::show_all(app, Some("显示全部"))?;
    let separator4 = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("退出 LanisMD"))?;

    Submenu::with_items(
        app,
        "LanisMD",
        true,
        &[
            &about,
            &check_update,
            &separator,
            &preferences,
            &separator2,
            &services,
            &separator3,
            &hide,
            &hide_others,
            &show_all,
            &separator4,
            &quit,
        ],
    )
}

/// Windows / Linux 应用子菜单：只保留跨平台可用的项
#[cfg(not(target_os = "macos"))]
fn build_app_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let about = PredefinedMenuItem::about(app, Some("关于 LanisMD"), None)?;
    let check_update = action_item(app, action::CHECK_UPDATE, "检查更新…", "")?;
    let separator = PredefinedMenuItem::separator(app)?;
    let preferences = action_item(app, action::PREFERENCES, "偏好设置…", "")?;

    Submenu::with_items(
        app,
        "LanisMD",
        true,
        &[&about, &check_update, &separator, &preferences],
    )
}

/// 构建完整应用菜单
pub fn create_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let app_submenu = build_app_submenu(app)?;

    let new_file = action_item(app, action::NEW_FILE, "新建", "CmdOrCtrl+N")?;
    let open_file = action_item(app, action::OPEN_FILE, "打开…", "CmdOrCtrl+O")?;
    let open_folder = action_item(app, action::OPEN_FOLDER, "打开文件夹…", "CmdOrCtrl+Shift+O")?;
    let file_separator = PredefinedMenuItem::separator(app)?;
    let save_file = action_item(app, action::SAVE_FILE, "保存", "CmdOrCtrl+S")?;
    let file_separator2 = PredefinedMenuItem::separator(app)?;
    let quick_open = action_item(app, action::QUICK_OPEN, "快速打开…", "CmdOrCtrl+P")?;
    let file_separator3 = PredefinedMenuItem::separator(app)?;
    let close_window = PredefinedMenuItem::close_window(app, Some("关闭窗口"))?;
    let file_submenu = Submenu::with_items(
        app,
        "文件",
        true,
        &[
            &new_file,
            &open_file,
            &open_folder,
            &file_separator,
            &save_file,
            &file_separator2,
            &quick_open,
            &file_separator3,
            &close_window,
        ],
    )?;

    let undo = PredefinedMenuItem::undo(app, Some("撤销"))?;
    let redo = PredefinedMenuItem::redo(app, Some("重做"))?;
    let edit_separator = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, Some("剪切"))?;
    let copy = PredefinedMenuItem::copy(app, Some("复制"))?;
    let paste = PredefinedMenuItem::paste(app, Some("粘贴"))?;
    let select_all = PredefinedMenuItem::select_all(app, Some("全选"))?;
    let edit_separator2 = PredefinedMenuItem::separator(app)?;
    let find = action_item(app, action::FIND, "查找…", "CmdOrCtrl+F")?;
    let global_search = action_item(
        app,
        action::GLOBAL_SEARCH,
        "全局搜索…",
        "CmdOrCtrl+Shift+F",
    )?;
    let edit_submenu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &undo,
            &redo,
            &edit_separator,
            &cut,
            &copy,
            &paste,
            &select_all,
            &edit_separator2,
            &find,
            &global_search,
        ],
    )?;

    let toggle_sidebar = action_item(
        app,
        action::TOGGLE_SIDEBAR,
        "切换侧边栏",
        "CmdOrCtrl+Shift+B",
    )?;
    let toggle_outline = action_item(app, action::TOGGLE_OUTLINE, "大纲", "CmdOrCtrl+Shift+L")?;
    let toggle_typewriter = action_item(
        app,
        action::TOGGLE_TYPEWRITER,
        "打字机模式",
        "CmdOrCtrl+Shift+9",
    )?;
    let toggle_immersive = action_item(
        app,
        action::TOGGLE_IMMERSIVE,
        "沉浸式阅读",
        "CmdOrCtrl+Shift+I",
    )?;
    let view_separator = PredefinedMenuItem::separator(app)?;
    let fullscreen = PredefinedMenuItem::fullscreen(app, Some("进入/退出全屏"))?;
    let view_submenu = Submenu::with_items(
        app,
        "视图",
        true,
        &[
            &toggle_sidebar,
            &toggle_outline,
            &toggle_typewriter,
            &toggle_immersive,
            &view_separator,
            &fullscreen,
        ],
    )?;

    let minimize = PredefinedMenuItem::minimize(app, Some("最小化"))?;
    let maximize = PredefinedMenuItem::maximize(app, Some("最大化"))?;
    let window_separator = PredefinedMenuItem::separator(app)?;
    let mut window_items: Vec<&dyn IsMenuItem<R>> =
        vec![&minimize, &maximize, &window_separator];
    #[cfg(target_os = "macos")]
    let bring_all_to_front =
        PredefinedMenuItem::bring_all_to_front(app, Some("前置全部窗口"))?;
    #[cfg(target_os = "macos")]
    window_items.push(&bring_all_to_front);
    let window_submenu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "窗口",
        true,
        &window_items,
    )?;

    let about_app = action_item(app, action::ABOUT, "关于 LanisMD", "")?;
    let help_check_update = action_item(app, action::CHECK_UPDATE, "检查更新…", "")?;
    let help_submenu = Submenu::with_id_and_items(
        app,
        HELP_SUBMENU_ID,
        "帮助",
        true,
        &[&about_app, &help_check_update],
    )?;

    Menu::with_items(
        app,
        &[
            &app_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &window_submenu,
            &help_submenu,
        ],
    )
}

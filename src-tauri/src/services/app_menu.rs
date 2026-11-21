/**
 * 系统集成：原生应用菜单
 *
 * - macOS：菜单为应用级，显示在系统顶部菜单栏，并由原生菜单接管快捷键。
 * - Windows：主窗口使用系统标题栏，菜单栏只挂在主窗口上（不挂到预览、画板等子窗口），
 *   菜单结构遵循 Windows 习惯（文件 / 编辑 / 视图 / 窗口 / 帮助）。自定义项的快捷键只作为
 *   文字提示展示，实际仍由 WebView 处理，避免菜单与编辑器重复触发。
 * - Linux：窗口为无边框自绘标题栏，沿用应用级菜单，不注册快捷键。
 *
 * 菜单点击统一以 `system:menu-action` 事件发给前端，复用现有的界面动作。
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                                      |
 * | v1.0.0 | 初始实现：跨平台原生菜单与菜单动作事件转发     | REQ: 系统集成-原生菜单 TECH: tauri::menu  |
 * | v1.1.0 | 移除帮助菜单，关于统一使用系统原生面板         | REQ: 系统集成-菜单优化 TECH: tauri::menu  |
 * | v1.2.0 | macOS 关于改为自定义项，交由 about_panel 打开  | REQ: 系统集成-关于信息 TECH: AppKit 关于面板 |
 * | v1.3.0 | Windows 启用原生菜单栏：窗口级挂载、Windows 菜单结构、快捷键文字提示 | REQ: 系统集成-Windows 菜单 TECH: tauri::menu + muda |
 * /@changelog
 *
 * @author hhhuilli
 */
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID};
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
    /// 仅 macOS 使用，由 Rust 侧直接打开原生关于面板，不转发给前端
    pub const ABOUT: &str = "about";
}

/// 只有自定义动作需要转发给前端；预定义菜单项由系统自行处理
const APP_ACTIONS: [&str; 13] = [
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
];

/// 处理菜单点击：关于面板由 Rust 侧直接打开，其余动作转发给前端
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    #[cfg(target_os = "macos")]
    if id == action::ABOUT {
        super::about_panel::show(app);
        return;
    }
    if APP_ACTIONS.contains(&id) {
        let _ = app.emit(MENU_ACTION_EVENT, id.to_string());
    }
}

/// Windows：把菜单挂到主窗口上。
/// 不使用应用级菜单，是因为应用级菜单会被之后创建的预览、画板等子窗口继承，
/// 这些子窗口带系统标题栏，会多出一条菜单栏。
#[cfg(target_os = "windows")]
pub fn attach_to_main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        window.set_menu(create_menu(app)?)?;
    }
    Ok(())
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

/// 菜单项文字。Windows 菜单会把 `\t` 之后的内容右对齐显示为快捷键提示，
/// 借此展示快捷键而不注册加速键表
#[cfg(target_os = "windows")]
fn menu_label(text: &str, key: &str) -> String {
    if key.is_empty() {
        text.to_string()
    } else {
        format!("{text}\t{}", key.replace("CmdOrCtrl", "Ctrl"))
    }
}

#[cfg(not(target_os = "windows"))]
fn menu_label(text: &str, _key: &str) -> String {
    text.to_string()
}

/// 顶层菜单标题。Windows 追加 `(&X)` 助记键，支持 Alt+字母 直接展开
#[cfg(target_os = "windows")]
fn top_title(text: &str, mnemonic: char) -> String {
    format!("{text}(&{mnemonic})")
}

#[cfg(not(target_os = "windows"))]
fn top_title(text: &str, _mnemonic: char) -> String {
    text.to_string()
}

/// 创建自定义菜单项；加速键格式不被平台接受时退化为无快捷键项，避免阻塞应用启动
fn action_item<R: Runtime>(
    app: &AppHandle<R>,
    id: &'static str,
    text: &str,
    key: &'static str,
) -> tauri::Result<MenuItem<R>> {
    let label = menu_label(text, key);
    match MenuItem::with_id(app, id, &label, true, accel(key)) {
        Ok(item) => Ok(item),
        Err(_) => MenuItem::with_id(app, id, &label, true, None::<&str>),
    }
}

/// macOS 应用子菜单：包含系统标准的关于、服务、隐藏与退出项
#[cfg(target_os = "macos")]
fn build_app_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    // 不用预定义关于项：其 credits 只能传纯文本，无法控制信息区排版
    let about = action_item(app, action::ABOUT, "关于 LanisMD", "")?;
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

/// Linux 应用子菜单：只保留跨平台可用的项
#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn build_app_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let about = PredefinedMenuItem::about(
        app,
        Some("关于 LanisMD"),
        Some(super::about_panel::about_metadata(app)),
    )?;
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

/// Windows 帮助菜单：承接其它平台放在应用子菜单里的检查更新与关于
#[cfg(target_os = "windows")]
fn build_help_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let check_update = action_item(app, action::CHECK_UPDATE, "检查更新…", "")?;
    let separator = PredefinedMenuItem::separator(app)?;
    let about = PredefinedMenuItem::about(
        app,
        Some("关于 LanisMD"),
        Some(super::about_panel::about_metadata(app)),
    )?;

    Submenu::with_items(
        app,
        top_title("帮助", 'H'),
        true,
        &[&check_update, &separator, &about],
    )
}

/// 文件菜单。Windows 额外放入偏好设置，并以「退出」收尾：
/// 退出走关闭窗口而不是直接结束进程，保证窗口关闭流程照常执行
fn build_file_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let new_file = action_item(app, action::NEW_FILE, "新建", "CmdOrCtrl+N")?;
    let open_file = action_item(app, action::OPEN_FILE, "打开…", "CmdOrCtrl+O")?;
    let open_folder = action_item(app, action::OPEN_FOLDER, "打开文件夹…", "CmdOrCtrl+Shift+O")?;
    let separator = PredefinedMenuItem::separator(app)?;
    let save_file = action_item(app, action::SAVE_FILE, "保存", "CmdOrCtrl+S")?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quick_open = action_item(app, action::QUICK_OPEN, "快速打开…", "CmdOrCtrl+P")?;
    let separator3 = PredefinedMenuItem::separator(app)?;

    let mut items: Vec<&dyn IsMenuItem<R>> = vec![
        &new_file,
        &open_file,
        &open_folder,
        &separator,
        &save_file,
        &separator2,
        &quick_open,
        &separator3,
    ];

    #[cfg(target_os = "windows")]
    let preferences = action_item(app, action::PREFERENCES, "偏好设置…", "CmdOrCtrl+,")?;
    #[cfg(target_os = "windows")]
    let separator4 = PredefinedMenuItem::separator(app)?;
    #[cfg(target_os = "windows")]
    {
        items.push(&preferences);
        items.push(&separator4);
    }

    let close_text = if cfg!(target_os = "windows") {
        "退出"
    } else {
        "关闭窗口"
    };
    let close_window = PredefinedMenuItem::close_window(app, Some(close_text))?;
    items.push(&close_window);

    Submenu::with_items(app, top_title("文件", 'F'), true, &items)
}

fn build_edit_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let undo = PredefinedMenuItem::undo(app, Some("撤销"))?;
    let redo = PredefinedMenuItem::redo(app, Some("重做"))?;
    let separator = PredefinedMenuItem::separator(app)?;
    let cut = PredefinedMenuItem::cut(app, Some("剪切"))?;
    let copy = PredefinedMenuItem::copy(app, Some("复制"))?;
    let paste = PredefinedMenuItem::paste(app, Some("粘贴"))?;
    let select_all = PredefinedMenuItem::select_all(app, Some("全选"))?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let find = action_item(app, action::FIND, "查找…", "CmdOrCtrl+F")?;
    let global_search = action_item(app, action::GLOBAL_SEARCH, "全局搜索…", "CmdOrCtrl+Shift+F")?;

    Submenu::with_items(
        app,
        top_title("编辑", 'E'),
        true,
        &[
            &undo,
            &redo,
            &separator,
            &cut,
            &copy,
            &paste,
            &select_all,
            &separator2,
            &find,
            &global_search,
        ],
    )
}

/// 视图菜单。Windows 不支持预定义的全屏项，因此只在其它平台加入
fn build_view_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
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

    #[allow(unused_mut)]
    let mut items: Vec<&dyn IsMenuItem<R>> = vec![
        &toggle_sidebar,
        &toggle_outline,
        &toggle_typewriter,
        &toggle_immersive,
    ];

    #[cfg(not(target_os = "windows"))]
    let separator = PredefinedMenuItem::separator(app)?;
    #[cfg(not(target_os = "windows"))]
    let fullscreen = PredefinedMenuItem::fullscreen(app, Some("进入/退出全屏"))?;
    #[cfg(not(target_os = "windows"))]
    {
        items.push(&separator);
        items.push(&fullscreen);
    }

    Submenu::with_items(app, top_title("视图", 'V'), true, &items)
}

fn build_window_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let minimize = PredefinedMenuItem::minimize(app, Some("最小化"))?;
    let maximize = PredefinedMenuItem::maximize(app, Some("最大化"))?;

    #[allow(unused_mut)]
    let mut items: Vec<&dyn IsMenuItem<R>> = vec![&minimize, &maximize];

    #[cfg(target_os = "macos")]
    let separator = PredefinedMenuItem::separator(app)?;
    #[cfg(target_os = "macos")]
    let bring_all_to_front = PredefinedMenuItem::bring_all_to_front(app, Some("前置全部窗口"))?;
    #[cfg(target_os = "macos")]
    {
        items.push(&separator);
        items.push(&bring_all_to_front);
    }

    Submenu::with_id_and_items(app, WINDOW_SUBMENU_ID, top_title("窗口", 'W'), true, &items)
}

/// 构建完整应用菜单：Windows 以帮助菜单收尾，其它平台以应用子菜单开头
pub fn create_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let file_submenu = build_file_submenu(app)?;
    let edit_submenu = build_edit_submenu(app)?;
    let view_submenu = build_view_submenu(app)?;
    let window_submenu = build_window_submenu(app)?;

    #[cfg(target_os = "windows")]
    {
        let help_submenu = build_help_submenu(app)?;
        Menu::with_items(
            app,
            &[
                &file_submenu,
                &edit_submenu,
                &view_submenu,
                &window_submenu,
                &help_submenu,
            ],
        )
    }

    #[cfg(not(target_os = "windows"))]
    {
        let app_submenu = build_app_submenu(app)?;
        Menu::with_items(
            app,
            &[
                &app_submenu,
                &file_submenu,
                &edit_submenu,
                &view_submenu,
                &window_submenu,
            ],
        )
    }
}

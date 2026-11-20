/**
 * 系统集成：「关于 LanisMD」面板
 *
 * macOS 直接调用 AppKit 标准关于面板：Tauri / muda 的预定义关于项只能传纯文本 credits，
 * 无法居中、调字号与配色，因此版本与运行环境信息统一由这里构造成带样式的富文本，
 * 放进信息区自行排版；系统自带的版本行与构建号均置空，避免重复与样式不一致。
 * 同时显式传入应用图标，避免开发期（非 .app bundle）显示通用文件夹图标。
 * Windows / Linux 的原生菜单栏不可见，仍使用预定义关于项，信息通过 comments 展示。
 *
 * @changelog
 * | 版本   | 变更说明                                         | 关联                                      |
 * | v1.0.0 | 初始实现：原生关于面板自绘运行环境信息区         | REQ: 系统集成-关于信息 TECH: AppKit 关于面板 |
 * | v1.1.0 | 版本号并入信息区自绘，移除 WebKit / 系统版本     | REQ: 系统集成-关于信息 TECH: AppKit 关于面板 |
 * /@changelog
 *
 * @author hhhuilli
 */

/// 编译期由 build.rs 写入的 rustc 版本
const RUSTC_VERSION: &str = env!("LANISMD_RUSTC_VERSION");

/// 构建环境信息，每行一项
fn build_details() -> String {
    format!("Tauri {}\nRust {RUSTC_VERSION}", tauri::VERSION)
}

/// Windows / Linux 预定义关于项的元数据
#[cfg(not(target_os = "macos"))]
pub fn about_metadata<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::menu::AboutMetadata<'static> {
    tauri::menu::AboutMetadataBuilder::new()
        .name(Some("LanisMD"))
        .version(Some(app.package_info().version.to_string()))
        .comments(Some(build_details()))
        .build()
}

/// 打开 macOS 标准关于面板；AppKit 只能在主线程调用，因此统一投递到主线程执行
#[cfg(target_os = "macos")]
pub fn show<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    let version = app.package_info().version.to_string();
    if let Err(err) = app.run_on_main_thread(move || macos::show_panel(&version)) {
        eprintln!("打开关于面板失败: {err}");
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{
        NSAboutPanelOptionApplicationIcon, NSAboutPanelOptionApplicationName,
        NSAboutPanelOptionApplicationVersion, NSAboutPanelOptionCredits, NSAboutPanelOptionVersion,
        NSApplication, NSColor, NSFont, NSFontAttributeName, NSForegroundColorAttributeName,
        NSImage, NSMutableParagraphStyle, NSParagraphStyleAttributeName, NSTextAlignment,
    };
    use objc2_foundation::{NSAttributedString, NSData, NSDictionary, NSString};

    /// 编译期嵌入图标，开发期与打包后表现一致，不依赖 bundle 资源
    const APP_ICON_PNG: &[u8] = include_bytes!("../../icons/128x128@2x.png");

    /// 信息区富文本（版本与构建环境共用同一样式）：居中、小号系统字体、次要文字色（随浅色 / 深色外观自动切换）
    fn credits(text: &str) -> Retained<NSAttributedString> {
        let paragraph = NSMutableParagraphStyle::new();
        paragraph.setAlignment(NSTextAlignment::Center);
        let font = NSFont::systemFontOfSize(NSFont::smallSystemFontSize());
        let color = NSColor::secondaryLabelColor();

        // 安全性：三个键均为 AppKit 导出的常量，值类型与键约定一致
        let keys = unsafe {
            [
                NSParagraphStyleAttributeName,
                NSFontAttributeName,
                NSForegroundColorAttributeName,
            ]
        };
        let values: [Retained<AnyObject>; 3] = [
            Retained::into_super(paragraph).into(),
            font.into(),
            color.into(),
        ];
        let attributes = NSDictionary::from_retained_objects(&keys, &values);
        // 安全性：attributes 中每个值的类型与其属性键要求一致
        unsafe {
            NSAttributedString::initWithString_attributes(
                NSAttributedString::alloc(),
                &NSString::from_str(text),
                Some(&attributes),
            )
        }
    }

    pub(super) fn show_panel(version: &str) {
        let Some(mtm) = MainThreadMarker::new() else {
            eprintln!("关于面板必须在主线程打开");
            return;
        };

        // 安全性：均为 AppKit 导出的常量键
        let mut keys = unsafe {
            vec![
                NSAboutPanelOptionApplicationName,
                // 系统版本行与构建号显式置空：不传时会回退读取 bundle 中的版本号；
                // 置空后系统仍保留一行空白占位，正好作为名称与信息区的间距
                NSAboutPanelOptionApplicationVersion,
                NSAboutPanelOptionVersion,
                NSAboutPanelOptionCredits,
            ]
        };
        let mut values: Vec<Retained<AnyObject>> = vec![
            NSString::from_str("LanisMD").into(),
            NSString::from_str("").into(),
            NSString::from_str("").into(),
            credits(&format!("版本 {version}\n{}", super::build_details())).into(),
        ];

        let data = NSData::with_bytes(APP_ICON_PNG);
        if let Some(icon) = NSImage::initWithData(NSImage::alloc(), &data) {
            keys.push(unsafe { NSAboutPanelOptionApplicationIcon });
            values.push(icon.into());
        }

        let options = NSDictionary::from_retained_objects(&keys, &values);
        // 安全性：options 中每个值的类型符合 AppKit 对相应键的约定
        unsafe {
            NSApplication::sharedApplication(mtm).orderFrontStandardAboutPanelWithOptions(&options);
        }
    }
}

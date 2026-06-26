# Deprecated 警告迁移计划

> 创建时间：2026-04-28
> 最后修订：2026-04-28（合并任务二+任务三为 objc2 重写）
> 状态：待实施
> 影响范围：`src-tauri/`（Rust 后端，仅 macOS 相关代码）
> 当前警告总数：32（cocoa 31 + tauri-plugin-shell 1）

---

## 背景

`cargo check` 输出 32 条 deprecated 警告，全部源自上游生态在 2024 年的两次换代：

1. Tauri 2.x 把 `tauri-plugin-shell` 中的 `open` 方法拆出，独立为 `tauri-plugin-opener`
2. Rust on macOS 的事实标准从 `cocoa` + `objc` 切换到 `objc2` 系列；`cocoa` crate 把全部 API 标为 `#[deprecated]`

这两件事都是上游标注变更，不是项目代码退化。当前代码功能正常，仅产生编译警告。本文档拆为 2 个独立任务，按优先级依次执行。

---

## 任务一：tauri-plugin-shell::open → tauri-plugin-opener

### 优先级：P0（最先做）

### 背景

- 当前唯一调用点：`src-tauri/src/commands/ai_commands.rs:68`
- 用途：用户点击"打开 AI 配置目录"按钮时，调用系统文件管理器打开目录
- 整个项目没有使用 `tauri-plugin-shell` 的其他能力（无 `Command` 调用），可以直接整包替换

### 选定方案

迁移到 `tauri-plugin-opener`，并从依赖中移除 `tauri-plugin-shell`。

### 实施步骤

1. **修改 `src-tauri/Cargo.toml`**
   - 删除 `tauri-plugin-shell = "2"`
   - 新增 `tauri-plugin-opener = "2"`

2. **修改 `src-tauri/src/lib.rs`**
   - 删除 `.plugin(tauri_plugin_shell::init())`
   - 新增 `.plugin(tauri_plugin_opener::init())`

3. **修改 `src-tauri/src/commands/ai_commands.rs`**
   - 删除 `use tauri_plugin_shell::ShellExt;`
   - 新增 `use tauri_plugin_opener::OpenerExt;`
   - 调用替换：
     ```rust
     // 旧
     app.shell().open(&dir_str, None)
     // 新
     app.opener().open_path(dir_str, None::<&str>)
     ```

4. **修改 `src-tauri/capabilities/default.json`**
   - 删除 `shell:default`、`shell:allow-open`（若存在）
   - 新增 `opener:default`、`opener:allow-open-path`

### 验证

- `cargo check --no-default-features` 通过且无 `tauri-plugin-shell` 相关警告
- 启动应用，AI 设置面板点击"打开配置目录"按钮，验证系统文件管理器正常弹出

### 回滚

`git revert` 此次提交即可，无数据迁移。

### 预期收益

- 警告数：32 → 31
- 依赖减少 1 个 crate，包体积略降

---

## 任务二：cocoa + objc → objc2 系列重写

### 优先级：P1

### 背景

- 文件位置：`src-tauri/src/lib.rs:30-65`（macOS 专用 unsafe 块）
- 当前用 `cocoa` + `objc` crate 直接调 `NSWindow` / `NSApplication` / `NSImage`，做两件事：
  1. **标题栏样式**（`lib.rs:31-47`）：阴影、`NSFullSizeContentViewWindowMask`、标题栏透明、隐藏标题文字
  2. **开发期 Dock 图标**（`lib.rs:49-64`）：从 `icons/128x128@2x.png` 加载 `NSImage` 并 `setApplicationIconImage_`
- `cocoa` crate 已被上游全量标记 `#[deprecated]`，该 crate 长期维护停滞，未来与新 Rust 编译器/macOS SDK 不兼容时需紧急迁移
- 社区事实标准已切换到 [`objc2`](https://github.com/madsmtm/objc2) 系列（`objc2` + `objc2-app-kit` + `objc2-foundation`），API 与原 cocoa 几乎一一对应，仍是 unsafe 但更安全（编译期类型检查更严，自动管理 retain/release）

### 方案选择过程

曾考虑过用 `tauri.conf.json` 的 `titleBarStyle: "Overlay"` 高层 API 替换标题栏 cocoa 调用，但放弃，原因：

1. **跨平台风险**：`titleBarStyle: Overlay` 必须配合 `decorations: true`，而 `decorations` 字段跨平台生效。Windows/Linux 上当前是 `decorations: false` + 前端 `TitleBar.tsx` 自绘三键标题栏，改成 `true` 会导致 Windows/Linux 出现"原生标题栏 + 自绘标题栏"双层重叠
2. **macOS 行为不完全等价**：当前 cocoa 实现做了 4 个细节操作（`setHasShadow` / `setStyleMask` / `setTitlebarAppearsTransparent` / `setTitleVisibility`），`titleBarStyle: Overlay` 只覆盖前 3 个，`setTitleVisibility` 不一定生效，可能导致标题文字"LanisMD"重新出现，与 `TitleBar.tsx` 自绘的文件名重叠
3. **像素位置风险**：`TitleBar.tsx:160` 写死 `w-[68px]` 给红绿灯让位，Tauri 内置 Overlay 模式的红绿灯位置若与原 cocoa 实现有偏差，前端布局会破相

而 **objc2 重写**：
- macOS 行为 1:1 等价（API 同名直译）
- Windows/Linux 编译路径完全不变（仍在 `#[cfg(target_os = "macos")]` cfg 块内，依赖也在 `[target.'cfg(target_os = "macos")'.dependencies]`）
- 唯一新增风险是 API 翻译可能出错，但调用的都是核心 NSWindow/NSApplication/NSImage API，objc2-app-kit 100% 覆盖

### 选定方案

**用 `objc2` + `objc2-app-kit` + `objc2-foundation` 重写 `lib.rs` 中所有 macOS 专用 unsafe 块**，保留与当前完全一致的运行时行为，删除 `cocoa` + `objc` 依赖。

### 实施步骤

1. **修改 `src-tauri/Cargo.toml`**

   删除：
   ```toml
   [target.'cfg(target_os = "macos")'.dependencies]
   cocoa = "0.26"
   objc = "0.2"
   ```

   新增：
   ```toml
   [target.'cfg(target_os = "macos")'.dependencies]
   objc2 = "0.5"
   objc2-app-kit = { version = "0.2", features = ["NSWindow", "NSApplication", "NSImage"] }
   objc2-foundation = { version = "0.2", features = ["NSString", "NSData"] }
   ```

   > 注：具体 features 列表以编译报错提示为准，objc2 系列 crate 需要按使用的类型显式启用 feature。

2. **修改 `src-tauri/src/lib.rs` 顶部 use**

   删除所有 `use cocoa::...;` 和 `use objc::...;`

   新增（仅 macOS 块内 `use`，避免污染其他平台）：
   ```rust
   #[cfg(target_os = "macos")]
   use objc2::{rc::Retained, MainThreadMarker};
   #[cfg(target_os = "macos")]
   use objc2_app_kit::{
       NSApplication, NSImage, NSWindow,
       NSWindowStyleMask, NSWindowTitleVisibility,
   };
   #[cfg(target_os = "macos")]
   use objc2_foundation::{NSData, NSString};
   ```

3. **重写标题栏块**（`lib.rs:31-47`）

   要点：
   - `ns_window` 通过 Tauri 的 `window.ns_window()?` 获取，强转为 `*mut NSWindow`
   - 用 `&*ns_window` 拿到引用后调用 objc2 提供的 safe-ish wrapper 方法
   - 等价 API 映射：
     - `setHasShadow_(YES)` → `set_has_shadow(true)`
     - `setStyleMask_(mask)` → `set_style_mask(NSWindowStyleMask::Titled | NSWindowStyleMask::Closable | NSWindowStyleMask::Miniaturizable | NSWindowStyleMask::Resizable | NSWindowStyleMask::FullSizeContentView)`
     - `setTitlebarAppearsTransparent_(YES)` → `set_titlebar_appears_transparent(true)`
     - `setTitleVisibility_(NSWindowTitleHidden)` → `set_title_visibility(NSWindowTitleVisibility::Hidden)`

4. **重写 Dock 图标块**（`lib.rs:49-64`）

   要点：
   - 用 `MainThreadMarker::new()` 获取主线程标记（setup 闭包默认在主线程，应可直接 `unwrap`，但需在迁移时验证）
   - `NSApplication::sharedApplication(mtm)` 获取 app 实例
   - 读取 PNG 字节后用 `NSData::with_bytes(...)` 构造，再 `NSImage::initWithData(...)` 构造图像
   - `setApplicationIconImage_(image)` → `set_application_icon_image(Some(&image))`

5. **保留兜底**：所有 unsafe 块仍包在 `#[cfg(target_os = "macos")]` 内，Windows/Linux 编译路径零变化

### 验证

#### macOS 端（关键，需逐项目视确认）

- `cargo check --no-default-features` 通过，cocoa/objc 相关 31 条警告全部消失
- 开发模式启动应用，**像素级对比迁移前后截图**，确认：
  - 红绿灯按钮位置、间距与之前一致（`TitleBar.tsx:160` 的 `w-[68px]` 留白对齐）
  - 标题栏区域透明、无 "LanisMD" 标题文字
  - 内容延伸到标题栏下方（Overlay 效果）
  - 窗口阴影正常
  - Dock 图标显示为 `icons/128x128@2x.png` 自定义图标（不是默认 Tauri 图标）
- 执行 `cargo tauri build` 打包后启动，确认所有上述行为在打包版本下也保持一致

#### Windows / Linux 端

- `cargo check --target x86_64-pc-windows-msvc`（或在对应平台上 `cargo check`）通过
- 仅做编译验证即可，无运行时变化
- 若条件允许，启动应用确认 `TitleBar.tsx` 的自绘三键标题栏行为完全不变

### 回滚

`git revert` 此次提交即可，无数据迁移、无配置文件变化（`tauri.conf.json` 不修改）。

### 预期收益

- 警告数：31 → 0
- 依赖换代：删除 `cocoa` / `objc`（已废弃），引入 `objc2` / `objc2-app-kit` / `objc2-foundation`（社区事实标准）
- unsafe 代码行数大致持平（仍需 unsafe 调 ObjC API），但类型安全性提升

### 风险点

| 风险 | 概率 | 缓解 |
|---|---|---|
| objc2 API 翻译错误导致行为偏差 | 中 | 像素级对比截图，逐项验证 4 个标题栏属性和 Dock 图标 |
| `MainThreadMarker::new()` 在 setup 闭包内返回 None | 低 | 用 `MainThreadMarker::new().expect("setup must run on main thread")`，若失败立即可见 |
| objc2 系列 feature 配置不全导致类型不可用 | 中 | 按编译错误增量补 feature；可参考 objc2 官方 examples |
| 与 Tauri 2.x 的 `ns_window()` 返回类型不兼容 | 低 | Tauri 2 返回 `*mut c_void`，需 `as *mut NSWindow` 强转，objc2 支持 |

### 参考资料

- [objc2 官方迁移指南](https://docs.rs/objc2/latest/objc2/topics/migrating_from_objc.html)
- [objc2-app-kit NSWindow 文档](https://docs.rs/objc2-app-kit/latest/objc2_app_kit/struct.NSWindow.html)

---

## 总体执行顺序

| 顺序 | 任务 | 预计耗时 | 风险 | 警告变化 |
|---|---|---|---|---|
| 1 | 任务一：shell → opener | 10 分钟 | 极低 | 32 → 31 |
| 2 | 任务二：cocoa/objc → objc2 重写 | 1-2 小时 | 中（macOS 行为需逐项验证） | 31 → 0 |

每个任务独立提交一个 commit，便于单独回滚。

---

## 验收标准

全部完成后：

1. `cargo check --no-default-features` 警告数 = 0（不计与本次迁移无关的项目告警）
2. 应用功能完全正常：
   - **macOS**：标题栏 Overlay 样式与迁移前像素级一致；开发模式 Dock 图标显示自定义图标；打包版本 Dock 图标正常
   - **Windows / Linux**：行为完全不变（自绘 `TitleBar.tsx` 三键标题栏正常工作）
   - "打开 AI 配置目录"按钮正常工作（任务一）
3. 依赖项清理：`Cargo.toml` 中 `tauri-plugin-shell`、`cocoa`、`objc` 全部移除；新增 `tauri-plugin-opener`、`objc2`、`objc2-app-kit`、`objc2-foundation`
4. `src-tauri/src/lib.rs` 中所有 macOS 相关 unsafe 块仍包在 `#[cfg(target_os = "macos")]` 内（Windows/Linux 编译路径不受影响）

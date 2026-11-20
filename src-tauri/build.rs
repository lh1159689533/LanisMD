use std::process::Command;

fn main() {
    emit_rustc_version();
    tauri_build::build()
}

/// 编译期记录 rustc 版本，供「关于」面板展示；获取失败时降级为 unknown，不阻塞构建
fn emit_rustc_version() {
    // cargo 会通过 RUSTC 传入实际使用的编译器路径，比直接调用 PATH 中的 rustc 更准确
    let rustc = std::env::var("RUSTC").unwrap_or_else(|_| "rustc".to_string());
    let version = Command::new(rustc)
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        // 输出形如 "rustc 1.94.1 (e408947bf 2026-03-25)"，只取版本号
        .and_then(|text| text.split_whitespace().nth(1).map(str::to_string))
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=LANISMD_RUSTC_VERSION={version}");
    println!("cargo:rerun-if-env-changed=RUSTC");
}

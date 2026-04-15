use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

/// 搜索请求参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub root_path: String,
    pub query: String,
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub use_regex: bool,
    pub include_folders: Vec<String>,
    pub exclude_folders: Vec<String>,
}

/// 单条匹配结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatchItem {
    pub line_number: u32,
    pub line_content: String,
    pub match_start: u32,
    pub match_end: u32,
}

/// 单个文件的搜索结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchResult {
    pub file_path: String,
    pub file_name: String,
    pub matches: Vec<SearchMatchItem>,
}

/// 搜索响应
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub results: Vec<FileSearchResult>,
    pub total_matches: u32,
    pub total_files: u32,
}

/// 构建正则匹配器
fn build_matcher(params: &SearchParams) -> Result<regex::Regex, String> {
    let pattern = if params.use_regex {
        params.query.clone()
    } else {
        regex::escape(&params.query)
    };

    let pattern = if params.whole_word {
        format!(r"\b{}\b", pattern)
    } else {
        pattern
    };

    regex::RegexBuilder::new(&pattern)
        .case_insensitive(!params.case_sensitive)
        .build()
        .map_err(|e| format!("正则表达式错误: {}", e))
}

/// 判断文件是否应被搜索（文件夹过滤）
/// 注意：只对路径中的目录部分进行匹配，不匹配文件名
fn should_include(file_path: &Path, root: &Path, params: &SearchParams) -> bool {
    let rel = file_path.strip_prefix(root).unwrap_or(file_path);

    // 收集相对路径中的所有目录段（不含文件名）
    let dir_components: Vec<String> = rel
        .parent()
        .map(|p| {
            p.components()
                .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
                .collect()
        })
        .unwrap_or_default();

    // 排除过滤：任一目录段包含排除关键词则排除
    for f in &params.exclude_folders {
        let f = f.trim().to_lowercase();
        if !f.is_empty() && dir_components.iter().any(|comp| comp.contains(&f)) {
            return false;
        }
    }

    // 包含过滤：至少有一个目录段包含任一包含关键词
    let has_include = params.include_folders.iter().any(|f| !f.trim().is_empty());
    if has_include {
        return params.include_folders.iter().any(|f| {
            let f = f.trim().to_lowercase();
            !f.is_empty() && dir_components.iter().any(|comp| comp.contains(&f))
        });
    }

    true
}

/// 全局搜索命令
#[tauri::command]
pub async fn global_search(params: SearchParams) -> Result<SearchResponse, String> {
    if params.query.is_empty() {
        return Ok(SearchResponse {
            results: Vec::new(),
            total_matches: 0,
            total_files: 0,
        });
    }

    let matcher = build_matcher(&params)?;
    let root = Path::new(&params.root_path);

    if !root.exists() || !root.is_dir() {
        return Err("工作区路径不存在或不是目录".to_string());
    }

    let mut results: Vec<FileSearchResult> = Vec::new();
    let mut total_matches: u32 = 0;

    for entry in WalkDir::new(root).follow_links(false).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        // 只搜索 .md/.markdown 文件
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "md" && ext != "markdown" {
            continue;
        }

        // 跳过隐藏文件/目录（以 . 开头的路径段）
        let is_hidden = path.components().any(|c| {
            c.as_os_str().to_string_lossy().starts_with('.')
        });
        if is_hidden {
            continue;
        }

        if !should_include(path, root, &params) {
            continue;
        }

        // 读取文件并搜索
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut file_matches = Vec::new();
        for (line_idx, line) in content.lines().enumerate() {
            for mat in matcher.find_iter(line) {
                // 将字节偏移转换为字符偏移，确保前端 JS slice() 正确高亮
                let char_start = line[..mat.start()].chars().count() as u32;
                let char_end = line[..mat.end()].chars().count() as u32;
                file_matches.push(SearchMatchItem {
                    line_number: (line_idx + 1) as u32,
                    line_content: line.to_string(),
                    match_start: char_start,
                    match_end: char_end,
                });
            }
        }

        if !file_matches.is_empty() {
            total_matches += file_matches.len() as u32;
            let file_name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            results.push(FileSearchResult {
                file_path: path.to_string_lossy().to_string(),
                file_name,
                matches: file_matches,
            });
        }
    }

    let total_files = results.len() as u32;

    Ok(SearchResponse {
        results,
        total_matches,
        total_files,
    })
}

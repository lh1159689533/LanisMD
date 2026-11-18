// MCP 工具参数定义（字段注释会作为 JSON Schema 描述提供给模型）
//
// @changelog
// | 版本   | 变更说明                                 | 关联                                |
// | v1.0.0 | 从 server.rs 拆出参数；新增乐观锁与工作区参数 | REQ: MCP 乐观锁 TECH: version 校验 |
// /@changelog
//
// @author hhhuilli

use schemars::JsonSchema;
use serde::Deserialize;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ListDocumentsArgs {
    /// 相对工作区的子目录，默认为工作区根目录
    #[serde(default)]
    pub dir: Option<String>,
    /// 是否递归子目录，默认 true
    #[serde(default)]
    pub recursive: Option<bool>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ReadDocumentArgs {
    /// 文档路径（相对工作区或工作区内的绝对路径）
    pub path: String,
    /// 起始行号（从 1 开始，含），不传则从第一行开始
    #[serde(default)]
    pub start_line: Option<usize>,
    /// 结束行号（含），不传则读到末尾
    #[serde(default)]
    pub end_line: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PathArgs {
    /// 文档路径（相对工作区或工作区内的绝对路径）
    pub path: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SearchDocumentsArgs {
    /// 搜索关键词或正则表达式
    pub query: String,
    /// 是否把 query 当作正则表达式，默认 false
    #[serde(default)]
    pub use_regex: Option<bool>,
    /// 是否区分大小写，默认 false
    #[serde(default)]
    pub case_sensitive: Option<bool>,
    /// 是否全词匹配，默认 false
    #[serde(default)]
    pub whole_word: Option<bool>,
    /// 限定搜索的子目录（相对工作区），默认整个工作区
    #[serde(default)]
    pub dir: Option<String>,
    /// 最多返回的匹配行数，默认 100
    #[serde(default)]
    pub max_results: Option<usize>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct WriteDocumentArgs {
    /// 目标 Markdown 文件路径，父目录不存在时会自动创建
    pub path: String,
    /// 完整的文件内容
    pub content: String,
    /// 文件已存在时是否覆盖，默认 false（已存在则报错）
    #[serde(default)]
    pub overwrite: Option<bool>,
    /// 覆盖已有文件时必填：read_document 返回的 version，文件在此之后被改动则拒绝写入
    #[serde(default)]
    pub expected_version: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct EditDocumentArgs {
    /// 目标 Markdown 文件路径
    pub path: String,
    /// 要被替换的原文，必须与文件内容逐字一致（含空白与换行）
    pub old_text: String,
    /// 替换后的新文本，传空字符串表示删除
    pub new_text: String,
    /// 是否替换全部匹配，默认 false（要求 old_text 唯一）
    #[serde(default)]
    pub replace_all: Option<bool>,
    /// 可选：read_document 返回的 version，文件在此之后被改动则拒绝修改
    #[serde(default)]
    pub expected_version: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct AppendDocumentArgs {
    /// 目标 Markdown 文件路径，不存在时自动创建
    pub path: String,
    /// 追加到文末的内容（会自动与原内容用换行分隔）
    pub content: String,
    /// 可选：read_document 返回的 version，文件在此之后被改动则拒绝追加
    #[serde(default)]
    pub expected_version: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct MoveDocumentArgs {
    /// 源 Markdown 文件路径
    pub from: String,
    /// 目标 Markdown 文件路径（不能已存在），可用于重命名或移动到其他目录
    pub to: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GitLogArgs {
    /// 返回的提交数量，默认 20，最大 200
    #[serde(default)]
    pub limit: Option<u32>,
    /// 跳过的提交数量（分页），默认 0
    #[serde(default)]
    pub skip: Option<u32>,
    /// 只看某个文件或目录的历史（相对工作区），默认整个工作区
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GitDiffArgs {
    /// 只查看这些文件的改动（相对工作区），不传则包含全部未提交改动
    #[serde(default)]
    pub paths: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SelectWorkspaceArgs {
    /// 用户明确选择的文件夹绝对路径（可以是最近打开的文件夹，也可以是用户指定的新目录，不存在会自动创建）
    pub path: String,
}

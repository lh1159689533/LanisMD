# 全局搜索功能 PRD

## 1. 功能概述

在 LanisMD 编辑器侧边栏中实现 **VSCode 风格的全局文件内容搜索功能**，允许用户在当前打开的工作区文件夹中搜索所有 `.md` 文件的内容，快速定位并跳转到匹配位置。

**不包含替换功能**，仅做搜索。

---

## 2. 功能范围

### 2.1 包含

| 模块 | 说明 |
|------|------|
| 搜索面板 UI | 侧边栏搜索面板，包含搜索框、搜索选项、文件夹过滤、结果列表 |
| Rust 后端搜索命令 | 新增 Tauri 命令，在后端高效遍历 `.md` 文件并搜索内容 |
| 搜索结果展示 | 按文件分组、显示匹配行内容、关键词高亮 |
| 结果交互 | 点击结果项打开文件、跳转到对应行并高亮关键词 |
| 搜索选项 | 区分大小写、全词匹配、正则表达式 |
| 文件夹过滤 | "包含文件夹"和"排除文件夹"过滤条件（默认收起） |

### 2.2 不包含

- 搜索替换功能
- 搜索历史记录
- "在编辑器中打开"汇总视图
- 非 `.md` 文件的搜索

---

## 3. 用户交互设计

### 3.1 搜索面板布局

```
+-------------------------------------+
|  搜索                         [...] |  <- 标题 + 展开/收起过滤按钮(...)
+-------------------------------------+
|  +---------------------+ [Aa][ab][.*] |  <- 搜索输入框 + 3个选项按钮
|  +---------------------+             |
+- - - - - - - - - - - - - - - - - - -+  <- 以下为可折叠区域（默认收起）
|  包含文件夹: +------------------+    |
|             +------------------+    |
|  排除文件夹: +------------------+    |
|             +------------------+    |
+-------------------------------------+
|  N 个结果，包含于 M 个文件中          |  <- 结果统计
+-------------------------------------+
|  > 文档A.md                    (3)  |  <- 文件名 + 匹配数角标
|    | ...匹配**内容**...       |  <- 关键词高亮
|    | ...匹配**内容**...      |
|    | ...匹配**内容**...      |
|  > 文档B.md                    (1)  |
|    | ...匹配**内容**...       |
+-------------------------------------+
```

### 3.2 搜索选项按钮

| 按钮 | 图标 | 功能 | 默认状态 |
|------|------|------|----------|
| 区分大小写 | `Aa` | 切换大小写敏感搜索 | 关闭 |
| 全词匹配 | `ab` (带边框) | 仅匹配完整单词 | 关闭 |
| 正则表达式 | `.*` | 启用正则表达式搜索 | 关闭 |

按钮为 toggle 样式，激活时高亮。

### 3.3 文件夹过滤区域

- **默认状态**：收起（隐藏），通过标题栏右侧的 `...` 按钮切换展开/收起
- **包含文件夹**：输入框，以逗号分隔的文件夹名/路径片段，只在匹配的文件夹下搜索。为空表示搜索所有文件夹
- **排除文件夹**：输入框，以逗号分隔的文件夹名/路径片段，跳过匹配的文件夹。为空表示不排除

### 3.4 搜索结果交互

| 交互 | 行为 |
|------|------|
| 输入搜索词 | 输入停止 300ms 后自动触发搜索（debounce） |
| 点击结果项 | 在编辑器中打开该 `.md` 文件，滚动到对应行，高亮匹配关键词 |
| 点击文件名行 | 展开/折叠该文件的匹配结果 |
| 清空搜索框 | 清除所有结果 |
| 切换搜索选项 | 保持当前搜索词，重新触发搜索 |

---

## 4. 技术设计

### 4.1 架构分层

```
+---------------------------------------------+
|                前端 (React)                  |
|  +--------------+  +---------------------+  |
|  | SearchPanel  |  | useGlobalSearchStore|  |
|  |  组件 (UI)   |  |   (Zustand)         |  |
|  +------+-------+  +----------+----------+  |
|         |                     |              |
|  +------+---------------------+----------+  |
|  |     globalSearchService (TS 服务层)    |  |
|  +--------------+------------------------+  |
+-----------------+---------------------------+
                  |  invoke()
+-----------------+---------------------------+
|                Rust 后端                     |
|  +--------------+------------------------+  |
|  |  search_commands.rs (Tauri 命令)      |  |
|  +---------------------------------------+  |
+---------------------------------------------+
```

### 4.2 新增文件清单

| 文件路径 | 类型 | 说明 |
|---------|------|------|
| `src-tauri/src/commands/search_commands.rs` | Rust | 全局搜索 Tauri 命令 |
| `src/stores/global-search-store.ts` | TS | 全局搜索状态管理 |
| `src/services/tauri/global-search-service.ts` | TS | 前端搜索服务层 |
| `src/components/layout/SearchPanel.tsx` | TSX | 搜索面板 UI 组件 |
| `src/styles/layout/search-panel.css` | CSS | 搜索面板样式 |

### 4.3 现有文件修改

| 文件路径 | 修改内容 |
|---------|---------|
| `src-tauri/src/commands/mod.rs` | 注册 `search_commands` 模块 |
| `src-tauri/src/main.rs` 或 `lib.rs` | 注册新的 Tauri 命令 |
| `src/components/layout/Sidebar.tsx` | 将搜索面板区域替换为 `<SearchPanel />` 组件 |
| `src/stores/index.ts` | 导出 `useGlobalSearchStore` |

### 4.4 核心数据结构

#### Rust 端

```rust
/// 搜索请求参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    /// 工作区根路径
    pub root_path: String,
    /// 搜索关键词
    pub query: String,
    /// 区分大小写
    pub case_sensitive: bool,
    /// 全词匹配
    pub whole_word: bool,
    /// 正则模式
    pub use_regex: bool,
    /// 包含文件夹过滤（逗号分隔）
    pub include_folders: Vec<String>,
    /// 排除文件夹过滤（逗号分隔）
    pub exclude_folders: Vec<String>,
}

/// 单条匹配结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatchItem {
    /// 匹配行号（从1开始）
    pub line_number: u32,
    /// 完整行内容
    pub line_content: String,
    /// 匹配在行内的起始字符位置
    pub match_start: u32,
    /// 匹配在行内的结束字符位置
    pub match_end: u32,
}

/// 单个文件的搜索结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSearchResult {
    /// 文件绝对路径
    pub file_path: String,
    /// 文件名
    pub file_name: String,
    /// 该文件中的所有匹配
    pub matches: Vec<SearchMatchItem>,
}

/// 搜索响应
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    /// 按文件分组的结果
    pub results: Vec<FileSearchResult>,
    /// 总匹配数
    pub total_matches: u32,
    /// 包含匹配的文件数
    pub total_files: u32,
}
```

#### 前端 Zustand Store (`useGlobalSearchStore`)

```typescript
interface GlobalSearchState {
  // 搜索参数
  searchText: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  includeFolders: string;
  excludeFolders: string;
  showFilters: boolean;         // 文件夹过滤区域是否展开

  // 搜索结果
  results: FileSearchResult[];
  totalMatches: number;
  totalFiles: number;
  isSearching: boolean;

  // 结果展示状态
  expandedFiles: Set<string>;   // 已展开的文件路径集合

  // Actions
  setSearchText: (text: string) => void;
  toggleCaseSensitive: () => void;
  toggleWholeWord: () => void;
  toggleUseRegex: () => void;
  setIncludeFolders: (value: string) => void;
  setExcludeFolders: (value: string) => void;
  toggleFilters: () => void;
  toggleFileExpanded: (filePath: string) => void;
  performSearch: () => Promise<void>;
  clearResults: () => void;
}
```

### 4.5 与现有 `useSearchStore` 的关系

现有的 `useSearchStore` 是**编辑器内搜索**（Ctrl+F，在当前文档内查找），基于 ProseMirror 文档位置。新增的 `useGlobalSearchStore` 是**全局文件搜索**（侧边栏搜索面板，跨文件搜索），两者独立互不干扰。

### 4.6 结果点击跳转流程

```
用户点击搜索结果项
  -> 调用 fileService.readFile(filePath) 读取文件内容
  -> 调用 fileStore.openFile(...) 在编辑器中打开
  -> 等待编辑器初始化完成
  -> 定位到目标行号
  -> 使用编辑器内搜索（useSearchStore）高亮关键词
```

---

## 5. 边界条件与约束

| 条件 | 处理方式 |
|------|---------|
| 未打开工作区文件夹 | 显示提示"请先打开文件夹" |
| 搜索框为空 | 不触发搜索，清空结果 |
| 无匹配结果 | 显示"未找到结果" |
| 正则表达式语法错误 | 显示错误提示，不执行搜索 |
| 搜索过程中修改搜索词 | 取消上一次搜索（debounce 300ms），重新搜索 |
| 大文件夹（大量文件） | Rust 后端异步搜索，前端显示搜索中 loading 状态 |
| 点击结果打开的文件有未保存修改 | 复用现有的文件打开逻辑（如当前已有的脏文件处理） |

---

## 6. 不做的事项（明确排除）

- 搜索替换功能
- 搜索历史/最近搜索记录
- 文件内容预览（hover 预览）
- 搜索结果的"在编辑器中打开"汇总视图
- 非 `.md` 文件的搜索支持
- 搜索结果的排序切换
- 搜索进度百分比显示

# 技术设计文档 — GitHub/Gitee 文档同步

> Phase 07 (DESIGN_ARCHITECT) 产出 | 2026-06-15

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (React)                        │
├─────────────┬──────────────┬────────────────────────────────┤
│ SyncConfigPanel │ SyncActions  │ SyncStatusIndicator         │
│ (设置面板)       │ (操作按钮)   │ (状态图标)                    │
└───────┬─────┴──────┬───────┴──────────┬─────────────────────┘
        │            │                  │
        ▼            ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│              src/services/tauri/sync-service.ts               │
│              src/stores/sync-store.ts                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ invoke()
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              src-tauri/src/commands/sync_commands.rs          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              src-tauri/src/services/sync/                     │
├─────────────┬──────────────┬────────────────────────────────┤
│  config.rs  │  github.rs   │  gitee.rs                      │
│  (配置管理)  │  (GitHub API) │  (Gitee API)                  │
├─────────────┼──────────────┴────────────────────────────────┤
│  sync_engine.rs (统一同步引擎: diff/upload/pull)              │
│  file_hash.rs   (MD5 计算 + 增量检测)                        │
└─────────────────────────────────────────────────────────────┘
```

## 2. 数据模型

### 2.1 远程仓库配置 (SyncRepoConfig)

```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncRepoConfig {
    pub id: String,                      // UUID
    pub name: String,                    // 用户自定义名称
    pub platform: Platform,              // GitHub | Gitee
    pub token: String,                   // Personal Access Token
    pub owner: String,                   // 仓库拥有者
    pub repo: String,                    // 仓库名
    pub branch: String,                  // 目标分支，默认 "main"
    pub remote_path: Option<String>,     // 远程目标路径，None 表示根目录
    pub local_path: Option<String>,      // 绑定的本地文件夹路径
    pub include_patterns: Vec<String>,   // 白名单 glob 模式
    pub exclude_patterns: Vec<String>,   // 黑名单 glob 模式
    pub created_at: String,              // ISO 8601
    pub updated_at: String,              // ISO 8601
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Github,
    Gitee,
}
```

### 2.2 本地同步清单 (SyncManifest — `lanismd-sync.json`)

拉取/推送操作完成后，将同步信息写入**当前文件夹根目录**下的 `lanismd-sync.json` 文件。
该文件用于：恢复异常中断的拉取、重新打开文件夹后继续拉取/推送、推送时判断哪些文件有变更。

**清单失效规则**: 拉取时检测 `repo_config.platform` + `branch` 与本次操作是否一致：
- 平台或分支发生变更 → 清单中的 `file_entries` 全部失效，**清空后重新全量拉取**
- 同一平台+同一分支 → 正常增量同步（仅拉取差异文件）

```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncManifest {
    pub repo_config: SyncManifestRepoConfig, // 仓库连接信息（快照，脱敏）
    pub branch: String,                      // 同步分支
    pub include_patterns: Vec<String>,       // 白名单 glob
    pub exclude_patterns: Vec<String>,       // 黑名单 glob
    pub remote_path: Option<String>,         // 远程目标路径
    pub last_sync_at: Option<String>,        // 上次同步时间 ISO 8601
    pub sync_direction: String,              // "pull" | "push" — 上次操作方向
    pub file_entries: HashMap<String, SyncFileEntry>, // 相对路径 -> 文件信息
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncManifestRepoConfig {
    pub platform: Platform,
    pub owner: String,
    pub repo: String,
    pub config_id: String,                   // 引用 SyncRepoConfig.id（可反查 token）
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncFileEntry {
    pub md5: String,                         // 文件 MD5
    pub remote_sha: Option<String>,          // 远程文件 SHA（GitHub/Gitee API 需要）
    pub size: u64,                           // 文件大小(字节)
    pub synced_at: String,                   // 该文件的同步时间
    pub status: String,                      // "synced" | "pending" | "error"
}
```

### 2.3 配置存储路径

```
{dirs::data_dir()}/com.lanis.md/sync-repos.json    — 仓库配置列表（设置页面管理）
{当前文件夹}/lanismd-sync.json                     — 本地同步清单（拉取/推送时自动生成）
```

## 3. Rust 后端模块设计

### 3.1 命令层 (`commands/sync_commands.rs`)

| 命令名 | 参数 | 返回 | 说明 |
|--------|------|------|------|
| `sync_get_repos` | - | `Vec<SyncRepoConfig>` | 获取所有配置 |
| `sync_save_repo` | `config: SyncRepoConfig` | `SyncRepoConfig` | 添加/更新配置 |
| `sync_delete_repo` | `id: String` | `()` | 删除配置 |
| `sync_test_connection` | `config: SyncRepoConfig` | `bool` | 测试连接 |
| `sync_browse_remote` | `repo_id: String, path: Option<String>` | `Vec<RemoteEntry>` | 浏览远程目录 |
| `sync_list_branches` | `config_id: String` | `Vec<String>` | 获取远程仓库分支列表 |
| `sync_pull` | `PullRequest` | `SyncResult` | 拉取(远程→本地)，含仓库/分支/黑白名单/本地路径 |
| `sync_push` | `PushRequest` | `SyncResult` | 推送(本地→远程)，含 local_path + 可选的仓库/分支/黑白名单 |
| `sync_diff` | `local_path: String` | `DiffResult` | 对比差异，读取 lanismd-sync.json |
| `sync_read_manifest` | `local_path: String` | `Option<SyncManifest>` | 读取文件夹下的 lanismd-sync.json |

### 3.2 服务层 (`services/sync/`)

```
src-tauri/src/services/sync/
├── mod.rs              — 模块导出
├── config.rs           — 配置文件读写 (sync-repos.json)
├── sync_engine.rs      — 统一同步引擎 (diff/pull/push 核心逻辑)
├── file_hash.rs        — MD5 计算 + glob 过滤
├── github.rs           — GitHub REST API v3 封装
├── gitee.rs            — Gitee API v5 封装
└── types.rs            — 公共类型定义
```

### 3.3 API 抽象层 (Trait)

```rust
#[async_trait]
pub trait RemoteProvider: Send + Sync {
    /// 测试连接
    async fn test_connection(&self) -> AppResult<bool>;
    
    /// 获取远程目录树（最多 1000 文件）
    async fn get_tree(&self, path: Option<&str>) -> AppResult<Vec<RemoteEntry>>;
    
    /// 获取单个文件内容（Base64）
    async fn get_file_content(&self, path: &str) -> AppResult<Vec<u8>>;
    
    /// 获取文件的 SHA（用于更新 API）
    async fn get_file_sha(&self, path: &str) -> AppResult<Option<String>>;
    
    /// 创建或更新单个文件
    async fn put_file(&self, path: &str, content: &[u8], sha: Option<&str>, message: &str) -> AppResult<()>;
    
    /// 删除文件
    async fn delete_file(&self, path: &str, sha: &str, message: &str) -> AppResult<()>;
}
```

### 3.4 同步引擎核心流程

#### Pull (远程 → 本地)

```
1. 读取本地文件夹下的 lanismd-sync.json（如存在，用于续传）
2. ★ 源+分支变更检测:
   - 对比已有清单的 repo_config.platform + branch 与本次拉取请求
   - 如果 platform 或 branch 不同 → 清空 file_entries → 全量拉取
   - 如果相同 → 保留 file_entries → 增量拉取
3. 调用 RemoteProvider.get_tree() 获取远程文件列表
4. 按 include/exclude 过滤远程文件
5. 扫描本地文件夹，计算本地文件 MD5
6. 对比远程文件的 SHA/内容 hash 与本地 MD5
7. 找出需要拉取的文件（MD5 不同 / 本地不存在 / 上次状态为 "pending"/"error"）
8. 逐个文件调用 RemoteProvider.get_file_content() 下载
9. 写入本地文件夹（保持目录结构）
10. 每个文件拉取成功后，实时更新 lanismd-sync.json（写入 MD5/SHA/状态）
11. 通过 Tauri event 实时推送进度给前端
12. 全部完成后，更新 lanismd-sync.json 的 last_sync_at、repo_config、branch
```

#### Push (本地 → 远程)

根据 `lanismd-sync.json` 是否存在，分两种模式：

**模式 A: 清单已存在（之前拉取过）**
- platform + branch **锁定**，不允许修改，直接推送到拉取时的仓库和分支
- 对比本地文件 MD5 与清单记录，仅推送变更文件

**模式 B: 清单不存在（纯本地文件夹，从未拉取过）**
- 弹出 `SyncPushDialog`，允许用户选择仓库、分支、黑白名单（同拉取弹窗）
- 推送完成后生成 `lanismd-sync.json`

```
1. 检查本地文件夹下的 lanismd-sync.json 是否存在
   → 存在（模式 A）: 锁定 platform + branch，跳到步骤 3
   → 不存在（模式 B）: 弹出 SyncPushDialog 让用户选择仓库/分支/黑白名单
2. [仅模式 B] 用户确认后，根据选择构造 PushRequest
3. 扫描本地文件夹，按 include/exclude 过滤
4. 计算每个文件 MD5
5. [模式 A] 对比清单中记录的 hash，找出 新增/修改/删除 的文件
   [模式 B] 所有文件视为新增
6. 过滤 >25MB 的文件（跳过并记录警告）
7. 逐个文件调用 RemoteProvider.put_file() 上传
8. 每个文件上传成功后，实时更新 lanismd-sync.json
9. 生成自动 commit message: "sync: {timestamp} - {n} files updated"
10. 通过 Tauri event 实时推送进度给前端
```

### 3.5 进度通知机制

使用 Tauri Event System 实现实时进度推送：

```rust
// Rust 端
app.emit("sync-progress", SyncProgress {
    repo_id: "xxx",
    phase: "uploading",  // "scanning" | "uploading" | "downloading" | "completed" | "error"
    current: 5,
    total: 20,
    current_file: "docs/readme.md",
    message: None,
});

// 前端监听
import { listen } from '@tauri-apps/api/event';
listen<SyncProgress>('sync-progress', (event) => { ... });
```

## 4. 前端模块设计

### 4.1 服务层 (`services/tauri/sync-service.ts`)

```typescript
class SyncService {
  async getRepos(): Promise<SyncRepoConfig[]>;
  async saveRepo(config: SyncRepoConfig): Promise<SyncRepoConfig>;
  async deleteRepo(id: string): Promise<void>;
  async testConnection(config: SyncRepoConfig): Promise<boolean>;
  async listBranches(configId: string): Promise<string[]>;
  async browseRemote(repoId: string, path?: string): Promise<RemoteEntry[]>;
  async pull(request: PullRequest): Promise<SyncResult>;
  async push(request: PushRequest): Promise<SyncResult>;
  async diff(localPath: string): Promise<DiffResult>;
  async readManifest(localPath: string): Promise<SyncManifest | null>;
}

export const syncService = new SyncService();
```

### 4.2 状态管理 (`stores/sync-store.ts`)

```typescript
interface SyncProgress {
  repoId: string;
  phase: 'scanning' | 'uploading' | 'downloading' | 'completed' | 'error';
  current: number;
  total: number;
  currentFile: string;
  message?: string;
}

interface SyncState {
  repos: SyncRepoConfig[];
  /** 当前同步操作状态（拉取/推送），非 null 时按钮置灰 */
  activeSync: SyncProgress | null;
  /** 当前文件夹的同步清单（从 lanismd-sync.json 读取） */
  manifest: SyncManifest | null;

  // Actions
  loadRepos: () => Promise<void>;
  saveRepo: (config: SyncRepoConfig) => Promise<void>;
  deleteRepo: (id: string) => Promise<void>;
  /** 拉取：弹窗确认后调用 */
  startPull: (request: PullRequest) => Promise<void>;
  /** 推送：有清单时直接推送，无清单时需传入仓库/分支配置 */
  startPush: (request: PushRequest) => Promise<void>;
  /** 加载当前文件夹的同步清单 */
  loadManifest: (localPath: string) => Promise<void>;
  /** 监听 Tauri Event 更新进度 */
  listenProgress: () => () => void;
}

export const useSyncStore = create<SyncState>()((set, get) => ({ ... }));
```

### 4.3 UI 组件

| 组件 | 位置 | 说明 |
|------|------|------|
| `SyncConfigPanel` | 设置界面 (`SettingsDialog`) | 仓库配置的增删改查（平台/Token/Owner/Repo/默认黑白名单） |
| 拉取/推送按钮 | 文件树 header (`FileTree.tsx`) | 文件树操作按钮区新增两个按钮，同步进行中时置灰禁用 |
| `SyncPullDialog` | 弹窗 | 拉取弹窗：选择仓库配置 → 选择分支 → 配置黑白名单（默认继承设置页面） → 确认拉取 |
| `SyncPushDialog` | 弹窗 | 推送弹窗（仅无 `lanismd-sync.json` 时弹出）：选择仓库 → 分支 → 黑白名单 → 确认推送 |
| `SyncProgressBar` | 状态栏 (`StatusBar.tsx`) | 右下角显示拉取/推送进度（类似 VSCode 进度条） |
| `SyncStatusIcon` | 文件树节点 (P1) | 文件同步状态图标 |

### 4.4 拉取交互流程

```
1. 用户打开（空）文件夹
2. 点击文件树 header 的「拉取」按钮
3. 弹出 SyncPullDialog:
   a. 选择已配置的仓库（下拉，来自设置页面）
   b. 选择分支（从远程 API 获取分支列表）
   c. 黑白名单规则（默认继承仓库配置，可修改）
   d. 远程路径（默认为仓库根目录，可指定子目录）
   e. ★ 如果当前文件夹已有 lanismd-sync.json 且本次选择的源或分支与清单中不同:
      → 弹窗提示: "当前文件夹已从 {旧平台}/{旧分支} 同步，切换到 {新平台}/{新分支} 将清空同步记录并重新全量拉取"
      → 用户确认后继续
4. 确认拉取 → 调用后端 sync_pull 命令
5. 拉取过程中:
   - 拉取/推送按钮置灰禁用
   - 右下角 StatusBar 显示进度条
   - 已拉取文件的 MD5/SHA 信息实时写入 lanismd-sync.json
6. 拉取完成 → 刷新文件树 → 按钮恢复可用
7. 拉取异常中断 → 重新打开文件夹时读取 lanismd-sync.json → 可继续拉取

推送流程（分两种模式）:

模式 A — 清单已存在（之前拉取过）:
1. 点击「推送」按钮
2. 读取 lanismd-sync.json，platform + branch 锁定不可修改
3. 直接开始推送（无需弹窗选择仓库/分支）
4. 对比本地文件 MD5 与清单记录，仅推送变更文件
5. 推送完成 → 更新 lanismd-sync.json

模式 B — 清单不存在（纯本地文件夹）:
1. 点击「推送」按钮
2. 检测到无 lanismd-sync.json → 弹出 SyncPushDialog
3. SyncPushDialog 内容与 SyncPullDialog 类似：选择仓库 → 分支 → 黑白名单
4. 确认后所有本地文件视为新增，逐个上传
5. 推送完成 → 生成 lanismd-sync.json
```

## 5. 安全设计

| 风险 | 措施 |
|------|------|
| PAT 泄露 | 存储在系统数据目录的 JSON 文件中，日志中脱敏处理 |
| SSRF | HTTP 请求只允许白名单域名: `api.github.com`, `gitee.com/api` |
| 路径穿越 | 对 remote_path 和 local_path 做路径规范化和边界检查 |
| 中间人攻击 | reqwest 强制 HTTPS (rustls-tls) |
| 大文件 DoS | 单文件 >25MB 拒绝上传 |

## 6. 依赖新增

### Rust (Cargo.toml)

```toml
# 已有，无需新增:
# reqwest (HTTP), tokio (async), serde/serde_json, dirs, walkdir

# 可能新增:
md-5 = "0.10"           # MD5 计算（或使用 sha2 + hex）
glob = "0.3"            # glob 模式匹配
base64 = "0.22"         # GitHub API 文件内容 Base64 编解码
```

### 前端 (package.json)

```json
// 无需新增第三方依赖，使用 @tauri-apps/api 即可
```

## 7. 冲突处理策略

简单二选一模式：

```
Pull 时发现冲突（本地有修改 + 远程也有修改）:
  → 前端弹窗: "文件 {path} 存在冲突"
  → 选项: [保留本地版本] [使用远程版本] [跳过]
  → 用户选择后按策略处理
```

检测方式：对比 lanismd-sync.json 中记录的 hash vs 当前本地 hash vs 远程 hash
- manifest hash == 本地 hash != 远程 hash → 远程有更新，直接拉取
- manifest hash != 本地 hash == 远程 hash → 本地有修改，无需拉取
- manifest hash != 本地 hash != 远程 hash → 冲突，需用户决策

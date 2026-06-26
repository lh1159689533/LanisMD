# 任务拆分 — GitHub/Gitee 文档同步

> Phase 08 (DESIGN_TASK_SPLIT) 产出 | 2026-06-15 | 更新于 2026-06-15T23:04

## 架构任务（Phase 09: IMPL_ARCHITECT_BACKEND）

| # | 任务 | 优先级 | 复杂度 | 涉及模块 | 技术栈 | 状态 |
|---|------|--------|--------|----------|--------|------|
| A1 | Rust 同步模块骨架 + 类型定义 | P0 | 低 | `services/sync/mod.rs`, `types.rs` | Rust | pending |
| A2 | 同步配置存储方案 (JSON 文件读写) | P0 | 低 | `services/sync/config.rs` | Rust | pending |
| A3 | 命令层定义 + 注册 | P0 | 低 | `commands/sync_commands.rs`, `commands/mod.rs`, `lib.rs` | Rust | pending |
| A4 | Cargo.toml 新增依赖 | P0 | 低 | `Cargo.toml` | Rust | pending |
| A5 | 前端类型定义 + 服务层接口 | P0 | 低 | `types/sync.ts`, `services/tauri/sync-service.ts` | TypeScript | pending |
| A6 | Zustand Store 骨架 | P0 | 低 | `stores/sync-store.ts` | TypeScript | pending |

## 业务任务（Phase 10: IMPL_CODE）

### 后端任务（Backend - Rust）

| # | 任务 | 优先级 | 复杂度 | 涉及模块 | 依赖 | 状态 |
|---|------|--------|--------|----------|------|------|
| B1 | RemoteProvider Trait + GitHub API 实现 | P0 | 高 | `services/sync/github.rs` | A1 | pending |
| B2 | Gitee API 实现 | P0 | 中 | `services/sync/gitee.rs` | A1, B1 | pending |
| B3 | 文件 MD5 计算 + Glob 过滤 | P0 | 中 | `services/sync/file_hash.rs` | A1 | pending |
| B4 | 同步引擎: Pull 逻辑 (远程→本地) + lanismd-sync.json 写入 | P0 | 高 | `services/sync/sync_engine.rs` | B1, B3, A2 | pending |
| B5 | 同步引擎: Push 逻辑 (本地→远程) + lanismd-sync.json 读写 | P0 | 高 | `services/sync/sync_engine.rs` | B1, B3, A2 | pending |
| B6 | 同步引擎: Diff 对比 + 冲突检测 | P0 | 中 | `services/sync/sync_engine.rs` | B3 | pending |
| B7 | 连接测试 + 分支列表 + 远程目录浏览命令实现 | P0 | 低 | `commands/sync_commands.rs` | B1 | pending |
| B8 | 进度事件推送 (Tauri Event) | P0 | 低 | `commands/sync_commands.rs` | B4, B5 | pending |
| B9 | lanismd-sync.json 清单读写服务 | P0 | 低 | `services/sync/manifest.rs` | A1 | pending |

### 前端任务（Frontend - React/TypeScript）

| # | 任务 | 优先级 | 复杂度 | 涉及模块 | 依赖 | 状态 |
|---|------|--------|--------|----------|------|------|
| F1 | 设置页面: 远程仓库配置面板（增删改查 + 连接测试） | P0 | 中 | `components/settings/SyncSettings.tsx`, `SettingsDialog.tsx` | A5, A6, B7 | pending |
| F2 | 文件树 header 拉取/推送按钮 + 置灰逻辑 | P0 | 低 | `components/layout/FileTree.tsx` | A6 | pending |
| F3 | 拉取弹窗 SyncPullDialog（选仓库/分支/黑白名单 + 源分支变更提示） | P0 | 中 | `components/sync/SyncPullDialog.tsx` | A5, B7 | pending |
| F3.5 | 推送弹窗 SyncPushDialog（仅无清单时弹出，选仓库/分支/黑白名单） | P0 | 中 | `components/sync/SyncPushDialog.tsx` | A5, B7 | pending |
| F4 | 右下角同步进度条（StatusBar 扩展） | P0 | 低 | `components/layout/StatusBar.tsx` | B8 | pending |
| F5 | Store 完整实现（进度监听/manifest 读取/状态管理） | P0 | 中 | `stores/sync-store.ts` | A6, B8 | pending |
| F6 | 文件树同步状态图标 | P1 | 低 | `components/layout/FileTree.tsx` (扩展) | B6 | pending |

## 依赖关系图

```
A1 ──┬── A2 ── A3
     │
     ├── B1 ──┬── B2
     │        ├── B4 ── B8
     │        ├── B5 ── B8
     │        └── B7
     │
     ├── B3 ──┬── B4
     │        ├── B5
     │        └── B6
     │
     └── B9

A5 ── A6 ── F1, F2, F3, F3.5, F5
B7 ── F1, F3, F3.5
B8 ── F4, F5
B6 ── F6
```

## 执行顺序建议

1. **第一批（无依赖）**: A1, A4, A5
2. **第二批**: A2, A3, A6, B3, B9
3. **第三批**: B1, B6
4. **第四批**: B2, B4, B5, B7
5. **第五批**: B8, F1, F2, F3, F3.5, F5
6. **第六批（P1）**: F4, F6

## 关键变更说明（相比初版）

1. **同步元数据位置**: 从 `{data_dir}/sync-metadata/{repo_id}.json` 改为当前文件夹下的 `lanismd-sync.json`
2. **入口变更**: 取消独立 `SyncActions.tsx` 组件，改为在 `FileTree.tsx` header 操作按钮区新增拉取/推送按钮
3. **新增拉取弹窗**: `SyncPullDialog.tsx` — 选择仓库配置 → 分支 → 黑白名单 → 确认拉取
4. **进度展示**: 从 Toast 改为 StatusBar 右下角进度条（类似 VSCode）
5. **新增 B9 任务**: lanismd-sync.json 清单读写独立为服务模块
6. **B8 升级为 P0**: 进度事件推送是核心交互的必要部分
7. **新增 `sync_list_branches` / `sync_read_manifest` 命令**
8. **推送分两种模式**: 有清单时锁定 platform+branch 直接推送；无清单时弹出 `SyncPushDialog` 让用户选择
9. **新增 F3.5 任务**: `SyncPushDialog` 推送弹窗（仅无 `lanismd-sync.json` 时弹出）
10. **`sync_push` 参数升级**: 从 `local_path: String` 改为 `PushRequest`，支持无清单时传入仓库/分支配置

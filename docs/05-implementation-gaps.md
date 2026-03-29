# LanisMD 实现差距分析与修复计划

> **阶段**: Develop（开发执行）
> **日期**: 2026-03-28
> **版本**: v1.0.0
> **关联文档**: [02-prd.md](./02-prd.md) | [04-architecture.md](./04-architecture.md)
> **目的**: 对照 PRD 功能需求，梳理当前实现中的缺失和不完整项，作为下一步开发的执行清单

---

## ✅ 已修复项（本轮迭代完成）

以下问题已在 2026-03-28 修复，记录供追溯：

| 编号 | 问题 | 修复内容 |
|------|------|---------|
| ~~BUG-001~~ | 编辑器每次输入都会销毁重建 | 移除 `useEffect` 中 `activeTab?.content` 依赖，仅依赖 `activeTabId` |
| ~~BUG-002~~ | 保存按钮使用了错误的图标 | `RiSettings3Line` → `RiSave3Line` |
| ~~BUG-003~~ | 字数统计逻辑错误 | 实现中文按字 + 英文按词的正确计数 |
| ~~ARCH-002~~ | Toast 通知系统无渲染 | 新建 `ToastContainer.tsx` 并挂载到 `App.tsx` |
| ~~MISS-004~~ (部分) | 标签页中键关闭/Cmd+W/Ctrl+Tab/关闭最后标签新建空白页 | `TabBar.tsx` 添加中键关闭 + `useShortcuts.ts` 绑定快捷键 |
| ~~MISS-006~~ | 文件打开不支持多选 | `multiple: false` → `multiple: true`，循环打开多个文件 |
| ~~MISS-007~~ | 另存为快捷键未绑定 | 绑定 `Cmd+Shift+S` 到 `saveFileAs` |
| ~~快捷键~~ | Cmd+W / Ctrl+Tab / Ctrl+Shift+Tab / Cmd+, | 已绑定到对应 handler |

---

## 目录

1. [🔴 P0-Missing: MVP 核心功能缺失](#1-p0-missing-mvp-核心功能缺失)
2. [🟡 P1: 重要功能缺失/不完整](#2-p1-重要功能缺失不完整)
3. [🟠 架构/设计层面问题](#3-架构设计层面问题)
4. [📋 快捷键覆盖率](#4-快捷键覆盖率)
5. [🗓️ 建议修复顺序](#5-建议修复顺序)

---

## 1. P0-Missing: MVP 核心功能缺失

### MISS-001: 自动保存功能完全缺失

**PRD 功能**: F-010 自动保存

**当前状态**: `settings-store` 有配置项 (`autoSave: { enabled: true, interval: 5000 }`)，但 **没有任何定时器逻辑**

**需要实现**:
- [ ] 创建 `useAutoSave` hook
- [ ] 对已保存过的文件（`filePath !== null`），每 N 秒检查 `isDirty`，若为 true 则静默保存
- [ ] 对未保存的新文件（`filePath === null`），不执行自动保存
- [ ] 用户可在设置面板开关和调整间隔
- [ ] 自动保存时更新状态栏显示（如短暂闪烁 "已保存" 提示）

**涉及文件**:
- 新建: `src/hooks/useAutoSave.ts`
- 修改: `src/App.tsx`（接入 hook）

---

### MISS-002: 图片插入功能未实现

**PRD 功能**: F-004 图片插入

**当前状态**: `editor-setup.ts` 加载了 `upload` 插件，但 **没有配置 uploader handler**

**需要实现**:
- [ ] 配置 Milkdown upload 插件的 `uploader` 函数
- [ ] 拖拽/粘贴图片时，通过 Tauri 后端保存到文档所在目录的 `assets/` 子目录
- [ ] 生成唯一文件名（如 `image-20260327-143022.png`）
- [ ] 插入相对路径引用 `![](./assets/image-xxx.png)`
- [ ] 处理网络图片 URL 加载失败时显示 alt 文本

**涉及文件**:
- 修改: `src/editor/editor-setup.ts`（配置 uploader）
- 新建: `src/services/image-service.ts`（图片保存逻辑）
- 修改: 可能需要扩展 Tauri 后端命令

---

### MISS-003: 关闭确认缺失（数据丢失风险）

**PRD 功能**: F-007 AC7 / F-008

**当前状态**: 关闭标签和关闭窗口时 **不检查未保存内容**，直接丢弃

**需要实现**:
- [ ] `closeTab` 方法中检查 `isDirty`，若为 true 弹出确认对话框
- [ ] 确认对话框提供三个选项：保存 / 不保存 / 取消
- [ ] 监听 Tauri 窗口关闭事件（`tauri://close-requested`），遍历所有 dirty 标签
- [ ] 实现 `ConfirmDialog` 通用组件

**涉及文件**:
- 新建: `src/components/common/ConfirmDialog.tsx`
- 修改: `src/stores/file-store.ts`（closeTab 逻辑）
- 修改: `src/App.tsx`（窗口关闭拦截）

---

### MISS-004: 标签页拖拽排序未实现

**PRD 功能**: F-008 AC8

**当前状态**: 标签页其他功能（中键关闭/快捷键/关闭新建空白页）已实现，但 **拖拽排序未实现**

**需要实现**:
- [ ] `TabBar.tsx` 实现拖拽排序（可用 HTML5 Drag API 或 `@dnd-kit/core`）

**涉及文件**:
- 修改: `src/components/layout/TabBar.tsx`
- 修改: `src/stores/file-store.ts`（添加 reorderTabs 方法）

---

### MISS-005: 最近文件列表未展示

**PRD 功能**: F-009

**当前状态**: 后端 `ConfigService` 有 `get_recent_files` / `add_recent_file`，但 WelcomePage **只有三个按钮**，没有展示最近文件列表

**需要实现**:
- [ ] WelcomePage 启动时调用 `configService.getRecentFiles()` 获取列表
- [ ] 按最近打开时间倒序渲染文件列表（最多 20 条）
- [ ] 点击条目直接打开文件
- [ ] 文件不存在时提示并从列表移除
- [ ] 列表项显示文件名 + 完整路径（灰色小字）

**涉及文件**:
- 修改: `src/components/editor/WelcomePage.tsx`
- 使用: `src/services/tauri.ts` 中的 `configService`

---

## 2. P1: 重要功能缺失/不完整

### P1-001: KaTeX 数学公式未集成

**PRD 功能**: F-014

**当前状态**: `katex` 依赖已安装，CSS 已引入，但 **编辑器未加载 math 插件**

**需要实现**:
- [ ] 安装 `@milkdown/plugin-math`（如未安装）
- [ ] `editor-setup.ts` 中 `.use(math)` 加载插件
- [ ] 确保 KaTeX CSS 正确加载

---

### P1-002: Mermaid 图表未集成

**PRD 功能**: F-015

**当前状态**: `mermaid` 依赖已安装，但 **编辑器未加载 diagram 插件**

**需要实现**:
- [ ] 安装 `@milkdown/plugin-diagram`（如未安装）
- [ ] `editor-setup.ts` 中加载 diagram 插件
- [ ] 配置 mermaid 渲染函数

---

### P1-003: 搜索替换组件未集成

**PRD 功能**: F-017

**当前状态**: `SearchReplace.tsx` 组件已完整实现（UI + 匹配计数），但：
1. **没有被任何组件引用/挂载**
2. `onReplace` / `onReplaceAll` 回调 **无实际逻辑**
3. 无法通过 `Cmd+F` / `Cmd+H` 调用

**需要实现**:
- [ ] 在 `MainLayout.tsx` 或 `EditorCore` 中条件渲染 `SearchReplace` 组件
- [ ] 使用 `ui-store` 添加搜索面板开关状态
- [ ] `useShortcuts.ts` 绑定 `Cmd+F` 打开搜索、`Cmd+H` 打开替换
- [ ] 实现替换逻辑：通过 Milkdown API 操作编辑器内容
- [ ] 实现高亮当前匹配项（需要 ProseMirror decoration）

**涉及文件**:
- 修改: `src/components/layout/MainLayout.tsx`
- 修改: `src/stores/ui-store.ts`
- 修改: `src/hooks/useShortcuts.ts`
- 修改: `src/components/editor/SearchReplace.tsx`

---

### P1-004: 大纲视图点击不跳转

**PRD 功能**: F-018 AC3

**当前状态**: Sidebar 大纲面板能正确解析标题树，但 **点击标题按钮无任何跳转逻辑**

**问题位置**: `src/components/layout/Sidebar.tsx:15-19`

```tsx
// 当前代码：button 无 onClick 处理
<button className="..." title={item.text}>
  {item.text}
</button>
```

**需要实现**:
- [ ] 大纲点击时，通过 Milkdown/ProseMirror API 滚动到对应标题节点
- [ ] 高亮当前光标所在的标题（AC6）
- [ ] 添加 `Cmd+Shift+L` 快捷键切换大纲（AC5）

---

### P1-005: 源码模式未实现

**PRD 功能**: F-019

**当前状态**: `editor-store` 有 `mode: "wysiwyg" | "source"`，但 **无源码编辑器实现**

**需要实现**:
- [ ] 实现源码模式（直接显示 Markdown 原文，使用 textarea 或 CodeMirror）
- [ ] 添加 `Cmd+/` 快捷键切换 WYSIWYG / 源码模式
- [ ] 两种模式间同步内容

---

### P1-006: PDF/HTML 导出质量低下

**PRD 功能**: F-012, F-013

**当前状态**: `useExport.ts` 使用简易正则 `markdownToHtml` 转换，**不支持**：
- GFM 表格
- 任务列表
- 有序列表
- 代码块语法高亮
- 数学公式
- Mermaid 图表

**需要实现**:
- [ ] 替换正则转换器，使用 `marked` 或 `remark`/`rehype` 完整解析 Markdown
- [ ] 集成代码高亮（`highlight.js` 或 `shiki`）
- [ ] PDF 导出使用 Tauri 的 webview 打印 API 获得更好的排版控制
- [ ] 导出功能接入 UI（菜单或快捷键 `Cmd+P`）

**涉及文件**:
- 修改: `src/hooks/useExport.ts`
- 修改: `src/hooks/useShortcuts.ts`
- 修改: `src/App.tsx`

---

### P1-007: 自动目录 TOC 未实现

**PRD 功能**: F-016

**需要实现**:
- [ ] 解析 `[toc]` 语法
- [ ] 在编辑器中渲染为可点击的目录列表
- [ ] 目录随文档标题变化自动更新

---

### P1-008: 设置面板功能不完整

**PRD 功能**: F-024

**当前状态**: 有 4 个分区，但：
- Editor 区只读展示，无法修改字体大小等
- 缺少"恢复默认"按钮（AC5）
- 快捷键页显示"will be available in a future update"

> 注：`Cmd+,` 打开设置快捷键已实现 ✅

**需要实现**:
- [ ] Editor 分区的配置项可编辑（字体大小、行高、最大宽度等）
- [ ] 添加"恢复默认设置"按钮

---

### P1-009: 自定义标题栏不完整

**PRD 功能**: F-023

**当前状态**:
- macOS 交通灯区域已预留 ✅
- Windows/Linux 缺少最小化/最大化/关闭按钮（AC2）
- 双击标题栏未实现最大化/还原（AC6）

**需要实现**:
- [ ] 检测平台，非 macOS 时渲染自定义窗口控制按钮
- [ ] 标题栏双击事件触发窗口最大化/还原

---

## 3. 架构/设计层面问题

### ARCH-001: 配置双重持久化冲突

**问题描述**:
- **前端**: `settings-store` → `zustand/persist` → `localStorage`
- **后端**: `ConfigService` → `app_data_dir/config.json`

两套系统 **互相独立、不同步**。

**修复方案**: 统一为一套：
- 方案 A（推荐）：前端为主，去掉后端 ConfigService 的配置持久化，仅用后端做文件操作
- 方案 B：后端为主，前端启动时从后端读取配置，修改时写入后端

---

### ARCH-003: 导出功能未集成到 UI

**问题描述**: `useExport` hook 已实现，但 **没有菜单或快捷键调用它**

**修复方案**:
- [ ] 在标题栏或菜单中添加导出按钮/菜单
- [ ] 绑定快捷键 `Cmd+P` 导出 PDF
- [ ] 或集成到命令面板（F-025，P2 功能，可后做）

---

## 4. 快捷键覆盖率

| 快捷键 | PRD 功能 | 当前状态 | 修复优先级 |
|--------|---------|---------|-----------|
| `Cmd+N` | 新建文件 | ✅ 已实现 | — |
| `Cmd+O` | 打开文件 | ✅ 已实现 | — |
| `Cmd+S` | 保存 | ✅ 已实现 | — |
| `Cmd+Shift+S` | 另存为 | ✅ 已实现 | — |
| `Cmd+Shift+B` | 侧边栏 | ✅ 已实现 | — |
| `Cmd+W` | 关闭标签 | ✅ 已实现 | — |
| `Ctrl+Tab` | 下一个标签 | ✅ 已实现 | — |
| `Ctrl+Shift+Tab` | 上一个标签 | ✅ 已实现 | — |
| `Cmd+,` | 设置 | ✅ 已实现 | — |
| `Cmd+Z` | 撤销 | ⚠️ Milkdown 内置 | — |
| `Cmd+Shift+Z` | 重做 | ⚠️ Milkdown 内置 | — |
| `Cmd+B` | 粗体 | ⚠️ Milkdown 内置 | — |
| `Cmd+I` | 斜体 | ⚠️ Milkdown 内置 | — |
| `Cmd+1~6` | 标题级别 | ❌ | P1 |
| `Cmd+K` | 插入链接 | ❌ | P1 |
| `Cmd+F` | 搜索 | ❌ | P1 |
| `Cmd+H` | 替换 | ❌ | P1 |
| `Cmd+/` | 源码切换 | ❌ | P1 |
| `Cmd+Shift+L` | 大纲切换 | ❌ | P1 |
| `Cmd+P` | 导出 PDF | ❌ | P1 |
| `Cmd+Shift+P` | 命令面板 | ❌ | P2 |

**需要修改的文件**: `src/hooks/useShortcuts.ts`、`src/App.tsx`

---

## 5. 建议修复顺序

按依赖关系和影响面排列，分为 3 个迭代：

### 迭代一：MVP 完整性（P0 功能补齐）

| # | 编号 | 任务 | 涉及文件 | 预估 |
|---|------|------|---------|------|
| 1 | MISS-001 | 实现自动保存 | 新建 `useAutoSave.ts`、改 `App.tsx` | 1h |
| 2 | MISS-003 | 关闭确认对话框 | 新建 `ConfirmDialog.tsx`、改 `file-store.ts`、`App.tsx` | 1.5h |
| 3 | MISS-004 | 标签页拖拽排序 | `TabBar.tsx`、`file-store.ts` | 1.5h |
| 4 | MISS-005 | 最近文件列表 | `WelcomePage.tsx` | 1h |

### 迭代二：P1 功能实现

| # | 编号 | 任务 | 涉及文件 | 预估 |
|---|------|------|---------|------|
| 5 | P1-001 | KaTeX 数学公式 | `editor-setup.ts` | 1h |
| 6 | P1-002 | Mermaid 图表 | `editor-setup.ts` | 1h |
| 7 | P1-003 | 搜索替换集成 | `MainLayout.tsx`、`ui-store.ts`、`useShortcuts.ts`、`SearchReplace.tsx` | 2h |
| 8 | P1-004 | 大纲点击跳转 | `Sidebar.tsx` | 1.5h |
| 9 | P1-006 | 导出质量提升 + UI 集成 | `useExport.ts`、`useShortcuts.ts` | 2h |
| 10 | P1-008 | 设置面板完善 | `SettingsDialog.tsx` | 1.5h |
| 11 | MISS-002 | 图片插入 | `editor-setup.ts`、新建 `image-service.ts` | 2h |

### 迭代三：体验增强

| # | 编号 | 任务 | 涉及文件 | 预估 |
|---|------|------|---------|------|
| 12 | P1-005 | 源码模式 | 新建 `SourceEditor.tsx`、改 `EditorCore.tsx` | 3h |
| 13 | P1-007 | TOC 自动目录 | 编辑器插件 | 2h |
| 14 | P1-009 | 跨平台标题栏 | `TitleBar.tsx` | 1h |
| 15 | ARCH-001 | 统一配置系统 | `settings-store.ts`、后端 | 2h |
| 16 | ARCH-003 | 导出接入 UI/命令面板 | `App.tsx`、可选新建命令面板组件 | 1h |
| 17 | — | 补齐剩余快捷键 | `useShortcuts.ts` | 1h |

---

## 附录：文件索引

便于快速定位需要修改的文件：

| 文件路径 | 涉及修复项 |
|---------|-----------|
| `src/editor/editor-setup.ts` | MISS-002, P1-001, P1-002 |
| `src/stores/file-store.ts` | MISS-003, MISS-004 |
| `src/stores/ui-store.ts` | P1-003 |
| `src/stores/settings-store.ts` | ARCH-001 |
| `src/hooks/useShortcuts.ts` | P1-003, 快捷键 |
| `src/hooks/useExport.ts` | P1-006 |
| `src/components/layout/TitleBar.tsx` | P1-009 |
| `src/components/layout/TabBar.tsx` | MISS-004 |
| `src/components/layout/MainLayout.tsx` | P1-003 |
| `src/components/layout/Sidebar.tsx` | P1-004 |
| `src/components/editor/WelcomePage.tsx` | MISS-005 |
| `src/components/editor/SearchReplace.tsx` | P1-003 |
| `src/components/settings/SettingsDialog.tsx` | P1-008 |
| `src/App.tsx` | MISS-001, MISS-003, ARCH-003 |
| **新建文件** | |
| `src/hooks/useAutoSave.ts` | MISS-001 |
| `src/services/image-service.ts` | MISS-002 |
| `src/components/common/ConfirmDialog.tsx` | MISS-003 |

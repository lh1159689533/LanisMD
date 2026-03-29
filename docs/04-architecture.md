# MyTypora 架构设计文档

> **阶段**: Architect（架构设计）
> **日期**: 2026-03-27
> **版本**: v1.0.0
> **关联文档**: [01-brainstorm.md](./01-brainstorm.md) · [02-prd.md](./02-prd.md) · [03-ux-design.md](./03-ux-design.md)
> **技术栈**: Rust + Tauri 2.x + React 18 + TypeScript 5 + Milkdown 7.x + Tailwind CSS 3 + Zustand + Vite 5

---

## 目录

1. [系统架构设计](#1-系统架构设计)
2. [技术选型 ADR](#2-技术选型-adr)
3. [Tauri IPC 接口设计](#3-tauri-ipc-接口设计)
4. [前端架构设计](#4-前端架构设计)
5. [Rust 后端架构设计](#5-rust-后端架构设计)
6. [数据模型设计](#6-数据模型设计)
7. [性能优化策略](#7-性能优化策略)
8. [跨平台兼容性设计](#8-跨平台兼容性设计)

---

## 1. 系统架构设计

### 1.1 整体架构

MyTypora 采用 Tauri 2.x 的 **Rust 后端 + WebView 前端** 混合架构。前端通过 React 构建 UI 交互层，后端通过 Rust 处理系统级操作（文件系统、窗口管理、原生 API）。

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MyTypora 桌面应用                             │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   WebView 前端 (React)                        │  │
│  │                                                               │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │  │
│  │  │  UI 组件层    │  │  Milkdown    │  │  业务逻辑层         │  │  │
│  │  │             │  │  编辑器内核    │  │                    │  │  │
│  │  │ · 标签栏     │  │             │  │ · Zustand Stores   │  │  │
│  │  │ · 侧边栏     │  │ · CommonMark │  │ · Custom Hooks    │  │  │
│  │  │ · 状态栏     │  │ · GFM 扩展   │  │ · Tauri Service   │  │  │
│  │  │ · 设置弹窗   │  │ · 数学公式   │  │   封装层            │  │  │
│  │  │ · 命令面板   │  │ · Mermaid    │  │                    │  │  │
│  │  └─────────────┘  └──────────────┘  └────────────────────┘  │  │
│  └───────────────────────────┬───────────────────────────────────┘  │
│                              │                                      │
│                     Tauri IPC (Commands / Events)                   │
│                     ──────────────────────────                      │
│                              │                                      │
│  ┌───────────────────────────┴───────────────────────────────────┐  │
│  │                   Rust 后端 (Native)                          │  │
│  │                                                               │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │  │
│  │  │  Commands    │  │  Services    │  │  Tauri Plugins     │  │  │
│  │  │  (IPC 入口)  │  │  (业务逻辑)  │  │  (系统抽象)         │  │  │
│  │  │             │  │             │  │                    │  │  │
│  │  │ · file      │  │ · fs_service │  │ · fs 插件          │  │  │
│  │  │ · config    │  │ · cfg_service│  │ · dialog 插件      │  │  │
│  │  │ · export    │  │ · exp_service│  │ · window 插件      │  │  │
│  │  │ · watch     │  │ · watch_svc  │  │ · store 插件       │  │  │
│  │  └──────────────┘  └──────────────┘  └────────────────────┘  │  │
│  │                                                               │  │
│  │  ┌───────────────────────────────────────────────────────┐   │  │
│  │  │              操作系统 (macOS / Windows / Linux)        │   │  │
│  │  │  文件系统 · 窗口管理 · 原生对话框 · 系统通知 · 系统主题   │   │  │
│  │  └───────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 架构分层原则

| 层次 | 职责 | 技术实现 |
|------|------|----------|
| **UI 组件层** | 负责渲染和用户交互，纯展示型组件 | React + Tailwind CSS |
| **编辑器层** | Markdown 编辑核心，WYSIWYG 渲染 | Milkdown 7.x + ProseMirror |
| **业务逻辑层** | 状态管理、业务规则、数据转换 | Zustand + Custom Hooks |
| **服务封装层** | 封装 Tauri IPC 调用，提供前端友好的异步 API | TypeScript services |
| **IPC 通信层** | 前后端桥接，序列化/反序列化 | Tauri invoke / listen / emit |
| **Commands 层** | Rust 端 IPC 入口，参数校验，错误映射 | Tauri #[tauri::command] |
| **Services 层** | Rust 端核心业务逻辑 | 纯 Rust 模块 |
| **OS 交互层** | 操作系统 API 调用 | Tauri Plugins + Rust std |

### 1.3 前后端通信机制

Tauri 2.x 提供三种通信方式，MyTypora 根据场景分别选用：

| 通信方式 | 模式 | 适用场景 | 示例 |
|----------|------|----------|------|
| **IPC Commands** | 请求-响应（Invoke） | 前端主动调用后端，等待返回结果 | `read_file`、`save_file`、`open_dialog` |
| **IPC Events** | 发布-订阅（EventBus） | 后端向前端推送异步消息 | `file-changed`、`fs-watch-event` |
| **Window Messages** | 窗口间通信 | 多窗口数据传递（P3 分屏场景预留） | 暂不使用 |

#### 通信流程图

```
用户操作 → React 组件 → Zustand Store → Tauri Service 层 → Tauri IPC invoke()
                                                          ↓
                                              Rust #[command] 函数
                                                          ↓
                                              Rust Service 层处理
                                                          ↓
                                              文件系统 / 系统 API
                                                          ↓
                                              Rust Result<T, E>
                                                          ↓
                                              Tauri 序列化为 JSON
                                                          ↓
                                              前端 Promise resolve / reject
                                                          ↓
                                              Zustand Store 更新状态
                                                          ↓
                                              React 组件 re-render
```

### 1.4 数据流架构图

```
┌────────────────────────────────────────────────────────────────────────┐
│                           数据流向                                      │
│                                                                        │
│   用户输入                                                               │
│      │                                                                 │
│      ▼                                                                 │
│   ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐         │
│   │ Milkdown  │───▶│ Zustand      │───▶│ Tauri IPC Service   │         │
│   │ Editor    │    │ editor-store │    │ (TypeScript 封装)    │         │
│   │           │    │              │    │                      │         │
│   │ 内容变更   │    │ 内容快照      │    │ invoke('write_file')│         │
│   │ 光标变化   │    │ 修改标记      │    │ invoke('save_file') │         │
│   │ 格式变化   │    │ 光标位置      │    │ invoke('get_config')│         │
│   └──────────┘    └──────────────┘    └──────────┬───────────┘         │
│                                                    │                     │
│                                          Tauri IPC (JSON)               │
│                                                    │                     │
│   ┌──────────────┐    ┌──────────────┐    ┌───────┴───────────┐        │
│   │ 文件系统      │◀───│ Rust Service │◀───│ Rust Command      │        │
│   │              │    │              │    │ (参数校验+错误处理)  │        │
│   │ 读写文件      │    │ 原子写入      │    │                   │        │
│   │ 监听变更      │    │ 编码检测      │    │ fn write_file(    │        │
│   │ 目录遍历      │    │ 配置管理      │    │   path, content   │        │
│   └──────────────┘    └──────────────┘    │ ) -> Result<()>   │        │
│                                          └───────────────────┘        │
│                                                                        │
│   反向数据流（事件推送）：                                                 │
│                                                                        │
│   文件系统变更 ──▶ fs-watch ──▶ Rust Event ──▶ 前端 listen()           │
│                                                    │                   │
│                                          ┌─────────┴──────────┐       │
│                                          │ Zustand Store 更新   │       │
│                                          │ → 标记文件已变更      │       │
│                                          │ → 弹出提示对话框      │       │
│                                          └────────────────────┘       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 技术选型 ADR

### ADR-001: 为什么选择 Milkdown 而非 TipTap/ProseMirror/CodeMirror

#### 状态：已接受

#### 背景

需要一个所见即所得（WYSIWYG）的 Markdown 编辑器内核，支持 CommonMark + GFM 语法，能与 React 深度集成，且具备良好的扩展性以支持数学公式、Mermaid 图表、代码高亮等高级功能。

#### 决策

选择 **Milkdown 7.x** 作为编辑器内核。

#### 备选方案对比

| 维度 | Milkdown 7.x | TipTap | ProseMirror（原生） | CodeMirror 6 |
|------|-------------|--------|--------------------|--------------| 
| **WYSIWYG** | ✅ 原生 WYSIWYG | ✅ WYSIWYG | ✅ 底层能力 | ❌ 源码编辑器 |
| **Markdown 原生** | ✅ 基于 Remark，Markdown 一等公民 | ⚠️ Markdown 需要转换层 | ⚠️ 通用富文本，需自行搭建 MD 解析 | ❌ 非 WYSIWYG |
| **React 集成** | ✅ 官方 React 支持 | ✅ 官方 React 支持 | ⚠️ 需要自行封装 React 组件 | ✅ 官方 React 支持 |
| **学习曲线** | 中（声明式插件 API） | 中（基于 ProseMirror 封装） | 高（底层 API，需深入理解 Schema/Transaction） | 中 |
| **插件生态** | 良好（官方 + 社区） | 优秀（大量官方扩展） | 无内置，需全部自行实现 | 丰富 |
| **数学公式** | ✅ 官方 `plugin-math` | ⚠️ 需自行开发 NodeView | ⚠️ 需自行开发 | ❌ N/A |
| **代码高亮** | ✅ 官方 `plugin-prism` | ⚠️ 需集成第三方 | ⚠️ 需自行开发 | ✅ 官方支持 |
| **包体积** | ~200KB（含预设） | ~300KB | ~100KB（核心） | ~200KB |
| **TypeScript** | ✅ 完整 TS 支持 | ✅ 完整 TS 支持 | ✅ 完整 TS 支持 | ✅ 完整 TS 支持 |
| **开源协议** | MIT | MIT | MIT | MIT |

#### 决策理由

1. **Markdown 一等公民**：Milkdown 基于 Remark（Unified 生态），Markdown 解析和序列化是其核心能力。TipTap 和 ProseMirror 本质上是通用富文本编辑器，Markdown 支持需要额外的解析层
2. **WYSIWYG 开箱即用**：Milkdown 天然支持"编辑时显示标记、离开时隐藏"的 WYSIWYG 行为，这正是 Typora 式体验的核心
3. **官方插件覆盖关键需求**：`plugin-math`（KaTeX）、`plugin-prism`（代码高亮）、`plugin-slash`（斜杠命令）、`plugin-upload`（图片上传）等官方插件直接覆盖 PRD 中的 P0/P1 需求
4. **React 集成质量**：Milkdown 提供官方 `@milkdown/react` 包，声明式 API 与 React 理念一致
5. **扩展性**：基于 ProseMirror 底层，可以通过自定义 NodeView 实现任何定制需求（如 Mermaid 图表渲染）
6. **轻量**：相比 TipTap，Milkdown 的核心包体积更小，符合 Tauri 轻量架构的定位

#### 后果

- **正面**：开箱即用的 WYSIWYG Markdown 编辑体验；官方插件减少开发工作量；与 React 深度集成
- **负面**：社区规模小于 TipTap，遇到问题时的参考资料较少；部分高级定制需要深入理解 ProseMirror
- **风险**：Milkdown 7.x 大版本升级可能引入 Breaking Changes；Mermaid 图表需要自行开发 NodeView

---

### ADR-002: 为什么选择 Tauri 而非 Electron

#### 状态：已接受

#### 背景

桌面应用需要跨平台（macOS、Windows、Linux）运行，需要访问本地文件系统、原生对话框、窗口管理等系统能力。

#### 决策

选择 **Tauri 2.x** 作为桌面应用框架。

#### 备选方案对比

| 维度 | Tauri 2.x | Electron 33+ |
|------|-----------|-------------|
| **后端语言** | Rust | Node.js (JavaScript) |
| **渲染引擎** | 系统 WebView（WKWebView / WebView2 / WebKitGTK） | 内嵌 Chromium |
| **安装包体积** | ~3-10 MB | ~50-100 MB |
| **运行时内存** | ~30-80 MB | ~100-300 MB |
| **冷启动速度** | 快（<1s 系统 WebView） | 较慢（1-3s Chromium 启动） |
| **文件系统访问** | Rust std + Tauri fs 插件 | Node.js fs 模块 |
| **安全性** | 基于权限的沙箱（capabilities 系统） | 进程隔离，但 Node.js 完整访问系统能力 |
| **插件生态** | 成长中（30+ 官方插件） | 成熟（npm 生态 + Electron API） |
| **多窗口** | WebviewWindow API | BrowserWindow API |
| **自动更新** | tauri-plugin-updater | electron-updater |
| **系统通知** | tauri-plugin-notification | Notification API |
| **跨平台一致** | 优秀（Rust 统一抽象） | 良好（Chromium 统一渲染） |

#### 决策理由

1. **轻量是核心卖点**：PRD 中明确将「轻量快速」列为核心价值主张。Tauri 的安装包体积约为 Electron 的 1/10，内存占用降低 50%+，这是最核心的差异化优势
2. **性能优势**：Rust 后端处理文件 I/O 的性能远超 Node.js；系统 WebView 启动速度优于内嵌 Chromium
3. **安全性**：Tauri 2.x 引入了 Capabilities 权限系统，对文件系统访问进行细粒度控制，比 Electron 的全量 Node.js 访问更安全
4. **学习价值**：Rust 是系统编程语言，作为学习项目可以同时掌握 Rust 和前端技术栈
5. **Tauri 2.x 已成熟**：2024-10 发布稳定版，API 稳定，核心插件齐全（fs、dialog、window、store、notification）

#### 后果

- **正面**：安装包小、内存低、启动快；安全性强；技术栈更有学习价值
- **负面**：社区生态小于 Electron，遇到问题参考资料少；无法使用 Node.js 生态（npm 包）；Rust 开发门槛高于 JavaScript
- **缓解**：Tauri 社区快速增长；核心功能（文件系统、对话框、窗口）的 API 已稳定；作为学习项目，挑战即价值

---

### ADR-003: 为什么选择 Zustand 而非 Redux/MobX/Jotai

#### 状态：已接受

#### 背景

需要一个前端状态管理方案来管理编辑器状态（文件列表、标签页、编辑器内容、设置配置、侧边栏状态等）。应用状态复杂度中等，不需要 Redux 那样的重型企业级方案。

#### 决策

选择 **Zustand** 作为状态管理方案。

#### 备选方案对比

| 维度 | Zustand | Redux Toolkit | MobX | Jotai |
|------|---------|--------------|------|-------|
| **心智模型** | Store + Hook | 单一 Store + Slice | Observable + Reaction | 原子化状态 |
| **样板代码** | 极少 | 中等 | 少 | 少 |
| **TypeScript** | ✅ 原生支持 | ✅ 完整支持 | ✅ 装饰器/函数 | ✅ 原生支持 |
| **包体积** | ~1.1 KB | ~11 KB | ~16 KB | ~3.5 KB |
| **学习曲线** | 低 | 中高 | 中 | 低 |
| **DevTools** | ✅ 支持 | ✅ 优秀 | ✅ 支持 | ✅ 支持 |
| **适用场景** | 中小型应用 | 大型复杂应用 | 复杂响应式 | 细粒度状态 |
| **React 18 并发** | ✅ 兼容 | ✅ 兼容 | ⚠️ 需注意 | ✅ 原生 |

#### 决策理由

1. **极简 API，低样板代码**：Zustand 的 `create()` API 只需几行代码即可创建 Store，无需像 Redux 那样定义 action、reducer、dispatch。对于 MyTypora 的中等复杂度状态，Zustand 足够
2. **灵活的 Store 切分**：Zustand 不强制单一 Store，可以按功能域拆分为多个独立 Store（`file-store`、`editor-store`、`settings-store`），符合关注点分离原则
3. **中间件生态**：内置 `persist` 中间件（配置持久化）、`devtools` 中间件（调试）、`immer` 中间件（不可变更新），开箱即用
4. **体积最小**：~1.1 KB 的 gzip 体积，在所有方案中最小，符合 Tauri 轻量理念
5. **React 18 完美兼容**：基于 Hook 的 API 与 React 18 的并发模式天然兼容
6. **社区趋势**：Zustand 是 React 生态中增长最快的状态管理方案，已被 Vercel、Next.js 等团队采用

#### 后果

- **正面**：代码简洁，开发效率高；灵活的 Store 拆分；包体积极小
- **负面**：对于非常复杂的状态逻辑（如多步 undo/redo），可能需要额外的设计；缺少 Redux 的严格单向数据流约束
- **缓解**：Milkdown 自带 ProseMirror 的 undo/redo 管理；Zustand 的 `subscribeWithSelector` 中间件可以支持复杂的派生状态

---

### ADR-004: 为什么选择 pnpm 而非 npm/yarn

#### 状态：已接受

#### 背景

前端项目需要包管理器来管理 npm 依赖。

#### 决策

选择 **pnpm** 作为包管理器。

#### 备选方案对比

| 维度 | pnpm | npm 10+ | yarn 4 (Berry) |
|------|------|---------|---------------|
| **安装速度** | 快（硬链接 + 符号链接） | 中 | 快 |
| **磁盘空间** | 最优（全局内容寻址存储） | 每个项目独立复制 | 全局缓存 |
| **monorepo 支持** | ✅ 内置 workspaces | ⚠️ 基础 workspaces | ✅ workspaces + 插件 |
| **锁文件** | `pnpm-lock.yaml` | `package-lock.json` | `yarn.lock` |
| **安全性** | 严格（限制依赖提升） | 中 | 中 |
| **Node.js 兼容** | ✅ 完全兼容 | ✅ 内置 | ✅ 完全兼容 |
| **生态兼容** | ✅ 完全兼容 npm registry | ✅ 标准 | ✅ 兼容 npm registry |

#### 决策理由

1. **磁盘效率**：pnpm 使用全局内容寻址存储 + 硬链接机制，多个项目共享同一依赖版本时只占一份磁盘空间
2. **安装速度快**：硬链接机制使得依赖安装几乎瞬间完成
3. **严格的依赖解析**：pnpm 的非扁平 `node_modules` 结构避免了幽灵依赖（phantom dependencies），安全性更高
4. **monorepo 友好**：如果未来需要拆分 Tauri 插件为独立包，pnpm workspaces 可以无缝支持
5. **Vite 官方推荐**：Vite 官方文档推荐使用 pnpm

---

### ADR-005: 代码高亮方案（Prism.js vs Shiki）

#### 状态：有条件接受（MVP 使用 Prism.js，P1 评估 Shiki 升级）

#### 背景

代码块需要语法高亮支持，至少覆盖 10 种主流编程语言。Milkdown 官方提供 `@milkdown/plugin-prism`（基于 Prism.js），而 Shiki 作为更现代的方案能提供 VS Code 级别的精确高亮。

#### 备选方案对比

| 维度 | Prism.js | Shiki |
|------|----------|-------|
| **高亮质量** | 良好（正则匹配） | 优秀（TextMate 语法 + VS Code 引擎） |
| **主题丰富度** | 丰富（社区主题多） | 丰富（所有 VS Code 主题可用） |
| **Milkdown 集成** | ✅ 官方插件 `@milkdown/plugin-prism` | ⚠️ 需自定义开发或使用社区方案 |
| **包体积** | ~20-40 KB（按需语言） | ~200-500 KB（含 WASM + 语言定义） |
| **加载方式** | 同步加载 | 异步加载（WASM 初始化） |
| **语言支持** | 150+ 语言 | 200+ 语言 |
| **TypeScript** | ✅ 类型定义完整 | ✅ 原生 TypeScript |
| **编辑器内高亮** | ✅ 通过 Decoration API | ⚠️ 需自行实现 Decoration 集成 |

#### 决策理由

**MVP 阶段（P0）使用 Prism.js**：
1. 官方插件 `@milkdown/plugin-prism` 开箱即用，零额外开发成本
2. 包体积小（~20-40 KB），不影响冷启动速度
3. 对于常见的编程语言，Prism.js 的高亮质量完全足够
4. 稳定可靠，没有 WASM 初始化的复杂性

**P1 阶段评估 Shiki 升级**：
1. Shiki 的 TextMate 语法解析精度更高，能正确处理嵌套语法（如 JSX 中嵌入 CSS）
2. 可以使用 VS Code 的暗色主题（如 `github-dark`、`one-dark-pro`），与编辑器主题更统一
3. 如果 Shiki 的加载性能和集成复杂度可控（使用动态 import + 语言按需加载），则升级

#### 后果

- **正面**：MVP 快速交付；Prism.js 稳定可靠；包体积小
- **负面**：Prism.js 正则匹配在高亮精度上不如 Shiki（如嵌套语法场景）
- **缓解**：P1 阶段可无缝升级，不影响 API 接口

---

### ADR-006: PDF 导出方案（window.print vs html2pdf.js）

#### 状态：有条件接受（MVP 组合方案，详见下文）

#### 背景

PRD F-012 要求将 Markdown 文档导出为 PDF，保留格式化样式（标题、粗体/斜体、代码高亮、表格、图片），中文内容正确渲染。

#### 备选方案对比

| 方案 | 实现方式 | 优点 | 缺点 | 依赖 |
|------|----------|------|------|------|
| **window.print()** | 调用浏览器打印 API | 零依赖；跨平台原生；用户可自定义页面设置 | 无法静默导出；质量依赖系统驱动；无法预览 | 无 |
| **html2pdf.js** | html2canvas + jsPDF | 纯前端；可定制页面/边距/水印；可预览 | 大文档性能差（Canvas 方案）；复杂排版还原度一般 | ~300 KB |
| **浏览器打印 CSS** | @media print 样式 | 与 window.print 配合，精确控制打印样式 | 仍依赖系统打印驱动 | 无 |

#### 决策

采用 **分阶段方案**：

**Phase 1（MVP P1）**：`window.print()` + `@media print` 样式
- 使用 `window.print()` 调起系统打印对话框
- 用户在打印对话框中选择「另存为 PDF」
- 通过 `@media print` CSS 精确控制 PDF 输出样式（隐藏编辑器 UI、调整边距、设置字体等）
- 优点：零外部依赖，实现成本最低，跨平台一致

**Phase 2（P2 增强）**：评估 `html2pdf.js` 或 `@tauri-apps/plugin-shell` + 系统工具
- 如果 `window.print()` 的体验不满足需求（如需要静默导出、自定义水印、批量导出）
- 引入 `html2pdf.js` 作为前端直出方案
- 或通过 Tauri shell 插件调用系统的 `wkhtmltopdf` / `weasyprint`（如果用户已安装）

#### 决策理由

1. **零依赖原则**：`window.print()` 是浏览器原生 API，无需引入任何第三方库
2. **跨平台兼容**：macOS Preview、Windows Edge/Chrome、Linux CUPS 都能将打印保存为 PDF
3. **质量可控**：通过 `@media print` CSS 可以精确控制输出的页面尺寸、边距、字体、分页等
4. **MVP 够用**：对于研究生提交论文、技术博主导出文档等场景，系统打印对话框的 PDF 输出质量足够

#### 后果

- **正面**：零额外依赖；跨平台一致；用户可控的页面设置
- **负面**：无法静默导出（必须经过系统打印对话框）；部分 Linux 发行版的打印驱动质量参差不齐
- **缓解**：P2 阶段可引入 `html2pdf.js` 作为高级导出选项

---

## 3. Tauri IPC 接口设计

### 3.1 接口设计原则

1. **命名规范**：使用 `snake_case`，动词 + 名词（如 `read_file`、`open_dialog`）
2. **参数设计**：使用 TypeScript 接口定义参数类型，Rust 端使用 serde 进行 JSON 序列化/反序列化
3. **错误处理**：Rust 端所有错误统一转换为 `AppError`，序列化为 `{ code: string, message: string }` 传递给前端
4. **幂等性**：读操作天然幂等；写操作通过原子写入保证幂等
5. **参数校验**：Rust 端使用 `validator` crate 进行参数校验，前端仅做基础类型检查

### 3.2 文件操作接口

#### `read_file`

读取文件内容（文本模式）。

**Rust 签名**：
```rust
#[tauri::command]
async fn read_file(path: String, encoding: Option<String>) -> Result<FileContent, AppError>
```

**TypeScript 签名**：
```typescript
interface ReadFileParams {
  path: string;
  encoding?: 'utf-8' | 'gbk' | 'gb2312' | 'shift_jis' | 'auto';
}

interface FileContent {
  content: string;
  encoding: string;
  metadata: FileMetadata;
}

function readFile(params: ReadFileParams): Promise<FileContent>;
```

**参数说明**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | ✅ | 文件绝对路径 |
| `encoding` | `string` | ❌ | 指定编码，默认 `auto`（自动检测） |

**返回值**：
| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | `string` | 文件文本内容 |
| `encoding` | `string` | 实际使用的编码 |
| `metadata` | `FileMetadata` | 文件元信息 |

**错误处理**：
| 错误码 | 触发条件 | 前端处理 |
|--------|----------|----------|
| `FILE_NOT_FOUND` | 文件不存在 | Toast 提示"文件不存在" |
| `PERMISSION_DENIED` | 无读取权限 | Toast 提示"无权限读取文件" |
| `ENCODING_ERROR` | 编码检测/转换失败 | 弹窗让用户手动选择编码 |
| `INVALID_PATH` | 路径格式不合法 | 静默忽略 |

---

#### `write_file`

写入文件内容（原子写入）。

**Rust 签名**：
```rust
#[tauri::command]
async fn write_file(
    path: String,
    content: String,
    encoding: Option<String>,
    create_parents: Option<bool>,
) -> Result<FileMetadata, AppError>
```

**TypeScript 签名**：
```typescript
interface WriteFileParams {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'gbk' | 'gb2312';
  createParents?: boolean;
}

function writeFile(params: WriteFileParams): Promise<FileMetadata>;
```

**原子写入策略**：
```
1. 写入临时文件：{path}.tmp.{timestamp}
2. fsync 确保数据落盘
3. rename 替换原文件（原子操作）
4. 清理失败时的临时文件
```

**错误处理**：
| 错误码 | 触发条件 | 前端处理 |
|--------|----------|----------|
| `WRITE_FAILED` | 磁盘空间不足、权限不足 | 状态栏显示警告图标 + Toast 提示 |
| `PERMISSION_DENIED` | 无写入权限 | 弹窗提示并建议"另存为" |
| `INVALID_PATH` | 路径不合法 | 静默忽略 |
| `ENCODING_ERROR` | 编码转换失败 | 回退到 UTF-8 重试 |

---

#### `read_file_meta`

读取文件元信息（不读取文件内容）。

**Rust 签名**：
```rust
#[tauri::command]
async fn read_file_meta(path: String) -> Result<FileMetadata, AppError>
```

**TypeScript 签名**：
```typescript
function readFileMeta(path: string): Promise<FileMetadata>;
```

---

#### `delete_file`

删除文件。

**Rust 签名**：
```rust
#[tauri::command]
async fn delete_file(path: String, trash: Option<bool>) -> Result<(), AppError>
```

**TypeScript 签名**：
```typescript
interface DeleteFileParams {
  path: string;
  trash?: boolean; // 默认 true，移到回收站而非永久删除
}

function deleteFile(params: DeleteFileParams): Promise<void>;
```

### 3.3 对话框接口

#### `open_file_dialog`

打开文件选择对话框。

**Rust 签名**：
```rust
#[tauri::command]
async fn open_file_dialog(
    title: Option<String>,
    filters: Option<Vec<DialogFilter>>,
    multiple: Option<bool>,
    directory: Option<bool>,
) -> Result<Option<OpenDialogResult>, AppError>

struct DialogFilter {
    name: String,
    extensions: Vec<String>,
}

struct OpenDialogResult {
    paths: Vec<String>,       // multiple=true 时为多个路径
    path: String,             // multiple=false 时为单个路径（兼容）
}
```

**TypeScript 签名**：
```typescript
interface DialogFilter {
  name: string;
  extensions: string[];
}

interface OpenDialogParams {
  title?: string;
  filters?: DialogFilter[];
  multiple?: boolean;
  directory?: boolean;
}

interface OpenDialogResult {
  paths: string[];
}

function openFileDialog(params?: OpenDialogParams): Promise<OpenDialogResult | null>;
```

**默认行为**（不传参数时）：
```typescript
{
  title: '打开文件',
  filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
  multiple: true,
}
```

---

#### `save_file_dialog`

保存文件对话框。

**Rust 签名**：
```rust
#[tauri::command]
async fn save_file_dialog(
    title: Option<String>,
    default_name: Option<String>,
    filters: Option<Vec<DialogFilter>>,
) -> Result<Option<String>, AppError>
```

**TypeScript 签名**：
```typescript
interface SaveDialogParams {
  title?: string;
  defaultName?: string;
  filters?: DialogFilter[];
}

function saveFileDialog(params?: SaveDialogParams): Promise<string | null>;
```

### 3.4 配置操作接口

#### `get_config`

获取应用配置。

**Rust 签名**：
```rust
#[tauri::command]
async fn get_config(key: Option<String>) -> Result<serde_json::Value, AppError>
```

**TypeScript 签名**：
```typescript
// 获取全部配置
function getConfig(): Promise<AppConfig>;

// 获取指定键
function getConfig(key: string): Promise<unknown>;
```

**配置存储位置**：
| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/com.mytypora.app/config.json` |
| Windows | `%APPDATA%\com.mytypora.app\config.json` |
| Linux | `~/.config/com.mytypora.app/config.json` |

---

#### `set_config`

更新应用配置（支持部分更新/深度合并）。

**Rust 签名**：
```rust
#[tauri::command]
async fn set_config(key: String, value: serde_json::Value) -> Result<(), AppError>
```

**TypeScript 签名**：
```typescript
function setConfig(key: string, value: unknown): Promise<void>;

// 示例
await setConfig('theme', 'dark');
await setConfig('editor.fontSize', 18);
await setConfig('autoSave', { enabled: true, interval: 5000 });
```

**深度合并策略**：使用 `.` 分隔符访问嵌套字段，使用 JSON Merge Patch (RFC 7396) 进行合并。

---

#### `get_recent_files`

获取最近打开的文件列表。

**Rust 签名**：
```rust
#[tauri::command]
async fn get_recent_files(limit: Option<u32>) -> Result<Vec<RecentFile>, AppError>
```

**TypeScript 签名**：
```typescript
function getRecentFiles(limit?: number): Promise<RecentFile[]>;
// 默认 limit = 20
```

---

#### `add_recent_file`

添加/更新最近文件记录（自动去重，更新时间戳，超限裁剪）。

**Rust 签名**：
```rust
#[tauri::command]
async fn add_recent_file(path: String) -> Result<(), AppError>
```

**TypeScript 签名**：
```typescript
function addRecentFile(path: string): Promise<void>;
```

### 3.5 导出接口

#### `export_pdf`

通过系统打印 API 导出 PDF。

**Rust 签名**：
```rust
#[tauri::command]
async fn export_pdf(
    window: tauri::Window,
    html_content: String,
    css_styles: String,
) -> Result<(), AppError>
```

**TypeScript 签名**：
```typescript
interface ExportPdfParams {
  htmlContent: string;
  cssStyles: string;
}

function exportPdf(params: ExportPdfParams): Promise<void>;
```

> **实现说明**：前端构造包含编辑器内容的 HTML 字符串和打印样式，Rust 端创建隐藏的 WebView 窗口加载该 HTML 并触发打印。MVP 阶段可直接在前端使用 `window.print()` 简化实现。

---

#### `export_html`

导出为独立 HTML 文件。

**Rust 签名**：
```rust
#[tauri::command]
async fn export_html(
    html_content: String,
    css_styles: String,
    embed_images: Option<bool>,
) -> Result<String, AppError>
```

**TypeScript 签名**：
```typescript
interface ExportHtmlParams {
  htmlContent: string;
  cssStyles: string;
  embedImages?: boolean; // 默认 true
}

function exportHtml(params: ExportHtmlParams): Promise<string>;
```

> **实现说明**：返回完整的 HTML 字符串（包含内嵌 CSS 和 base64 编码图片），前端负责调用 `save_file_dialog` 让用户选择保存位置。

### 3.6 文件监听接口

#### `watch_file`

监听文件变更。

**Rust 签名**：
```rust
#[tauri::command]
async fn watch_file(
    app: tauri::AppHandle,
    path: String,
) -> Result<String, AppError> // 返回 watch ID
```

**TypeScript 签名**：
```typescript
function watchFile(path: string): Promise<string>; // 返回 watchId

// 监听事件
import { listen } from '@tauri-apps/api/event';

interface FileWatchEvent {
  watchId: string;
  path: string;
  kind: 'create' | 'modify' | 'remove' | 'rename';
  timestamp: number;
}

const unlisten = await listen<FileWatchEvent>('fs-watch-event', (event) => {
  // 处理文件变更事件
});
```

---

#### `unwatch_file`

取消文件监听。

**Rust 签名**：
```rust
#[tauri::command]
async fn unwatch_file(app: tauri::AppHandle, watch_id: String) -> Result<(), AppError>
```

**TypeScript 签名**：
```typescript
function unwatchFile(watchId: string): Promise<void>;
```

### 3.7 统一错误类型

```rust
// Rust 端统一错误类型
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("File not found: {0}")]
    FileNotFound(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Encoding error: {0}")]
    Encoding(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Write failed: {0}")]
    WriteFailed(String),

    #[error("Config error: {0}")]
    Config(String),

    #[error("Export failed: {0}")]
    ExportFailed(String),
}

// 序列化为前端可识别的 JSON
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where S: Serializer {
        #[derive(Serialize)]
        struct ErrorInfo {
            code: String,
            message: String,
        }

        let (code, message) = match self {
            Self::FileNotFound(msg) => ("FILE_NOT_FOUND", msg.as_str()),
            Self::PermissionDenied(msg) => ("PERMISSION_DENIED", msg.as_str()),
            Self::Io(msg) => ("IO_ERROR", &msg.to_string()),
            Self::Encoding(msg) => ("ENCODING_ERROR", msg.as_str()),
            Self::InvalidPath(msg) => ("INVALID_PATH", msg.as_str()),
            Self::WriteFailed(msg) => ("WRITE_FAILED", msg.as_str()),
            Self::Config(msg) => ("CONFIG_ERROR", msg.as_str()),
            Self::ExportFailed(msg) => ("EXPORT_FAILED", msg.as_str()),
        };

        ErrorInfo { code: code.into(), message: message.into() }.serialize(serializer)
    }
}
```

```typescript
// 前端错误类型
interface AppError {
  code: ErrorCode;
  message: string;
}

type ErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'IO_ERROR'
  | 'ENCODING_ERROR'
  | 'INVALID_PATH'
  | 'WRITE_FAILED'
  | 'CONFIG_ERROR'
  | 'EXPORT_FAILED';
```

---

## 4. 前端架构设计

### 4.1 React 组件层次结构

```
App
├── TitleBar                    // 自定义标题栏
│   ├── WindowControls          // 窗口控制按钮（macOS/Windows 差异）
│   ├── FileTitle               // 当前文件名 + 修改指示器
│   └── TitleBarActions         // 设置、主题切换按钮
│
├── TabBar                      // 标签栏
│   ├── TabItem (×N)            // 单个标签页
│   │   ├── TabIcon
│   │   ├── TabLabel
│   │   ├── UnsavedIndicator
│   │   └── TabCloseButton
│   └── TabNewButton            // 新建标签按钮
│
├── MainContent                 // 主内容区
│   ├── Sidebar                 // 侧边栏
│   │   ├── SidebarPanelSwitch  // 面板切换图标栏
│   │   ├── OutlinePanel        // 大纲面板
│   │   │   └── OutlineItem (×N)
│   │   ├── FileTreePanel       // 文件树面板（P2）
│   │   └── SearchPanel         // 搜索面板
│   │       ├── SearchInput
│   │       ├── ReplaceInput
│   │       ├── SearchOptions
│   │       └── SearchResults
│   │
│   └── EditorArea              // 编辑器区域
│       ├── WelcomePage         // 欢迎页（无文件打开时）
│       │   ├── RecentFilesList
│       │   └── QuickActions
│       └── EditorContainer     // 编辑器容器（每个标签页一个实例）
│           ├── MilkdownEditor  // Milkdown 编辑器
│           ├── BubbleMenu      // 浮动格式菜单
│           └── SlashCommand    // 斜杠命令面板
│
├── StatusBar                   // 状态栏
│   ├── WordCount
│   ├── CursorPosition
│   ├── FileType
│   ├── Encoding
│   └── ThemeToggle
│
├── SettingsDialog              // 设置弹窗
│   ├── SettingsNav             // 左侧导航
│   └── SettingsContent         // 右侧内容
│       ├── GeneralSettings
│       ├── AppearanceSettings
│       ├── EditorSettings
│       └── KeyBindingsSettings
│
├── CommandPalette              // 命令面板（模态）
│
├── ContextMenu                 // 右键菜单
│
└── ToastContainer              // Toast 通知容器
    └── Toast (×N)
```

### 4.2 Zustand Store 设计

采用**按功能域拆分**的策略，每个 Store 独立管理自己的状态。

#### file-store：文件与标签页管理

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FileState {
  // 标签页列表
  tabs: EditorTab[];
  activeTabId: string | null;

  // 最近文件
  recentFiles: RecentFile[];

  // 操作方法
  openFile: (path: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  updateTabContent: (tabId: string, content: string) => void;
  markTabSaved: (tabId: string) => void;
  markTabDirty: (tabId: string) => void;
  createUntitledTab: () => void;
  loadRecentFiles: () => Promise<void>;
}

export const useFileStore = create<FileState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,
      recentFiles: [],

      openFile: async (path: string) => {
        // 1. 检查是否已在标签页中打开
        const existing = get().tabs.find(t => t.filePath === path);
        if (existing) {
          set({ activeTabId: existing.id });
          return;
        }

        // 2. 通过 Tauri IPC 读取文件
        const fileContent = await tauriService.readFile({ path });

        // 3. 创建新标签页
        const newTab: EditorTab = {
          id: generateId(),
          filePath: path,
          fileName: basename(path),
          content: fileContent.content,
          encoding: fileContent.encoding,
          isDirty: false,
          cursorPosition: { line: 1, column: 1 },
          scrollPosition: 0,
          lastSavedContent: fileContent.content,
        };

        set(state => ({
          tabs: [...state.tabs, newTab],
          activeTabId: newTab.id,
        }));

        // 4. 更新最近文件
        await tauriService.addRecentFile(path);
        await get().loadRecentFiles();
      },

      // ... 其他方法实现
    }),
    {
      name: 'file-store',
      partialize: (state) => ({
        recentFiles: state.recentFiles,
      }),
    }
  )
);
```

#### editor-store：编辑器状态

```typescript
interface EditorState {
  // 编辑模式
  mode: 'wysiwyg' | 'source';

  // 专注模式
  focusMode: boolean;

  // 打字机模式
  typewriterMode: boolean;

  // 选区信息（用于 Bubble Menu 触发判断）
  selectionRange: { from: number; to: number } | null;
  selectedText: string;

  // 文档统计
  wordCount: number;
  charCount: number;
  lineCount: number;
  readingTime: number;

  // 大纲数据
  outline: OutlineItem[];

  // 操作方法
  setMode: (mode: 'wysiwyg' | 'source') => void;
  toggleFocusMode: () => void;
  toggleTypewriterMode: () => void;
  updateSelection: (range: { from: number; to: number }, text: string) => void;
  updateStats: (content: string) => void;
  updateOutline: (items: OutlineItem[]) => void;
}
```

#### settings-store：应用配置

```typescript
interface SettingsState {
  config: AppConfig;
  isLoading: boolean;

  // 操作方法
  loadConfig: () => Promise<void>;
  updateConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}
```

#### ui-store：UI 状态（非持久化）

```typescript
interface UIState {
  // 侧边栏
  sidebarOpen: boolean;
  sidebarPanel: 'outline' | 'files' | 'search';
  sidebarWidth: number;

  // 命令面板
  commandPaletteOpen: boolean;

  // 设置弹窗
  settingsOpen: boolean;
  settingsActiveSection: string;

  // 搜索
  searchOpen: boolean;
  searchQuery: string;
  searchReplaceQuery: string;
  searchCaseSensitive: boolean;
  searchUseRegex: boolean;

  // Toast
  toasts: Toast[];

  // 操作方法
  toggleSidebar: () => void;
  setSidebarPanel: (panel: 'outline' | 'files' | 'search') => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openSettings: (section?: string) => void;
  closeSettings: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}
```

### 4.3 自定义 Hook 设计

#### `useEditor` — 编辑器核心 Hook

```typescript
interface UseEditorReturn {
  editor: Editor | null;           // Milkdown Editor 实例
  isReady: boolean;                // 编辑器是否初始化完成
  getContent: () => string;        // 获取当前 Markdown 内容
  setContent: (content: string) => void;  // 设置编辑器内容
  getCursorPosition: () => { line: number; column: number };
  setCursorPosition: (line: number, column: number) => void;
  focus: () => void;
  destroy: () => void;
}

function useEditor(tabId: string): UseEditorReturn;
```

**职责**：管理 Milkdown Editor 实例的生命周期（创建、销毁、内容同步）。当 `tabId` 变化时，切换到对应标签页的编辑器实例（复用或创建）。

---

#### `useFile` — 文件操作 Hook

```typescript
interface UseFileReturn {
  // 当前活动标签页信息
  currentTab: EditorTab | null;

  // 文件操作
  newFile: () => Promise<void>;
  openFile: () => Promise<void>;
  saveFile: () => Promise<void>;
  saveAs: () => Promise<void>;
  closeFile: () => Promise<void>;

  // 状态
  isSaving: boolean;
  isDirty: boolean;
}

function useFile(): UseFileReturn;
```

**职责**：封装文件操作的业务逻辑（新建、打开、保存、另存为、关闭），处理保存前的确认对话框、自动保存触发等。

---

#### `useTabs` — 标签页管理 Hook

```typescript
interface UseTabsReturn {
  tabs: EditorTab[];
  activeTabId: string | null;
  activeTab: EditorTab | null;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  closeOtherTabs: (tabId: string) => void;
  closeTabsToRight: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
}

function useTabs(): UseTabsReturn;
```

---

#### `useTheme` — 主题管理 Hook

```typescript
interface UseThemeReturn {
  theme: 'light' | 'dark' | 'system';
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
  toggleTheme: () => Promise<void>;
}

function useTheme(): UseThemeReturn;
```

**职责**：
1. 管理主题状态（亮色/暗色/跟随系统）
2. 设置 `document.documentElement.dataset.theme`
3. 监听 `prefers-color-scheme` 系统主题变化
4. 持久化主题设置到 Tauri Store

---

#### `useShortcuts` — 快捷键 Hook

```typescript
interface UseShortcutsReturn {
  registerShortcut: (key: string, handler: () => void, options?: ShortcutOptions) => () => void;
  isRecording: boolean;
  startRecording: () => void;
}

function useShortcuts(): UseShortcutsReturn;
```

**职责**：
1. 注册全局快捷键监听
2. 支持平台差异（macOS Cmd vs Windows/Linux Ctrl）
3. 快捷键录制功能（用于设置面板的自定义快捷键）
4. 快捷键冲突检测

---

#### `useAutoSave` — 自动保存 Hook

```typescript
interface UseAutoSaveReturn {
  lastSaveTime: number | null;
  saveError: string | null;
}

function useAutoSave(content: string, tab: EditorTab | null, enabled: boolean, interval: number): UseAutoSaveReturn;
```

**职责**：
1. 监听内容变化，debounce 后触发自动保存
2. 仅对已保存过的文件执行自动保存（跳过未命名文件）
3. 保存失败时更新 `saveError` 状态

---

#### `useFileWatcher` — 文件监听 Hook

```typescript
interface UseFileWatcherReturn {
  isWatching: boolean;
  externalChange: FileWatchEvent | null;
  dismissChange: () => void;
}

function useFileWatcher(path: string | null, enabled: boolean): UseFileWatcherReturn;
```

### 4.4 Milkdown 插件架构

#### 插件组织方式

Milkdown 采用声明式插件系统，所有插件通过 `Milkdown.use()` 注册。MyTypora 按功能模块组织插件：

```
src/
├── editor/
│   ├── plugins/
│   │   ├── core.ts              // 核心插件集合
│   │   ├── markdown.ts          // Markdown 语法插件
│   │   ├── code-highlight.ts    // 代码高亮插件
│   │   ├── math.ts              // 数学公式插件
│   │   ├── mermaid.ts           // Mermaid 图表插件（P1）
│   │   ├── slash-command.ts     // 斜杠命令插件
│   │   ├── bubble-menu.ts       // 浮动菜单插件
│   │   ├── block-drag.ts        // 块级拖拽插件（P2）
│   │   ├── focus-mode.ts        // 专注模式插件（P2）
│   │   └── typewriter.ts        // 打字机模式插件（P2）
│   │
│   ├── components/
│   │   ├── MilkdownEditor.tsx   // 编辑器 React 组件
│   │   ├── BubbleMenu.tsx       // 浮动格式菜单
│   │   ├── SlashCommand.tsx     // 斜杠命令面板
│   │   ├── MermaidBlock.tsx     // Mermaid 渲染组件
│   │   └── SourceEditor.tsx     // 源码模式编辑器
│   │
│   ├── hooks/
│   │   ├── useEditor.ts
│   │   └── useEditorCommands.ts
│   │
│   └── theme/
│       └── editor.css           // 编辑器专用样式
```

#### 插件注册示例

```typescript
// editor/plugins/core.ts
import { editorViewOptionsCtx } from '@milkdown/kit/core';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { cursor } from '@milkdown/kit/plugin/cursor';
import { history } from '@milkdown/kit/plugin/history';
import { upload } from '@milkdown/kit/plugin/upload';
import { prism } from '@milkdown/kit/plugin/prism';
import { math } from '@milkdown/plugin-math';
import { slash } from '@milkdown/kit/plugin/slash';

export function createCorePlugins() {
  return [
    listener,
    history,
    clipboard,
    cursor,
    upload,
    // 代码高亮（Prism.js）
    prism,
    // 数学公式
    math,
    // 斜杠命令
    slash,
  ];
}

// editor/plugins/code-highlight.ts
import { $view } from '@milkdown/utils';

// 自定义代码块语言选择菜单的 NodeView
export function createCodeBlockPlugins() {
  return [
    // 注册代码块的自定义 NodeView
    // 添加语言选择下拉菜单
    // 添加复制按钮
  ];
}

// editor/plugins/mermaid.ts（P1 阶段）
export function createMermaidPlugins() {
  return [
    // 自定义 mermaid 代码块的 NodeView
    // 编辑时显示源码，失焦时渲染为 SVG
    // 懒加载 Mermaid.js
  ];
}
```

#### Milkdown Editor React 组件

```typescript
// editor/components/MilkdownEditor.tsx
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core';
import { nord } from '@milkdown/theme-nord';
import { milkdown } from '@milkdown/react';
import { createCorePlugins } from '../plugins/core';

interface MilkdownEditorProps {
  content: string;
  onChange?: (markdown: string) => void;
  onCursorChange?: (position: { line: number; column: number }) => void;
  readOnly?: boolean;
  theme: 'light' | 'dark';
}

export function MilkdownEditor({
  content,
  onChange,
  onCursorChange,
  readOnly = false,
  theme,
}: MilkdownEditorProps) {
  const { ref } = useEditor((root) =>
    Editor.make()
      .config(nord)
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
      })
      .use(createCorePlugins())
      .create()
  );

  return <div ref={ref} className="milkdown-editor" data-theme={theme} />;
}
```

### 4.5 Tauri IPC 调用层封装

为了将前端业务逻辑与 Tauri IPC 实现解耦，设计 `services/` 层封装所有 Tauri 调用：

```
src/
├── services/
│   ├── tauri/
│   │   ├── file-service.ts      // 文件操作
│   │   ├── dialog-service.ts    // 对话框
│   │   ├── config-service.ts    // 配置管理
│   │   ├── export-service.ts    // 导出功能
│   │   └── watch-service.ts     // 文件监听
│   │
│   └── index.ts                 // 统一导出
```

#### file-service.ts 示例

```typescript
// services/tauri/file-service.ts
import { invoke } from '@tauri-apps/api/core';

interface ReadFileParams {
  path: string;
  encoding?: string;
}

interface FileContent {
  content: string;
  encoding: string;
  metadata: FileMetadata;
}

interface WriteFileParams {
  path: string;
  content: string;
  encoding?: string;
  createParents?: boolean;
}

class FileService {
  async readFile(params: ReadFileParams): Promise<FileContent> {
    try {
      return await invoke<FileContent>('read_file', params);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async writeFile(params: WriteFileParams): Promise<FileMetadata> {
    try {
      return await invoke<FileMetadata>('write_file', params);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async readFileMeta(path: string): Promise<FileMetadata> {
    return invoke<FileMetadata>('read_file_meta', { path });
  }

  async deleteFile(path: string, trash = true): Promise<void> {
    return invoke<void>('delete_file', { path, trash });
  }

  private handleError(error: unknown): AppError {
    // 解析 Tauri IPC 错误，转换为统一的 AppError
    if (typeof error === 'object' && error !== null && 'code' in error) {
      return error as AppError;
    }
    return {
      code: 'UNKNOWN_ERROR',
      message: String(error),
    };
  }
}

export const fileService = new FileService();
```

#### 统一导出

```typescript
// services/index.ts
export { fileService } from './tauri/file-service';
export { dialogService } from './tauri/dialog-service';
export { configService } from './tauri/config-service';
export { exportService } from './tauri/export-service';
export { watchService } from './tauri/watch-service';

// 统一的 tauriService 对象（便捷访问）
export const tauriService = {
  file: fileService,
  dialog: dialogService,
  config: configService,
  export: exportService,
  watch: watchService,
};
```

---

## 5. Rust 后端架构设计

### 5.1 模块划分

```
src-tauri/
├── src/
│   ├── main.rs                  // 入口，Tauri Builder 配置
│   ├── lib.rs                   // 库入口，注册所有 Commands
│   │
│   ├── commands/                // IPC Command 层
│   │   ├── mod.rs
│   │   ├── file_commands.rs     // 文件操作 Commands
│   │   ├── dialog_commands.rs   // 对话框 Commands
│   │   ├── config_commands.rs   // 配置操作 Commands
│   │   ├── export_commands.rs   // 导出 Commands
│   │   └── watch_commands.rs    // 文件监听 Commands
│   │
│   ├── services/                // 业务逻辑层
│   │   ├── mod.rs
│   │   ├── fs_service.rs        // 文件系统服务
│   │   ├── config_service.rs    // 配置管理服务
│   │   ├── encoding_service.rs  // 编码检测服务
│   │   └── watch_service.rs     // 文件监听服务
│   │
│   ├── models/                  // 数据模型
│   │   ├── mod.rs
│   │   ├── file_metadata.rs     // 文件元信息
│   │   ├── app_config.rs        // 应用配置
│   │   └── recent_file.rs       // 最近文件
│   │
│   └── error.rs                 // 统一错误类型
│
├── Cargo.toml
├── tauri.conf.json
└── capabilities/
    └── default.json             // Tauri 权限配置
```

### 5.2 文件系统服务（fs_service.rs）

```rust
// services/fs_service.rs
use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::NamedTempFile;

pub struct FileSystemService;

impl FileSystemService {
    /// 读取文件内容
    pub fn read_file(
        &self,
        path: &str,
        encoding: Option<&str>,
    ) -> Result<(String, String), AppError> {
        let path = Path::new(path);

        // 1. 校验路径
        if !path.exists() {
            return Err(AppError::FileNotFound(path.to_string_lossy().to_string()));
        }

        // 2. 读取原始字节
        let bytes = fs::read(path)
            .map_err(|e| AppError::Io(e))?;

        // 3. 编码检测与转换
        let (content, detected_encoding) = if let Some(enc) = encoding {
            if enc == "auto" || enc.is_empty() {
                EncodingService::detect_and_decode(&bytes)?
            } else {
                EncodingService::decode_with(&bytes, enc)?
            }
        } else {
            // 默认 UTF-8，回退到自动检测
            match String::from_utf8(bytes.clone()) {
                Ok(s) => (s, "utf-8".to_string()),
                Err(_) => EncodingService::detect_and_decode(&bytes)?,
            }
        };

        Ok((content, detected_encoding))
    }

    /// 原子写入文件
    pub fn write_file(
        &self,
        path: &str,
        content: &str,
        encoding: Option<&str>,
        create_parents: bool,
    ) -> Result<(), AppError> {
        let path = Path::new(path);

        // 1. 确保父目录存在
        if create_parents {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| AppError::Io(e))?;
            }
        }

        // 2. 编码转换
        let encoding = encoding.unwrap_or("utf-8");
        let bytes = EncodingService::encode(content, encoding)?;

        // 3. 原子写入：写入临时文件 → fsync → rename
        let dir = path.parent().unwrap_or(Path::new("."));
        let mut temp_file = NamedTempFile::new_in(dir)
            .map_err(|e| AppError::WriteFailed(e.to_string()))?;

        temp_file.write_all(&bytes)
            .map_err(|e| AppError::WriteFailed(e.to_string()))?;

        temp_file.flush()
            .map_err(|e| AppError::WriteFailed(e.to_string()))?;

        // 4. 原子重命名（POSIX 保证原子性）
        temp_file.persist(path)
            .map_err(|e| AppError::WriteFailed(e.to_string()))?;

        Ok(())
    }

    /// 读取文件元信息
    pub fn read_file_meta(&self, path: &str) -> Result<FileMetadata, AppError> {
        let metadata = fs::metadata(path)
            .map_err(|e| AppError::FileNotFound(e.to_string()))?;

        Ok(FileMetadata {
            path: path.to_string(),
            file_name: Path::new(path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            size_bytes: metadata.len(),
            modified_time: metadata
                .modified()
                .ok()
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64),
            created_time: metadata
                .created()
                .ok()
                .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64),
            is_readonly: metadata.permissions().readonly(),
        })
    }
}
```

### 5.3 配置管理服务（config_service.rs）

```rust
// services/config_service.rs
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub struct ConfigService {
    config_dir: PathBuf,
    config_path: PathBuf,
}

impl ConfigService {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let config_dir = app_data_dir.join("com.mytypora.app");
        let config_path = config_dir.join("config.json");

        // 确保目录存在
        std::fs::create_dir_all(&config_dir).ok();

        Self { config_dir, config_path }
    }

    /// 获取配置（支持获取全部或指定键）
    pub fn get_config(&self, key: Option<&str>) -> Result<Value, AppError> {
        let config = self.load_config()?;

        match key {
            None => Ok(config),
            Some(k) => {
                let keys: Vec<&str> = k.split('.').collect();
                let mut current = &config;
                for (i, k_part) in keys.iter().enumerate() {
                    match current.get(*k_part) {
                        Some(v) => {
                            if i == keys.len() - 1 {
                                return Ok(v.clone());
                            }
                            current = v;
                        }
                        None => return Err(AppError::Config(format!("Key not found: {}", k))),
                    }
                }
                Ok(config)
            }
        }
    }

    /// 设置配置（支持深度合并）
    pub fn set_config(&self, key: &str, value: Value) -> Result<(), AppError> {
        let mut config = self.load_config()?;

        // 使用点分隔符设置嵌套值
        let keys: Vec<&str> = key.split('.').collect();
        if keys.len() == 1 {
            config[key] = value;
        } else {
            let mut current = config.as_object_mut()
                .ok_or_else(|| AppError::Config("Config is not an object".into()))?;

            for (i, k_part) in keys.iter().enumerate() {
                if i == keys.len() - 1 {
                    current.insert(k_part.to_string(), value);
                } else {
                    if !current.contains_key(*k_part) {
                        current.insert(k_part.to_string(), Value::Object(Default::default()));
                    }
                    current = current.get_mut(*k_part)
                        .and_then(|v| v.as_object_mut())
                        .ok_or_else(|| AppError::Config(format!("Cannot navigate to: {}", key)))?;
                }
            }
        }

        self.save_config(&config)
    }

    /// 加载配置并与默认值合并
    fn load_config(&self) -> Result<Value, AppError> {
        if !self.config_path.exists() {
            return Ok(self.default_config());
        }

        let content = std::fs::read_to_string(&self.config_path)
            .map_err(|e| AppError::Config(e.to_string()))?;

        let user_config: Value = serde_json::from_str(&content)
            .unwrap_or_else(|_| Value::Object(Default::default()));

        // 深度合并：默认值 + 用户配置
        Ok(self.merge(self.default_config(), user_config))
    }

    /// 保存配置
    fn save_config(&self, config: &Value) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(config)
            .map_err(|e| AppError::Config(e.to_string()))?;

        std::fs::write(&self.config_path, content)
            .map_err(|e| AppError::Config(e.to_string()))?;

        Ok(())
    }

    /// 默认配置值
    fn default_config(&self) -> Value {
        serde_json::json!({
            "theme": "system",
            "language": "system",
            "autoSave": {
                "enabled": true,
                "interval": 5000
            },
            "editor": {
                "fontSize": 16,
                "fontFamily": "system",
                "maxWidth": 800,
                "lineHeight": 1.75,
                "wordWrap": "soft",
                "showLineNumbers": true,
                "markdownVisibility": "edit"
            },
            "recentFiles": {
                "maxCount": 20
            },
            "restoreSession": false,
            "sidebar": {
                "position": "left",
                "width": 280
            }
        })
    }

    /// 深度合并两个 JSON Value
    fn merge(&self, default: Value, override_val: Value) -> Value {
        match (default, override_val) {
            (Value::Object(mut d), Value::Object(o)) => {
                for (k, v) in o {
                    let merged = if d.contains_key(&k) {
                        self.merge(d[k].clone(), v)
                    } else {
                        v
                    };
                    d.insert(k, merged);
                }
                Value::Object(d)
            }
            (_, override_val) => override_val,
        }
    }
}
```

### 5.4 错误处理策略

完整的错误链路：**Rust Result → Tauri IPC 错误 → 前端错误提示**

```
Rust 后端                           前端
─────────                           ────
std::io::Error
    │
    ▼
AppError::Io(msg)
    │
    ▼
impl Serialize for AppError
    │   → { code: "IO_ERROR", message: "..." }
    ▼
Tauri IPC 序列化
    │
    ▼
前端 invoke() Promise reject
    │
    ▼
services/ 层 handleError()
    │   → AppError { code, message }
    ▼
Hook / Store 层
    │
    ├── 可恢复错误 → Toast 提示
    ├── 需确认错误 → 弹窗提示
    └── 致命错误    → 错误页面
```

### 5.5 Tauri 权限配置（capabilities/default.json）

```json
{
  "identifier": "default",
  "description": "Default capabilities for MyTypora",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-read-file",
    "fs:allow-write-file",
    "fs:allow-stat",
    "fs:allow-exists",
    "fs:allow-mkdir",
    "fs:allow-remove",
    "fs:allow-rename",
    "fs:allow-watch",
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "dialog:allow-message",
    "dialog:allow-ask",
    "window:default",
    "window:allow-close",
    "window:allow-minimize",
    "window:allow-maximize",
    "window:allow-unmaximize",
    "window:allow-set-title",
    "window:allow-center",
    "store:default",
    "notification:default",
    "os:default"
  ]
}
```

---

## 6. 数据模型设计

### 6.1 FileMetadata（文件元信息）

```typescript
interface FileMetadata {
  /** 文件绝对路径 */
  path: string;

  /** 文件名（含扩展名） */
  fileName: string;

  /** 文件大小（字节） */
  sizeBytes: number;

  /** 最后修改时间（Unix 毫秒时间戳） */
  modifiedTime: number | null;

  /** 创建时间（Unix 毫秒时间戳） */
  createdTime: number | null;

  /** 是否只读 */
  isReadonly: boolean;

  /** 文件编码 */
  encoding?: string;
}
```

```rust
// Rust 对应结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub modified_time: Option<i64>,
    pub created_time: Option<i64>,
    pub is_readonly: bool,
    pub encoding: Option<String>,
}
```

### 6.2 AppConfig（应用配置）

```typescript
interface AppConfig {
  /** 主题：亮色/暗色/跟随系统 */
  theme: 'light' | 'dark' | 'system';

  /** 界面语言 */
  language: 'system' | 'zh-CN' | 'en';

  /** 自动保存配置 */
  autoSave: {
    enabled: boolean;
    interval: number; // 毫秒，默认 5000
  };

  /** 编辑器配置 */
  editor: {
    fontSize: number;          // 12-24，默认 16
    fontFamily: string;        // 字体族
    maxWidth: number;          // 600-1200，默认 800
    lineHeight: number;        // 1.4-2.0，默认 1.75
    wordWrap: 'soft' | 'hard' | 'off';
    showLineNumbers: boolean;
    markdownVisibility: 'edit' | 'always-hide' | 'always-show';
  };

  /** 最近文件配置 */
  recentFiles: {
    maxCount: number; // 5-50，默认 20
  };

  /** 启动时恢复上次会话 */
  restoreSession: boolean;

  /** 侧边栏配置 */
  sidebar: {
    position: 'left' | 'right';
    width: number;
  };

  /** 快捷键自定义 */
  keyBindings?: Record<string, string>;

  /** 图片存储配置 */
  image: {
    insertAction: 'copy-to-assets' | 'relative-path' | 'absolute-path';
    assetsFolderName: string; // 默认 "assets"
  };
}
```

### 6.3 EditorTab（标签页状态）

```typescript
interface EditorTab {
  /** 标签页唯一 ID */
  id: string;

  /** 文件绝对路径（未保存文件为空） */
  filePath: string | null;

  /** 显示用的文件名 */
  fileName: string;

  /** 当前编辑器内容（Markdown 文本） */
  content: string;

  /** 最后保存时的内容快照（用于 dirty 判断） */
  lastSavedContent: string;

  /** 文件编码 */
  encoding: string;

  /** 是否有未保存的修改 */
  isDirty: boolean;

  /** 光标位置 */
  cursorPosition: {
    line: number;
    column: number;
  };

  /** 滚动位置（像素偏移量） */
  scrollPosition: number;

  /** 编辑器状态 */
  editorMode: 'wysiwyg' | 'source';

  /** 是否处于只读模式（外部删除/权限问题） */
  isReadOnly: boolean;

  /** Milkdown 编辑器实例引用（非序列化，运行时状态） */
  editorInstance?: unknown;

  /** 创建时间 */
  createdAt: number;
}
```

### 6.4 RecentFile（最近文件记录）

```typescript
interface RecentFile {
  /** 文件绝对路径 */
  path: string;

  /** 文件名 */
  fileName: string;

  /** 最后打开时间（Unix 毫秒时间戳） */
  lastOpenedAt: number;

  /** 文件是否存在（运行时检查，不持久化） */
  exists?: boolean;
}
```

```rust
// Rust 对应结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub file_name: String,
    pub last_opened_at: i64,
}
```

### 6.5 数据模型关系图

```
AppConfig (全局配置，JSON 持久化)
├── theme
├── autoSave
├── editor
├── sidebar
├── recentFiles.maxCount
└── keyBindings

RecentFile[] (最近文件列表，JSON 持久化)
└── RecentFile
    ├── path ──────────────────┐
    └── lastOpenedAt            │
                                │ 引用
EditorTab[] (标签页列表，内存状态)
└── EditorTab
    ├── id
    ├── filePath ───────────────┤ (同一文件可能对应多个标签页)
    ├── fileName
    ├── content
    ├── lastSavedContent
    ├── encoding
    ├── isDirty
    ├── cursorPosition
    ├── scrollPosition
    └── editorMode

FileMetadata (文件元信息，实时从文件系统获取)
├── path
├── fileName
├── sizeBytes
├── modifiedTime
├── createdTime
└── isReadonly
```

---

## 7. 性能优化策略

### 7.1 Milkdown 编辑器性能

#### 不可变数据与 ProseMirror 优化

ProseMirror 天然使用不可变数据结构（Immutable.js 思想），每次编辑生成新的文档状态而非修改原有状态。这是 Milkdown 编辑性能的基石。

**优化措施**：

1. **Transaction 批处理**：连续的编辑操作（如输入一个字符的多个步骤）合并为一次 Transaction，减少视图更新次数
2. **Decoration 延迟计算**：搜索高亮、专注模式等 Decoration 在 debounce 后统一计算，避免每次按键都触发
3. **插件按需加载**：Mermaid.js、KaTeX CSS 等大型资源使用动态 import，仅在需要时加载

```typescript
// Mermaid 懒加载示例
const renderMermaid = async (code: string, container: HTMLElement) => {
  // 动态 import Mermaid.js（仅在首次使用时加载）
  const mermaid = await import('mermaid');
  mermaid.default.initialize({
    startOnLoad: false,
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default',
  });

  const { svg } = await mermaid.default.render(`mermaid-${Date.now()}`, code);
  container.innerHTML = svg;
};
```

#### ProseMirror Schema 优化

```typescript
// 优化 NodeSpec 的 contentExpression，避免使用模糊匹配
const optimizedSchema = {
  nodes: {
    doc: {
      content: 'block+',  // 明确的 contentExpression
    },
    paragraph: {
      content: 'inline*',  // 限制内联内容，而非 text*
    },
  },
};
```

### 7.2 大文件处理

PRD 要求支持 10,000 行文档无明显卡顿。

#### 分块渲染策略

对于超大文档（>5000 行），采用 ProseMirror 的虚拟化渲染：

1. **视口检测**：通过 `IntersectionObserver` 监听文档各段落是否在视口内
2. **延迟渲染**：视口外的段落使用轻量占位符（只保留高度信息），进入视口时再渲染完整内容
3. **代码块虚拟化**：代码块内容在不可见时不应用语法高亮

#### 大文件打开优化

```typescript
async function openLargeFile(path: string) {
  const meta = await tauriService.file.readFileMeta(path);

  // 大文件警告（>5MB）
  if (meta.sizeBytes > 5 * 1024 * 1024) {
    const confirmed = await showConfirmDialog(
      '大文件提示',
      `该文件较大（${formatSize(meta.sizeBytes)}），打开可能较慢。是否继续？`
    );
    if (!confirmed) return;
  }

  // 分块读取
  const content = await tauriService.file.readFile({ path });
  return content;
}
```

### 7.3 Mermaid 延迟加载

Mermaid.js 的包体积约 1.5MB，不能影响初始加载。

#### Web Worker 离屏渲染

```typescript
// editor/plugins/mermaid-worker.ts
// 将 Mermaid 渲染放入 Web Worker，不阻塞主线程

const mermaidWorker = new Worker(
  new URL('./mermaid-worker.ts', import.meta.url),
  { type: 'module' }
);

// 主线程发送渲染请求
function renderMermaidInWorker(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    mermaidWorker.postMessage({ type: 'render', code, theme: currentTheme });
    mermaidWorker.onmessage = (e) => {
      if (e.data.type === 'rendered') {
        resolve(e.data.svg);
      } else if (e.data.type === 'error') {
        reject(e.data.message);
      }
    };
  });
}
```

#### Debounce 渲染

```typescript
// Mermaid 代码块编辑后，debounce 1 秒再渲染
const debouncedRender = debounce(async (code: string, container: HTMLElement) => {
  try {
    const svg = await renderMermaidInWorker(code);
    container.innerHTML = svg;
  } catch (error) {
    container.innerHTML = `<div class="mermaid-error">渲染失败: ${error}</div>`;
  }
}, 1000);
```

### 7.4 自动保存 Debounce 策略

```typescript
// hooks/useAutoSave.ts
import { useEffect, useRef, useCallback } from 'react';
import { fileService } from '@/services';

function useAutoSave(
  content: string,
  filePath: string | null,
  isDirty: boolean,
  enabled: boolean,
  interval: number // 毫秒，默认 5000
) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveContentRef = useRef<string>('');

  const doSave = useCallback(async () => {
    if (!filePath || !isDirty) return;

    // 避免重复保存相同内容
    if (content === lastSaveContentRef.current) return;

    try {
      await fileService.writeFile({
        path: filePath,
        content,
        encoding: 'utf-8',
      });
      lastSaveContentRef.current = content;
      // 通知 Store 更新保存状态
    } catch (error) {
      // 状态栏显示警告
    }
  }, [content, filePath, isDirty]);

  useEffect(() => {
    if (!enabled || !filePath || !isDirty) return;

    // Debounce：内容变化后等待 interval 毫秒再保存
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(doSave, interval);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [content, enabled, filePath, isDirty, interval, doSave]);

  // 组件卸载时立即保存
  useEffect(() => {
    return () => {
      if (filePath && isDirty) {
        doSave();
      }
    };
  }, [filePath, isDirty, doSave]);
}
```

**自动保存策略总结**：

| 场景 | 策略 |
|------|------|
| 正常编辑 | 内容变化后 debounce 5 秒自动保存 |
| 未保存文件 | 不执行自动保存（`filePath` 为 null） |
| 切换标签页 | 立即保存当前标签页（如果有未保存修改） |
| 关闭标签页 | 立即保存（如果有未保存修改） |
| 关闭窗口 | 立即保存所有标签页 |
| 保存失败 | 状态栏显示警告图标，不阻断编辑 |
| 应用崩溃 | 依赖原子写入保证文件完整性 |

### 7.5 Tauri WebView 性能优化

#### 启动速度优化

1. **代码分割**：Vite 配置 `manualChunks`，将大型依赖（Milkdown、Mermaid、KaTeX）拆分为独立 chunk，按需加载
2. **Tree Shaking**：确保 Vite 的 tree-shaking 生效，移除未使用的导出
3. **CSS 优化**：Tailwind CSS 的 purge 模式只保留实际使用的样式类
4. **预加载关键资源**：在 `index.html` 中使用 `<link rel="preload">` 预加载关键字体和 CSS

```javascript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'milkdown-core': ['@milkdown/kit/core', '@milkdown/kit/commonmark'],
          'milkdown-gfm': ['@milkdown/kit/gfm', '@milkdown/kit/plugin'],
          'mermaid': ['mermaid'],
          'katex': ['katex'],
        },
      },
    },
  },
});
```

#### 运行时优化

1. **CSS 动画硬件加速**：侧边栏展开/收起、标签切换等动画使用 `transform` 和 `opacity`（触发 GPU 合成层），避免使用 `width`/`height`/`top`/`left`（触发重排）
2. **虚拟列表**：大纲面板、最近文件列表等可能包含大量项目的列表使用虚拟滚动（如 `@tanstack/react-virtual`）
3. **React.memo**：对标签页组件、侧边栏面板等使用 `React.memo` 避免不必要的重渲染
4. **requestAnimationFrame 批处理**：频繁的状态更新（如光标位置变化）使用 `requestAnimationFrame` 合并到同一帧

---

## 8. 跨平台兼容性设计

### 8.1 平台差异处理

#### macOS 交通灯按钮

```typescript
// components/TitleBar/WindowControls.tsx
import { platform } from '@tauri-apps/plugin-os';

export function WindowControls() {
  const isMac = platform() === 'macos';

  if (isMac) {
    // macOS: 使用 data-tauri-drag-region 让系统渲染交通灯
    // Tauri 2.x decorations: false 时，macOS 仍保留交通灯
    return (
      <div className="w-[68px] flex-shrink-0" data-tauri-drag-region>
        {/* macOS 交通灯由系统自动渲染，此区域仅预留空间 */}
      </div>
    );
  }

  // Windows/Linux: 渲染自定义窗口控制按钮
  return (
    <div className="flex items-center h-full">
      <WindowButton onClick={minimize} icon="minimize" />
      <WindowButton onClick={toggleMaximize} icon="maximize" />
      <WindowButton onClick={close} icon="close" variant="danger" />
    </div>
  );
}
```

#### Tauri 窗口配置

```json
// tauri.conf.json (平台特定配置)
{
  "app": {
    "windows": [
      {
        "title": "MyTypora",
        "decorations": false,
        "width": 1024,
        "height": 768,
        "minWidth": 800,
        "minHeight": 600,
        "center": true
      }
    ]
  }
}
```

#### 快捷键差异

```typescript
// hooks/useShortcuts.ts
import { platform } from '@tauri-apps/plugin-os';

const modKey = platform() === 'macos' ? 'Meta' : 'Control';
const altKey = platform() === 'macos' ? 'Alt' : 'Alt';

// 快捷键映射（自动适配平台）
const SHORTCUTS: Record<string, { mac: string; win: string; linux: string }> = {
  save: { mac: 'Meta+s', win: 'Control+s', linux: 'Control+s' },
  openFile: { mac: 'Meta+o', win: 'Control+o', linux: 'Control+o' },
  newFile: { mac: 'Meta+n', win: 'Control+n', linux: 'Control+n' },
  toggleSidebar: { mac: 'Meta+Shift+b', win: 'Control+Shift+b', linux: 'Control+Shift+b' },
  commandPalette: { mac: 'Meta+Shift+p', win: 'Control+Shift+p', linux: 'Control+Shift+p' },
  bold: { mac: 'Meta+b', win: 'Control+b', linux: 'Control+b' },
  italic: { mac: 'Meta+i', win: 'Control+i', linux: 'Control+i' },
  undo: { mac: 'Meta+z', win: 'Control+z', linux: 'Control+z' },
  redo: { mac: 'Meta+Shift+z', win: 'Control+Shift+z', linux: 'Control+Shift+z' },
  fullscreen: { mac: 'Meta+Control+f', win: 'F11', linux: 'F11' },
};

function getShortcut(action: string): string {
  const p = platform();
  const mapping = SHORTCUTS[action];
  if (p === 'macos') return mapping.mac;
  if (p === 'windows') return mapping.win;
  return mapping.linux;
}

// 显示用的快捷键文本
function getShortcutLabel(action: string): string {
  const shortcut = getShortcut(action);
  return shortcut
    .replace('Meta', '⌘')
    .replace('Control', 'Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', '⌥');
}
```

### 8.2 文件路径规范化

```rust
// services/fs_service.rs
use std::path::{Path, PathBuf};

pub fn normalize_path(path: &str) -> PathBuf {
    let path = Path::new(path);

    // 1. 处理 ~ 展开为用户主目录
    let expanded = if path.starts_with("~") {
        if let Some(home) = dirs::home_dir() {
            home.join(path.strip_prefix("~").unwrap())
        } else {
            path.to_path_buf()
        }
    } else {
        path.to_path_buf()
    };

    // 2. 规范化路径（去除 . 和 ..，统一分隔符）
    // 注意：不解析符号链接，保持用户的原始路径意图
    expanded
}

// 获取文件名用于显示
pub fn display_file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("未命名")
        .to_string()
}

// 获取相对路径（基于某个根目录）
pub fn relative_path(from: &str, to: &str) -> Option<String> {
    let from = Path::new(from).parent()?;
    pathdiff::diff_paths(to, from)
        .and_then(|p| p.to_str().map(|s| s.replace('\\', '/')))
}
```

### 8.3 字体回退链

```css
/* tailwind.config.js 中扩展 fontFamily */
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        // 编辑器正文字体
        sans: [
          'Inter',
          'SF Pro Text',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Noto Sans SC',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif',
        ],

        // 代码字体
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'SF Mono',
          'Cascadia Code',
          'Source Code Pro',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
};
```

**字体覆盖策略**：

| 平台 | 正文字体优先级 | 代码字体优先级 |
|------|--------------|--------------|
| **macOS** | Inter → SF Pro Text → PingFang SC | JetBrains Mono → SF Mono |
| **Windows** | Inter → Segoe UI → Microsoft YaHei | JetBrains Mono → Cascadia Code → Consolas |
| **Linux** | Inter → Noto Sans SC | JetBrains Mono → Source Code Pro |

> **中文字体**：所有平台都包含中文字体回退（PingFang SC / Microsoft YaHei / Noto Sans SC），确保中文内容在所有平台上正确渲染。

### 8.4 系统通知

```typescript
// services/tauri/notification-service.ts
import { sendNotification, requestPermission, isPermissionGranted } from '@tauri-apps/plugin-notification';

export async function notifySuccess(title: string, body: string) {
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === 'granted';
  }

  if (granted) {
    sendNotification({
      title,
      body,
      // 静默通知（不弹窗，仅在系统通知中心显示）
      // 适用于自动保存完成等非关键通知
    });
  }
}

// 使用场景
await notifySuccess('导出完成', '文档已成功导出为 PDF');
```

### 8.5 系统主题跟随

```typescript
// hooks/useTheme.ts
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { configService } from '@/services';

export function useTheme() {
  // 监听系统主题变化（Tauri 2.x 系统主题事件）
  useEffect(() => {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handler = (e: MediaQueryListEvent) => {
        const currentTheme = configService.getCachedConfig().theme;
        // 仅在设置为"跟随系统"时响应
        if (currentTheme === 'system') {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      };

      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, []);
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;

  // 同步到 Tauri 窗口主题（影响标题栏颜色）
  // 仅在 Windows/Linux 自定义标题栏时需要
  // macOS 交通灯由系统自动适配
}
```

---

## 附录：项目目录结构总览

```
myTypora/
├── src/                           # 前端源码
│   ├── main.tsx                   # React 入口
│   ├── App.tsx                    # 根组件
│   ├── components/                # UI 组件
│   │   ├── TitleBar/
│   │   ├── TabBar/
│   │   ├── Sidebar/
│   │   ├── EditorArea/
│   │   ├── StatusBar/
│   │   ├── SettingsDialog/
│   │   ├── CommandPalette/
│   │   ├── ContextMenu/
│   │   └── Toast/
│   ├── editor/                    # Milkdown 编辑器
│   │   ├── plugins/               # Milkdown 插件
│   │   ├── components/            # 编辑器组件
│   │   ├── hooks/                 # 编辑器 Hooks
│   │   └── theme/                 # 编辑器样式
│   ├── hooks/                     # 通用 Hooks
│   │   ├── useFile.ts
│   │   ├── useTabs.ts
│   │   ├── useTheme.ts
│   │   ├── useShortcuts.ts
│   │   ├── useAutoSave.ts
│   │   └── useFileWatcher.ts
│   ├── stores/                    # Zustand Stores
│   │   ├── file-store.ts
│   │   ├── editor-store.ts
│   │   ├── settings-store.ts
│   │   └── ui-store.ts
│   ├── services/                  # Tauri IPC 服务封装
│   │   └── tauri/
│   ├── styles/                    # 全局样式
│   │   ├── globals.css
│   │   ├── theme.css              # CSS 变量定义
│   │   └── print.css              # 打印样式
│   ├── types/                     # TypeScript 类型定义
│   │   ├── editor.ts
│   │   ├── file.ts
│   │   └── config.ts
│   ├── utils/                     # 工具函数
│   │   ├── format.ts              # 字数统计、格式化
│   │   ├── path.ts                # 路径处理
│   │   └── debounce.ts
│   └── constants/                 # 常量定义
│       ├── shortcuts.ts           # 默认快捷键映射
│       └── defaults.ts            # 默认配置值
│
├── src-tauri/                     # Rust 后端源码
│   ├── src/
│   │   ├── main.rs                # Tauri 入口
│   │   ├── lib.rs                 # 库入口 + Command 注册
│   │   ├── error.rs               # 统一错误类型
│   │   ├── commands/              # IPC Commands
│   │   ├── services/              # 业务逻辑层
│   │   └── models/                # 数据模型
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── capabilities/
│
├── public/                        # 静态资源
│   └── icons/                     # 应用图标
│
├── docs/                          # 项目文档
│   ├── 01-brainstorm.md
│   ├── 02-prd.md
│   ├── 03-ux-design.md
│   └── 04-architecture.md         # 本文档
│
├── index.html
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

---

> **文档版本**: v1.0
> **最后更新**: 2026-03-27
> **下一步**: 基于 04-architecture.md 进入 Make 阶段，创建 `05-task-breakdown.md`（任务拆分）和 `plan.md`（执行计划）

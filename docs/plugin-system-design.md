# LanisMD 插件系统 — BMAD 方法论规划

> **阶段**: Brainstorm + Map + Architect\
> **日期**: 2026-06-24\
> **状态**: 草案 (Draft)

***

## 目录

1. [Brainstorm — 头脑风暴](#1-brainstorm--头脑风暴)
2. [Map — 全景分析](#2-map--全景分析)
3. [Architect — 架构设计](#3-architect--架构设计)
4. [Develop — 实施路线图](#4-develop--实施路线图)

***

## 1. Brainstorm — 头脑风暴

### 1.1 为什么需要插件系统？

| 驱动力       | 当前痛点                                               | 插件化后的预期收益              |
| --------- | -------------------------------------------------- | ---------------------- |
| **用户定制化** | 所有功能硬编码，用户无法选择性启用/禁用 AI、同步等模块                      | 用户按需安装，保持编辑器轻量         |
| **包体积优化** | AI (reqwest + SSE) 和同步 (GitHub/Gitee 客户端) 增加了二进制体积 | 核心包精简，功能按需加载           |
| **开发效率**  | 新功能必须合入主仓库，耦合度高                                    | 功能模块独立开发、独立版本          |
| **社区生态**  | 无法接受社区贡献的功能扩展                                      | 开放社区插件，形成生态            |
| **差异化竞争** | Typora 无插件系统；Obsidian 基于 Electron，方案不同             | Tauri 轻量 + 插件灵活 = 独特定位 |

### 1.2 竞品参考

#### Obsidian 插件系统

```
obsidian-plugin/
├── manifest.json          # 元数据（id, name, version, minAppVersion）
├── main.js                # 入口（继承 Plugin 类）
└── styles.css             # 可选样式

// 插件生命周期
class MyPlugin extends Plugin {
  onload()     → 注册命令、视图、设置、事件
  onunload()   → 清理资源
}

// 核心 API
this.addCommand()           → 注册命令面板命令
this.addSettingTab()        → 添加设置页面
this.addRibbonIcon()        → 添加侧边栏图标
this.registerView()         → 注册自定义面板
this.registerEditorExtension() → CodeMirror 6 扩展
this.registerMarkdownPostProcessor() → 渲染后处理
```

**Obsidian 的优势**: Electron + Node.js 提供完整运行时，CodeMirror 6 原生支持动态 Extension。\
**LanisMD 不可照搬的原因**: Tauri 无 Node.js、Milkdown/ProseMirror 的 Schema 不可运行时变更。

#### Typora 扩展方式

* 主题系统：CSS 文件放入 `themes/` 目录（**LanisMD 已实现类似能力**）

* 导出功能：通过 Pandoc 命令行集成

* 第三方扩展：社区 hack 方式（非官方支持）

* **启示**：主题是最自然的"插件化"维度，LanisMD 可以在此基础上逐步扩展

#### VS Code 扩展系统（参考架构思想）

* Extension Host 进程隔离（LanisMD 可用 Web Worker 模拟）

* JSON-RPC 通信协议（可借鉴消息传递模式）

* 通过 Proxy 限制 API 访问范围（可实现安全沙箱）

### 1.3 LanisMD 特有的技术约束

| 约束                         | 说明                                            | 对插件系统的影响                            |
| -------------------------- | --------------------------------------------- | ----------------------------------- |
| **Tauri 静态编译**             | `generate_handler![]` 是编译时宏，无法运行时动态注册 Rust 命令 | 后端能力必须预编译为"桥接层"，插件只能调用已有的桥接 API     |
| **无 Node.js 运行时**          | Tauri WebView 中没有 Node.js，无法 `require()`      | 插件只能是纯浏览器 JS，分发方式需要自行设计             |
| **ProseMirror Schema 不可变** | Schema 在 Editor 创建后不可变                        | 新增自定义节点/Mark 的插件需要在编辑器初始化前注册，需重启编辑器 |
| **Milkdown 插件时序**          | `.use()` 需在 `Editor.make()` 链中调用              | 编辑器语法层插件需要特殊的"预注册"机制                |
| **安全性**                    | 桌面端 JS 可访问 DOM、Tauri IPC、文件系统                 | 需要沙箱隔离第三方代码                         |

***

## 2. Map — 全景分析

### 2.1 现有功能模块的可插件化评估

```
┌─────────────────────────────────────────────────────────────────┐
│                     LanisMD 功能全景图                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ╔═══════════════════════════════════════════════╗              │
│  ║            内核层（不可插件化）                  ║              │
│  ║                                               ║              │
│  ║  • Milkdown 编辑器核心 (commonmark + GFM)      ║              │
│  ║  • 文件读写 / 文件树 / 文件监听                  ║              │
│  ║  • 基础 UI 框架 (TitleBar + Sidebar + StatusBar)║              │
│  ║  • 设置系统 / 配置持久化                        ║              │
│  ║  • 快捷键系统                                  ║              │
│  ║  • 剪贴板 / 撤销重做 / 缩进 / 尾部空行          ║              │
│  ╚═══════════════════════════════════════════════╝              │
│                                                                 │
│  ╔═══════════════════════════════════════════════╗              │
│  ║         可选内置层（第一批可插件化）              ║              │
│  ║                                               ║              │
│  ║  ★ AI 助手模块                                 ║              │
│  ║    前端: ai-store, ai-service, AiSettings,     ║              │
│  ║          editor/plugins/ai-edit/ (11文件)       ║              │
│  ║    后端: ai_commands.rs, services/ai/ (6文件)   ║              │
│  ║                                               ║              │
│  ║  ★ 远程同步模块                                 ║              │
│  ║    前端: sync-store, sync-service, SyncSettings,║              │
│  ║          4个同步UI组件                           ║              │
│  ║    后端: sync_commands.rs, services/sync/ (7文件)║              │
│  ║                                               ║              │
│  ║  ★ Mermaid 图表                                 ║              │
│  ║    前端: mermaid-block/ 插件 + mermaid 库(~2MB)  ║              │
│  ║                                               ║              │
│  ║  ★ 数学公式 (KaTeX)                             ║              │
│  ║    前端: math-inline/ + math-block/ + katex 库   ║              │
│  ╚═══════════════════════════════════════════════╝              │
│                                                                 │
│  ╔═══════════════════════════════════════════════╗              │
│  ║         编辑器增强层（中期可插件化）               ║              │
│  ║                                               ║              │
│  ║  • 专注模式 / 打字机模式                        ║              │
│  ║  • 代码块折叠                                   ║              │
│  ║  • 搜索高亮                                     ║              │
│  ║  • 大纲同步                                     ║              │
│  ║  • 下划线 / 高亮 / 上标 / 下标                   ║              │
│  ║  • GFM Alert                                   ║              │
│  ║  • Front Matter / TOC                          ║              │
│  ╚═══════════════════════════════════════════════╝              │
│                                                                 │
│  ╔═══════════════════════════════════════════════╗              │
│  ║         社区扩展层（远期开放）                    ║              │
│  ║                                               ║              │
│  ║  • 导出格式扩展（PDF/DOCX/HTML/EPUB）           ║              │
│  ║  • 新的同步后端（WebDAV/S3/Notion）              ║              │
│  ║  • 新的 AI Provider                             ║              │
│  ║  • 自定义编辑器语法节点                          ║              │
│  ║  • 侧边栏面板扩展                               ║              │
│  ║  • 状态栏项目扩展                               ║              │
│  ║  • 命令面板命令扩展                             ║              │
│  ║  • Markdown 后处理器                            ║              │
│  ╚═══════════════════════════════════════════════╝              │
│                                                                 │
│  ╔═══════════════════════════════════════════════╗              │
│  ║         主题层（已实现插件化）                    ║              │
│  ║                                               ║              │
│  ║  • 内置主题: light/dark/sepia/nord + bloom×16   ║              │
│  ║  • 用户自定义: CSS文件/目录 → 运行时加载         ║              │
│  ║  ✅ 已有 manifest + 动态加载 + 设置面板集成       ║              │
│  ╚═══════════════════════════════════════════════╝              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 插件类型定义

| 插件类型                 | 说明                        | 加载时机    | 安全级别 | 示例                |
| -------------------- | ------------------------- | ------- | ---- | ----------------- |
| **Theme**            | CSS 主题                    | 运行时热加载  | 安全   | bloom-petal, nord |
| **EditorExtension**  | ProseMirror/Milkdown 层插件  | 编辑器初始化时 | 中等   | 专注模式, 打字机模式, 高亮标记 |
| **Feature**          | 功能模块（含 UI + Store + 后端桥接） | 应用启动时   | 需审核  | AI 助手, 远程同步       |
| **ExportFormat**     | 导出格式扩展                    | 按需加载    | 中等   | PDF, DOCX, EPUB   |
| **SidebarPanel**     | 侧边栏面板                     | 应用启动时   | 中等   | 自定义面板             |
| **CommandExtension** | 命令面板 / 快捷键扩展              | 应用启动时   | 安全   | 自定义命令             |

### 2.3 AI 助手模块插件化分析

当前 AI 模块的耦合点：

```
耦合关系图:

editor-setup.ts ──── 无直接引用 AI（AI 编辑通过 tooltip 触发）
     │
App.tsx ───────────── useAiStore.refreshConfig()（启动初始化）
     │
SettingsDialog.tsx ── <AiSettings /> 组件（设置面板 Tab）
     │
tooltip-toolbar.ts ── 引用 AI 编辑功能（条件性：config.ai.showInTooltip）
     │
slash-menu/ ────────── AI 指令项（条件性：config.ai.showInSlash）
     │
settings-store.ts ──── config.ai 配置项（深度嵌入 AppConfig 类型）
     │
lib.rs ─────────────── ai_commands 硬编码注册
```

**结论**: AI 模块在前端层面可以通过条件加载实现"软插件化"——已有的 `config.ai.enabled` 开关是良好的起点。后端命令虽然无法动态注册，但可以保持编译进二进制中，前端通过插件管理器决定是否调用。

### 2.4 远程同步模块插件化分析

```
耦合关系图:

App.tsx ───────────── useSyncStore.listenProgress()（启动监听）
     │
SettingsDialog.tsx ── <SyncSettings /> 组件
     │
StatusBar.tsx ─────── 同步状态显示（需确认）
     │
settings-store.ts ──── 无直接 sync 配置（sync 配置在 sync-store 中独立管理）
     │
lib.rs ─────────────── sync_commands 硬编码注册
```

**结论**: 同步模块的耦合度比 AI 更低。配置独立在 `sync-store.ts` 中，不在 `AppConfig` 中嵌套。主要耦合点是 App.tsx 的初始化和设置面板的 Tab 引用，均可通过插件注册机制解耦。

***

## 3. Architect — 架构设计

### 3.1 设计原则

1. **渐进式插件化**: 不做大爆炸重构，而是逐步抽象出插件接口
2. **前端优先**: 利用 JS 动态性实现插件加载，不改变 Rust 后端的静态编译模型
3. **内置即插件**: 现有的 AI、同步模块重构为"内置插件"，与第三方插件共用同一套接口
4. **安全默认**: 第三方插件必须在沙箱中运行，需用户明确授权
5. **兼容已有主题系统**: 主题系统已经是一种插件，新系统应兼容并增强

### 3.2 核心架构

```
┌─────────────────────────────────────────────────────────┐
│                    LanisMD 应用层                        │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │              Plugin Manager                  │       │
│  │                                              │       │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │       │
│  │  │ Registry │ │ Loader   │ │ Lifecycle│    │       │
│  │  │          │ │          │ │ Manager  │    │       │
│  │  │ 注册表   │ │ 加载器   │ │ 生命周期 │     │       │
│  │  └──────────┘ └──────────┘ └──────────┘    │       │
│  │                                              │       │
│  │  ┌──────────────────────────────────────┐   │       │
│  │  │         Plugin API (沙箱化)           │   │       │
│  │  │                                      │   │       │
│  │  │  app.editor     → 编辑器操作          │   │       │
│  │  │  app.commands   → 命令注册            │   │       │
│  │  │  app.settings   → 设置面板注册        │   │       │
│  │  │  app.sidebar    → 侧边栏面板注册      │   │       │
│  │  │  app.statusbar  → 状态栏项目注册      │   │       │
│  │  │  app.storage    → 插件数据持久化      │   │       │
│  │  │  app.events     → 事件总线            │   │       │
│  │  │  app.tauri      → Tauri IPC 桥接      │   │       │
│  │  └──────────────────────────────────────┘   │       │
│  └─────────────────────────────────────────────┘       │
│                                                         │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ Built-in    │ │ Built-in     │ │ Community    │    │
│  │ Plugin: AI  │ │ Plugin: Sync │ │ Plugins...   │    │
│  └─────────────┘ └──────────────┘ └──────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────┐       │
│  │              Core (不可插件化)                │       │
│  │  Editor · FileSystem · UI Framework · Config │       │
│  └─────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

### 3.3 插件 Manifest 规范

每个插件包含一个 `plugin.json` 描述文件：

```jsonc
{
  // 必填字段
  "id": "lanismd-ai-assistant",
  "name": "AI 助手",
  "version": "1.0.0",
  "description": "集成多个 AI 服务商，提供智能写作辅助",
  "author": "LanisMD Team",
  "license": "MIT",
  
  // 插件类型
  "type": "feature",               // theme | editor-extension | feature | export-format | sidebar-panel | command
  
  // 入口文件
  "main": "index.js",              // 插件入口（编译后的 JS）
  "styles": "styles.css",          // 可选：插件样式
  
  // 兼容性
  "engines": {
    "lanismd": ">=1.0.0"           // 最低兼容版本
  },
  
  // 权限声明（安全控制）
  "permissions": [
    "tauri:invoke",                 // 需要调用 Tauri 命令
    "editor:read",                  // 读取编辑器内容
    "editor:write",                 // 修改编辑器内容
    "settings:register",           // 注册设置面板
    "sidebar:register",            // 注册侧边栏面板
    "commands:register",           // 注册命令面板命令
    "network:external",            // 访问外部网络
    "storage:local"                // 本地数据存储
  ],
  
  // 依赖的后端能力（Tauri 命令组）
  "backends": ["ai"],              // 声明需要 ai 相关的 Tauri 命令
  
  // 可选：插件设置的 Schema
  "settingsSchema": {
    "enabled": { "type": "boolean", "default": true, "label": "启用 AI 助手" },
    "provider": { "type": "select", "default": "zhipu", "options": ["zhipu", "deepseek", "siliconflow", "custom"] }
  },
  
  // 可选：关键词，用于插件市场搜索
  "keywords": ["ai", "writing", "assistant", "智能写作"],
  
  // 可选：仓库/主页
  "repository": "https://github.com/user/lanismd-ai-assistant",
  "homepage": "https://lanismd.app/plugins/ai-assistant"
}
```

### 3.4 Plugin API 设计

```typescript
/**
 * 插件生命周期接口
 * 所有插件必须实现此接口
 */
interface LanisPlugin {
  /** 插件加载时调用，注册所有功能 */
  activate(ctx: PluginContext): void | Promise<void>;
  
  /** 插件卸载时调用，清理资源 */
  deactivate?(): void | Promise<void>;
}

/**
 * 插件上下文 — 插件与宿主交互的唯一入口
 */
interface PluginContext {
  /** 插件元数据 */
  readonly manifest: PluginManifest;
  
  /** 插件本地存储（键值对，自动持久化） */
  readonly storage: PluginStorage;
  
  /** 编辑器操作 API */
  readonly editor: EditorAPI;
  
  /** 命令系统 API */
  readonly commands: CommandsAPI;
  
  /** 设置面板 API */
  readonly settings: SettingsAPI;
  
  /** 侧边栏 API */
  readonly sidebar: SidebarAPI;
  
  /** 状态栏 API */
  readonly statusbar: StatusBarAPI;
  
  /** 事件总线 */
  readonly events: EventBusAPI;
  
  /** Tauri IPC 桥接（受权限控制） */
  readonly tauri: TauriAPI;
  
  /** 通知/Toast API */
  readonly notifications: NotificationAPI;
}

// ----- 子 API 定义 -----

interface EditorAPI {
  /** 获取当前文档的 Markdown 内容 */
  getMarkdown(): string;
  
  /** 替换当前文档内容 */
  setMarkdown(content: string): void;
  
  /** 获取选中的文本 */
  getSelection(): string | null;
  
  /** 在光标位置插入文本 */
  insertText(text: string): void;
  
  /** 替换选中的文本 */
  replaceSelection(text: string): void;
  
  /** 注册 Milkdown 插件（仅 editor-extension 类型可用） */
  registerMilkdownPlugin(plugin: MilkdownPluginFactory): Disposable;
  
  /** 注册 ProseMirror 插件 */
  registerProseMirrorPlugin(plugin: ProseMirrorPluginFactory): Disposable;
  
  /** 注册 Tooltip 工具栏项目 */
  registerTooltipItem(item: TooltipItem): Disposable;
  
  /** 注册 Slash 菜单项目 */
  registerSlashItem(item: SlashMenuItem): Disposable;
  
  /** 监听编辑器事件 */
  onDocChanged(callback: (markdown: string) => void): Disposable;
  onSelectionChanged(callback: (selection: SelectionInfo) => void): Disposable;
  onFocus(callback: () => void): Disposable;
  onBlur(callback: () => void): Disposable;
}

interface CommandsAPI {
  /** 注册命令面板命令 */
  registerCommand(command: CommandDefinition): Disposable;
  
  /** 执行已注册的命令 */
  executeCommand(id: string, args?: unknown): void;
}

interface SettingsAPI {
  /** 注册设置页面 Tab */
  registerSettingsTab(tab: SettingsTabDefinition): Disposable;
  
  /** 读取插件配置 */
  get<T>(key: string): T | undefined;
  
  /** 写入插件配置 */
  set(key: string, value: unknown): void;
  
  /** 监听配置变化 */
  onChange(key: string, callback: (value: unknown) => void): Disposable;
}

interface SidebarAPI {
  /** 注册侧边栏面板 */
  registerPanel(panel: SidebarPanelDefinition): Disposable;
}

interface StatusBarAPI {
  /** 添加状态栏项目 */
  addItem(item: StatusBarItemDefinition): Disposable;
  
  /** 更新状态栏项目内容 */
  updateItem(id: string, update: Partial<StatusBarItemDefinition>): void;
}

interface EventBusAPI {
  /** 发布事件 */
  emit(event: string, data?: unknown): void;
  
  /** 订阅事件 */
  on(event: string, callback: (data: unknown) => void): Disposable;
  
  /** 一次性订阅 */
  once(event: string, callback: (data: unknown) => void): Disposable;
}

interface TauriAPI {
  /** 调用 Tauri 命令（受 manifest.backends 限制） */
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  
  /** 监听 Tauri 事件 */
  listen<T>(event: string, callback: (payload: T) => void): Promise<Disposable>;
}

interface PluginStorage {
  get<T>(key: string, defaultValue?: T): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  clear(): void;
}

interface NotificationAPI {
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

/** 可释放资源，用于清理注册的功能 */
interface Disposable {
  dispose(): void;
}
```

### 3.5 插件加载流程

```
应用启动
  │
  ▼
┌─────────────────────────────────────┐
│  1. Core 初始化                      │
│     • UI 框架、设置系统、文件系统      │
│     • Zustand stores 创建            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  2. Plugin Manager 初始化            │
│     • 扫描插件目录                    │
│     • 读取所有 plugin.json           │
│     • 构建依赖图，确定加载顺序         │
│     • 检查用户启用/禁用状态           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  3. 编辑器插件预注册                  │
│     • 收集所有 editor-extension 类型  │
│       插件的 Schema/Node/Mark 定义    │
│     • 注入到 editor-setup.ts 的       │
│       createEditor() 构建链中         │
│                                      │
│     ⚠️ 此步骤在编辑器创建之前执行      │
│     ⚠️ 变更后需要重新创建编辑器实例     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  4. 编辑器创建                       │
│     • Editor.make() + 核心 .use()    │
│     • + 已注册的编辑器扩展插件        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  5. Feature 插件激活                  │
│     • 按依赖顺序调用 plugin.activate()│
│     • 注册 UI 组件、命令、设置页       │
│     • 初始化后端通信                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  6. 应用就绪                         │
│     • 所有插件已激活                  │
│     • 用户可以在设置中管理插件         │
└─────────────────────────────────────┘
```

### 3.6 插件目录结构

```
~/.lanismd/                           # 应用数据目录
├── plugins/                          # 插件安装目录
│   ├── lanismd-ai-assistant/         # 内置插件（随应用分发）
│   │   ├── plugin.json
│   │   ├── index.js
│   │   └── styles.css
│   ├── lanismd-sync/                 # 内置插件
│   │   ├── plugin.json
│   │   ├── index.js
│   │   └── styles.css
│   └── community-plugin-xxx/         # 社区插件（用户安装）
│       ├── plugin.json
│       ├── index.js
│       └── styles.css
├── plugin-data/                      # 插件运行时数据
│   ├── lanismd-ai-assistant/
│   │   └── storage.json
│   └── lanismd-sync/
│       └── storage.json
└── themes/                           # 主题目录（已有，保持兼容）
    ├── my-theme.css
    └── my-theme/
        └── my-theme.css
```

### 3.7 安全模型

```
┌─────────────────────────────────────────────────┐
│                安全分层模型                       │
├─────────────────────────────────────────────────┤
│                                                  │
│  Level 0: 内置插件（Trusted）                     │
│  ├── 完全信任，可访问所有 API                      │
│  ├── 随应用分发，由开发团队维护                     │
│  ├── 示例: AI 助手、远程同步                       │
│  └── 权限: 所有                                   │
│                                                  │
│  Level 1: 社区插件-已审核（Verified）              │
│  ├── 经过代码审核，签名验证                        │
│  ├── 可访问声明的 API（按 manifest.permissions）   │
│  ├── 示例: 未来的插件市场上架插件                   │
│  └── 权限: manifest 声明的子集                    │
│                                                  │
│  Level 2: 社区插件-未审核（Untrusted）             │
│  ├── 用户手动安装，显示安全警告                     │
│  ├── 运行在 Web Worker 沙箱中                     │
│  ├── 通过 Proxy 限制 API 访问                     │
│  └── 权限: 最小权限 + 用户逐项授权                 │
│                                                  │
│  ── 权限检查机制 ──                               │
│  1. 安装时: 展示权限列表，用户确认                  │
│  2. 运行时: API 调用前检查权限声明                  │
│  3. Tauri IPC: 只允许调用 backends 声明的命令组     │
│  4. 网络访问: 需 "network:external" 权限           │
│  5. 文件系统: 通过 Tauri 命令间接访问（受限）       │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 3.8 Plugin Manager Store

```typescript
// stores/plugin-store.ts

interface PluginInfo {
  /** 插件 manifest */
  manifest: PluginManifest;
  /** 安装状态 */
  status: 'installed' | 'enabled' | 'disabled' | 'error';
  /** 插件实例（启用后） */
  instance?: LanisPlugin;
  /** 错误信息（如有） */
  error?: string;
  /** 是否为内置插件 */
  builtin: boolean;
  /** 安全级别 */
  trustLevel: 'trusted' | 'verified' | 'untrusted';
}

interface PluginStore {
  /** 已注册的插件 */
  plugins: Map<string, PluginInfo>;
  
  /** 加载所有插件 */
  loadPlugins(): Promise<void>;
  
  /** 启用插件 */
  enablePlugin(id: string): Promise<void>;
  
  /** 禁用插件 */
  disablePlugin(id: string): Promise<void>;
  
  /** 安装插件（从文件/URL） */
  installPlugin(source: string): Promise<void>;
  
  /** 卸载插件 */
  uninstallPlugin(id: string): Promise<void>;
  
  /** 获取插件列表 */
  getPluginList(): PluginInfo[];
  
  /** 检查插件是否启用 */
  isEnabled(id: string): boolean;
}
```

### 3.9 Tauri 后端的"命令组"桥接方案

由于 Tauri 的 `generate_handler![]` 宏无法动态注册，我们采用\*\*"编译时包含、运行时控制"\*\*的策略：

```rust
// src-tauri/src/lib.rs — 保持所有命令在编译时注册

.invoke_handler(tauri::generate_handler![
    // 核心命令（始终可用）
    file_commands::read_file,
    file_commands::write_file,
    config_commands::get_config,
    config_commands::set_config,
    
    // AI 命令组（由前端插件管理器控制是否调用）
    ai_commands::ai_chat_stream,
    ai_commands::set_ai_api_key,
    // ...
    
    // Sync 命令组（同上）
    sync_commands::sync_push,
    sync_commands::sync_pull,
    // ...
    
    // 插件管理命令（新增）
    plugin_commands::list_plugins,
    plugin_commands::install_plugin,
    plugin_commands::uninstall_plugin,
    plugin_commands::get_plugin_data,
    plugin_commands::set_plugin_data,
])
```

前端插件的 `TauriAPI.invoke()` 方法在调用前检查：

1. 该命令属于哪个 `backend` 组
2. 当前插件的 `manifest.backends` 是否声明了该组
3. 未声明则拒绝调用并报错

### 3.10 设置面板集成

插件注册的设置页面通过动态 Tab 机制集成到现有的 SettingsDialog 中：

```
┌────────────────────────────────────┐
│  设置                              │
├──────────┬─────────────────────────┤
│ 通用     │                         │
│ 外观     │   （对应 Tab 的内容区）   │
│ 编辑器   │                         │
│ 图片     │                         │
│──────────│                         │
│ 🔌 插件  │  ← 新增：插件管理页面    │
│──────────│                         │
│ AI 助手  │  ← 由 AI 插件注册       │
│ 远程同步 │  ← 由 Sync 插件注册      │
│ 插件 X   │  ← 由社区插件注册        │
│──────────│                         │
│ 快捷键   │                         │
└──────────┴─────────────────────────┘
```

***

## 4. Develop — 实施路线图

### 4.1 分阶段实施计划

```
Phase 1: 基础设施（MVP）                        Phase 2: 内置插件迁移
  预计工期: 3-4 周                                 预计工期: 3-4 周
  ┌────────────────────────────┐                ┌────────────────────────────┐
  │ 1.1 Plugin Manifest 规范    │                │ 2.1 AI 模块 → 内置插件       │
  │ 1.2 Plugin Manager Store   │                │ 2.2 Sync 模块 → 内置插件     │
  │ 1.3 Plugin Loader 加载器    │                │ 2.3 Mermaid → 可选插件       │
  │ 1.4 Plugin Context API     │                │ 2.4 Math → 可选插件          │
  │ 1.5 插件管理 UI             │                │ 2.5 设置面板动态 Tab          │
  │ 1.6 Tauri 命令组桥接        │                │ 2.6 验证插件 enable/disable   │
  └────────────────────────────┘                └────────────────────────────┘
           │                                              │
           ▼                                              ▼
Phase 3: 编辑器扩展 API                         Phase 4: 社区生态
  预计工期: 2-3 周                                 预计工期: 4-6 周
  ┌────────────────────────────┐                ┌────────────────────────────┐
  │ 3.1 Editor API 完善         │                │ 4.1 插件开发模板             │
  │ 3.2 Tooltip/Slash 注册 API │                │ 4.2 插件打包/分发工具         │
  │ 3.3 Sidebar 面板注册        │                │ 4.3 插件市场（GitHub 索引）   │
  │ 3.4 StatusBar 注册          │                │ 4.4 安全审核流程             │
  │ 3.5 Command 注册            │                │ 4.5 插件更新机制             │
  └────────────────────────────┘                └────────────────────────────┘
```

### 4.2 Phase 1 详细任务分解

#### 1.1 Plugin Manifest 规范

* 定义 `PluginManifest` TypeScript 类型

* 实现 manifest 验证器（JSON Schema）

* 为现有 AI 和 Sync 模块编写 plugin.json 示例

#### 1.2 Plugin Manager Store

* 创建 `src/stores/plugin-store.ts`

* 实现插件注册、启用/禁用、状态查询

* 持久化用户的启用/禁用配置到 `settings-store`

#### 1.3 Plugin Loader 加载器

* Rust 端：实现 `plugin_commands.rs`

  * `list_plugins` - 扫描插件目录

  * `read_plugin_manifest` - 读取 plugin.json

  * `install_plugin` / `uninstall_plugin` - 安装/卸载

  * `get_plugin_data` / `set_plugin_data` - 数据持久化

* 前端：实现 JS 模块动态加载

  * 通过 `import()` 或 `new Function()` 加载插件代码

  * 构建 PluginContext 并注入

#### 1.4 Plugin Context API

* 实现 `PluginContext` 接口

* 实现各子 API（先实现 storage、commands、settings、notifications）

* 实现权限检查中间件

#### 1.5 插件管理 UI

* 在 SettingsDialog 中新增"插件"Tab

* 展示已安装插件列表

* 支持启用/禁用切换

* 显示插件信息（名称、版本、描述、作者）

#### 1.6 Tauri 命令组桥接

* 定义后端命令组映射表

* 实现前端 `TauriAPI.invoke()` 的权限过滤

* 确保未启用的插件无法调用对应命令组

### 4.3 Phase 2 关键决策

#### AI 模块插件化策略

```
当前结构:                          目标结构:
                                   
src/                               src/
├── stores/ai-store.ts             ├── stores/        (移除 ai-store)
├── services/ai-service.ts         ├── services/      (移除 ai-service)
├── services/ai/                   │
├── components/settings/           │
│   └── AiSettings.tsx             │
├── editor/plugins/ai-edit/        │
│                                  │
src-tauri/src/                     plugins/
├── commands/ai_commands.rs        └── lanismd-ai-assistant/
├── services/ai/                       ├── plugin.json
                                       ├── src/
                                       │   ├── index.ts        ← 入口
                                       │   ├── ai-store.ts     ← 迁移
                                       │   ├── ai-service.ts   ← 迁移
                                       │   ├── AiSettings.tsx  ← 迁移
                                       │   └── ai-edit/        ← 迁移
                                       └── dist/
                                           ├── index.js
                                           └── styles.css
                                           
注意: src-tauri/ 下的 Rust 代码保持原位
     只是前端逻辑迁移到插件包中
```

#### Sync 模块插件化策略（类似）

```
plugins/
└── lanismd-sync/
    ├── plugin.json
    ├── src/
    │   ├── index.ts
    │   ├── sync-store.ts
    │   ├── sync-service.ts
    │   ├── SyncSettings.tsx
    │   └── components/
    │       ├── SyncPushDialog.tsx
    │       ├── SyncPullDialog.tsx
    │       └── SyncProgressPanel.tsx
    └── dist/
        ├── index.js
        └── styles.css
```

### 4.4 技术难点与解决方案

| 难点                         | 解决方案                                                   |
| -------------------------- | ------------------------------------------------------ |
| **ProseMirror Schema 不可变** | 编辑器扩展插件在 Editor 创建前预注册；变更插件需重启编辑器实例（不需重启应用）            |
| **插件 React 组件渲染**          | 使用 `React.lazy()` + Portal 方式渲染插件组件到指定容器（设置面板、侧边栏等）    |
| **插件间通信**                  | 通过 EventBus 实现松耦合通信，不允许直接 import                       |
| **插件打包**                   | 提供 Vite 插件开发模板，打包为单 JS 文件 + CSS（类似 Obsidian 的方式）       |
| **插件热加载**                  | Feature 类型插件可热加载/卸载；EditorExtension 类型需重建编辑器           |
| **Tauri 命令静态注册**           | 所有后端命令保持编译时注册，前端通过权限系统控制调用                             |
| **插件间依赖**                  | 通过 manifest 的 `dependencies` 字段声明，PluginManager 解析加载顺序 |
| **数据迁移**                   | Phase 2 迁移时保持兼容：旧版设置自动迁移到插件存储                          |

### 4.5 插件开发者体验 (DX)

```bash
# 未来的插件开发工作流

# 1. 创建插件项目
npx create-lanismd-plugin my-plugin

# 2. 项目结构
my-plugin/
├── plugin.json
├── src/
│   └── index.ts
├── package.json         # 开发依赖
├── tsconfig.json
└── vite.config.ts       # 打包配置

# 3. 开发时
pnpm dev                 # 监听模式，自动重载到 LanisMD

# 4. 打包
pnpm build               # 输出 dist/index.js + dist/styles.css

# 5. 发布
pnpm publish-plugin      # 发布到插件市场（GitHub Release）
```

插件入口示例：

```typescript
// src/index.ts
import type { LanisPlugin, PluginContext } from '@lanismd/plugin-api';

const plugin: LanisPlugin = {
  activate(ctx: PluginContext) {
    // 注册命令
    ctx.commands.registerCommand({
      id: 'my-plugin.hello',
      label: '我的插件: 打招呼',
      execute: () => {
        ctx.notifications.info('Hello from my plugin!');
      },
    });
    
    // 注册设置
    ctx.settings.registerSettingsTab({
      id: 'my-plugin',
      label: '我的插件',
      render: (container) => {
        container.innerHTML = '<p>插件设置内容</p>';
      },
    });
    
    // 注册 Slash 菜单项
    ctx.editor.registerSlashItem({
      id: 'my-plugin.insert-template',
      label: '插入模板',
      icon: '📝',
      execute: () => {
        ctx.editor.insertText('# 模板标题\n\n模板内容...');
      },
    });
  },
  
  deactivate() {
    // 清理工作（Disposable 会自动处理大部分清理）
  },
};

export default plugin;
```

***

## 附录 A: 与现有架构的对比

| 维度    | 当前架构                                | 插件化后           |
| ----- | ----------------------------------- | -------------- |
| AI 功能 | 硬编码在 6+ 前端文件 + 6+ 后端文件中             | 独立插件包，可启用/禁用   |
| 同步功能  | 硬编码在 7+ 前端文件 + 7+ 后端文件中             | 独立插件包，可启用/禁用   |
| 新增功能  | 需修改 editor-setup.ts + lib.rs + 设置面板 | 独立插件包，无需修改核心代码 |
| 设置面板  | 硬编码 SECTIONS 数组                     | 插件自动注册 Tab     |
| 包体积   | 全功能包含，约 XX MB                       | 核心精简 + 按需安装    |
| 更新频率  | 所有功能绑定在同一版本                         | 核心独立版本，插件独立更新  |

## 附录 B: 风险评估

| 风险                          | 概率 | 影响 | 缓解措施                        |
| --------------------------- | -- | -- | --------------------------- |
| 插件加载性能影响启动速度                | 中  | 中  | 懒加载 + 缓存 + 并行加载             |
| ProseMirror Schema 限制导致功能受限 | 高  | 高  | 明确文档说明限制；提供 Mark/Node 预注册机制 |
| 第三方插件安全漏洞                   | 中  | 高  | 权限系统 + Web Worker 沙箱 + 社区审核 |
| 插件 API 不稳定导致插件频繁适配          | 高  | 中  | Phase 1-2 充分验证后再开放社区        |
| 用户安装过多插件导致性能下降              | 低  | 中  | 插件性能监控 + 建议数量上限             |
| 插件分发/更新机制复杂度                | 中  | 中  | 先用最简方案（本地安装），再逐步完善          |

## 附录 C: 决策记录

| 决策           | 选择                 | 替代方案          | 理由                             |
| ------------ | ------------------ | ------------- | ------------------------------ |
| 插件运行环境       | 主线程 JS             | Web Worker 隔离 | 需要直接操作 DOM/编辑器；社区插件未来可走 Worker |
| 后端扩展方式       | 编译时包含+运行时控制        | WASM 动态加载     | WASM 方案复杂度过高，且 Tauri 生态尚不成熟    |
| 插件分发         | 本地文件安装 → GitHub 索引 | npm registry  | Tauri 环境无 Node.js，不适合 npm 方式   |
| 插件打包格式       | 单 JS 文件 + CSS      | ES Module 多文件 | 单文件加载更简单，避免模块解析问题              |
| UI 框架在插件中的使用 | 共享宿主的 React 实例     | 独立打包 React    | 避免多 React 实例冲突和体积膨胀            |

***

> **下一步**: 如需进入 Develop 阶段，请根据此规划创建 PRD 文档，使用 `/x-flow:run` 启动开发工作流。


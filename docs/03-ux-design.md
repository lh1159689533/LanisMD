# LanisMD UX 设计规范

> **阶段**: Map（需求映射） — UX Design Specification
> **日期**: 2026-03-27
> **目标**: 定义 LanisMD 的完整用户体验设计规范，涵盖设计原则、信息架构、组件设计、交互规范、主题系统和响应式适配，可直接指导开发实现

---

## 目录

1. [设计原则](#1-设计原则)
2. [信息架构](#2-信息架构)
3. [组件设计规范](#3-组件设计规范)
   - [3.1 自定义标题栏](#31-自定义标题栏)
   - [3.2 标签栏](#32-标签栏)
   - [3.3 编辑器主区域](#33-编辑器主区域)
   - [3.4 侧边栏](#34-侧边栏)
   - [3.5 状态栏](#35-状态栏)
   - [3.6 设置弹窗](#36-设置弹窗)
   - [3.7 Slash Command 面板](#37-slash-command-面板)
   - [3.8 Bubble Menu（浮动格式菜单）](#38-bubble-menu浮动格式菜单)
4. [交互设计](#4-交互设计)
   - [4.1 键盘快捷键体系](#41-键盘快捷键体系)
   - [4.2 动效规范](#42-动效规范)
   - [4.3 状态管理规则](#43-状态管理规则)
5. [亮色/暗色主题设计](#5-亮色暗色主题设计)
6. [响应式/窗口尺寸适配](#6-响应式窗口尺寸适配)

---

## 1. 设计原则

LanisMD 的设计哲学围绕 **「沉浸式写作」** 这一核心理念展开，所有设计决策服务于让用户专注于内容创作这一目标。

### 1.1 沉浸式写作 — 内容为王，UI 退居幕后

编辑器的终极目标是让用户忘记工具本身的存在。所有 UI 元素都应当服务于内容，而非抢占注意力。

- **默认最小化 UI**：首次启动时仅显示编辑区域，侧边栏隐藏，菜单栏最小化
- **低对比度 UI**：非活动状态下的 UI 元素（如标签栏、状态栏）使用低饱和度、低对比度颜色，让内容自然成为视觉焦点
- **聚焦模式**：提供更极端的沉浸模式，隐藏标题栏、标签栏、状态栏，只保留编辑区域
- **留白即美学**：编辑区域内容居中，两侧充足留白，营造"纸上写作"的舒适感

### 1.2 即时反馈 — 每个操作都有视觉响应

用户执行的每一个操作都应当在合理的时间内（<100ms 感知阈值）给予视觉反馈，避免用户产生"操作是否生效"的疑虑。

- **微交互**：按钮悬停、点击状态变化，开关切换动画
- **保存反馈**：文件保存成功时显示简短 Toast
- **格式切换**：粗体/斜体等格式操作后，文本立即呈现对应样式
- **错误提示**：操作失败时，内联提示或 Toast 展示具体错误原因

### 1.3 渐进展示 — 默认最小化 UI，按需展开

遵循「渐进披露（Progressive Disclosure）」原则，将低频功能隐藏在交互层级之后，降低初始认知负荷。

- **侧边栏默认隐藏**：通过 `Cmd+B` / `Ctrl+B` 或工具栏按钮切换
- **右键菜单**：提供上下文相关的操作选项
- **命令面板**：`Cmd+Shift+P` / `Ctrl+Shift+P` 统一入口，搜索所有可用命令
- **Slash Command**：在编辑器中输入 `/` 触发，按需展示块类型选择

### 1.4 键盘优先 — 所有功能都可通过键盘操作

作为面向写作者和开发者的工具，键盘是最高效的输入方式。所有 UI 操作都必须提供键盘访问路径。

- **全局快捷键**：文件操作、视图切换、格式化等核心操作都有快捷键
- **快捷键可自定义**：用户可在设置中修改所有快捷键绑定
- **焦点管理**：Tab 键可在 UI 元素间导航，Escape 返回编辑器
- **命令面板**：作为键盘操作的核心枢纽，支持模糊搜索

### 1.5 跨平台一致 — 三端体验统一，尊重平台惯例

在 macOS、Windows、Linux 三端保持核心体验一致，同时尊重各平台的原生交互习惯。

- **统一的布局结构**：三端使用相同的标签栏、侧边栏、编辑器布局
- **平台原生窗口控制**：macOS 使用交通灯按钮，Windows/Linux 使用自定义标题栏按钮
- **平台原生快捷键**：macOS 使用 `Cmd` 键，Windows/Linux 使用 `Ctrl` 键
- **平台原生字体**：字体回退链覆盖三平台常用字体
- **平台原生对话框**：文件打开/保存使用系统原生对话框

---

## 2. 信息架构

### 2.1 整体布局结构

```
┌──────────────────────────────────────────────────────────────┐
│  自定义标题栏 (38px)                                          │
│  [窗口控制] [文件名 ●] [修改状态]               [设置] [主题]  │
├──────────────────────────────────────────────────────────────┤
│  标签栏 (36px)                                               │
│  [tab1] [tab2 ●] [tab3]                         [+]          │
├─────────┬────────────────────────────────────────────────────┤
│  侧边栏  │  编辑器主区域                                       │
│ (280px) │                                                    │
│         │     ┌──────────────────────────┐                    │
│ [大纲]  │     │                          │                    │
│ [文件树] │     │      内容居中区域          │                    │
│ [搜索]  │     │      max-width: 800px    │                    │
│         │     │                          │                    │
│         │     │                          │                    │
│         │     └──────────────────────────┘                    │
│         │                                                    │
├─────────┴────────────────────────────────────────────────────┤
│  状态栏 (24px)                                               │
│  [字数: 1,234] [行: 56, 列: 12]  [Markdown]     [☀️/🌙]     │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 布局尺寸规范

| 区域 | 高度/宽度 | 说明 |
|------|-----------|------|
| **自定义标题栏** | `height: 38px` | macOS 交通灯按钮区域预留 |
| **标签栏** | `height: 36px` | 含 1px 底部边框 |
| **侧边栏** | `width: 280px` | 可折叠，展开/收起有动画 |
| **编辑器主区域** | `flex: 1` | 自适应填充剩余空间 |
| **编辑器内容区** | `max-width: 800px` | 水平居中，两侧自动留白 |
| **状态栏** | `height: 24px` | 固定底部 |

### 2.3 层级关系

```
应用窗口 (z-index 基准)
├── 标题栏 (z-50)          — 始终置顶
├── 标签栏 (z-40)          — 始终置顶
├── 侧边栏 (z-30)          — 覆盖编辑器
├── 编辑器 (z-10)          — 基础层
│   ├── Bubble Menu (z-20)  — 浮于编辑器之上
│   └── Slash Command (z-20) — 浮于编辑器之上
├── 状态栏 (z-40)           — 始终置底
├── 命令面板 (z-50)         — 模态覆盖
├── 设置弹窗 (z-50)         — 模态覆盖
├── 右键菜单 (z-50)         — 上下文菜单
└── Toast 通知 (z-[60])     — 最顶层
```

---

## 3. 组件设计规范

### 3.1 自定义标题栏

标题栏是应用的"脸面"，在保持最小化的同时传递关键信息。

#### 布局规范

```
macOS:
┌─────────────────────────────────────────────────────────┐
│ 🔴🟡🟢     untitled.md ●                    ⚙️  🌙    │
│  52px       居中文件名              右侧功能区           │
│ 预留区       修改指示器                                  │
└─────────────────────────────────────────────────────────┘

Windows/Linux:
┌─────────────────────────────────────────────────────────┐
│ untitled.md ●                            ─  □  ✕        │
│ 文件名+状态                 最小化 最大化 关闭           │
└─────────────────────────────────────────────────────────┘
```

#### 样式规范

| 属性 | 值 | Tailwind CSS |
|------|-----|-------------|
| **高度** | `38px` | `h-[38px]` |
| **背景色（亮色）** | `#FFFFFF` | `bg-white` |
| **背景色（暗色）** | `#1E293B` | `bg-slate-800` |
| **底部边框（亮色）** | `1px solid #E2E8F0` | `border-b border-slate-200` |
| **底部边框（暗色）** | `1px solid #334155` | `border-b border-slate-700` |
| **拖拽区域** | 整个标题栏（排除交互元素） | `data-tauri-drag-region` |
| **用户选择** | 不可选中 | `select-none` |

#### 文件名样式

| 状态 | 样式 |
|------|------|
| **默认** | `font-size: 13px; font-weight: 500; color: var(--text-primary)` |
| **未保存** | 文件名后追加 `●` 指示器，颜色 `#2563EB`（primary） |
| **悬停** | `cursor: pointer; opacity: 0.8`，点击可触发"另存为" |
| **长文件名** | 超过 200px 时截断，显示省略号 `text-overflow: ellipsis` |

#### 窗口控制按钮

**macOS 交通灯按钮**：
- 使用 `decorations: false`（Tauri 配置），前端不渲染交通灯
- Tauri 2.x 的 `decorations: false` 模式下，macOS 交通灯由系统自动保留在左上角
- 标题栏左侧预留 `68px`（52px 按钮区 + 16px 间距）

**Windows/Linux 自定义按钮**：

| 按钮 | 图标 | 悬停背景 | 点击背景 | 尺寸 |
|------|------|----------|----------|------|
| **最小化** | `─`（水平线） | `#F1F5F9` | `#E2E8F0` | `46px × 38px` |
| **最大化** | `□`（方框） | `#F1F5F9` | `#E2E8F0` | `46px × 38px` |
| **关闭** | `✕`（叉号） | `#EF4444` | `#DC2626`，文字白色 | `46px × 38px` |

- 悬停时使用 `transition: background-color 150ms ease`
- 关闭按钮悬停时图标颜色变白：`hover:text-white`

#### 右侧功能区

标题栏右侧放置轻量级全局操作按钮：

| 按钮 | 图标 | 功能 | 交互 |
|------|------|------|------|
| **设置** | `⚙️`（Gear / SVG） | 打开设置弹窗 | 点击打开模态窗口 |
| **主题切换** | `☀️` / `🌙`（Sun/Moon SVG） | 切换亮色/暗色主题 | 点击切换，图标随之变化 |

- 按钮尺寸：`width: 32px; height: 32px`
- 按钮圆角：`border-radius: 6px`
- 按钮间距：`gap: 4px`
- 悬停效果：`background: var(--background-secondary); transition: 150ms`

---

### 3.2 标签栏

标签栏提供多文件管理的核心交互。

#### 布局规范

```
┌──────────────────────────────────────────────────────────────┐
│ [📄 untitled.md ×] [📄 README.md ×] [📄 notes.md ● ×]   [+] │
│  活动标签              非活动标签       未保存标签    新建    │
└──────────────────────────────────────────────────────────────┘
```

#### 样式规范

| 属性 | 值 | Tailwind CSS |
|------|-----|-------------|
| **高度** | `36px` | `h-9` |
| **背景色（亮色）** | `#FFFFFF` | `bg-white` |
| **背景色（暗色）** | `#1E293B` | `bg-slate-800` |
| **底部边框** | `1px solid var(--border-primary)` | `border-b` |
| **内边距** | `padding: 0 4px` | `px-1` |

#### 单个标签样式

| 状态 | 样式 |
|------|------|
| **活动标签（亮色）** | `background: #FFFFFF; border-bottom: 2px solid #2563EB; color: #1E293B; font-weight: 500` |
| **活动标签（暗色）** | `background: #0F172A; border-bottom: 2px solid #3B82F6; color: #F8FAFC; font-weight: 500` |
| **非活动标签（亮色）** | `background: transparent; color: #64748B; hover: background: #F8FAFC` |
| **非活动标签（暗色）** | `background: transparent; color: #94A3B8; hover: background: #1E293B` |
| **悬停** | `background: var(--background-secondary); transition: 150ms` |

- **标签高度**：`height: 36px`
- **标签内边距**：`padding: 0 12px`
- **标签最小宽度**：`min-width: 100px`
- **标签最大宽度**：`max-width: 200px`
- **文件名文字**：`font-size: 13px; line-height: 36px`
- **文件名溢出**：`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`

#### 文件图标

- 每个标签左侧显示一个小的文件图标（SVG）
- 图标尺寸：`14px × 14px`
- 图标与文件名间距：`6px`
- 图标颜色跟随文字颜色，`opacity: 0.6`

#### 关闭按钮

| 属性 | 值 |
|------|-----|
| **尺寸** | `20px × 20px` |
| **图标** | `×`（叉号），`font-size: 12px` |
| **默认状态** | `opacity: 0`（隐藏） |
| **标签悬停时** | `opacity: 1`（显示） |
| **按钮悬停** | `background: var(--background-tertiary); border-radius: 4px` |
| **与文件名间距** | `margin-left: 8px` |

#### 未保存指示器

- 在关闭按钮左侧、文件名末尾显示 `●` 圆点
- 圆点尺寸：`8px`，颜色：`#2563EB`（primary）
- 仅在文件有未保存修改时显示

#### 交互行为

| 操作 | 行为 |
|------|------|
| **单击标签** | 切换到该文件 |
| **鼠标中键点击** | 关闭该标签 |
| **悬停显示关闭按钮** | 标签上的 × 按钮淡入显示 |
| **点击关闭按钮** | 关闭该标签（有未保存修改时弹出确认对话框） |
| **双击标签** | 进入文件重命名模式（仅对已保存文件） |
| **拖拽标签** | 调整标签顺序（P2 功能，MVP 不实现） |
| **右键标签** | 弹出右键菜单 |

#### 右键菜单

```
┌──────────────────────────┐
│  关闭标签          Ctrl+W │
│  关闭其他标签              │
│  关闭右侧标签              │
│  ─────────────────────── │
│  复制文件路径              │
│  在资源管理器中显示         │
└──────────────────────────┘
```

- 菜单背景（亮色）：`#FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1)`
- 菜单背景（暗色）：`#1E293B; border: 1px solid #334155; box-shadow: 0 4px 12px rgba(0,0,0,0.3)`
- 菜单项高度：`height: 32px; padding: 0 12px`
- 菜单项悬停（亮色）：`background: #F1F5F9`
- 菜单项悬停（暗色）：`background: #334155`
- 快捷键文字（右对齐）：`color: #94A3B8; font-size: 12px`

#### 标签溢出处理

当标签数量超出标签栏宽度时：

1. 标签栏两端显示 **左右滚动箭头**（`◀` / `▶`），各 `width: 28px; height: 36px`
2. 箭头仅在标签溢出时显示
3. 点击箭头水平滚动标签列表，每次滚动一个标签宽度
4. 新建标签（`+`）按钮始终显示在最右侧
5. 支持鼠标滚轮在标签栏上水平滚动

---

### 3.3 编辑器主区域

编辑器主区域是应用的灵魂，承载用户的核心写作体验。

#### 整体布局

```
┌──────────────────────────────────────────────────────────┐
│                    编辑器外层容器                           │
│                                                          │
│      ┌────────────────────────────────────┐              │
│      │                                    │              │
│      │         内容居中区域                 │              │
│      │     max-width: 800px               │              │
│      │     margin: 0 auto                 │              │
│      │     padding: 48px 0               │              │
│      │                                    │              │
│      │     # 文档标题 (H1)                │              │
│      │                                    │              │
│      │     正文段落文字...                  │              │
│      │                                    │              │
│      │     正文段落文字...                  │              │
│      │                                    │              │
│      └────────────────────────────────────┘              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### 容器样式

| 属性 | 值 | Tailwind CSS |
|------|-----|-------------|
| **外层容器** | `flex: 1; overflow-y: auto; overflow-x: hidden` | `flex-1 overflow-y-auto overflow-x-hidden` |
| **外层背景（亮色）** | `#F8FAFC` | `bg-slate-50` |
| **外层背景（暗色）** | `#0F172A` | `bg-slate-900` |
| **内容区域** | `max-width: 800px; margin: 0 auto; padding: 48px 0` | `max-w-[800px] mx-auto py-12` |
| **内容背景（亮色）** | `#FFFFFF` | `bg-white`（可选：仅在内容区设白色背景，形成"纸张"效果） |
| **内容背景（暗色）** | `#1E293B` | `bg-slate-800` |
| **内容水平内边距** | `padding: 0 64px` | `px-16` |
| **滚动条** | 使用自定义滚动条样式（见下方） |

#### 自定义滚动条

```css
/* 亮色主题滚动条 */
.editor-scroll::-webkit-scrollbar {
  width: 8px;
}
.editor-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.editor-scroll::-webkit-scrollbar-thumb {
  background: #CBD5E1;
  border-radius: 4px;
}
.editor-scroll::-webkit-scrollbar-thumb:hover {
  background: #94A3B8;
}

/* 暗色主题滚动条 */
[data-theme="dark"] .editor-scroll::-webkit-scrollbar-thumb {
  background: #475569;
}
[data-theme="dark"] .editor-scroll::-webkit-scrollbar-thumb:hover {
  background: #64748B;
}
```

- macOS 下可考虑隐藏滚动条（`scrollbar-width: thin`），悬停时显示

#### 排版规范

| 元素 | 字号 | 字重 | 行高 | 段前/段后间距 | 颜色 |
|------|------|------|------|--------------|------|
| **H1** | `32px` | `700` | `1.4` | `margin: 24px 0 16px` | `var(--text-primary)` |
| **H2** | `24px` | `600` | `1.4` | `margin: 20px 0 12px` | `var(--text-primary)` |
| **H3** | `20px` | `600` | `1.5` | `margin: 16px 0 8px` | `var(--text-primary)` |
| **H4** | `18px` | `600` | `1.5` | `margin: 14px 0 8px` | `var(--text-primary)` |
| **H5** | `16px` | `600` | `1.5` | `margin: 12px 0 6px` | `var(--text-primary)` |
| **H6** | `16px` | `500` | `1.5` | `margin: 12px 0 6px` | `var(--text-secondary)` |
| **正文段落** | `16px` | `400` | `1.75` | `margin: 0 0 16px` | `var(--text-primary)` |
| **引用块** | `16px` | `400` | `1.75` | `margin: 0 0 16px; padding: 8px 16px; border-left: 3px solid var(--border-accent)` | `var(--text-secondary)` |
| **行内代码** | `14px` | `400` | `1.4` | `padding: 2px 6px; border-radius: 4px; background: var(--background-tertiary); font-family: 'JetBrains Mono', 'Fira Code', monospace` | `var(--text-primary)` |
| **粗体** | `16px` | `700` | `1.75` | 继承 | 继承 |
| **斜体** | `16px` | `400 italic` | `1.75` | 继承 | 继承 |
| **删除线** | `16px` | `400` | `1.75` | `text-decoration: line-through; opacity: 0.7` | 继承 |
| **链接** | `16px` | `400` | `1.75` | `color: #2563EB; text-decoration: underline; text-underline-offset: 2px` | `#2563EB` |
| **无序列表** | `16px` | `400` | `1.75` | `margin: 0 0 8px; padding-left: 24px; list-style-type: disc` | 继承 |
| **有序列表** | `16px` | `400` | `1.75` | `margin: 0 0 8px; padding-left: 24px; list-style-type: decimal` | 继承 |
| **任务列表** | `16px` | `400` | `1.75` | 复选框 `width: 16px; height: 16px; border-radius: 3px; border: 2px solid #CBD5E1; margin-right: 8px; vertical-align: middle` | 继承 |
| **分割线** | `—` | `—` | `—` | `margin: 24px 0; border: none; border-top: 1px solid var(--border-primary)` | `var(--border-primary)` |
| **图片** | `max-width: 100%; border-radius: 8px; margin: 16px auto; display: block` | — | — | — | — |

#### 编辑态 vs 渲染态

LanisMD 的核心 WYSIWYG 交互：当前正在编辑的段落显示 Markdown 标记，其他段落显示渲染结果。

| 状态 | 行为 | 视觉表现 |
|------|------|----------|
| **光标所在段落（编辑态）** | 显示 Markdown 标记源码 | `# ` `**` `*` `- ` `>` `1. ` 等标记可见 |
| **非活动段落（渲染态）** | 隐藏 Markdown 标记，显示渲染结果 | 标题加粗加大、列表显示圆点、引用显示左边框等 |
| **代码块** | 始终保持编辑态（显示源码 + 语法高亮） | 带语言标签的代码块样式 |
| **行内元素** | 编辑时标记可见（如 `**bold**`），光标离开后渲染 | `bold` 显示为 **bold** |
| **聚焦模式** | 非当前编辑段落整体降低不透明度 | 非活动段落 `opacity: 0.3`，当前段落 `opacity: 1` |

> **实现注意**：此行为依赖 Milkdown 的编辑器机制。Milkdown 基于 ProseMirror，天然支持"编辑时显示标记、渲染时隐藏"的 WYSIWYG 行为，但需要通过自定义 NodeView 或 Decoration 进行精细控制。

#### 代码块样式

代码块是技术写作的核心元素，需要精心设计。

```
┌─ javascript ─────────────────── 📋  ┐
│ 1 │ function hello() {              │
│ 2 │   console.log('Hello World');   │
│ 3 │ }                               │
└──────────────────────────────────────┘
```

| 属性 | 值 |
|------|-----|
| **容器** | `border-radius: 8px; overflow: hidden` |
| **背景色（亮色）** | `#F8FAFC` |
| **背景色（暗色）** | `#0F172A` |
| **内边距** | `padding: 16px 20px` |
| **行高** | `1.6` |
| **字体** | `'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace` |
| **字号** | `14px` |
| **行号** | 右对齐，`color: #94A3B8; font-size: 13px; width: 32px; margin-right: 16px; user-select: none` |
| **语言标签** | 左上角，`font-size: 12px; color: #94A3B8; font-weight: 500; text-transform: uppercase` |
| **复制按钮** | 右上角，悬停代码块时显示，`width: 28px; height: 28px; border-radius: 4px; background: transparent; hover: background: rgba(0,0,0,0.06)` |
| **顶部栏** | `height: 32px; padding: 0 12px; background: var(--background-tertiary); display: flex; justify-content: space-between; align-items: center` |

#### Bubble Menu（浮动格式菜单）

选中文字时，在选中区域上方弹出格式操作工具栏。详细设计见 [3.8 节](#38-bubble-menu浮动格式菜单)。

#### Slash Command 面板

输入 `/` 时触发的块类型选择面板。详细设计见 [3.7 节](#37-slash-command-面板)。

---

### 3.4 侧边栏

侧边栏提供文件导航和搜索能力，默认隐藏以保持编辑器的简洁。

#### 布局规范

```
┌──────────────────────────────────────────┐
│ 侧边栏标题区 (36px)                      │
├──────────────────────────────────────────┤
│ [大纲] [文件树] [搜索]    ← 面板切换图标   │
├──────────────────────────────────────────┤
│                                          │
│  大纲 / 文件树 / 搜索 面板内容             │
│                                          │
│  (flex: 1, overflow-y: auto)             │
│                                          │
└──────────────────────────────────────────┘
```

#### 样式规范

| 属性 | 值 | Tailwind CSS |
|------|-----|-------------|
| **宽度** | `280px`（固定） | `w-[280px]` |
| **背景色（亮色）** | `#FFFFFF` | `bg-white` |
| **背景色（暗色）** | `#1E293B` | `bg-slate-800` |
| **右侧边框（亮色）** | `1px solid #E2E8F0` | `border-r border-slate-200` |
| **右侧边框（暗色）** | `1px solid #334155` | `border-r border-slate-700` |
| **展开/收起动画** | `width: 280ms ease-out; transform: 280ms ease-out` | — |
| **面板切换图标高度** | `36px` | `h-9` |
| **面板切换图标宽度** | `280px`（与侧边栏同宽） | `w-full` |

#### 展开与收起

- **快捷键**：`Cmd+B`（macOS）/ `Ctrl+B`（Windows/Linux）
- **展开动画**：`width: 0 → 280px` + `opacity: 0 → 1`，持续 `200ms ease-out`
- **收起动画**：`width: 280px → 0` + `opacity: 1 → 0`，持续 `200ms ease-out`
- **收起时**：编辑器占满剩余空间，侧边栏完全不占据布局空间
- **记住状态**：侧边栏的展开/收起状态通过 `tauri-plugin-store` 持久化

#### 面板切换图标栏

位于侧边栏顶部，水平排列三个面板切换图标：

| 图标 | 功能 | 激活态 |
|------|------|--------|
| `☰`（List / Outline） | 大纲面板 | 底部 `border-bottom: 2px solid #2563EB` |
| `📁`（Folder / Files） | 文件树面板 | 底部 `border-bottom: 2px solid #2563EB` |
| `🔍`（Search） | 搜索面板 | 底部 `border-bottom: 2px solid #2563EB` |

- 每个图标尺寸：`width: 48px; height: 36px; display: flex; align-items: center; justify-content: center`
- 图标大小：`18px × 18px`
- 默认颜色：`var(--text-tertiary)`
- 激活颜色：`var(--text-primary)`
- 悬停效果：`background: var(--background-secondary)`

#### 大纲面板

```
┌─────────────────────────┐
│  ▼ 文档标题 (H1)        │  ← 一级标题
│    ▼ 第一章 (H2)        │  ← 二级标题，缩进 16px
│      小节 1.1 (H3)      │  ← 三级标题，缩进 32px
│      小节 1.2 (H3)      │
│    ▼ 第二章 (H2)        │
│      小节 2.1 (H3)      │
└─────────────────────────┘
```

| 属性 | 值 |
|------|-----|
| **列表项高度** | `height: 32px; line-height: 32px; padding: 0 12px` |
| **文字大小** | H1: `14px / 600`; H2: `13px / 500`; H3: `12px / 400` |
| **文字颜色** | `var(--text-primary)` |
| **缩进** | H1: `0px`; H2: `16px`; H3: `32px` |
| **悬停效果** | `background: var(--background-secondary)` |
| **当前段落高亮** | `background: var(--primary-light); color: var(--primary); font-weight: 600`（`primary-light`: `rgba(37,99,235,0.08)`） |
| **折叠图标** | `▶` / `▼`，`font-size: 10px; margin-right: 8px; color: var(--text-tertiary)` |
| **点击行为** | 点击大纲项 → 编辑器滚动到对应标题位置 |

- 大纲自动从文档标题结构生成
- 支持折叠/展开子级标题
- 当前编辑位置对应的大纲项高亮显示
- 大纲实时更新（文档结构变化时自动同步）

#### 文件树面板（P2 功能）

> **注意**：文件树面板为 P2 优先级，MVP 阶段可先显示"即将推出"占位内容。以下为完整设计规范供后续实现参考。

```
┌─────────────────────────┐
│  📂 my-project/          │  ← 项目根目录
│  ▼ 📂 docs/             │
│      📄 readme.md       │
│      📄 api.md           │
│  ▼ 📂 src/              │
│      📄 main.ts          │
│  📄 package.json         │
│  📄 CHANGELOG.md         │
└─────────────────────────┘
```

| 属性 | 值 |
|------|-----|
| **列表项高度** | `height: 28px; padding: 0 8px` |
| **文字大小** | `13px / 400` |
| **缩进** | 每级 `16px` |
| **悬停效果** | `background: var(--background-secondary); border-radius: 4px` |
| **当前文件高亮** | `background: var(--primary-light)` |
| **文件夹图标** | 展开: `📂`; 折叠: `📁` |
| **文件图标** | 根据 `.md` 显示文档图标，其他扩展名显示对应图标 |
| **交互** | 单击打开文件; 双击文件夹展开/折叠 |

#### 搜索面板

```
┌─────────────────────────────────┐
│  ┌───────────────────────────┐  │
│  │ 🔍 搜索...                │  │  ← 搜索输入框
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 替换为...                  │  │  ← 替换输入框（可折叠）
│  └───────────────────────────┘  │
│  [Aa] [.*] [ ]正则     [替换▼]  │  ← 选项栏
├─────────────────────────────────┤
│  3 个结果，共 2 个文件           │  ← 结果统计
│                                  │
│  📄 readme.md                    │
│    ...使用 **LanisMD**...      │  ← 匹配文本上下文，关键字高亮
│    L12: 下载并安装 LanisMD     │  ← 行号 + 匹配行
│                                  │
│  📄 api.md                       │
│    ...API **文档**...            │
│    L5: 查看 API 文档            │
│                                  │
└─────────────────────────────────┘
```

**搜索输入框**：
- `height: 32px; padding: 0 12px 0 36px; border: 1px solid var(--border-primary); border-radius: 6px; font-size: 13px`
- 聚焦时边框高亮：`border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1)`
- 搜索图标（左侧）：`position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary)`

**替换输入框**：
- 样式同搜索框
- 默认隐藏，点击"替换▼"按钮展开
- 展开动画：`height: 0 → 32px; opacity: 0 → 1`，`150ms ease-out`

**选项栏**：
- 位于搜索框下方，水平排列
- 各选项为 Toggle 按钮（按下/弹起状态切换）
- 高度：`height: 28px; padding: 0 8px`

| 选项 | 图标/文字 | 功能 |
|------|-----------|------|
| **Aa** | `Aa` | 区分大小写 |
| **.*`** | `Ab` | 全词匹配 |
| **正则** | `.*` | 正则表达式模式 |
| **替换▼** | 文字 | 展开/折叠替换输入框 + 替换操作按钮 |

替换操作按钮（替换输入框展开后显示）：
- `替换`：替换当前匹配项
- `全部替换`：替换所有匹配项

**搜索结果**：
- 统计信息：`font-size: 12px; color: var(--text-tertiary); padding: 8px 12px`
- 文件分组：`font-size: 13px; font-weight: 500; color: var(--text-primary); padding: 4px 12px`
- 匹配上下文：`font-size: 12px; color: var(--text-secondary); padding: 4px 12px 4px 24px; border-radius: 4px`
- 匹配高亮：`background: rgba(245,158,11,0.3); color: inherit; border-radius: 2px; padding: 0 1px`
- 行号：`color: var(--text-tertiary); font-size: 11px; margin-right: 8px`
- 悬停效果：`background: var(--background-secondary)`
- 点击结果：编辑器跳转到对应文件和位置，匹配文字高亮选中

---

### 3.5 状态栏

状态栏提供轻量的文档信息展示和全局操作入口。

#### 布局规范

```
┌──────────────────────────────────────────────────────────────┐
│ 字数: 1,234 │ 行 56, 列 12              Markdown      ☀️ 🌙   │
│ ← 左侧信息区 →              ← 中间 →     ← 右侧功能区 →    │
└──────────────────────────────────────────────────────────────┘
```

#### 样式规范

| 属性 | 值 | Tailwind CSS |
|------|-----|-------------|
| **高度** | `24px` | `h-6` |
| **背景色（亮色）** | `#FFFFFF` | `bg-white` |
| **背景色（暗色）** | `#1E293B` | `bg-slate-800` |
| **顶部边框（亮色）** | `1px solid #E2E8F0` | `border-t border-slate-200` |
| **顶部边框（暗色）** | `1px solid #334155` | `border-t border-slate-700` |
| **内边距** | `padding: 0 12px` | `px-3` |
| **字号** | `12px` | `text-xs` |
| **颜色** | `var(--text-tertiary)` | `text-slate-400` |

#### 各区域内容

**左侧信息区**：

| 项目 | 格式 | 说明 |
|------|------|------|
| **字数统计** | `字数: 1,234` | 中文字数 + 英文单词数 |
| **光标位置** | `行 56, 列 12` | 当前行号和列号（0-based 或 1-based，统一使用 1-based） |

- 各信息项之间用 `│`（竖线）分隔
- 竖线样式：`margin: 0 8px; color: var(--border-primary)`

**中间信息区**：

| 项目 | 格式 | 说明 |
|------|------|------|
| **文件类型** | `Markdown` | 当前文件的格式类型 |

- 居中显示

**右侧功能区**：

| 按钮 | 图标 | 功能 | 尺寸 |
|------|------|------|------|
| **主题切换** | `☀️`（亮色模式时显示）/ `🌙`（暗色模式时显示） | 切换亮色/暗色主题 | `18px × 18px` |

- 按钮悬停效果：`opacity: 0.6 → 1; cursor: pointer`

---

### 3.6 设置弹窗

设置弹窗采用经典的"左导航 + 右内容"布局。

#### 整体布局

```
┌──────────────────────────────────────────────────────────────┐
│  设置                                              [×]      │
├───────────────┬──────────────────────────────────────────────┤
│               │                                              │
│  通用          │   通用设置                                   │
│  外观          │                                              │
│  编辑器        │   默认文件格式:  Markdown     [▼]           │
│  快捷键        │                                              │
│               │   自动保存:  [开关 ON]                        │
│               │   保存间隔:  5 分钟  [▼]                     │
│               │                                              │
│               │   启动时打开上次文件:  [开关 OFF]             │
│               │                                              │
│               │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

#### 遮罩层

| 属性 | 值 |
|------|-----|
| **背景** | `rgba(0, 0, 0, 0.4)`（亮色）/ `rgba(0, 0, 0, 0.6)`（暗色） |
| **模糊** | `backdrop-filter: blur(4px)` |
| **动画** | `opacity: 0 → 1`，`200ms ease-out` |

#### 弹窗容器

| 属性 | 值 |
|------|-----|
| **位置** | 居中 |
| **宽度** | `min-width: 680px; max-width: 80vw` |
| **高度** | `min-height: 480px; max-height: 80vh` |
| **背景（亮色）** | `#FFFFFF` |
| **背景（暗色）** | `#1E293B` |
| **圆角** | `12px` |
| **阴影（亮色）** | `0 16px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)` |
| **阴影（暗色）** | `0 16px 48px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)` |
| **动画** | `opacity: 0 → 1; transform: scale(0.95) → scale(1)`，`200ms ease-out` |

#### 标题栏

| 属性 | 值 |
|------|-----|
| **高度** | `48px` |
| **字号** | `16px / 600` |
| **内边距** | `padding: 0 16px` |
| **底部边框** | `1px solid var(--border-primary)` |
| **关闭按钮** | 右上角 `×`，`width: 28px; height: 28px; border-radius: 6px; hover: background: var(--background-secondary)` |

#### 左侧导航

| 属性 | 值 |
|------|-----|
| **宽度** | `180px` |
| **背景（亮色）** | `#F8FAFC` |
| **背景（暗色）** | `#0F172A` |
| **右侧边框** | `1px solid var(--border-primary)` |
| **内边距** | `padding: 8px 0` |

**导航项**：

| 属性 | 值 |
|------|-----|
| **高度** | `height: 36px` |
| **内边距** | `padding: 0 16px` |
| **字号** | `14px / 400` |
| **悬停** | `background: var(--background-secondary); cursor: pointer` |
| **选中态** | `background: var(--primary-light); color: var(--primary); font-weight: 500` |

导航项列表：
1. 通用
2. 外观
3. 编辑器
4. 快捷键

#### 右侧内容区

| 属性 | 值 |
|------|-----|
| **内边距** | `padding: 24px 32px` |
| **溢出** | `overflow-y: auto` |

**设置项通用样式**：

每个设置项占一行，布局如下：
```
标签文字                          控件
说明文字（可选，12px，灰色）
```

- **标签与控件间距**：`margin-left: auto`（标签左对齐，控件右对齐，用 `flex justify-between`）
- **设置项之间间距**：`margin-bottom: 20px`
- **分组标题**：`font-size: 13px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin: 24px 0 12px; letter-spacing: 0.5px`

#### 各分类设置项详情

**通用**：

| 设置项 | 标签 | 控件类型 | 默认值 | 选项 |
|--------|------|----------|--------|------|
| 默认文件格式 | 默认文件格式 | 下拉选择 | Markdown | Markdown / Plain Text |
| 自动保存 | 自动保存 | 开关 (Switch) | 开 | ON / OFF |
| 保存间隔 | 保存间隔 | 下拉选择 | 5 分钟 | 1 分钟 / 5 分钟 / 10 分钟 / 30 分钟 |
| 启动时打开上次文件 | 启动时恢复上次会话 | 开关 (Switch) | 关 | ON / OFF |
| 语言 | 界面语言 | 下拉选择 | 跟随系统 | 跟随系统 / 简体中文 / English |
| 最近文件数量 | 最近文件列表数量 | 数字输入 | 10 | 5 / 10 / 20 / 50 |

**外观**：

| 设置项 | 标签 | 控件类型 | 默认值 | 选项 |
|--------|------|----------|--------|------|
| 主题 | 主题 | 单选卡片 | 系统 | 系统 / 亮色 / 暗色 |
| 字体 | 编辑器字体 | 字体选择器 | 系统默认 | 输入自定义字体族 |
| 字号 | 正文字号 | 滑块 (Slider) | 16px | 12px ~ 24px |
| 编辑器宽度 | 编辑器最大宽度 | 滑块 (Slider) | 800px | 600px ~ 1200px |
| 侧边栏位置 | 侧边栏位置 | 单选按钮 | 左侧 | 左侧 / 右侧 |
| 显示行号 | 代码块显示行号 | 开关 (Switch) | 开 | ON / OFF |

**编辑器**：

| 设置项 | 标签 | 控件类型 | 默认值 | 选项 |
|--------|------|----------|--------|------|
| 默认换行方式 | 换行方式 | 单选按钮 | 软换行 | 软换行 / 硬换行 / 不换行 |
| Markdown 扩展语法 | 启用 GFM 扩展 | 开关 (Switch) | 开 | ON / OFF |
| 自动补全括号 | 自动补全括号 | 开关 (Switch) | 开 | ON / OFF |
| 自动补全配对符号 | 自动配对符号 | 开关 (Switch) | 开 | ON / OFF |
| 拼写检查 | 拼写检查 | 开关 (Switch) | 关 | ON / OFF |
| Markdown 标记可见性 | 默认显示 Markdown 标记 | 单选按钮 | 编辑时可见 | 始终隐藏 / 编辑时可见 / 始终显示 |

**快捷键**：

| 设置项 | 标签 | 控件类型 | 说明 |
|--------|------|----------|------|
| 快捷键列表 | 所有快捷键绑定 | 可搜索列表 + 录制按钮 | 列出所有快捷键，点击可重新录制 |

- 快捷键列表使用表格布局：`命令名称 | 当前快捷键 | [录制按钮]`
- 搜索框位于列表上方：`placeholder: "搜索快捷键..."`
- 录制模式：点击录制按钮后进入录音状态，显示"请按下新的快捷键组合..."
- 重置按钮：`恢复默认快捷键`，位于列表底部

#### 控件样式

**开关 (Switch)**：
```
  OFF 状态:                          ON 状态:
  ┌──────────────┐                  ┌──────────────┐
  │  ○           │                  │           ●  │
  │  #CBD5E1     │                  │  #2563EB     │
  └──────────────┘                  └──────────────┘
   width: 44px                       width: 44px
   height: 24px                      height: 24px
   background: #CBD5E1               background: #2563EB
   circle: 20px, left: 2px           circle: 20px, left: 22px
```
- `border-radius: 12px`（药丸形）
- 圆形滑块：`width: 20px; height: 20px; border-radius: 50%; background: #FFFFFF; box-shadow: 0 1px 3px rgba(0,0,0,0.2)`
- 过渡动画：`transition: all 200ms ease`

**下拉选择 (Select)**：
- `height: 32px; padding: 0 32px 0 12px; border: 1px solid var(--border-primary); border-radius: 6px; font-size: 13px; background: var(--background-primary); color: var(--text-primary)`
- 右侧下拉箭头：自定义 SVG，`position: absolute; right: 10px`
- 聚焦态：`border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.1)`

**滑块 (Slider)**：
- 轨道：`height: 4px; border-radius: 2px; background: var(--border-primary)`
- 已填充部分：`background: var(--primary); border-radius: 2px`
- 滑块手柄：`width: 16px; height: 16px; border-radius: 50%; background: #FFFFFF; border: 2px solid var(--primary); box-shadow: 0 1px 3px rgba(0,0,0,0.2)`
- 值标签：滑块右侧显示当前值

**单选卡片**（主题选择）：
```
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │   ☐ 系统跟随  │  │   ○ 亮色     │  │   ☐ 暗色     │
  │   (auto)     │  │   (light)    │  │   (dark)     │
  └──────────────┘  └──────────────┘  └──────────────┘
   选中时:
   - border: 2px solid #2563EB
   - background: rgba(37,99,235,0.05)
   未选中时:
   - border: 1px solid var(--border-primary)
   - background: transparent
```
- 卡片尺寸：`width: 120px; height: 72px; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px`
- 卡片间距：`gap: 12px`

**数字输入**：
- `width: 80px; height: 32px; padding: 0 8px; border: 1px solid var(--border-primary); border-radius: 6px; font-size: 13px; text-align: center`

---

### 3.7 Slash Command 面板

Slash Command 是从编辑器内快速插入各种块类型的核心交互，借鉴自 Notion 和 MarkText。

#### 触发条件

在编辑器中输入 `/` 时触发面板。具体规则：
- `/` 必须是当前行的第一个非空白字符（行首触发）
- 或 `/` 前面有空格（行中触发）
- 在代码块内输入 `/` **不触发**
- 输入 `/` 后继续输入文字可进行过滤搜索

#### 面板布局

```
                          ┌──────────────────────────────┐
                          │  🔍 /标题                    │  ← 搜索过滤
                          ├──────────────────────────────┤
                          │  ▸ 标题 (H1)      #          │  ← 当前选中项
                          │    一级标题                  │
                          ├──────────────────────────────┤
                          │    标题 (H2)      ##         │
                          │    二级标题                  │
                          ├──────────────────────────────┤
                          │    标题 (H3)      ###        │
                          │    三级标题                  │
                          ├──────────────────────────────┤
                          │    粗体            **text**  │
                          ├──────────────────────────────┤
                          │    斜体            *text*    │
                          ├──────────────────────────────┤
                          │    删除线          ~~text~~  │
                          ├──────────────────────────────┤
                          │    代码块          ```       │
                          ├──────────────────────────────┤
                          │    引用块          >         │
                          ├──────────────────────────────┤
                          │    无序列表        -         │
                          ├──────────────────────────────┤
                          │    有序列表        1.        │
                          ├──────────────────────────────┤
                          │    任务列表        - [ ]     │
                          ├──────────────────────────────┤
                          │    表格            | col |   │
                          ├──────────────────────────────┤
                          │    分割线          ---       │
                          ├──────────────────────────────┤
                          │    行内公式         $...$    │
                          ├──────────────────────────────┤
                          │    块级公式         $$...$$  │
                          └──────────────────────────────┘
```

#### 面板样式

| 属性 | 值 |
|------|-----|
| **位置** | 光标正下方，左对齐（如空间不足则右移） |
| **宽度** | `280px` |
| **最大高度** | `360px`（超出时内部滚动） |
| **背景（亮色）** | `#FFFFFF` |
| **背景（暗色）** | `#1E293B` |
| **圆角** | `10px` |
| **阴影（亮色）** | `0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)` |
| **阴影（暗色）** | `0 8px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)` |
| **边框** | `1px solid var(--border-primary)` |

#### 列表项样式

| 属性 | 值 |
|------|-----|
| **高度** | `height: auto; min-height: 56px` |
| **内边距** | `padding: 8px 12px` |
| **图标** | 左侧图标区域 `width: 32px; height: 32px; border-radius: 6px; background: var(--background-tertiary); display: flex; align-items: center; justify-content: center; font-size: 14px; margin-right: 10px` |
| **标题** | `font-size: 14px; font-weight: 500; color: var(--text-primary)` |
| **描述** | `font-size: 12px; color: var(--text-tertiary); margin-top: 2px` |
| **语法提示** | 右对齐，`font-size: 11px; color: var(--text-tertiary); font-family: monospace` |

#### 选中态样式

当前键盘导航选中的列表项：
- `background: var(--primary-light)`（`rgba(37,99,235,0.08)`）
- 左侧显示 `▸` 选中指示器（或 `background: var(--primary)` 的 3px 宽左边框）

#### 交互行为

| 操作 | 行为 |
|------|------|
| **上下方向键** | 在列表项间移动选中状态 |
| **Enter** | 确认选中项，插入对应块类型，关闭面板 |
| **Escape** | 关闭面板，清除已输入的 `/` |
| **继续输入文字** | 模糊搜索过滤列表项（匹配标题和描述） |
| **鼠标悬停** | 移动选中状态到悬停项 |
| **鼠标点击** | 确认选中项，插入对应块类型 |
| **点击面板外部** | 关闭面板 |
| **输入空格或其他字符** | 如果过滤结果为空，关闭面板，将 `/` 作为普通字符处理 |

#### 过滤逻辑

- 搜索文本为 `/` 后面输入的所有字符
- 匹配规则：列表项的标题或描述中包含搜索文本（不区分大小写）
- 使用模糊匹配（fuzzy match），优先匹配标题开头

#### 出现/消失动画

- **出现**：`opacity: 0 → 1; transform: translateY(4px) → translateY(0)`，`150ms ease-out`
- **消失**：`opacity: 1 → 0; transform: translateY(0) → translateY(4px)`，`100ms ease-in`

---

### 3.8 Bubble Menu（浮动格式菜单）

Bubble Menu 是选中文字时弹出的行内格式工具栏，提供快速格式化操作。

#### 触发条件

- 在编辑器中选中（高亮）一段文字时自动弹出
- 选中文字长度 ≥ 1 个字符
- 在代码块内选中文字时 **不弹出** Bubble Menu（代码块有自己的上下文菜单）

#### 面板布局

```
              ┌──────────────────────────────────────────┐
              │  [B] [I] [S] [</>] [🔗] [🖍]            │
              │  粗体 斜体 删除线 代码 链接 高亮          │
              └────────────┬─────────────────────────────┘
                           │
                           ▼  ← 箭头指向选中区域
              ═══════════════════════════
              「选中的文字内容」
              ═══════════════════════════
```

#### 面板样式

| 属性 | 值 |
|------|-----|
| **位置** | 选中区域上方居中，与选中区域保持 `8px` 间距 |
| **方向** | 默认向上弹出；如果上方空间不足，向下弹出 |
| **背景（亮色）** | `#FFFFFF` |
| **背景（暗色）** | `#1E293B` |
| **圆角** | `8px` |
| **内边距** | `padding: 4px` |
| **阴影（亮色）** | `0 4px 12px rgba(0,0,0,0.1)` |
| **阴影（暗色）** | `0 4px 12px rgba(0,0,0,0.3)` |
| **边框** | `1px solid var(--border-primary)` |
| **箭头** | 底部中央 6px 三角形，使用 CSS `::after` 伪元素实现，颜色与背景色一致 |

#### 按钮样式

| 属性 | 值 |
|------|-----|
| **尺寸** | `width: 32px; height: 32px` |
| **间距** | `gap: 2px` |
| **圆角** | `border-radius: 6px` |
| **图标** | 文本图标，`font-size: 14px; font-weight: 600` |
| **默认** | `color: var(--text-secondary); background: transparent` |
| **悬停** | `background: var(--background-secondary); color: var(--text-primary)` |
| **激活态**（当前选中文本已应用该格式） | `background: var(--primary-light); color: var(--primary)` |
| **点击** | `background: var(--background-tertiary); transition: 100ms` |

#### 按钮列表

| 按钮 | 显示 | 快捷键 | 功能 | 激活态判断 |
|------|------|--------|------|-----------|
| **粗体** | **B** | `Cmd+B` / `Ctrl+B` | 切换粗体 | 选区包含 `strong` 节点 |
| **斜体** | *I* | `Cmd+I` / `Ctrl+I` | 切换斜体 | 选区包含 `em` 节点 |
| **删除线** | ~~S~~ | `Cmd+Shift+X` / `Ctrl+Shift+X` | 切换删除线 | 选区包含 `s` 节点 |
| **行内代码** | `</>` | `Cmd+E` / `Ctrl+E` | 切换行内代码 | 选区包含 `code` 节点 |
| **链接** | 🔗 | `Cmd+K` / `Ctrl+K` | 插入/编辑链接 | 选区包含 `a` 节点 |
| **高亮** | `🖍` | `Cmd+Shift+H` / `Ctrl+Shift+H` | 切换高亮（`<mark>`） | 选区包含 `mark` 节点 |

#### 链接输入交互

点击链接按钮时的特殊交互：

1. 如果选区已包含链接 → 弹出编辑面板，显示当前 URL，可修改或删除
2. 如果选区不包含链接 → 弹出 URL 输入面板

URL 输入面板：
```
┌──────────────────────────────────────────────┐
│  📎 链接                                      │
│  ┌────────────────────────────────────────┐  │
│  │ https://                             │  │  ← 输入框，自动聚焦
│  └────────────────────────────────────────┘  │
│                               [取消] [确认]   │
└──────────────────────────────────────────────┘
```
- 输入框：`height: 32px; border: 1px solid var(--border-primary); border-radius: 6px; padding: 0 12px; font-size: 13px`
- 输入框自动聚焦，支持粘贴
- `Enter` 确认，`Escape` 取消
- 如果剪贴板中有 URL，自动填充

#### 关闭条件

| 条件 | 行为 |
|------|------|
| **点击编辑器空白区域** | 关闭 Bubble Menu |
| **按 Escape** | 关闭 Bubble Menu，取消选中 |
| **选中文字被取消**（点击其他位置） | 关闭 Bubble Menu |
| **选中文本变为空**（删除操作） | 关闭 Bubble Menu |

#### 出现/消失动画

- **出现**：`opacity: 0 → 1; transform: scale(0.9) → scale(1)`，`100ms ease-out`
- **消失**：`opacity: 1 → 0; transform: scale(1) → scale(0.9)`，`80ms ease-in`

---

## 4. 交互设计

### 4.1 键盘快捷键体系

快捷键分为四类：文件操作、编辑操作、格式操作、视图操作。macOS 使用 `Cmd`（⌘）键，Windows/Linux 使用 `Ctrl` 键。

#### 文件操作

| 操作 | macOS | Windows/Linux | 说明 |
|------|-------|---------------|------|
| 新建文件 | `Cmd+N` | `Ctrl+N` | 创建新的空白标签页 |
| 打开文件 | `Cmd+O` | `Ctrl+O` | 打开系统文件选择对话框 |
| 保存 | `Cmd+S` | `Ctrl+S` | 保存当前文件 |
| 另存为 | `Cmd+Shift+S` | `Ctrl+Shift+S` | 弹出另存为对话框 |
| 关闭标签 | `Cmd+W` | `Ctrl+W` | 关闭当前标签 |
| 关闭窗口 | `Cmd+Shift+W` | `Ctrl+Shift+W` | 关闭所有标签并退出 |
| 导出 | `Cmd+Shift+E` | `Ctrl+Shift+E` | 导出为 PDF/HTML 等 |
| 打印 | `Cmd+P` | `Ctrl+P` | 打印 / 保存为 PDF |

#### 编辑操作

| 操作 | macOS | Windows/Linux | 说明 |
|------|-------|---------------|------|
| 撤销 | `Cmd+Z` | `Ctrl+Z` | 撤销上一步操作 |
| 重做 | `Cmd+Shift+Z` | `Ctrl+Shift+Z` 或 `Ctrl+Y` | 重做撤销的操作 |
| 剪切 | `Cmd+X` | `Ctrl+X` | 剪切选中内容 |
| 复制 | `Cmd+C` | `Ctrl+C` | 复制选中内容 |
| 粘贴 | `Cmd+V` | `Ctrl+V` | 粘贴剪贴板内容 |
| 全选 | `Cmd+A` | `Ctrl+A` | 全选文档内容 |
| 查找 | `Cmd+F` | `Ctrl+F` | 打开侧边栏搜索面板 |
| 查找并替换 | `Cmd+H` | `Ctrl+H` | 打开侧边栏搜索面板并展开替换 |
| 跳转到行 | `Cmd+G` | `Ctrl+G` | 输入行号跳转（P2） |

#### 格式操作

| 操作 | macOS | Windows/Linux | 说明 |
|------|-------|---------------|------|
| 粗体 | `Cmd+B` | `Ctrl+B` | 切换粗体 `**text**` |
| 斜体 | `Cmd+I` | `Ctrl+I` | 切换斜体 `*text*` |
| 删除线 | `Cmd+Shift+X` | `Ctrl+Shift+X` | 切换删除线 `~~text~~` |
| 行内代码 | `Cmd+E` | `Ctrl+E` | 切换行内代码 `` `code` `` |
| 链接 | `Cmd+K` | `Ctrl+K` | 插入/编辑链接 `[text](url)` |
| 高亮 | `Cmd+Shift+H` | `Ctrl+Shift+H` | 切换高亮 `==text==` |
| 标题 1 | `Cmd+1` | `Ctrl+1` | 切换一级标题 |
| 标题 2 | `Cmd+2` | `Ctrl+2` | 切换二级标题 |
| 标题 3 | `Cmd+3` | `Ctrl+3` | 切换三级标题 |
| 标题 4 | `Cmd+4` | `Ctrl+4` | 切换四级标题 |
| 无序列表 | `Cmd+Shift+8` | `Ctrl+Shift+8` | 切换无序列表 `- item` |
| 有序列表 | `Cmd+Shift+9` | `Ctrl+Shift+9` | 切换有序列表 `1. item` |
| 任务列表 | `Cmd+Shift+L` | `Ctrl+Shift+L` | 切换任务列表 `- [ ] item` |
| 代码块 | `Cmd+Shift+C` | `Ctrl+Shift+C` | 插入代码块 |
| 引用块 | `Cmd+Shift+Q` | `Ctrl+Shift+Q` | 切换引用块 `> quote` |
| 分割线 | `Cmd+Shift+-`（减号） | `Ctrl+Shift+-` | 插入分割线 `---` |
| 表格 | `Cmd+Shift+T` | `Ctrl+Shift+T` | 插入 3×3 表格 |

> **注意**：`Cmd+B` / `Ctrl+B` 存在格式操作与侧边栏切换的冲突。解决方案：
> - 当编辑器有选区时 → 执行粗体操作
> - 当编辑器无选区（光标处于插入态）时 → 切换侧边栏
> - 或者侧边栏切换改用 `Cmd+Shift+B` / `Ctrl+Shift+B`

#### 视图操作

| 操作 | macOS | Windows/Linux | 说明 |
|------|-------|---------------|------|
| 命令面板 | `Cmd+Shift+P` | `Ctrl+Shift+P` | 打开命令面板 |
| 切换侧边栏 | `Cmd+Shift+B` | `Ctrl+Shift+B` | 显示/隐藏侧边栏 |
| 源码模式 | `Cmd+/` | `Ctrl+/` | 切换 Markdown 源码模式 |
| 全屏模式 | `Cmd+Ctrl+F` | `F11` | 切换全屏 |
| 专注模式 | `Cmd+Shift+J` | `Ctrl+Shift+J` | 切换专注模式（当前段落高亮，其他暗淡） |
| 打字机模式 | `Cmd+Shift+T` | `Ctrl+Shift+T` | 切换打字机模式（光标居中） — P2 |
| 放大 | `Cmd++` | `Ctrl++` | 增大编辑器字号 |
| 缩小 | `Cmd+-` | `Ctrl+-` | 减小编辑器字号 |
| 重置缩放 | `Cmd+0` | `Ctrl+0` | 重置编辑器字号 |

#### 快捷键冲突解决策略

| 冲突 | 解决方案 |
|------|----------|
| `Cmd+B` 粗体 vs 侧边栏 | 侧边栏改为 `Cmd+Shift+B` |
| `Cmd+Shift+T` 表格 vs 打字机模式 | 打字机模式改为 `Cmd+Option+T`（macOS）/ `Ctrl+Alt+T`（Win/Linux），或打字机模式仅在源码模式下生效 |
| `Cmd+E` 行内代码 vs macOS Finder（在此处显示） | 无实际冲突（Finder 快捷键仅在 Finder 中生效） |

---

### 4.2 动效规范

动效的目的是提供流畅的视觉反馈，增强操作的可感知性。所有动效都应当 **快速、克制、有意义**。

#### 动效总览

| 交互场景 | 时长 | 缓动函数 | 说明 |
|----------|------|----------|------|
| **侧边栏展开/收起** | `200ms` | `ease-out` | 宽度变化 + 透明度变化 |
| **标签切换** | `150ms` | `ease-out` | 淡入淡出 |
| **Bubble Menu 出现** | `100ms` | `ease-out` | 缩放 + 淡入 |
| **Bubble Menu 消失** | `80ms` | `ease-in` | 缩放 + 淡出 |
| **Slash Command 面板出现** | `150ms` | `ease-out` | 向上滑入 + 淡入 |
| **Slash Command 面板消失** | `100ms` | `ease-in` | 向下滑出 + 淡出 |
| **主题切换** | `300ms` | `ease-in-out` | 全局颜色过渡 |
| **Toast 通知出现** | `200ms` | `ease-out` | 从右侧滑入 + 淡入 |
| **Toast 通知消失** | `200ms` | `ease-in` | 向右侧滑出 + 淡出 |
| **Toast 通知持续时间** | `3000ms` | — | 3 秒后自动消失 |
| **设置弹窗打开** | `200ms` | `ease-out` | 遮罩淡入 + 窗口缩放 |
| **设置弹窗关闭** | `150ms` | `ease-in` | 遮罩淡出 + 窗口缩放 |
| **右键菜单出现** | `100ms` | `ease-out` | 缩放 + 淡入 |
| **按钮悬停** | `150ms` | `ease-out` | 背景色渐变 |
| **开关切换** | `200ms` | `ease-in-out` | 滑块滑动 + 颜色变化 |
| **大纲项悬停** | `100ms` | `ease-out` | 背景色渐变 |
| **聚焦模式过渡** | `300ms` | `ease-in-out` | UI 元素淡出 + 内容居中 |

#### 主题切换动画

主题切换时，所有使用 CSS 变量的元素同时进行颜色过渡：

```css
:root {
  /* 所有主题色变量添加过渡 */
  transition:
    --background-primary 300ms ease-in-out,
    --background-secondary 300ms ease-in-out,
    --background-tertiary 300ms ease-in-out,
    --text-primary 300ms ease-in-out,
    --text-secondary 300ms ease-in-out,
    --text-tertiary 300ms ease-in-out,
    --border-primary 300ms ease-in-out;
}
```

> **实现注意**：CSS 自定义属性（Custom Properties）的直接过渡需要 `@property` 规则注册。对于浏览器不支持 `@property` 的情况，退回使用 `transition: background-color 300ms, color 300ms, border-color 300ms` 应用于具体元素。

#### 无障碍考虑

- 尊重用户的 `prefers-reduced-motion` 系统设置：

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- 所有动效时长不超过 `300ms`，避免用户等待感
- 涉及布局变化的动效（侧边栏、标签切换）使用 `will-change` 属性优化渲染性能

---

### 4.3 状态管理规则

#### 文件修改状态

| 状态 | 指示位置 | 视觉表现 |
|------|----------|----------|
| **未修改（已保存）** | 标签页文件名旁 | 无指示器 |
| **已修改（未保存）** | 标签页文件名旁 | 显示 `●` 圆点，颜色 `#2563EB`（primary） |
| **保存中** | 标签页文件名旁 | 圆点变为旋转动画（或文字变为 "保存中..."） |
| **保存成功** | Toast 通知 | Toast 显示 "✓ 已保存"，持续 2 秒后自动消失 |
| **保存失败** | Toast 通知 | Toast 显示 "✕ 保存失败: {原因}"，需手动关闭 |

#### 未保存文件关闭确认

当用户尝试关闭含有未保存修改的标签页时：

```
┌──────────────────────────────────────────┐
│                                          │
│   是否保存对 "untitled.md" 的更改？       │
│                                          │
│   如果不保存，更改将丢失。                 │
│                                          │
│          [不保存]  [取消]  [保存]          │
│                                          │
└──────────────────────────────────────────┘
```

- 弹窗尺寸：`width: 400px; padding: 24px`
- 标题：`font-size: 16px; font-weight: 600; color: var(--text-primary)`
- 描述：`font-size: 13px; color: var(--text-secondary); margin-top: 8px`
- 按钮样式：
  - `不保存`：`text` 类型按钮，`color: var(--text-secondary)`
  - `取消`：`text` 类型按钮，`color: var(--text-primary)`
  - `保存`：`primary` 类型按钮，`background: var(--primary); color: white`
- 按钮悬停态：
  - 文字按钮：`background: var(--background-secondary)`
  - Primary 按钮：`background: var(--primary-dark); color: white`

#### Toast 通知系统

Toast 是应用内轻量级的状态反馈机制。

**位置**：窗口右下角，状态栏上方

**样式规范**：

| 属性 | 值 |
|------|-----|
| **宽度** | `auto; min-width: 240px; max-width: 400px` |
| **高度** | `auto; padding: 12px 16px` |
| **圆角** | `8px` |
| **阴影** | `0 4px 12px rgba(0,0,0,0.1)` |
| **间距** | 多个 Toast 之间 `gap: 8px`，堆叠显示 |

**Toast 类型**：

| 类型 | 左侧图标 | 背景色（亮色） | 背景色（暗色） |
|------|----------|---------------|---------------|
| **成功** | ✓（绿色） | `#F0FDF4` | `#052E16` |
| **错误** | ✕（红色） | `#FEF2F2` | `#450A0A` |
| **警告** | ⚠（黄色） | `#FFFBEB` | `#422006` |
| **信息** | ℹ（蓝色） | `#EFF6FF` | `#172554` |

- 图标尺寸：`18px × 18px`
- 文字：`font-size: 13px; color: var(--text-primary)`
- 持续时间：
  - 成功/信息：`3s` 自动消失
  - 警告：`5s` 自动消失
  - 错误：不自动消失，需手动关闭（点击 × 按钮）
- 关闭按钮：右侧 `×`，`width: 20px; height: 20px; opacity: 0.5; hover: opacity: 1`

#### 导出状态

| 阶段 | 反馈方式 |
|------|----------|
| **导出中** | 按钮显示 Spinner + "导出中..."；按钮禁用不可点击 |
| **导出成功** | Toast "✓ 导出成功"；触发系统文件管理器打开目标目录 |
| **导出失败** | Toast "✕ 导出失败: {原因}" |

Spinner 样式：
- 使用 SVG 圆形动画
- 尺寸：`16px × 16px`
- 颜色：`var(--primary)`
- 动画：`animation: spin 1s linear infinite`

---

## 5. 亮色/暗色主题设计

### 5.1 CSS 变量命名方案

采用语义化的 CSS 变量命名，不直接暴露具体颜色值：

```css
:root,
[data-theme="light"] {
  /* === 背景色 === */
  --background-primary: #FFFFFF;       /* 主背景：编辑器内容区、弹窗内容 */
  --background-secondary: #F8FAFC;     /* 次要背景：编辑器外层容器、侧边栏标题 */
  --background-tertiary: #F1F5F9;      /* 第三级背景：代码块、悬停态 */
  --background-hover: #E2E8F0;        /* 悬停背景：列表项悬停 */

  /* === 文字色 === */
  --text-primary: #1E293B;             /* 主文字：标题、正文 */
  --text-secondary: #475569;           /* 次要文字：说明文字、描述 */
  --text-tertiary: #94A3B8;            /* 第三级文字：辅助信息、占位符 */
  --text-inverse: #FFFFFF;             /* 反色文字：深色背景上的文字 */

  /* === 边框色 === */
  --border-primary: #E2E8F0;           /* 主边框：组件边框、分割线 */
  --border-secondary: #CBD5E1;         /* 次要边框：内部元素边框 */
  --border-accent: #2563EB;            /* 强调边框：引用块左边框 */

  /* === 主色（Primary） === */
  --primary: #2563EB;                  /* 主色 */
  --primary-hover: #1D4ED8;            /* 主色悬停态 */
  --primary-active: #1E40AF;           /* 主色按下态 */
  --primary-light: rgba(37, 99, 235, 0.08);  /* 主色浅色背景 */
  --primary-text: #FFFFFF;             /* 主色上的文字色 */

  /* === 功能色 === */
  --success: #22C55E;                  /* 成功 */
  --success-light: rgba(34, 197, 94, 0.08);
  --error: #EF4444;                    /* 错误 */
  --error-light: rgba(239, 68, 68, 0.08);
  --warning: #F59E0B;                  /* 警告 */
  --warning-light: rgba(245, 158, 11, 0.08);
  --info: #8B5CF6;                     /* 信息 */
  --info-light: rgba(139, 92, 246, 0.08);

  /* === 阴影 === */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);

  /* === 编辑器专用 === */
  --editor-background: #FFFFFF;        /* 编辑器内容区背景 */
  --editor-surface: #F8FAFC;           /* 编辑器外层表面 */
  --code-background: #F8FAFC;          /* 代码块背景 */
  --code-gutter: #94A3B8;              /* 代码块行号颜色 */
  --blockquote-border: #2563EB;        /* 引用块左边框颜色 */
  --selection: rgba(37, 99, 235, 0.15); /* 文本选中背景色 */
  --link-color: #2563EB;               /* 链接颜色 */
  --link-hover: #1D4ED8;               /* 链接悬停颜色 */
  --mark-background: #FEF08A;          /* 高亮标记背景 */
  --mark-color: #1E293B;               /* 高亮标记文字颜色 */
}

[data-theme="dark"] {
  /* === 背景色 === */
  --background-primary: #1E293B;       /* 主背景 */
  --background-secondary: #0F172A;     /* 次要背景 */
  --background-tertiary: #334155;      /* 第三级背景 */
  --background-hover: #475569;         /* 悬停背景 */

  /* === 文字色 === */
  --text-primary: #F8FAFC;             /* 主文字 */
  --text-secondary: #CBD5E1;           /* 次要文字 */
  --text-tertiary: #64748B;            /* 第三级文字 */
  --text-inverse: #1E293B;             /* 反色文字 */

  /* === 边框色 === */
  --border-primary: #334155;           /* 主边框 */
  --border-secondary: #475569;         /* 次要边框 */
  --border-accent: #3B82F6;            /* 强调边框 */

  /* === 主色（Primary） === */
  --primary: #3B82F6;                  /* 主色（暗色主题稍亮） */
  --primary-hover: #60A5FA;
  --primary-active: #2563EB;
  --primary-light: rgba(59, 130, 246, 0.12);
  --primary-text: #FFFFFF;

  /* === 功能色（暗色适配） === */
  --success: #4ADE80;
  --success-light: rgba(74, 222, 128, 0.1);
  --error: #F87171;
  --error-light: rgba(248, 113, 113, 0.1);
  --warning: #FBBF24;
  --warning-light: rgba(251, 191, 36, 0.1);
  --info: #A78BFA;
  --info-light: rgba(167, 139, 250, 0.1);

  /* === 阴影（暗色更重） === */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.35), 0 4px 6px -4px rgba(0, 0, 0, 0.25);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);

  /* === 编辑器专用 === */
  --editor-background: #1E293B;
  --editor-surface: #0F172A;
  --code-background: #0F172A;
  --code-gutter: #475569;
  --blockquote-border: #3B82F6;
  --selection: rgba(59, 130, 246, 0.2);
  --link-color: #60A5FA;
  --link-hover: #93C5FD;
  --mark-background: rgba(254, 240, 138, 0.25);
  --mark-color: #F8FAFC;
}
```

### 5.2 编辑器内容区域主题对比

#### 亮色主题编辑器

```
  ┌─────────────────────────────────────┐
  │  背景色: #F8FAFC (surface)          │  ← 编辑器外层
  │                                      │
  │   ┌──────────────────────────────┐   │
  │   │  背景色: #FFFFFF (primary)   │   │  ← 编辑器内容区（纸张效果）
  │   │                              │   │
  │   │  # 文档标题                  │   │  ← color: #1E293B, 32px, 700
  │   │                              │   │
  │   │  正文段落文字...              │   │  ← color: #1E293B, 16px, 400
  │   │                              │   │
  │   │  > 引用文字                  │   │  ← border-left: 3px #2563EB
  │   │                              │   │
  │   │  ┌─ javascript ──────────┐   │   │
  │   │  │ 1 │ const x = 1;      │   │   │  ← 背景色: #F8FAFC
  │   │  └───────────────────────┘   │   │
  │   │                              │   │
  │   │  `行内代码`                  │   │  ← 背景色: #F1F5F9
  │   │  [链接文字](url)             │   │  ← color: #2563EB
  │   │  ==高亮文字==                │   │  ← 背景色: #FEF08A
  │   │                              │   │
  │   └──────────────────────────────┘   │
  │                                      │
  └─────────────────────────────────────┘
```

#### 暗色主题编辑器

```
  ┌─────────────────────────────────────┐
  │  背景色: #0F172A (surface)          │  ← 编辑器外层
  │                                      │
  │   ┌──────────────────────────────┐   │
  │   │  背景色: #1E293B (primary)   │   │  ← 编辑器内容区
  │   │                              │   │
  │   │  # 文档标题                  │   │  ← color: #F8FAFC, 32px, 700
  │   │                              │   │
  │   │  正文段落文字...              │   │  ← color: #F8FAFC, 16px, 400
  │   │                              │   │
  │   │  > 引用文字                  │   │  ← border-left: 3px #3B82F6
  │   │                              │   │
  │   │  ┌─ javascript ──────────┐   │   │
  │   │  │ 1 │ const x = 1;      │   │   │  ← 背景色: #0F172A
  │   │  └───────────────────────┘   │   │
  │   │                              │   │
  │   │  `行内代码`                  │   │  ← 背景色: #334155
  │   │  [链接文字](url)             │   │  ← color: #60A5FA
  │   │  ==高亮文字==                │   │  ← 背景色: rgba(254,240,138,0.25)
  │   │                              │   │
  │   └──────────────────────────────┘   │
  │                                      │
  └─────────────────────────────────────┘
```

### 5.3 代码块主题

#### 亮色主题代码块

| 元素 | 颜色 |
|------|------|
| **代码块背景** | `#F8FAFC` |
| **顶部栏背景** | `#F1F5F9` |
| **语言标签** | `#64748B` |
| **行号** | `#94A3B8` |
| **文本** | `#1E293B` |
| **代码高亮** | 使用 Prism.js / Shiki 的亮色主题（如 `one-light` 或 `github-light`） |

#### 暗色主题代码块

| 元素 | 颜色 |
|------|------|
| **代码块背景** | `#0F172A` |
| **顶部栏背景** | `#1E293B` |
| **语言标签** | `#64748B` |
| **行号** | `#475569` |
| **文本** | `#E2E8F0` |
| **代码高亮** | 使用 Prism.js / Shiki 的暗色主题（如 `one-dark` 或 `github-dark`） |

### 5.4 各组件主题样式差异汇总

| 组件 | 亮色关键差异 | 暗色关键差异 |
|------|-------------|-------------|
| **标题栏** | bg: `#FFFFFF` | bg: `#1E293B` |
| **标签栏** | 活动 tab 下划线 `#2563EB` | 活动 tab 下划线 `#3B82F6` |
| **标签栏** | 非 activity tab 文字 `#64748B` | 非 activity tab 文字 `#94A3B8` |
| **侧边栏** | bg: `#FFFFFF`, border: `#E2E8F0` | bg: `#1E293B`, border: `#334155` |
| **大纲面板** | 当前项 bg: `rgba(37,99,235,0.08)` | 当前项 bg: `rgba(59,130,246,0.12)` |
| **搜索结果** | 匹配高亮 bg: `rgba(245,158,11,0.3)` | 匹配高亮 bg: `rgba(251,191,36,0.3)` |
| **状态栏** | 文字 `#94A3B8` | 文字 `#64748B` |
| **设置弹窗** | 左导航 bg: `#F8FAFC` | 左导航 bg: `#0F172A` |
| **开关 OFF** | 轨道 `#CBD5E1` | 轨道 `#475569` |
| **开关 ON** | 轨道 `#2563EB` | 轨道 `#3B82F6` |
| **Bubble Menu** | bg: `#FFFFFF`, shadow 较浅 | bg: `#1E293B`, shadow 较深 |
| **Slash Command** | bg: `#FFFFFF`, shadow 较浅 | bg: `#1E293B`, shadow 较深 |
| **右键菜单** | bg: `#FFFFFF`, border: `#E2E8F0` | bg: `#1E293B`, border: `#334155` |
| **Toast 成功** | bg: `#F0FDF4` | bg: `#052E16` |
| **Toast 错误** | bg: `#FEF2F2` | bg: `#450A0A` |
| **滚动条** | thumb: `#CBD5E1` | thumb: `#475569` |
| **选中文字** | bg: `rgba(37,99,235,0.15)` | bg: `rgba(59,130,246,0.2)` |

---

## 6. 响应式/窗口尺寸适配

### 6.1 窗口尺寸约束

| 属性 | 值 | 说明 |
|------|-----|------|
| **最小宽度** | `800px` | 低于此宽度时内容不可用 |
| **最小高度** | `600px` | 低于此高度时内容不可用 |
| **默认宽度** | `1024px` | 首次启动时的窗口宽度 |
| **默认高度** | `768px` | 首次启动时的窗口高度 |
| **最大宽度** | 无限制 | 不设上限，由用户屏幕决定 |

> **Tauri 配置**：在 `tauri.conf.json` 中设置 `minWidth: 800, minHeight: 600`。

### 6.2 窗口缩小时的行为

#### 侧边栏自动隐藏

| 窗口宽度 | 侧边栏行为 |
|----------|-----------|
| `≥ 960px` | 正常显示（如果用户打开了侧边栏） |
| `800px ~ 960px` | 侧边栏自动收起（即使之前是展开状态） |
| `800px` | 到达最小宽度，不可继续缩小 |

- 侧边栏自动收起时，不改变用户的"侧边栏开关"偏好设置
- 窗口恢复到 `≥ 960px` 时，如果用户之前打开了侧边栏，自动重新展开

#### 编辑区域自适应

| 窗口宽度 | 编辑区域行为 |
|----------|-------------|
| `≥ 960px` | 内容居中，`max-width: 800px`，两侧留白 |
| `800px ~ 960px` | 内容 `max-width` 自动缩小到 `window.width - 64px`，保持两侧各 `32px` 最小边距 |
| `800px` | 内容宽度 `736px`（800 - 64），两侧 `32px` 边距 |

```css
/* 编辑区域自适应逻辑 */
.editor-content {
  max-width: min(800px, calc(100vw - 64px));
  margin: 0 auto;
  padding: 48px 32px;
}
```

#### 标签栏溢出处理

| 标签栏宽度状态 | 行为 |
|---------------|------|
| 标签总宽度 ≤ 可用宽度 | 正常显示，无滚动控件 |
| 标签总宽度 > 可用宽度 | 显示左右滚动箭头，新建按钮（+）始终可见 |

- 滚动箭头仅在溢出时显示
- 箭头宽度各 `28px`，从标签栏可用宽度中扣除
- 标签最小宽度从 `100px` 缩小到 `80px`（溢出时）
- 标签文字溢出时截断并显示省略号

#### 状态栏自适应

| 窗口宽度 | 状态栏行为 |
|----------|-----------|
| `≥ 960px` | 完整显示所有信息 |
| `800px ~ 960px` | 隐藏光标位置（行/列），仅显示字数和文件类型 |

```css
/* 状态栏自适应 */
@media (max-width: 960px) {
  .statusbar-cursor {
    display: none;
  }
}
```

### 6.3 编辑器内容区域排版适配

窄窗口下编辑器的排版调整：

| 元素 | 正常（≥ 960px） | 窄窗口（800 ~ 960px） |
|------|-----------------|---------------------|
| **内容水平内边距** | `padding: 0 64px` | `padding: 0 32px` |
| **代码块** | 正常显示 | 正常显示，可水平滚动 |
| **表格** | 正常显示 | 容器可水平滚动，不挤压内容 |
| **图片** | `max-width: 100%` | `max-width: 100%`（自动缩小） |
| **引用块** | `padding: 8px 16px` | `padding: 8px 12px` |
| **列表缩进** | `padding-left: 24px` | `padding-left: 20px` |

#### Bubble Menu 和 Slash Command 窗口边界适配

| 组件 | 边界适配规则 |
|------|-------------|
| **Bubble Menu** | 如果上方空间不足，改为向下弹出；如果左右超出窗口，水平偏移使面板保持在窗口内 |
| **Slash Command** | 如果下方空间不足，面板向上弹出（光标上方）；如果左右超出，水平偏移 |
| **右键菜单** | 始终保持在窗口可见区域内，必要时调整弹出方向 |
| **命令面板** | 居中显示，已通过 `max-width: 80vw` 限制宽度 |

### 6.4 高分辨率屏幕适配

| 平台 | 适配策略 |
|------|----------|
| **macOS Retina** | Tauri WebView 自动处理 devicePixelRatio，无需特殊处理 |
| **Windows HiDPI** | Tauri 自动处理 DPI 缩放 |
| **Linux HiDPI** | 遵循系统 GDK_SCALE 设置；WebView 自动适配 |

- 图标使用 SVG 格式，天然支持任意分辨率
- 字体使用 `rem` 或 `px` 单位，系统 DPI 缩放时自动调整
- 不使用固定像素的位图资源

---

## 附录：设计 Token 速查表

### 颜色 Token

| Token 名称 | 亮色值 | 暗色值 | 用途 |
|-----------|--------|--------|------|
| `--background-primary` | `#FFFFFF` | `#1E293B` | 主背景 |
| `--background-secondary` | `#F8FAFC` | `#0F172A` | 次要背景 |
| `--background-tertiary` | `#F1F5F9` | `#334155` | 第三级背景 |
| `--background-hover` | `#E2E8F0` | `#475569` | 悬停背景 |
| `--text-primary` | `#1E293B` | `#F8FAFC` | 主文字 |
| `--text-secondary` | `#475569` | `#CBD5E1` | 次要文字 |
| `--text-tertiary` | `#94A3B8` | `#64748B` | 辅助文字 |
| `--border-primary` | `#E2E8F0` | `#334155` | 主边框 |
| `--border-secondary` | `#CBD5E1` | `#475569` | 次要边框 |
| `--primary` | `#2563EB` | `#3B82F6` | 主色 |
| `--primary-hover` | `#1D4ED8` | `#60A5FA` | 主色悬停 |
| `--primary-light` | `rgba(37,99,235,0.08)` | `rgba(59,130,246,0.12)` | 主色浅色 |
| `--success` | `#22C55E` | `#4ADE80` | 成功 |
| `--error` | `#EF4444` | `#F87171` | 错误 |
| `--warning` | `#F59E0B` | `#FBBF24` | 警告 |
| `--info` | `#8B5CF6` | `#A78BFA` | 信息 |

### 间距 Token

| Token 名称 | 值 | Tailwind CSS | 用途 |
|-----------|-----|-------------|------|
| `space-xs` | `4px` | `p-1 / m-1` | 最小间距 |
| `space-sm` | `8px` | `p-2 / m-2` | 小间距 |
| `space-md` | `12px` | `p-3 / m-3` | 中间距 |
| `space-lg` | `16px` | `p-4 / m-4` | 大间距 |
| `space-xl` | `24px` | `p-6 / m-6` | 超大间距 |
| `space-2xl` | `32px` | `p-8 / m-8` | 二级超大间距 |
| `space-3xl` | `48px` | `p-12 / m-12` | 三级超大间距 |

### 圆角 Token

| Token 名称 | 值 | Tailwind CSS | 用途 |
|-----------|-----|-------------|------|
| `radius-sm` | `4px` | `rounded` | 输入框、小按钮 |
| `radius-md` | `6px` | `rounded-md` | 按钮、标签 |
| `radius-lg` | `8px` | `rounded-lg` | 卡片、面板 |
| `radius-xl` | `10px` | `rounded-[10px]` | 浮动面板 |
| `radius-2xl` | `12px` | `rounded-xl` | 模态弹窗 |
| `radius-full` | `9999px` | `rounded-full` | 头像、药丸形开关 |

### 字号 Token

| Token 名称 | 值 | Tailwind CSS | 用途 |
|-----------|-----|-------------|------|
| `text-xs` | `12px` | `text-xs` | 辅助文字、标签 |
| `text-sm` | `13px` | `text-[13px]` | 标签栏、侧边栏 |
| `text-base` | `14px` | `text-sm` | 行内代码 |
| `text-md` | `16px` | `text-base` | 正文、编辑器默认字号 |
| `text-lg` | `18px` | `text-lg` | 小标题（H4） |
| `text-xl` | `20px` | `text-xl` | H3 |
| `text-2xl` | `24px` | `text-2xl` | H2 |
| `text-3xl` | `28px` | `text-[28px]` | 设置弹窗标题 |
| `text-4xl` | `32px` | `text-4xl` | H1 |

---

> **文档版本**: v1.0
> **最后更新**: 2026-03-27
> **下一步**: 将此设计规范传递给开发团队，作为前端实现的唯一设计参考。组件开发时严格按照此规范中的尺寸、颜色、间距、动效参数实现。

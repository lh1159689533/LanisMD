# LanisMD 主题系统现状分析与升级方案

> 本文档用于指导 AI 实现 LanisMD 主题系统升级，使其达到或超过 Typora 的主题定制能力。

---

## 〇、调研结论摘要

### 当前主题系统的主要问题

经过对 Typora 主题方案的深入调研和与当前项目的对比分析，发现以下关键差距：

| 问题类别 | 详细描述 | 严重程度 |
|---------|---------|---------|
| **仅支持颜色类变量** | 当前主题系统主要集中在颜色相关的变量定义，无法改变整体风格 | ⚠️ 高 |
| **文件树不支持连线** | 缺少树形连线功能（Typora 主题常见特性），无法通过 CSS 伪元素实现 | ⚠️ 高 |
| **大纲样式固定** | 大纲缩进使用硬编码的 `marginLeft`，无法自定义连线或层级标记 | ⚠️ 高 |
| **字体系统不完整** | 只有 `--lanismd-font-mono`，缺少正文、标题、UI 字体的独立变量 | ⚠️ 中 |
| **设置弹窗样式固定** | 设置弹窗使用硬编码样式，无法通过主题自定义 | ⚠️ 中 |
| **不支持自定义 CSS/字体加载** | 无法像 Typora 那样加载用户自定义主题文件 | ⚠️ 高 |

### 与 Typora 主题能力对比

| 功能 | Typora 支持 | LanisMD 当前支持 | 差距分析 |
|------|-------------|-----------------|---------|
| 文件树连线 | ✅ `::before`/`::after` 伪元素 | ❌ 不支持 | 需要组件改造 + CSS 变量 |
| 大纲连线/标记 | ✅ `.outline-expander` 等 | ❌ 不支持 | 需要组件重构 |
| 自定义字体 | ✅ `@font-face` + CSS 变量 | ⚠️ 仅部分支持 | 需要完善字体变量体系 |
| 侧边栏整体风格 | ✅ 圆角、阴影、边框样式 | ⚠️ 部分支持 | 需要扩展变量 |
| 设置弹窗样式 | ✅ 完全可定制 | ❌ 硬编码样式 | 需要变量化 |
| 图标样式 | ✅ mask-image 自定义图标 | ❌ 固定 React Icons | 需要架构改造 |

### 实现优先级与先决条件

> ⚠️ **重要说明**：以下功能需要**先完成组件改造**，才能通过主题 CSS 变量实现自定义。

| 先决条件 | 说明 | 优先级 |
|---------|------|-------|
| **文件树组件改造** | 需要添加 CSS 类和属性支持连线伪元素 | P0 |
| **大纲组件重构** | 需要将硬编码样式改为 CSS 变量驱动 | P0 |
| **设置弹窗变量化** | 需要将硬编码样式提取为 CSS 变量 | P1 |
| **主题加载服务** | 需要实现 `theme-loader.ts` 支持加载用户 CSS | P1 |
| **自定义字体加载** | 需要支持 `@font-face` 和字体文件加载 | P2 |
| **图标系统改造** | 如需支持自定义图标，需要改造图标系统 | P3 |

---

## 一、项目概述

LanisMD 是一个基于 Tauri + React + Milkdown 的现代 Markdown 编辑器。

### 技术栈
- **框架**: Tauri (Rust) + React 18 + TypeScript
- **编辑器**: Milkdown (基于 ProseMirror)
- **代码编辑**: CodeMirror 6
- **样式**: CSS + Tailwind CSS
- **状态管理**: Zustand

### 目录结构
```
src/
├── styles/
│   ├── variables.css          # 设计 Token（与主题无关）
│   ├── globals.css             # 全局基础样式
│   ├── print.css               # 打印样式
│   ├── themes/
│   │   ├── index.css           # 主题入口
│   │   ├── light.css           # 浅色主题
│   │   ├── dark.css            # 深色主题
│   │   ├── sepia.css           # 护眼主题
│   │   └── nord.css            # Nord 主题
│   └── editor/
│       ├── index.css           # 编辑器样式入口
│       ├── base.css            # 基础样式
│       ├── typography.css      # 排版样式
│       ├── code-block.css      # 代码块
│       ├── blockquote.css      # 引用块
│       ├── list.css            # 列表
│       ├── table.css           # 表格
│       ├── table-handle.css    # 表格操作
│       ├── source-editor.css   # 源码模式
│       ├── slash-menu.css      # 斜杠菜单
│       ├── tooltip.css         # 浮动工具栏
│       ├── dialog.css          # 对话框
│       └── ... (其他 25 个 CSS 文件)
├── hooks/
│   └── useTheme.ts             # 主题切换 Hook
├── stores/
│   └── settings-store.ts       # 设置状态管理
└── types/
    └── config.ts               # 配置类型定义
```

---

## 二、当前 CSS 加载顺序

在 `src/main.tsx` 中：
```typescript
import './styles/variables.css';   // 1. 设计 Token
import './styles/themes/index.css'; // 2. 主题变量
import './styles/globals.css';      // 3. 全局样式
import './styles/print.css';        // 4. 打印样式
```

编辑器样式通过组件单独导入 `src/styles/editor/index.css`。

---

## 三、当前 CSS 变量体系

### 3.1 设计 Token (`variables.css`)

这些是与主题无关的固定值：

```css
:root {
  /* Border Radius */
  --lanismd-radius-sm: 4px;
  --lanismd-radius-md: 6px;
  --lanismd-radius-lg: 8px;
  --lanismd-radius-xl: 12px;

  /* Transitions */
  --lanismd-transition-fast: 0.12s ease;
  --lanismd-transition-normal: 0.15s ease;
  --lanismd-transition-medium: 0.2s ease;
  --lanismd-transition-slow: 0.3s ease;

  /* Spacing */
  --lanismd-spacing-xs: 2px;
  --lanismd-spacing-sm: 4px;
  --lanismd-spacing-md: 8px;
  --lanismd-spacing-lg: 12px;
  --lanismd-spacing-xl: 16px;
  --lanismd-spacing-2xl: 20px;
  --lanismd-spacing-3xl: 24px;

  /* Font Sizes */
  --lanismd-font-size-xs: 11px;
  --lanismd-font-size-sm: 12px;
  --lanismd-font-size-base: 13px;
  --lanismd-font-size-md: 14px;
  --lanismd-font-size-lg: 15px;

  /* Font Family */
  --lanismd-font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;

  /* Layout */
  --lanismd-editor-max-width: 800px;
}
```

### 3.2 主题变量（以 `light.css` 为例）

当前主题变量分为 3 大类：

```css
:root,
.light,
.theme-light {
  /* ===== 1. 应用 UI ===== */
  
  /* Editor Area */
  --lanismd-editor-bg: #ffffff;
  --lanismd-editor-text: #1e293b;
  --lanismd-editor-border: #e2e8f0;
  
  /* Sidebar */
  --lanismd-sidebar-bg: #f8fafc;
  --lanismd-sidebar-text: #475569;
  --lanismd-sidebar-border: #e2e8f0;
  --lanismd-sidebar-hover: rgba(0, 0, 0, 0.04);
  --lanismd-sidebar-active: rgba(37, 99, 235, 0.08);
  
  /* Titlebar */
  --lanismd-titlebar-bg: #f8fafc;
  --lanismd-titlebar-text: #1e293b;
  
  /* Accent */
  --lanismd-accent: #2563eb;
  --lanismd-accent-hover: #1d4ed8;
  --lanismd-accent-light: rgba(37, 99, 235, 0.1);
  --lanismd-accent-contrast: #ffffff;
  
  /* Status Colors */
  --lanismd-success: #22c55e;
  --lanismd-warning: #f59e0b;
  --lanismd-danger: #ef4444;
  
  /* Interactive */
  --lanismd-hover-bg: rgba(37, 99, 235, 0.08);
  --lanismd-selected-bg: rgba(37, 99, 235, 0.06);
  --lanismd-focus-ring: rgba(37, 99, 235, 0.4);
  
  /* Shadows */
  --lanismd-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --lanismd-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.1);
  --lanismd-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);
  
  /* Scrollbar */
  --lanismd-scrollbar-thumb: #94a3b8;
  --lanismd-scrollbar-thumb-hover: #64748b;
  
  /* Handle */
  --lanismd-handle-color: #94a3b8;
  
  /* ===== 2. 编辑器内容 ===== */
  
  /* Typography */
  --lanismd-heading-color: #0f172a;
  --lanismd-text-muted: #64748b;
  --lanismd-link-color: var(--lanismd-accent);
  --lanismd-link-hover: var(--lanismd-accent-hover);
  
  /* Inline Code */
  --lanismd-inline-code-bg: rgba(0, 0, 0, 0.06);
  --lanismd-inline-code-text: var(--lanismd-accent);
  
  /* Blockquote */
  --lanismd-blockquote-border: var(--lanismd-accent);
  --lanismd-blockquote-bg: transparent;
  --lanismd-blockquote-text: var(--lanismd-sidebar-text);
  
  /* Table */
  --lanismd-table-header-bg: var(--lanismd-sidebar-bg);
  --lanismd-table-border: var(--lanismd-editor-border);
  --lanismd-table-row-hover: rgba(0, 0, 0, 0.02);
  
  /* Horizontal Rule */
  --lanismd-hr-color: var(--lanismd-editor-border);
  
  /* Selection */
  --lanismd-selection-bg: rgba(37, 99, 235, 0.2);
  --lanismd-selection-text: inherit;
  
  /* ===== 3. 代码块 ===== */
  
  /* Code Block Container */
  --lanismd-code-bg: #f6f8fa;
  --lanismd-code-toolbar-bg: #f0f2f5;
  
  /* CodeMirror Editor */
  --lanismd-cm-bg: #f6f8fa;
  --lanismd-cm-text: #24292e;
  --lanismd-cm-gutter-bg: #f6f8fa;
  --lanismd-cm-gutter-text: #6e7781;
  --lanismd-cm-line-active: rgba(37, 99, 235, 0.04);
  --lanismd-cm-gutter-active: rgba(37, 99, 235, 0.06);
  --lanismd-cm-cursor: #24292e;
  --lanismd-cm-selection: rgba(37, 99, 235, 0.15);
  --lanismd-cm-bracket-match: rgba(37, 99, 235, 0.2);
  --lanismd-cm-bracket-outline: rgba(37, 99, 235, 0.3);
  
  /* Syntax Highlighting */
  --lanismd-syntax-keyword: #d73a49;
  --lanismd-syntax-comment: #6a737d;
  --lanismd-syntax-string: #032f62;
  --lanismd-syntax-number: #005cc5;
  --lanismd-syntax-variable: #24292e;
  --lanismd-syntax-function: #6f42c1;
  --lanismd-syntax-type: #22863a;
  --lanismd-syntax-class: #6f42c1;
  --lanismd-syntax-property: #005cc5;
  --lanismd-syntax-operator: #d73a49;
  --lanismd-syntax-punctuation: #24292e;
  --lanismd-syntax-bool: #005cc5;
  --lanismd-syntax-regexp: #032f62;
  --lanismd-syntax-tag: #22863a;
  --lanismd-syntax-attr-name: #6f42c1;
  --lanismd-syntax-attr-value: #032f62;
  --lanismd-syntax-meta: #6a737d;
  --lanismd-syntax-definition: #e36209;
}
```

### 3.3 当前变量统计

| 类别 | 变量数量 |
|------|---------|
| 设计 Token | ~20 |
| 应用 UI | ~20 |
| 编辑器内容 | ~15 |
| 代码块/语法高亮 | ~30 |
| **总计** | **~85** |

---

## 四、当前编辑器样式实现

### 4.1 CSS 选择器命名规范

当前使用的选择器前缀：
```css
/* Milkdown 编辑器根 */
.milkdown-editor-root .ProseMirror { ... }

/* 代码块组件 */
.milkdown-editor-root .ProseMirror [data-type='code_block'] { ... }
.milkdown-editor-root .ProseMirror code-block { ... }

/* 源码编辑器 */
.source-editor-root .cm-editor { ... }

/* Milkdown 组件 */
.milkdown-slash { ... }
.milkdown-tooltip { ... }
```

### 4.2 标题样式 (`typography.css`)

**当前实现**：所有标题使用统一变量 `--lanismd-heading-color`

```css
.milkdown-editor-root .ProseMirror h1,
.milkdown-editor-root .ProseMirror h2,
.milkdown-editor-root .ProseMirror h3,
.milkdown-editor-root .ProseMirror h4,
.milkdown-editor-root .ProseMirror h5,
.milkdown-editor-root .ProseMirror h6 {
  color: var(--lanismd-heading-color);
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}

.milkdown-editor-root .ProseMirror h1 {
  font-size: 1.875rem;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--lanismd-hr-color);
}

.milkdown-editor-root .ProseMirror h2 {
  font-size: 1.5rem;
  padding-bottom: 0.25em;
  border-bottom: 1px solid var(--lanismd-hr-color);
}
```

**缺失能力**：
- 无法单独设置每级标题的颜色
- 无法使用渐变色
- 无法自定义前缀装饰
- 无法设置背景色

### 4.3 引用块样式 (`blockquote.css`)

**当前实现**：只有单一样式

```css
.milkdown-editor-root .ProseMirror blockquote {
  border-left: 4px solid var(--lanismd-blockquote-border);
  padding-left: var(--lanismd-spacing-xl);
  margin: 1em 0;
  color: var(--lanismd-blockquote-text);
  font-style: italic;
  background: var(--lanismd-blockquote-bg);
}
```

**缺失能力**：
- 不支持分级引用样式（`>`、`>>`、`>>>`）
- 不支持圆角边框
- 不支持右侧边框装饰

### 4.4 列表样式 (`list.css`)

**当前实现**：

```css
.milkdown-editor-root .ProseMirror ul {
  list-style-type: disc;
  padding-left: 1.75em;
  margin: 0.5em 0;
}

/* 任务列表 */
.milkdown-editor-root .ProseMirror input[type='checkbox'] {
  accent-color: var(--lanismd-accent);
  cursor: pointer;
  width: 16px;
  height: 16px;
}
```

**缺失能力**：
- 无法自定义列表标记颜色
- 无法自定义标记图标/形状
- 任务列表复选框样式有限

### 4.5 代码块样式 (`code-block.css`)

**当前实现**：完整的工具栏 + CodeMirror 样式

```css
/* 容器 */
.milkdown-editor-root .ProseMirror code-block {
  border-radius: var(--lanismd-radius-lg);
  border: 1px solid var(--lanismd-editor-border);
  background: var(--lanismd-code-bg);
}

/* 工具栏 */
.milkdown-editor-root .tools {
  background: var(--lanismd-code-toolbar-bg);
  border-bottom: 1px solid var(--lanismd-editor-border);
  min-height: 36px;
}
```

**缺失能力**：
- 不支持 macOS 窗口装饰（红黄绿圆点）
- 不支持 Windows 窗口装饰

### 4.6 源码模式样式 (`source-editor.css`)

**当前实现**：

```css
.source-editor-root .cm-editor {
  height: 100%;
  min-height: calc(100vh - 200px);
}

.source-editor-root .cm-header {
  font-weight: 600;
  color: var(--lanismd-heading-color);
}

.source-editor-root .cm-header-1 {
  font-size: 1.5em;
}
```

**现状**：基本支持主题一致性

---

## 五、主题切换机制

### 5.1 `useTheme.ts` 实现

```typescript
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import type { ThemeMode } from '@/types';

const THEME_CLASS_MAP: Record<Exclude<ThemeMode, 'system'>, string[]> = {
  light: ['theme-light'],
  dark: ['theme-dark', 'dark'],      // 保留 dark class 兼容 Tailwind
  sepia: ['theme-sepia'],
  nord: ['theme-nord', 'dark'],      // Nord 是深色主题
};

const ALL_THEME_CLASSES = ['light', 'dark', 'theme-light', 'theme-dark', 'theme-sepia', 'theme-nord'];

export function useTheme() {
  const { config } = useSettingsStore();

  useEffect(() => {
    const applyTheme = (theme: Exclude<ThemeMode, 'system'>) => {
      const root = document.documentElement;
      
      // 移除所有主题类
      ALL_THEME_CLASSES.forEach(cls => root.classList.remove(cls));
      
      // 添加新主题类
      const classes = THEME_CLASS_MAP[theme];
      classes.forEach(cls => root.classList.add(cls));
    };

    if (config.theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(isDark ? 'dark' : 'light');

      const handler = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? 'dark' : 'light');
      };
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      applyTheme(config.theme);
    }
  }, [config.theme]);
}
```

### 5.2 类型定义 (`config.ts`)

```typescript
export type ThemeMode = 'light' | 'dark' | 'sepia' | 'nord' | 'system';

export interface ThemeInfo {
  id: ThemeMode;
  name: string;
  description: string;
  isDark: boolean;
}

export const THEME_LIST: ThemeInfo[] = [
  { id: 'light', name: 'Light', description: '清爽浅色主题', isDark: false },
  { id: 'dark', name: 'Dark', description: 'Tokyo Night 深色主题', isDark: true },
  { id: 'sepia', name: 'Sepia', description: '护眼复古主题', isDark: false },
  { id: 'nord', name: 'Nord', description: 'Nord 极地风格', isDark: true },
  { id: 'system', name: 'System', description: '跟随系统设置', isDark: false },
];
```

---

## 六、升级目标

### 6.1 参照 Typora 主题能力

Typora 主题支持的样式（基于用户截图）：

| 样式特性 | 示例 | LanisMD 现状 | 实现依赖 |
|---------|-----|-------------|---------|
| 标题渐变色 | 粉色渐变文字 | ❌ 不支持 | CSS 变量扩展 |
| 列表标记定制 | 粉色圆点 | ❌ 不支持 | CSS 变量扩展 |
| 分级引用 | 不同颜色背景 | ❌ 不支持 | Blockquote 插件 + CSS |
| 代码块装饰 | 模拟终端窗口 | ❌ 不支持 | CSS 变量扩展 |
| 引用装饰 | 圆角背景 | ⚠️ 部分 | CSS 变量扩展 |
| **文件树连线** | 层级连接线 | ❌ 不支持 | **组件改造 + CSS** |
| **大纲连线/标记** | 与文件树风格一致 | ❌ 不支持 | **组件改造 + CSS** |
| **自定义字体** | 任意字体 | ⚠️ 部分 | **字体加载服务** |

### 6.2 升级要求

1. **定制方式**：纯 CSS 文件，用户通过编写 CSS 定制主题
2. **覆盖范围**：全量覆盖所有可定制样式
3. **优先级**：自建系统优先，Typora 兼容可后续考虑

### 6.3 功能层级划分

```
┌─────────────────────────────────────────────────────────────┐
│                    主题自定义能力                            │
├─────────────────────────────────────────────────────────────┤
│  Level 1: 颜色自定义                                        │
│  └── 仅改变颜色（背景色、字体色、边框色）                     │
│  └── 当前已基本支持 ✅                                       │
├─────────────────────────────────────────────────────────────┤
│  Level 2: 样式自定义                                        │
│  └── 改变元素样式（圆角、阴影、边框、间距）                   │
│  └── 需要扩展 CSS 变量 ⚠️                                    │
├─────────────────────────────────────────────────────────────┤
│  Level 3: 结构自定义                                        │
│  └── 添加装饰元素（连线、前缀图标、伪元素）                   │
│  └── 需要组件改造 ❌                                         │
├─────────────────────────────────────────────────────────────┤
│  Level 4: 资源自定义                                        │
│  └── 加载外部资源（字体、图标、图片）                        │
│  └── 需要加载服务 ❌                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、升级方案

### 7.0 先决条件（组件层改造）

> ⚠️ 以下组件改造是实现完整主题自定义能力的**先决条件**，需要在 CSS 变量扩展之前完成。

#### 7.0.1 文件树组件改造 (`FileTree.tsx`)

**当前问题**：
- 缩进使用固定的 `paddingLeft` 计算
- 无法通过 CSS 伪元素添加连线
- 图标使用固定的 React Icons

**改造要求**：
```tsx
// 改造前
<div style={{ paddingLeft: depth * 16 }}>...</div>

// 改造后
<div 
  className="file-tree-node"
  data-depth={depth}
  style={{ '--tree-depth': depth }}
>
  <div className="file-tree-indent" /> {/* 用于连线 */}
  <div className="file-tree-content">...</div>
</div>
```

**CSS 支持**：
```css
/* 主题可通过以下方式添加连线 */
.file-tree-node::before {
  content: '';
  position: absolute;
  left: calc(var(--tree-depth) * var(--lanismd-file-tree-indent) + 8px);
  top: 0;
  bottom: 0;
  width: var(--lanismd-file-tree-line-width);
  background: var(--lanismd-file-tree-line-color);
  display: var(--lanismd-file-tree-line-display, none);
}
```

#### 7.0.2 大纲组件改造 (`Sidebar.tsx` 中的 TOC 部分)

**当前问题**：
```tsx
// 硬编码的缩进
<div style={{ marginLeft: depth > 0 ? 12 : 0 }}>
```

**改造要求**：
```tsx
// 改造后
<div 
  className="outline-item"
  data-level={heading.level}
  style={{ '--outline-depth': depth }}
>
  <span className="outline-expander" /> {/* 展开器/标记 */}
  <span className="outline-label">{heading.text}</span>
</div>
```

#### 7.0.3 设置弹窗变量化 (`SettingsDialog.tsx`)

**当前问题**：
- 弹窗尺寸、圆角、阴影等样式硬编码

**改造要求**：
- 将样式属性提取为 CSS 变量
- 支持主题自定义弹窗外观

#### 7.0.4 主题加载服务 (`theme-loader.ts`)

**需要实现**：
```typescript
// src/services/theme-loader.ts
export interface ThemeLoaderService {
  // 加载用户自定义 CSS
  loadUserCSS(path: string): Promise<void>;
  
  // 加载自定义字体
  loadCustomFont(fontFace: FontFaceDescriptor): Promise<void>;
  
  // 监听主题文件变化（热重载）
  watchThemeFiles(paths: string[]): void;
  
  // 卸载主题
  unloadTheme(themeId: string): void;
}
```

**用户主题文件位置**：
```
~/.lanismd/themes/
├── base.user.css                     # 全局自定义（所有主题生效）
├── light.user.css                    # light 主题自定义
├── my-custom-theme/                  # 自定义主题目录
│   ├── theme.css                     # 主题主文件
│   ├── fonts/                        # 自定义字体
│   │   └── MyFont.woff2
│   └── theme.json                    # 主题元数据
```

---

### 7.1 新增 CSS 变量（完整清单）

#### 标题 H1-H6 独立变量
```css
:root {
  /* H1 */
  --lanismd-h1-color: #0f172a;
  --lanismd-h1-font-size: 1.875rem;
  --lanismd-h1-font-weight: 700;
  --lanismd-h1-line-height: 1.2;
  --lanismd-h1-margin-top: 1.5em;
  --lanismd-h1-margin-bottom: 0.5em;
  --lanismd-h1-padding-bottom: 0.3em;
  --lanismd-h1-border-bottom: 1px solid var(--lanismd-hr-color);
  --lanismd-h1-background: transparent;
  --lanismd-h1-text-decoration: none;
  --lanismd-h1-prefix-content: none;    /* 前缀装饰 */
  --lanismd-h1-prefix-color: inherit;
  
  /* H2-H6 同理... */
}
```

#### 文件树增强变量（需要组件改造支持）

> ⚠️ **先决条件**：需要先完成 `FileTree.tsx` 组件改造，添加必要的 CSS 类和属性。

```css
:root {
  /* ===== 文件树连线 ===== */
  --lanismd-file-tree-line-display: none;       /* none | block */
  --lanismd-file-tree-line-style: solid;        /* solid | dashed | dotted */
  --lanismd-file-tree-line-color: #d0d0d0;
  --lanismd-file-tree-line-width: 1px;
  --lanismd-file-tree-line-indent: 8px;         /* 连线距左侧距离 */
  
  /* ===== 文件树节点 ===== */
  --lanismd-file-tree-node-height: 28px;
  --lanismd-file-tree-node-padding: 4px 8px;
  --lanismd-file-tree-node-border-radius: 4px;
  --lanismd-file-tree-indent: 16px;             /* 每级缩进 */
  --lanismd-file-tree-active-border-left: none; /* 如 3px solid var(--lanismd-accent) */
  
  /* ===== 图标 ===== */
  --lanismd-file-tree-icon-color: #64748b;
  --lanismd-file-tree-icon-size: 16px;
  /* 以下需要图标系统改造支持 */
  /* --lanismd-file-tree-folder-icon: url(...); */
  /* --lanismd-file-tree-file-icon: url(...); */
}
```

#### 大纲增强变量（需要组件改造支持）

> ⚠️ **先决条件**：需要先完成 `Sidebar.tsx` 大纲部分组件改造，将硬编码样式改为 CSS 变量驱动。

```css
:root {
  /* ===== 大纲连线 ===== */
  --lanismd-outline-line-display: none;         /* none | block */
  --lanismd-outline-line-style: solid;          /* solid | dashed */
  --lanismd-outline-line-color: #e0e0e0;
  --lanismd-outline-line-width: 1px;
  
  /* ===== 展开器/标记 ===== */
  --lanismd-outline-expander-display: none;     /* none | inline */
  --lanismd-outline-expander-content: '›';      /* 展开器符号 */
  --lanismd-outline-expander-color: #666;
  --lanismd-outline-expander-size: 12px;
  
  /* ===== 大纲层级 ===== */
  --lanismd-outline-indent: 12px;               /* 每级缩进 */
  --lanismd-outline-l1-font-size: 14px;
  --lanismd-outline-l2-font-size: 13px;
  --lanismd-outline-l3-font-size: 12px;
  --lanismd-outline-l1-font-weight: 600;
  --lanismd-outline-l2-font-weight: 500;
  --lanismd-outline-l3-font-weight: 400;
  
  /* ===== 基础样式 ===== */
  --lanismd-outline-text: #475569;
  --lanismd-outline-hover-bg: rgba(0, 0, 0, 0.04);
  --lanismd-outline-active-bg: rgba(37, 99, 235, 0.08);
  --lanismd-outline-active-text: #2563eb;
  --lanismd-outline-marker-color: #94a3b8;
}
```

#### 字体系统增强（需要字体加载服务支持）

> ⚠️ **先决条件**：需要实现 `theme-loader.ts` 支持加载自定义字体文件。

```css
:root {
  /* ===== 字体族 ===== */
  --lanismd-font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
  --lanismd-font-serif: 'Georgia', 'Times New Roman', serif;
  --lanismd-font-heading: var(--lanismd-font-sans);
  --lanismd-font-body: var(--lanismd-font-sans);
  --lanismd-font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --lanismd-font-ui: var(--lanismd-font-sans);
  
  /* ===== 编辑器字体 ===== */
  --lanismd-editor-font-family: var(--lanismd-font-body);
  --lanismd-editor-font-size: 16px;
  --lanismd-editor-line-height: 1.75;
  
  /* ===== 自定义字体加载 ===== */
  /* 主题可通过 @font-face 定义自定义字体 */
  /* 需要 theme-loader.ts 支持 */
}

/* 示例：自定义字体主题 */
/*
@font-face {
  font-family: 'MyCustomFont';
  src: url('~/.lanismd/themes/my-theme/fonts/MyFont.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
}

.theme-my-custom {
  --lanismd-font-body: 'MyCustomFont', sans-serif;
}
*/
```

#### 设置弹窗变量化（需要组件改造支持）

> ⚠️ **先决条件**：需要先完成 `SettingsDialog.tsx` 组件改造，将硬编码样式提取为 CSS 变量。

```css
:root {
  /* ===== 弹窗/对话框 ===== */
  --lanismd-dialog-width: 60%;
  --lanismd-dialog-max-width: 900px;
  --lanismd-dialog-max-height: 80%;
  --lanismd-dialog-border-radius: 12px;
  --lanismd-dialog-shadow: 0 8px 32px rgba(0,0,0,0.12);
  --lanismd-dialog-bg: var(--lanismd-editor-bg);
  --lanismd-dialog-border: 1px solid var(--lanismd-border-color);
  
  /* ===== 设置弹窗导航 ===== */
  --lanismd-dialog-nav-width: 160px;
  --lanismd-dialog-nav-bg: var(--lanismd-sidebar-bg);
  --lanismd-dialog-nav-border: 1px solid var(--lanismd-border-color);
  --lanismd-dialog-nav-item-height: 36px;
  --lanismd-dialog-nav-item-hover-bg: var(--lanismd-hover-bg);
  --lanismd-dialog-nav-item-active-bg: var(--lanismd-selected-bg);
}
```

#### 分级引用变量
```css
:root {
  /* Level 1 (>) */
  --lanismd-blockquote-l1-border-color: #3b82f6;
  --lanismd-blockquote-l1-bg: rgba(59, 130, 246, 0.05);
  --lanismd-blockquote-l1-text-color: #1e40af;
  
  /* Level 2 (>>) */
  --lanismd-blockquote-l2-border-color: #22c55e;
  --lanismd-blockquote-l2-bg: rgba(34, 197, 94, 0.05);
  --lanismd-blockquote-l2-text-color: #166534;
  
  /* Level 3 (>>>) */
  --lanismd-blockquote-l3-border-color: #f59e0b;
  --lanismd-blockquote-l3-bg: rgba(245, 158, 11, 0.05);
  --lanismd-blockquote-l3-text-color: #92400e;
  
  /* Level 4+ (>>>>) */
  --lanismd-blockquote-l4-border-color: #f43f5e;
  --lanismd-blockquote-l4-bg: rgba(244, 63, 94, 0.05);
  --lanismd-blockquote-l4-text-color: #9f1239;
}
```

#### 列表样式变量
```css
:root {
  /* 无序列表 */
  --lanismd-ul-marker-color: var(--lanismd-text-color);
  --lanismd-ul-marker-type: disc;
  --lanismd-ul-marker-content: '•';   /* 自定义标记 */
  
  /* 任务列表 */
  --lanismd-task-checkbox-size: 16px;
  --lanismd-task-checkbox-border: 2px solid #94a3b8;
  --lanismd-task-checkbox-border-radius: 4px;
  --lanismd-task-checkbox-bg: transparent;
  --lanismd-task-checkbox-checked-bg: var(--lanismd-accent);
  --lanismd-task-checkbox-checked-border: var(--lanismd-accent);
  --lanismd-task-checkbox-checkmark-color: white;
}
```

#### 代码块装饰变量
```css
:root {
  /* 窗口装饰 */
  --lanismd-codeblock-window-controls: none; /* none | macos | windows */
  --lanismd-codeblock-dot-red: #ff5f56;
  --lanismd-codeblock-dot-yellow: #ffbd2e;
  --lanismd-codeblock-dot-green: #27c93f;
  --lanismd-codeblock-dot-size: 12px;
  --lanismd-codeblock-dot-spacing: 8px;
}
```

### 7.2 需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `src/styles/variables.css` | 添加新变量的默认值 |
| `src/styles/themes/light.css` | 按新变量体系重新定义 |
| `src/styles/themes/dark.css` | 按新变量体系重新定义 |
| `src/styles/themes/sepia.css` | 按新变量体系重新定义 |
| `src/styles/themes/nord.css` | 按新变量体系重新定义 |
| `src/styles/editor/typography.css` | 使用 H1-H6 独立变量 |
| `src/styles/editor/blockquote.css` | 支持分级引用样式 |
| `src/styles/editor/list.css` | 使用列表变量 |
| `src/styles/editor/code-block.css` | 添加窗口装饰样式 |

### 7.3 需要新增的文件

| 文件 | 用途 |
|------|-----|
| `src/services/theme-loader.ts` | 主题文件加载服务 |
| `src/styles/themes/_variables-full.css` | 完整变量参考 |
| `docs/theme-development.md` | 主题开发文档 |

### 7.4 Blockquote 插件修改

需要修改 Milkdown 的 blockquote 插件，为嵌套引用添加 `data-level` 属性：

```html
<!-- 渲染结果 -->
<blockquote data-level="1">...</blockquote>
<blockquote data-level="2">...</blockquote>
```

然后 CSS 可以这样使用：

```css
.ProseMirror blockquote[data-level="1"] {
  border-color: var(--lanismd-blockquote-l1-border-color);
  background: var(--lanismd-blockquote-l1-bg);
}
```

---

## 八、实现路线图

> ⚠️ **重要说明**：阶段 0 是先决条件，必须在其他阶段之前完成。

### 阶段 0：组件层改造（前置条件）

| 任务 | 工作量 | 状态 | 说明 |
|------|-------|------|------|
| **文件树组件改造** | 3 天 | ❌ 未完成 | 添加 CSS 类、data 属性支持连线伪元素 |
| **大纲组件重构** | 2 天 | ❌ 未完成 | 将硬编码 marginLeft 改为 CSS 变量驱动 |
| **设置弹窗变量化** | 2 天 | ❌ 未完成 | 提取硬编码样式为 CSS 变量 |
| **主题加载服务** | 3 天 | ❌ 未完成 | 实现 `theme-loader.ts`，支持加载用户 CSS |

**阶段 0 交付物**：
- [ ] `FileTree.tsx` 支持 `data-depth` 属性和连线 CSS 类
- [ ] `Sidebar.tsx` 大纲部分使用 CSS 变量控制样式
- [ ] `SettingsDialog.tsx` 样式变量化
- [ ] `src/services/theme-loader.ts` 基础实现

### 阶段 1：变量体系扩展 ✅ 已完成（2026-04-08）

> **完成情况**：已全部完成，新增约 50+ 个 CSS 变量

1. ✅ 在 `variables.css` 中添加所有新变量的默认值
2. ✅ 更新 4 个内置主题文件 (light/dark/sepia/nord)
3. ✅ 更新所有编辑器样式文件使用新变量
4. ✅ 创建完整变量参考文件 `_variables-full.css`

**已完成的具体工作**：
- **H1-H6 独立变量**：每级标题可单独设置颜色
- **分级引用变量**：L1-L4 四级，每级有边框色、背景、文本色
- **列表变量**：无序/有序列表标记颜色、任务列表复选框完整自定义
- **代码块窗口装饰**：macOS 风格红黄绿点变量
- **侧边栏增强**：新增 `--lanismd-sidebar-active-text` 和 `--lanismd-sidebar-active-border`
- **状态色增强**：新增 `--lanismd-info` 变量

**文件变更**：
| 文件 | 变更 |
|------|------|
| `src/styles/variables.css` | 添加 50+ 新变量默认值 |
| `src/styles/themes/light.css` | 添加新变量定义 |
| `src/styles/themes/dark.css` | 添加新变量定义 |
| `src/styles/themes/sepia.css` | 添加新变量定义 |
| `src/styles/themes/nord.css` | 添加新变量定义 |
| `src/styles/editor/typography.css` | H1-H6 使用独立变量 |
| `src/styles/editor/blockquote.css` | 分级引用样式 |
| `src/styles/editor/list.css` | 列表标记和任务列表变量 |
| `src/styles/editor/code-block.css` | 窗口装饰和工具栏变量 |
| `src/styles/themes/_variables-full.css` | 新增完整变量参考文件 |

### 阶段 2：分级引用支持 ✅ 已完成（2026-04-08）

> **完成情况**：CSS 变量已定义，样式规则已添加

1. ✅ 添加分级引用 CSS 变量（L1-L4）
2. ✅ 编写分级引用 CSS 样式规则（使用 `:has()` 选择器）
3. ⚠️ Blockquote 插件层的 `data-level` 属性待后续实现（可选增强）

### 阶段 3：代码块装饰增强 ✅ 已完成（2026-04-08）

> **完成情况**：macOS 窗口装饰变量已定义，工具栏样式已变量化

1. ✅ 添加 macOS 窗口装饰变量（红黄绿点）
2. ✅ 重构代码块工具栏样式（语言标签、复制按钮变量化）
3. ✅ 支持更多自定义选项

### 阶段 4：用户自定义 CSS 加载（5 天）
1. 完善 `theme-loader.ts` 服务
2. 支持 `base.user.css` 加载
3. 支持 `{theme}.user.css` 加载
4. 添加文件监听，支持热重载

### 阶段 5：自定义字体支持（3 天）
1. 支持 `@font-face` 定义
2. 支持从主题目录加载字体文件
3. 字体预加载和回退机制

### 阶段 6：文档和示例 ⚠️ 部分完成（2026-04-08）
1. ⚠️ 编写主题开发文档（待完善）
2. ❌ 创建 2-3 个示例主题
3. ✅ 提供变量参考表 (`_variables-full.css`)

---

### 实现优先级总览

```
┌─────────────────────────────────────────────────────────────────────┐
│ P0 (必须) - 基础主题能力                                             │
├─────────────────────────────────────────────────────────────────────┤
│ ☐ 阶段 0: 组件层改造（文件树、大纲、设置弹窗、主题加载服务）           │
│ ✅ 阶段 1: CSS 变量体系扩展                                          │
├─────────────────────────────────────────────────────────────────────┤
│ P1 (高优) - 增强主题能力                                             │
├─────────────────────────────────────────────────────────────────────┤
│ ✅ 阶段 2: 分级引用支持                                              │
│ ✅ 阶段 3: 代码块装饰增强                                            │
│ ☐ 阶段 4: 用户自定义 CSS 加载                                       │
├─────────────────────────────────────────────────────────────────────┤
│ P2 (中优) - 完整主题能力                                             │
├─────────────────────────────────────────────────────────────────────┤
│ ☐ 阶段 5: 自定义字体支持                                            │
│ ⚠️ 阶段 6: 文档和示例（部分完成）                                     │
├─────────────────────────────────────────────────────────────────────┤
│ P3 (低优) - 高级主题能力                                             │
├─────────────────────────────────────────────────────────────────────┤
│ ☐ 自定义图标系统                                                    │
│ ☐ Typora 主题兼容层                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 九、示例主题结构

用户自定义主题文件结构：

```
~/.lanismd/themes/
├── base.user.css                     # 全局自定义（所有主题生效）
├── light.user.css                    # light 主题自定义
├── my-custom-theme/                  # 自定义主题目录
│   ├── theme.css                     # 主题主文件
│   ├── codeblock.css                 # 代码块样式（可选）
│   └── theme.json                    # 主题元数据
```

### 示例主题 CSS

```css
/**
 * LanisMD Theme: Bloom (粉色浪漫主题)
 */

:root,
.theme-bloom {
  /* 全局 */
  --lanismd-editor-bg: #fdf2f8;
  --lanismd-editor-text: #831843;
  --lanismd-accent: #ec4899;
  
  /* 标题 */
  --lanismd-h1-color: #be185d;
  --lanismd-h1-border-bottom: 2px solid #f9a8d4;
  
  /* 分级引用 */
  --lanismd-blockquote-l1-border-color: #93c5fd;
  --lanismd-blockquote-l1-bg: rgba(59, 130, 246, 0.08);
  --lanismd-blockquote-l2-border-color: #86efac;
  --lanismd-blockquote-l2-bg: rgba(34, 197, 94, 0.08);
  
  /* 代码块 */
  --lanismd-codeblock-window-controls: macos;
  --lanismd-codeblock-bg: #fdf2f8;
}
```

---

## 十、注意事项

1. **CSS 选择器特异性**：自定义主题需要足够的特异性覆盖默认样式
2. **变量命名**：保持 `--lanismd-` 前缀一致性
3. **深色主题**：需要同时添加 `dark` class 以兼容 Tailwind
4. **热重载**：开发时使用 Vite 的 HMR 即可，生产环境需要手动刷新

---

## 十一、参考资料

- Typora 主题文档: https://theme.typora.io/doc/Write-Custom-Theme/
- Milkdown 文档: https://milkdown.dev/
- CodeMirror 6 主题: https://codemirror.net/docs/ref/#view.EditorView^theme

# LanisMD 主题系统实现方案

> 参考 Typora 主题系统设计，为 LanisMD 实现内置多主题功能

## 一、需求背景

### 1.1 目标

- **目的**：为 LanisMD 设计内置多主题系统
- **参考对象**：Typora
- **扩展级别**：内置多主题（官方主题切换，暂不支持用户自定义）
- **控制范围**：编辑器内容区 + 应用 UI（侧边栏、标题栏、菜单等）

### 1.2 当前架构

**现状优势**：

- ✅ 已有 CSS 变量体系（`--lanismd-*`）
- ✅ 已有 `themes/light.css` 和 `themes/dark.css` 分离
- ✅ 已使用 `darkMode: 'class'` 策略（Tailwind）
- ✅ 已有 `useTheme` hook 和 `settings-store`

**需要改进**：

- ❌ 变量覆盖不完整（很多硬编码颜色散落在组件 CSS 中）
- ❌ 代码高亮主题硬编码在 TypeScript 中
- ❌ 主题切换只支持 `light/dark/system`，不支持多主题
- ❌ 缺少主题定义的完整规范

### 1.3 目标主题列表

| 主题 | 类型 | 风格描述 |
|------|------|----------|
| Light | 亮色 | 默认浅色主题，清爽简洁 |
| Dark (Tokyo Night) | 暗色 | 深色主题，Tokyo Night 风格 |
| Sepia | 亮色 | 护眼/复古主题，温暖米黄色调 |
| Nord | 暗色 | Nord 极地风格，冷色调深色 |

---

## 二、技术架构

### 2.1 核心设计原则

| 原则 | 说明 |
|------|------|
| **变量驱动** | 所有颜色通过 CSS 变量定义，组件仅消费变量 |
| **分层设计** | 设计 Token（不变） + 主题变量（随主题切换） |
| **Class 切换** | 通过 `html` 元素的 class 切换主题，无需重载页面 |
| **全覆盖** | 编辑器 + UI + CodeMirror 代码高亮全部使用变量 |

### 2.2 目录结构

```
src/styles/
├── variables.css              # 设计 Token（不随主题变化）
├── globals.css                # 全局基础样式
├── print.css                  # 打印样式
├── themes/
│   ├── index.css              # 主题入口，导入所有主题
│   ├── light.css              # 亮色主题变量
│   ├── dark.css               # 暗色主题变量（Tokyo Night）
│   ├── sepia.css              # 护眼主题变量
│   └── nord.css               # Nord 主题变量
└── editor/
    ├── index.css              # 编辑器样式入口
    ├── base.css               # 基础样式（消费变量）
    ├── typography.css         # 排版样式（消费变量）
    ├── code-block.css         # 代码块样式（消费变量）
    ├── blockquote.css         # 引用样式（消费变量）
    ├── table.css              # 表格样式（消费变量）
    └── ...
```

### 2.3 主题 Class 命名规范

| 主题 | CSS Class | 说明 |
|------|-----------|------|
| Light | `.theme-light` 或 `:root` | 默认主题，无需额外 class |
| Dark | `.theme-dark .dark` | 需要 `.dark` 兼容 Tailwind |
| Sepia | `.theme-sepia` | 亮色系主题 |
| Nord | `.theme-nord .dark` | 暗色系，需要 `.dark` 兼容 Tailwind |

---

## 三、变量规范

### 3.1 设计 Token（不随主题变化）

**文件**: `src/styles/variables.css`

```css
:root {
  /* ===== 设计 Token（与主题无关，保持不变）===== */
  
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

### 3.2 主题变量分类

每个主题文件需要定义以下变量：

#### 3.2.1 应用 UI 变量

```css
/* Editor Area */
--lanismd-editor-bg: ...;
--lanismd-editor-text: ...;
--lanismd-editor-border: ...;

/* Sidebar */
--lanismd-sidebar-bg: ...;
--lanismd-sidebar-text: ...;
--lanismd-sidebar-border: ...;
--lanismd-sidebar-hover: ...;
--lanismd-sidebar-active: ...;

/* Titlebar */
--lanismd-titlebar-bg: ...;
--lanismd-titlebar-text: ...;

/* Accent */
--lanismd-accent: ...;
--lanismd-accent-hover: ...;
--lanismd-accent-light: ...;

/* Status Colors */
--lanismd-success: ...;
--lanismd-warning: ...;
--lanismd-danger: ...;

/* Interactive */
--lanismd-hover-bg: ...;
--lanismd-selected-bg: ...;
--lanismd-focus-ring: ...;

/* Shadows */
--lanismd-shadow-sm: ...;
--lanismd-shadow-md: ...;
--lanismd-shadow-lg: ...;

/* Scrollbar */
--lanismd-scrollbar-thumb: ...;
--lanismd-scrollbar-thumb-hover: ...;
```

#### 3.2.2 编辑器内容变量

```css
/* Typography */
--lanismd-heading-color: ...;
--lanismd-text-muted: ...;
--lanismd-link-color: ...;
--lanismd-link-hover: ...;

/* Inline Code */
--lanismd-inline-code-bg: ...;
--lanismd-inline-code-text: ...;

/* Blockquote */
--lanismd-blockquote-border: ...;
--lanismd-blockquote-bg: ...;
--lanismd-blockquote-text: ...;

/* Table */
--lanismd-table-header-bg: ...;
--lanismd-table-border: ...;
--lanismd-table-row-hover: ...;

/* Horizontal Rule */
--lanismd-hr-color: ...;

/* Selection */
--lanismd-selection-bg: ...;
--lanismd-selection-text: ...;
```

#### 3.2.3 代码块变量

```css
/* Code Block Container */
--lanismd-code-bg: ...;
--lanismd-code-toolbar-bg: ...;

/* CodeMirror Editor */
--lanismd-cm-bg: ...;
--lanismd-cm-text: ...;
--lanismd-cm-gutter-bg: ...;
--lanismd-cm-gutter-text: ...;
--lanismd-cm-line-active: ...;
--lanismd-cm-gutter-active: ...;
--lanismd-cm-cursor: ...;
--lanismd-cm-selection: ...;
--lanismd-cm-bracket-match: ...;
--lanismd-cm-bracket-outline: ...;

/* Syntax Highlighting */
--lanismd-syntax-keyword: ...;
--lanismd-syntax-comment: ...;
--lanismd-syntax-string: ...;
--lanismd-syntax-number: ...;
--lanismd-syntax-variable: ...;
--lanismd-syntax-function: ...;
--lanismd-syntax-type: ...;
--lanismd-syntax-class: ...;
--lanismd-syntax-property: ...;
--lanismd-syntax-operator: ...;
--lanismd-syntax-punctuation: ...;
--lanismd-syntax-bool: ...;
--lanismd-syntax-regexp: ...;
--lanismd-syntax-tag: ...;
--lanismd-syntax-attr-name: ...;
--lanismd-syntax-attr-value: ...;
--lanismd-syntax-meta: ...;
```

---

## 四、主题定义

### 4.1 Light 主题

**文件**: `src/styles/themes/light.css`

```css
/**
 * LanisMD Light Theme
 * 浅色主题完整变量定义
 */

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
  
  /* Syntax Highlighting (GitHub Light inspired) */
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
}
```

### 4.2 Dark 主题 (Tokyo Night)

**文件**: `src/styles/themes/dark.css`

```css
/**
 * LanisMD Dark Theme (Tokyo Night inspired)
 * 深色主题完整变量定义
 */

.dark,
.theme-dark {
  /* ===== 1. 应用 UI ===== */
  
  /* Editor Area */
  --lanismd-editor-bg: #1a1b26;
  --lanismd-editor-text: #c0caf5;
  --lanismd-editor-border: #292e42;
  
  /* Sidebar */
  --lanismd-sidebar-bg: #1f2335;
  --lanismd-sidebar-text: #a9b1d6;
  --lanismd-sidebar-border: #292e42;
  --lanismd-sidebar-hover: rgba(255, 255, 255, 0.04);
  --lanismd-sidebar-active: rgba(122, 162, 247, 0.12);
  
  /* Titlebar */
  --lanismd-titlebar-bg: #1f2335;
  --lanismd-titlebar-text: #c0caf5;
  
  /* Accent */
  --lanismd-accent: #7aa2f7;
  --lanismd-accent-hover: #89b4fa;
  --lanismd-accent-light: rgba(122, 162, 247, 0.15);
  
  /* Status Colors */
  --lanismd-success: #9ece6a;
  --lanismd-warning: #e0af68;
  --lanismd-danger: #f7768e;
  
  /* Interactive */
  --lanismd-hover-bg: rgba(122, 162, 247, 0.12);
  --lanismd-selected-bg: rgba(122, 162, 247, 0.08);
  --lanismd-focus-ring: rgba(122, 162, 247, 0.5);
  
  /* Shadows */
  --lanismd-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.2);
  --lanismd-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.3);
  --lanismd-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4);
  
  /* Scrollbar */
  --lanismd-scrollbar-thumb: #3b4261;
  --lanismd-scrollbar-thumb-hover: #545c7e;
  
  /* ===== 2. 编辑器内容 ===== */
  
  /* Typography */
  --lanismd-heading-color: #c0caf5;
  --lanismd-text-muted: #565f89;
  --lanismd-link-color: var(--lanismd-accent);
  --lanismd-link-hover: var(--lanismd-accent-hover);
  
  /* Inline Code */
  --lanismd-inline-code-bg: rgba(255, 255, 255, 0.08);
  --lanismd-inline-code-text: #7dcfff;
  
  /* Blockquote */
  --lanismd-blockquote-border: var(--lanismd-accent);
  --lanismd-blockquote-bg: transparent;
  --lanismd-blockquote-text: var(--lanismd-sidebar-text);
  
  /* Table */
  --lanismd-table-header-bg: var(--lanismd-sidebar-bg);
  --lanismd-table-border: var(--lanismd-editor-border);
  --lanismd-table-row-hover: rgba(255, 255, 255, 0.02);
  
  /* Horizontal Rule */
  --lanismd-hr-color: var(--lanismd-editor-border);
  
  /* Selection */
  --lanismd-selection-bg: rgba(122, 162, 247, 0.25);
  --lanismd-selection-text: inherit;
  
  /* ===== 3. 代码块 ===== */
  
  /* Code Block Container */
  --lanismd-code-bg: #1a1b26;
  --lanismd-code-toolbar-bg: #16171f;
  
  /* CodeMirror Editor */
  --lanismd-cm-bg: #1a1b26;
  --lanismd-cm-text: #c0caf5;
  --lanismd-cm-gutter-bg: #1a1b26;
  --lanismd-cm-gutter-text: #3b4261;
  --lanismd-cm-line-active: rgba(122, 162, 247, 0.06);
  --lanismd-cm-gutter-active: rgba(122, 162, 247, 0.08);
  --lanismd-cm-cursor: #c0caf5;
  --lanismd-cm-selection: rgba(122, 162, 247, 0.2);
  --lanismd-cm-bracket-match: rgba(122, 162, 247, 0.25);
  --lanismd-cm-bracket-outline: rgba(122, 162, 247, 0.4);
  
  /* Syntax Highlighting (Tokyo Night inspired) */
  --lanismd-syntax-keyword: #bb9af7;
  --lanismd-syntax-comment: #565f89;
  --lanismd-syntax-string: #9ece6a;
  --lanismd-syntax-number: #ff9e64;
  --lanismd-syntax-variable: #c0caf5;
  --lanismd-syntax-function: #7aa2f7;
  --lanismd-syntax-type: #2ac3de;
  --lanismd-syntax-class: #bb9af7;
  --lanismd-syntax-property: #7dcfff;
  --lanismd-syntax-operator: #89ddff;
  --lanismd-syntax-punctuation: #c0caf5;
  --lanismd-syntax-bool: #ff9e64;
  --lanismd-syntax-regexp: #b4f9f8;
  --lanismd-syntax-tag: #f7768e;
  --lanismd-syntax-attr-name: #bb9af7;
  --lanismd-syntax-attr-value: #9ece6a;
  --lanismd-syntax-meta: #565f89;
}
```

### 4.3 Sepia 主题（护眼）

**文件**: `src/styles/themes/sepia.css`

```css
/**
 * LanisMD Sepia Theme
 * 护眼复古主题 - 温暖的米黄色调
 */

.theme-sepia {
  /* ===== 1. 应用 UI ===== */
  --lanismd-editor-bg: #f4ecd8;
  --lanismd-editor-text: #5b4636;
  --lanismd-editor-border: #d4c5a9;
  
  --lanismd-sidebar-bg: #e8dcc8;
  --lanismd-sidebar-text: #6b5744;
  --lanismd-sidebar-border: #d4c5a9;
  --lanismd-sidebar-hover: rgba(91, 70, 54, 0.06);
  --lanismd-sidebar-active: rgba(156, 102, 68, 0.12);
  
  --lanismd-titlebar-bg: #e8dcc8;
  --lanismd-titlebar-text: #5b4636;
  
  --lanismd-accent: #9c6644;
  --lanismd-accent-hover: #7d5035;
  --lanismd-accent-light: rgba(156, 102, 68, 0.12);
  
  --lanismd-success: #6b8e23;
  --lanismd-warning: #cd853f;
  --lanismd-danger: #cd5c5c;
  
  --lanismd-hover-bg: rgba(156, 102, 68, 0.1);
  --lanismd-selected-bg: rgba(156, 102, 68, 0.08);
  --lanismd-focus-ring: rgba(156, 102, 68, 0.4);
  
  --lanismd-shadow-sm: 0 1px 3px rgba(91, 70, 54, 0.1);
  --lanismd-shadow-md: 0 4px 16px rgba(91, 70, 54, 0.12);
  --lanismd-shadow-lg: 0 8px 32px rgba(91, 70, 54, 0.15);
  
  --lanismd-scrollbar-thumb: #c4b49a;
  --lanismd-scrollbar-thumb-hover: #a89878;
  
  /* ===== 2. 编辑器内容 ===== */
  --lanismd-heading-color: #3d2914;
  --lanismd-text-muted: #8b7355;
  --lanismd-link-color: var(--lanismd-accent);
  --lanismd-link-hover: var(--lanismd-accent-hover);
  
  --lanismd-inline-code-bg: rgba(91, 70, 54, 0.08);
  --lanismd-inline-code-text: #7d5035;
  
  --lanismd-blockquote-border: var(--lanismd-accent);
  --lanismd-blockquote-bg: rgba(156, 102, 68, 0.05);
  --lanismd-blockquote-text: var(--lanismd-sidebar-text);
  
  --lanismd-table-header-bg: #e0d4c0;
  --lanismd-table-border: var(--lanismd-editor-border);
  --lanismd-table-row-hover: rgba(91, 70, 54, 0.04);
  
  --lanismd-hr-color: var(--lanismd-editor-border);
  --lanismd-selection-bg: rgba(156, 102, 68, 0.2);
  --lanismd-selection-text: inherit;
  
  /* ===== 3. 代码块 ===== */
  --lanismd-code-bg: #efe6d5;
  --lanismd-code-toolbar-bg: #e8dcc8;
  
  --lanismd-cm-bg: #efe6d5;
  --lanismd-cm-text: #5b4636;
  --lanismd-cm-gutter-bg: #efe6d5;
  --lanismd-cm-gutter-text: #a89878;
  --lanismd-cm-line-active: rgba(156, 102, 68, 0.06);
  --lanismd-cm-gutter-active: rgba(156, 102, 68, 0.1);
  --lanismd-cm-cursor: #5b4636;
  --lanismd-cm-selection: rgba(156, 102, 68, 0.18);
  --lanismd-cm-bracket-match: rgba(156, 102, 68, 0.2);
  --lanismd-cm-bracket-outline: rgba(156, 102, 68, 0.3);
  
  /* Syntax (warm tones) */
  --lanismd-syntax-keyword: #9c6644;
  --lanismd-syntax-comment: #a89878;
  --lanismd-syntax-string: #6b8e23;
  --lanismd-syntax-number: #cd853f;
  --lanismd-syntax-variable: #5b4636;
  --lanismd-syntax-function: #8b4513;
  --lanismd-syntax-type: #6b8e23;
  --lanismd-syntax-class: #9c6644;
  --lanismd-syntax-property: #7d5035;
  --lanismd-syntax-operator: #8b4513;
  --lanismd-syntax-punctuation: #5b4636;
  --lanismd-syntax-bool: #cd853f;
  --lanismd-syntax-regexp: #6b8e23;
  --lanismd-syntax-tag: #9c6644;
  --lanismd-syntax-attr-name: #8b4513;
  --lanismd-syntax-attr-value: #6b8e23;
  --lanismd-syntax-meta: #a89878;
}
```

### 4.4 Nord 主题

**文件**: `src/styles/themes/nord.css`

```css
/**
 * LanisMD Nord Theme
 * Nord 极地风格 - 冷色调深色主题
 */

.theme-nord {
  /* ===== 1. 应用 UI ===== */
  --lanismd-editor-bg: #2e3440;
  --lanismd-editor-text: #eceff4;
  --lanismd-editor-border: #3b4252;
  
  --lanismd-sidebar-bg: #3b4252;
  --lanismd-sidebar-text: #d8dee9;
  --lanismd-sidebar-border: #434c5e;
  --lanismd-sidebar-hover: rgba(236, 239, 244, 0.05);
  --lanismd-sidebar-active: rgba(136, 192, 208, 0.15);
  
  --lanismd-titlebar-bg: #3b4252;
  --lanismd-titlebar-text: #eceff4;
  
  --lanismd-accent: #88c0d0;
  --lanismd-accent-hover: #8fbcbb;
  --lanismd-accent-light: rgba(136, 192, 208, 0.15);
  
  --lanismd-success: #a3be8c;
  --lanismd-warning: #ebcb8b;
  --lanismd-danger: #bf616a;
  
  --lanismd-hover-bg: rgba(136, 192, 208, 0.12);
  --lanismd-selected-bg: rgba(136, 192, 208, 0.08);
  --lanismd-focus-ring: rgba(136, 192, 208, 0.5);
  
  --lanismd-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.25);
  --lanismd-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.35);
  --lanismd-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.45);
  
  --lanismd-scrollbar-thumb: #4c566a;
  --lanismd-scrollbar-thumb-hover: #5e6779;
  
  /* ===== 2. 编辑器内容 ===== */
  --lanismd-heading-color: #eceff4;
  --lanismd-text-muted: #616e88;
  --lanismd-link-color: var(--lanismd-accent);
  --lanismd-link-hover: var(--lanismd-accent-hover);
  
  --lanismd-inline-code-bg: rgba(236, 239, 244, 0.08);
  --lanismd-inline-code-text: #81a1c1;
  
  --lanismd-blockquote-border: #81a1c1;
  --lanismd-blockquote-bg: transparent;
  --lanismd-blockquote-text: var(--lanismd-sidebar-text);
  
  --lanismd-table-header-bg: #3b4252;
  --lanismd-table-border: #434c5e;
  --lanismd-table-row-hover: rgba(236, 239, 244, 0.03);
  
  --lanismd-hr-color: #434c5e;
  --lanismd-selection-bg: rgba(136, 192, 208, 0.25);
  --lanismd-selection-text: inherit;
  
  /* ===== 3. 代码块 ===== */
  --lanismd-code-bg: #2e3440;
  --lanismd-code-toolbar-bg: #3b4252;
  
  --lanismd-cm-bg: #2e3440;
  --lanismd-cm-text: #d8dee9;
  --lanismd-cm-gutter-bg: #2e3440;
  --lanismd-cm-gutter-text: #4c566a;
  --lanismd-cm-line-active: rgba(136, 192, 208, 0.06);
  --lanismd-cm-gutter-active: rgba(136, 192, 208, 0.1);
  --lanismd-cm-cursor: #d8dee9;
  --lanismd-cm-selection: rgba(136, 192, 208, 0.2);
  --lanismd-cm-bracket-match: rgba(136, 192, 208, 0.25);
  --lanismd-cm-bracket-outline: rgba(136, 192, 208, 0.4);
  
  /* Syntax (Nord palette) */
  --lanismd-syntax-keyword: #81a1c1;
  --lanismd-syntax-comment: #616e88;
  --lanismd-syntax-string: #a3be8c;
  --lanismd-syntax-number: #b48ead;
  --lanismd-syntax-variable: #d8dee9;
  --lanismd-syntax-function: #88c0d0;
  --lanismd-syntax-type: #8fbcbb;
  --lanismd-syntax-class: #8fbcbb;
  --lanismd-syntax-property: #88c0d0;
  --lanismd-syntax-operator: #81a1c1;
  --lanismd-syntax-punctuation: #eceff4;
  --lanismd-syntax-bool: #81a1c1;
  --lanismd-syntax-regexp: #ebcb8b;
  --lanismd-syntax-tag: #81a1c1;
  --lanismd-syntax-attr-name: #8fbcbb;
  --lanismd-syntax-attr-value: #a3be8c;
  --lanismd-syntax-meta: #616e88;
}
```

### 4.5 主题入口文件

**文件**: `src/styles/themes/index.css`

```css
/**
 * LanisMD Theme System Entry
 * 主题系统入口文件
 */

@import './light.css';
@import './dark.css';
@import './sepia.css';
@import './nord.css';
```

---

## 五、TypeScript 代码修改

### 5.1 类型定义

**文件**: `src/types/config.ts`

```typescript
// 扩展主题类型
export type ThemeMode = 'light' | 'dark' | 'sepia' | 'nord' | 'system';

// 主题元数据（可选，用于 UI 展示）
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

### 5.2 useTheme Hook

**文件**: `src/hooks/useTheme.ts`

```typescript
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import type { ThemeMode } from '@/types';

// 主题与 CSS class 的映射
const THEME_CLASS_MAP: Record<Exclude<ThemeMode, 'system'>, string[]> = {
  light: ['theme-light'],
  dark: ['theme-dark', 'dark'],      // 保留 dark class 兼容 Tailwind
  sepia: ['theme-sepia'],
  nord: ['theme-nord', 'dark'],      // Nord 是深色主题，需要 dark class
};

// 所有可能的主题 class
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

  useEffect(() => {
    document.documentElement.style.setProperty('--editor-max-width', `${config.editor.maxWidth}px`);
  }, [config.editor.maxWidth]);
}
```

### 5.3 CodeMirror 主题（消费 CSS 变量）

**文件**: `src/editor/plugins/code-block.ts`

需要重构 CodeMirror 主题部分，将硬编码颜色替换为 CSS 变量：

```typescript
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// 统一的 CodeMirror 编辑器主题（消费 CSS 变量）
const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--lanismd-cm-bg)',
    color: 'var(--lanismd-cm-text)',
  },
  '.cm-content': {
    caretColor: 'var(--lanismd-cm-cursor)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--lanismd-cm-gutter-bg)',
    color: 'var(--lanismd-cm-gutter-text)',
    border: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--lanismd-cm-gutter-active)',
    color: 'var(--lanismd-cm-text)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--lanismd-cm-line-active)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--lanismd-cm-cursor)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--lanismd-cm-selection)',
  },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    backgroundColor: 'var(--lanismd-cm-bracket-match)',
    outline: '1px solid var(--lanismd-cm-bracket-outline)',
  },
});

// 语法高亮样式（消费 CSS 变量）
const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--lanismd-syntax-keyword)' },
  { tag: tags.comment, color: 'var(--lanismd-syntax-comment)', fontStyle: 'italic' },
  { tag: tags.string, color: 'var(--lanismd-syntax-string)' },
  { tag: tags.number, color: 'var(--lanismd-syntax-number)' },
  { tag: tags.variableName, color: 'var(--lanismd-syntax-variable)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--lanismd-syntax-function)' },
  { tag: tags.typeName, color: 'var(--lanismd-syntax-type)' },
  { tag: tags.className, color: 'var(--lanismd-syntax-class)' },
  { tag: tags.propertyName, color: 'var(--lanismd-syntax-property)' },
  { tag: tags.operator, color: 'var(--lanismd-syntax-operator)' },
  { tag: tags.punctuation, color: 'var(--lanismd-syntax-punctuation)' },
  { tag: tags.bool, color: 'var(--lanismd-syntax-bool)' },
  { tag: tags.regexp, color: 'var(--lanismd-syntax-regexp)' },
  { tag: tags.tagName, color: 'var(--lanismd-syntax-tag)' },
  { tag: tags.attributeName, color: 'var(--lanismd-syntax-attr-name)' },
  { tag: tags.attributeValue, color: 'var(--lanismd-syntax-attr-value)' },
  { tag: tags.meta, color: 'var(--lanismd-syntax-meta)' },
]);

// 导出统一的主题扩展
export const codeBlockTheme = [
  editorTheme,
  syntaxHighlighting(highlightStyle),
];
```

**修改要点**：

1. 删除现有的 `lightTheme` 和 `darkTheme` 常量
2. 删除 `getCodeMirrorExtensions` 中的深色模式判断逻辑
3. 使用统一的 `editorTheme` 和 `highlightStyle`
4. 所有颜色值改为 `var(--lanismd-*)` 形式

---

## 六、CSS 文件重构清单

以下 CSS 文件需要重构，将硬编码颜色替换为变量：

### 6.1 `src/styles/editor/code-block.css`

**修改前（示例）**：

```css
.dark .milkdown-editor-root .ProseMirror [data-type='code_block'] {
  background: #1a1b26;
}
```

**修改后**：

```css
.milkdown-editor-root .ProseMirror [data-type='code_block'] {
  background: var(--lanismd-code-bg);
}
/* 删除 .dark 选择器，变量会自动切换 */
```

### 6.2 `src/styles/editor/blockquote.css`

确保引用块使用以下变量：

- `--lanismd-blockquote-border`
- `--lanismd-blockquote-bg`
- `--lanismd-blockquote-text`

### 6.3 `src/styles/editor/table.css`

确保表格使用以下变量：

- `--lanismd-table-header-bg`
- `--lanismd-table-border`
- `--lanismd-table-row-hover`

### 6.4 `src/styles/editor/typography.css`

确保排版元素使用以下变量：

- `--lanismd-heading-color`
- `--lanismd-text-muted`
- `--lanismd-link-color`
- `--lanismd-inline-code-bg`
- `--lanismd-inline-code-text`
- `--lanismd-hr-color`

### 6.5 重构原则

1. **删除所有 `.dark` 选择器**：不再需要为深色模式单独写选择器
2. **使用变量而非硬编码**：所有颜色值改为 `var(--lanismd-*)` 形式
3. **保持选择器简洁**：只需要一套选择器，变量会自动切换

---

## 七、实施步骤

### 阶段一：基础架构（1-2 小时）

| # | 任务 | 文件 |
|---|------|------|
| 1 | 更新设计 Token | `src/styles/variables.css` |
| 2 | 扩展 Light 主题变量 | `src/styles/themes/light.css` |
| 3 | 扩展 Dark 主题变量 | `src/styles/themes/dark.css` |
| 4 | 新建 Sepia 主题 | `src/styles/themes/sepia.css` |
| 5 | 新建 Nord 主题 | `src/styles/themes/nord.css` |
| 6 | 创建主题入口 | `src/styles/themes/index.css` |

### 阶段二：类型和 Hook（0.5 小时）

| # | 任务 | 文件 |
|---|------|------|
| 7 | 扩展 ThemeMode 类型 | `src/types/config.ts` |
| 8 | 重构 useTheme Hook | `src/hooks/useTheme.ts` |

### 阶段三：CSS 重构（1-2 小时）

| # | 任务 | 文件 |
|---|------|------|
| 9 | 重构代码块样式 | `src/styles/editor/code-block.css` |
| 10 | 重构引用块样式 | `src/styles/editor/blockquote.css` |
| 11 | 重构表格样式 | `src/styles/editor/table.css` |
| 12 | 重构排版样式 | `src/styles/editor/typography.css` |
| 13 | 重构基础样式 | `src/styles/editor/base.css` |
| 14 | 检查其他编辑器样式 | `src/styles/editor/*.css` |

### 阶段四：CodeMirror 重构（1 小时）

| # | 任务 | 文件 |
|---|------|------|
| 15 | 重构 CodeMirror 主题 | `src/editor/plugins/code-block.ts` |
| 16 | 删除深色模式判断逻辑 | `src/editor/plugins/code-block.ts` |

### 阶段五：UI 集成（0.5 小时）

| # | 任务 | 文件 |
|---|------|------|
| 17 | 添加主题选择 UI | `src/components/settings/AppearanceSettings.tsx` (或类似) |
| 18 | 更新设置 Store | `src/stores/settings-store.ts` |

### 阶段六：测试验证（0.5 小时）

| # | 任务 |
|---|------|
| 19 | 测试所有主题切换 |
| 20 | 验证 System 模式跟随 |
| 21 | 验证代码高亮在各主题下的效果 |
| 22 | 验证 UI 组件在各主题下的效果 |

---

## 八、注意事项

### 8.1 Tailwind CSS 兼容

- `dark` 和 `theme-dark` 需要同时存在，因为 Tailwind 的 `dark:` 变体依赖 `dark` class
- `theme-nord` 也需要 `dark` class，因为它是暗色主题

### 8.2 CSS 变量继承

- 使用 `var(--lanismd-accent)` 这样的引用可以让变量相互依赖
- 例如 `--lanismd-link-color: var(--lanismd-accent)` 可以确保链接颜色跟随主色调

### 8.3 性能考虑

- CSS 变量切换是即时的，不需要重新加载页面
- 避免在高频更新的元素上使用复杂的 CSS 变量计算

### 8.4 浏览器兼容

- CSS 变量在现代浏览器中支持良好
- Tauri 基于 Chromium，完全支持

---

## 九、后续扩展

### 9.1 用户自定义主题（未来）

如果需要支持用户自定义主题，可以：

1. 定义主题 JSON Schema
2. 用户提供 JSON 配置
3. 运行时动态注入 CSS 变量

### 9.2 导出 PDF 主题

可以为打印/导出 PDF 定义专门的变量：

```css
@media print {
  :root {
    --lanismd-editor-bg: white;
    --lanismd-editor-text: black;
    /* ... */
  }
}
```

---

## 十、参考资源

- [Typora 主题开发文档](https://theme.typora.io/doc/Write-Custom-Theme/)
- [CSS Custom Properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- [Tokyo Night 配色](https://github.com/enkia/tokyo-night-vscode-theme)
- [Nord 配色](https://www.nordtheme.com/)

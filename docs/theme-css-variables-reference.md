# LanisMD 主题 CSS 变量完整参考

> 本文档列出升级后的主题系统应支持的所有 CSS 变量。

---

## 〇、实现状态说明

本文档中的 CSS 变量分为以下几种状态：

| 状态 | 说明 |
|------|------|
| ✅ 已实现 | 当前版本已支持，可直接使用 |
| ⚠️ 部分实现 | 变量已定义但组件未完全消费 |
| 🔧 需组件改造 | 需要先完成组件改造才能使用 |
| 📦 需加载服务 | 需要实现主题加载服务才能使用 |
| ❌ 待实现 | 变量和组件都需要实现 |

### 先决条件清单

| 组件/服务 | 当前状态 | 影响范围 |
|----------|---------|---------|
| `FileTree.tsx` 组件改造 | ❌ 未完成 | 文件树连线、缩进样式 |
| `Sidebar.tsx` 大纲改造 | ❌ 未完成 | 大纲连线、层级样式 |
| `SettingsDialog.tsx` 变量化 | ❌ 未完成 | 设置弹窗样式 |
| `theme-loader.ts` 服务 | ❌ 未实现 | 用户自定义 CSS/字体加载 |

### 已完成的工作（2026-04-08）

| 阶段 | 完成状态 | 说明 |
|------|---------|------|
| **阶段 1: 变量体系扩展** | ✅ 已完成 | 新增 50+ 变量，更新 4 个主题 |
| **阶段 2: 分级引用支持** | ✅ 已完成 | L1-L4 分级变量和 CSS 样式 |
| **阶段 3: 代码块装饰增强** | ✅ 已完成 | macOS 窗口装饰、工具栏变量 |
| **阶段 6: 文档和示例** | ⚠️ 部分完成 | 变量参考文件已创建 |

---

## 一、设计 Token（与主题无关，保持不变）

这些变量在 `src/styles/variables.css` 中定义：

```css
:root {
  /* ===== Border Radius ===== */
  --lanismd-radius-sm: 4px;
  --lanismd-radius-md: 6px;
  --lanismd-radius-lg: 8px;
  --lanismd-radius-xl: 12px;

  /* ===== Transitions ===== */
  --lanismd-transition-fast: 0.12s ease;
  --lanismd-transition-normal: 0.15s ease;
  --lanismd-transition-medium: 0.2s ease;
  --lanismd-transition-slow: 0.3s ease;

  /* ===== Spacing ===== */
  --lanismd-spacing-xs: 2px;
  --lanismd-spacing-sm: 4px;
  --lanismd-spacing-md: 8px;
  --lanismd-spacing-lg: 12px;
  --lanismd-spacing-xl: 16px;
  --lanismd-spacing-2xl: 20px;
  --lanismd-spacing-3xl: 24px;

  /* ===== Font Sizes (UI) ===== */
  --lanismd-font-size-xs: 11px;
  --lanismd-font-size-sm: 12px;
  --lanismd-font-size-base: 13px;
  --lanismd-font-size-md: 14px;
  --lanismd-font-size-lg: 15px;

  /* ===== Font Family ===== */
  --lanismd-font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', monospace;  /* ✅ 已实现 */
  --lanismd-font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;    /* ✅ 已实现 */
  
  /* 📦 以下字体变量需要 theme-loader.ts 支持自定义字体加载 */
  --lanismd-font-serif: 'Georgia', 'Times New Roman', serif;                 /* ❌ 待实现 */
  --lanismd-font-heading: var(--lanismd-font-sans);                          /* ❌ 待实现 */
  --lanismd-font-body: var(--lanismd-font-sans);                             /* ❌ 待实现 */
  --lanismd-font-ui: var(--lanismd-font-sans);                               /* ❌ 待实现 */

  /* ===== Layout ===== */
  --lanismd-editor-max-width: 800px;
}
```

---

## 二、主题变量（需在每个主题文件中定义）

### 2.1 全局/窗口

```css
:root {
  /* 背景与文字 */
  --lanismd-bg-color: #ffffff;
  --lanismd-text-color: #1e293b;
  --lanismd-border-color: #e2e8f0;
  
  /* 选中文字 */
  --lanismd-selection-bg: rgba(37, 99, 235, 0.2);
  --lanismd-selection-text: inherit;
}
```

### 2.2 编辑器区域

```css
:root {
  --lanismd-editor-bg: #ffffff;
  --lanismd-editor-text: #1e293b;
  --lanismd-editor-border: #e2e8f0;
}
```

### 2.3 侧边栏

```css
:root {
  --lanismd-sidebar-bg: #f8fafc;
  --lanismd-sidebar-text: #475569;
  --lanismd-sidebar-border: #e2e8f0;
  --lanismd-sidebar-hover: rgba(0, 0, 0, 0.04);
  --lanismd-sidebar-active: rgba(37, 99, 235, 0.08);
  --lanismd-sidebar-active-text: inherit;
  --lanismd-sidebar-active-border: #777;
}
```

### 2.4 文件树 🔧

> ⚠️ **需要组件改造**：当前 `FileTree.tsx` 使用硬编码样式，需要先完成组件改造才能支持以下变量。

```css
:root {
  /* 基础样式 - 部分已实现 */
  --lanismd-file-tree-item-height: 28px;        /* ⚠️ 需组件消费 */
  --lanismd-file-tree-indent: 16px;             /* ⚠️ 需组件消费 */
  --lanismd-file-tree-icon-color: #64748b;      /* ⚠️ 需组件消费 */
  --lanismd-file-tree-folder-icon: inherit;     /* 🔧 需图标系统改造 */
  --lanismd-file-tree-file-icon: inherit;       /* 🔧 需图标系统改造 */
  
  /* 连线样式 - 需要组件改造 */
  --lanismd-file-tree-line-display: none;       /* 🔧 none | block */
  --lanismd-file-tree-line-style: solid;        /* 🔧 solid | dashed | dotted */
  --lanismd-file-tree-line-color: #d0d0d0;      /* 🔧 */
  --lanismd-file-tree-line-width: 1px;          /* 🔧 */
  
  /* 节点样式 - 需要组件改造 */
  --lanismd-file-tree-node-padding: 4px 8px;    /* 🔧 */
  --lanismd-file-tree-node-border-radius: 4px;  /* 🔧 */
  --lanismd-file-tree-active-border-left: none; /* 🔧 如 3px solid var(--lanismd-accent) */
}
```

**组件改造要求**：
```tsx
// FileTree.tsx 需要添加
<div 
  className="file-tree-node"
  data-depth={depth}
  style={{ '--tree-depth': depth }}
>
  <div className="file-tree-indent" /> {/* 用于连线伪元素 */}
  <div className="file-tree-content">...</div>
</div>
```

### 2.5 大纲 🔧

> ⚠️ **需要组件改造**：当前 `Sidebar.tsx` 中的大纲使用硬编码 `marginLeft`，需要先完成组件改造。

```css
:root {
  /* 基础样式 */
  --lanismd-outline-text: #475569;              /* ⚠️ 需组件消费 */
  --lanismd-outline-hover-bg: rgba(0, 0, 0, 0.04);
  --lanismd-outline-active-bg: rgba(37, 99, 235, 0.08);
  --lanismd-outline-active-text: #2563eb;
  --lanismd-outline-indent: 12px;               /* 🔧 需组件消费 */
  --lanismd-outline-marker-color: #94a3b8;
  
  /* 连线样式 - 需要组件改造 */
  --lanismd-outline-line-display: none;         /* 🔧 none | block */
  --lanismd-outline-line-style: solid;          /* 🔧 solid | dashed */
  --lanismd-outline-line-color: #e0e0e0;        /* 🔧 */
  --lanismd-outline-line-width: 1px;            /* 🔧 */
  
  /* 展开器/标记 - 需要组件改造 */
  --lanismd-outline-expander-display: none;     /* 🔧 none | inline */
  --lanismd-outline-expander-content: '›';      /* 🔧 展开器符号 */
  --lanismd-outline-expander-color: #666;       /* 🔧 */
  
  /* 层级样式 - 需要组件改造 */
  --lanismd-outline-l1-font-size: 14px;         /* 🔧 */
  --lanismd-outline-l2-font-size: 13px;         /* 🔧 */
  --lanismd-outline-l3-font-size: 12px;         /* 🔧 */
  --lanismd-outline-l1-font-weight: 600;        /* 🔧 */
  --lanismd-outline-l2-font-weight: 500;        /* 🔧 */
  --lanismd-outline-l3-font-weight: 400;        /* 🔧 */
}
```

**组件改造要求**：
```tsx
// Sidebar.tsx 大纲部分需要修改
// 改造前
<div style={{ marginLeft: depth > 0 ? 12 : 0 }}>

// 改造后
<div 
  className="outline-item"
  data-level={heading.level}
  style={{ '--outline-depth': depth }}
>
  <span className="outline-expander" />
  <span className="outline-label">{heading.text}</span>
</div>
```

### 2.6 标题栏

```css
:root {
  --lanismd-titlebar-bg: #f8fafc;
  --lanismd-titlebar-text: #1e293b;
}
```

### 2.7 强调色/主色

```css
:root {
  --lanismd-accent: #2563eb;
  --lanismd-accent-hover: #1d4ed8;
  --lanismd-accent-light: rgba(37, 99, 235, 0.1);
  --lanismd-accent-contrast: #ffffff;
}
```

### 2.8 状态色

```css
:root {
  --lanismd-success: #22c55e;
  --lanismd-warning: #f59e0b;
  --lanismd-danger: #ef4444;
  --lanismd-info: #3b82f6;
}
```

### 2.9 交互状态

```css
:root {
  --lanismd-hover-bg: rgba(37, 99, 235, 0.08);
  --lanismd-selected-bg: rgba(37, 99, 235, 0.06);
  --lanismd-focus-ring: rgba(37, 99, 235, 0.4);
}
```

### 2.10 阴影

```css
:root {
  --lanismd-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --lanismd-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.1);
  --lanismd-shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);
}
```

### 2.11 滚动条

```css
:root {
  --lanismd-scrollbar-width: 6px;
  --lanismd-scrollbar-track-bg: transparent;
  --lanismd-scrollbar-thumb: #94a3b8;
  --lanismd-scrollbar-thumb-hover: #64748b;
  --lanismd-scrollbar-thumb-radius: 3px;
}
```

### 2.12 拖拽手柄

```css
:root {
  --lanismd-handle-color: #94a3b8;
}
```

---

## 三、编辑器内容变量

### 3.1 标题 H1-H6（新增，独立变量）✅ 已实现

> **实现状态**：颜色变量已在 4 个内置主题中定义，`typography.css` 已使用这些变量

```css
:root {
  /* ===== H1 ===== */
  --lanismd-h1-color: #0f172a;  /* ✅ 已实现 */
  --lanismd-h1-font-size: 1.875rem;
  --lanismd-h1-font-weight: 700;
  --lanismd-h1-line-height: 1.2;
  --lanismd-h1-margin-top: 1.5em;
  --lanismd-h1-margin-bottom: 0.5em;
  --lanismd-h1-padding-bottom: 0.3em;
  --lanismd-h1-border-bottom: 1px solid var(--lanismd-border-color);
  --lanismd-h1-background: transparent;
  --lanismd-h1-text-decoration: none;
  --lanismd-h1-font-style: normal;
  --lanismd-h1-prefix-content: none;    /* 前缀装饰，如 '# ' */
  --lanismd-h1-prefix-color: inherit;
  
  /* ===== H2 ===== */
  --lanismd-h2-color: #0f172a;
  --lanismd-h2-font-size: 1.5rem;
  --lanismd-h2-font-weight: 600;
  --lanismd-h2-line-height: 1.225;
  --lanismd-h2-margin-top: 1.5em;
  --lanismd-h2-margin-bottom: 0.5em;
  --lanismd-h2-padding-bottom: 0.25em;
  --lanismd-h2-border-bottom: 1px solid var(--lanismd-border-color);
  --lanismd-h2-background: transparent;
  --lanismd-h2-text-decoration: none;
  --lanismd-h2-font-style: normal;
  --lanismd-h2-prefix-content: none;
  --lanismd-h2-prefix-color: inherit;
  
  /* ===== H3 ===== */
  --lanismd-h3-color: #0f172a;
  --lanismd-h3-font-size: 1.25rem;
  --lanismd-h3-font-weight: 600;
  --lanismd-h3-line-height: 1.43;
  --lanismd-h3-margin-top: 1.25em;
  --lanismd-h3-margin-bottom: 0.5em;
  --lanismd-h3-border-bottom: none;
  --lanismd-h3-background: transparent;
  --lanismd-h3-prefix-content: none;
  --lanismd-h3-prefix-color: inherit;
  
  /* ===== H4 ===== */
  --lanismd-h4-color: #0f172a;
  --lanismd-h4-font-size: 1.125rem;
  --lanismd-h4-font-weight: 600;
  --lanismd-h4-margin-top: 1em;
  --lanismd-h4-margin-bottom: 0.5em;
  --lanismd-h4-background: transparent;
  
  /* ===== H5 ===== */
  --lanismd-h5-color: #0f172a;
  --lanismd-h5-font-size: 1em;
  --lanismd-h5-font-weight: 600;
  --lanismd-h5-margin-top: 1em;
  --lanismd-h5-margin-bottom: 0.5em;
  
  /* ===== H6 ===== */
  --lanismd-h6-color: #64748b;
  --lanismd-h6-font-size: 1em;
  --lanismd-h6-font-weight: 600;
  --lanismd-h6-margin-top: 1em;
  --lanismd-h6-margin-bottom: 0.5em;
}
```

### 3.2 段落

```css
:root {
  --lanismd-paragraph-margin: 0.75em;
  --lanismd-paragraph-text-indent: 0;
}
```

### 3.3 链接

```css
:root {
  --lanismd-link-color: var(--lanismd-accent);
  --lanismd-link-hover-color: var(--lanismd-accent-hover);
  --lanismd-link-decoration: underline;
  --lanismd-link-hover-decoration: underline;
}
```

### 3.4 粗体/斜体/删除线

```css
:root {
  --lanismd-strong-color: inherit;
  --lanismd-strong-font-weight: 600;
  --lanismd-em-color: inherit;
  --lanismd-em-font-style: italic;
  --lanismd-del-color: inherit;
  --lanismd-del-opacity: 0.7;
  --lanismd-del-decoration: line-through;
}
```

### 3.5 高亮 (mark)

```css
:root {
  --lanismd-mark-bg: rgba(255, 235, 59, 0.5);
  --lanismd-mark-color: inherit;
  --lanismd-mark-padding: 0.1em 0.2em;
  --lanismd-mark-border-radius: 2px;
}
```

### 3.6 行内代码

```css
:root {
  --lanismd-inline-code-bg: rgba(0, 0, 0, 0.06);
  --lanismd-inline-code-color: var(--lanismd-accent);
  --lanismd-inline-code-padding: 0.15em 0.4em;
  --lanismd-inline-code-border-radius: 4px;
  --lanismd-inline-code-font-family: var(--lanismd-font-mono);
  --lanismd-inline-code-font-size: 0.875em;
  --lanismd-inline-code-border: none;
}
```

### 3.7 分割线

```css
:root {
  --lanismd-hr-color: var(--lanismd-border-color);
  --lanismd-hr-height: 2px;
  --lanismd-hr-style: solid;
  --lanismd-hr-margin: 2em 0;
}
```

---

## 四、引用块变量（支持分级）✅ 已实现

> **实现状态**：分级引用变量已在 4 个内置主题中定义，`blockquote.css` 已使用 `:has()` 选择器实现分级样式

```css
:root {
  /* ===== 基础引用块 ===== */
  --lanismd-blockquote-border-width: 4px;
  --lanismd-blockquote-border-style: solid;
  --lanismd-blockquote-border-color: var(--lanismd-accent);
  --lanismd-blockquote-bg: transparent;
  --lanismd-blockquote-text-color: #64748b;
  --lanismd-blockquote-font-style: italic;
  --lanismd-blockquote-padding: 0 0 0 1em;
  --lanismd-blockquote-margin: 1em 0;
  --lanismd-blockquote-border-radius: 0;
  
  /* ===== 分级引用（嵌套） ===== */
  
  /* Level 1 (>) - 默认使用基础样式 */
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

---

## 五、列表变量 ✅ 已实现

> **实现状态**：列表标记颜色和任务列表复选框变量已在 4 个内置主题中定义，`list.css` 已使用这些变量

```css
:root {
  /* ===== 无序列表 ===== */
  --lanismd-ul-padding-left: 1.75em;
  --lanismd-ul-margin: 0.5em 0;
  --lanismd-ul-marker-color: var(--lanismd-text-color);
  --lanismd-ul-marker-type: disc;  /* disc, circle, square, custom */
  --lanismd-ul-marker-content: '•';  /* 自定义标记（marker-type 为 custom 时） */
  --lanismd-ul-marker-font-size: 1em;
  
  /* 嵌套级别的标记类型 */
  --lanismd-ul-l1-marker-type: disc;
  --lanismd-ul-l2-marker-type: circle;
  --lanismd-ul-l3-marker-type: square;
  
  /* ===== 有序列表 ===== */
  --lanismd-ol-padding-left: 1.75em;
  --lanismd-ol-margin: 0.5em 0;
  --lanismd-ol-marker-color: var(--lanismd-text-color);
  --lanismd-ol-marker-type: decimal;
  
  /* ===== 任务列表 ===== */
  --lanismd-task-checkbox-size: 16px;
  --lanismd-task-checkbox-border: 2px solid #94a3b8;
  --lanismd-task-checkbox-border-radius: 4px;
  --lanismd-task-checkbox-bg: transparent;
  --lanismd-task-checkbox-checked-bg: var(--lanismd-accent);
  --lanismd-task-checkbox-checked-border: var(--lanismd-accent);
  --lanismd-task-checkbox-checkmark-color: white;
  --lanismd-task-checked-text-decoration: line-through;
  --lanismd-task-checked-text-opacity: 0.6;
  
  /* ===== 列表项 ===== */
  --lanismd-li-margin: 0.25em 0;
  --lanismd-li-line-height: 1.6;
}
```

---

## 六、代码块变量 ✅ 已实现

> **实现状态**：窗口装饰变量和工具栏变量已在 4 个内置主题中定义，`code-block.css` 已使用这些变量

```css
:root {
  /* ===== 容器 ===== */
  --lanismd-codeblock-bg: #f6f8fa;
  --lanismd-codeblock-border: 1px solid var(--lanismd-border-color);
  --lanismd-codeblock-border-radius: 8px;
  --lanismd-codeblock-margin: 1em 0;
  --lanismd-codeblock-padding: 0;
  
  /* ===== 工具栏 ===== */
  --lanismd-codeblock-toolbar-bg: #f0f2f5;
  --lanismd-codeblock-toolbar-border: 1px solid var(--lanismd-border-color);
  --lanismd-codeblock-toolbar-height: 36px;
  --lanismd-codeblock-toolbar-padding: 6px 12px;
  
  /* 语言标签 */
  --lanismd-codeblock-lang-color: #64748b;
  --lanismd-codeblock-lang-font-size: 12px;
  --lanismd-codeblock-lang-font-weight: 500;
  --lanismd-codeblock-lang-text-transform: uppercase;
  
  /* 复制按钮 */
  --lanismd-codeblock-copy-btn-color: #64748b;
  --lanismd-codeblock-copy-btn-hover-color: var(--lanismd-accent);
  --lanismd-codeblock-copy-btn-hover-bg: rgba(0, 0, 0, 0.05);
  
  /* ===== 窗口装饰（新增） ===== */
  --lanismd-codeblock-window-controls: none; /* none | macos | windows */
  --lanismd-codeblock-dot-red: #ff5f56;
  --lanismd-codeblock-dot-yellow: #ffbd2e;
  --lanismd-codeblock-dot-green: #27c93f;
  --lanismd-codeblock-dot-size: 12px;
  --lanismd-codeblock-dot-spacing: 8px;
  
  /* ===== CodeMirror 编辑器 ===== */
  --lanismd-cm-bg: #f6f8fa;
  --lanismd-cm-text: #24292e;
  --lanismd-cm-font-family: var(--lanismd-font-mono);
  --lanismd-cm-font-size: 0.875rem;
  --lanismd-cm-line-height: 1.6;
  --lanismd-cm-padding: 16px;
  
  /* 行号 */
  --lanismd-cm-gutter-bg: var(--lanismd-cm-bg);
  --lanismd-cm-gutter-text: #6e7781;
  --lanismd-cm-gutter-width: 40px;
  --lanismd-cm-gutter-padding: 0 8px 0 0;
  
  /* 当前行高亮 */
  --lanismd-cm-line-active: rgba(37, 99, 235, 0.04);
  --lanismd-cm-gutter-active: rgba(37, 99, 235, 0.06);
  
  /* 光标 */
  --lanismd-cm-cursor: #24292e;
  --lanismd-cm-cursor-width: 2px;
  
  /* 选中 */
  --lanismd-cm-selection: rgba(37, 99, 235, 0.15);
  
  /* 括号匹配 */
  --lanismd-cm-bracket-match: rgba(37, 99, 235, 0.2);
  --lanismd-cm-bracket-outline: rgba(37, 99, 235, 0.3);
}
```

---

## 七、语法高亮变量

```css
:root {
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

---

## 八、表格变量

```css
:root {
  --lanismd-table-border: 1px solid var(--lanismd-border-color);
  --lanismd-table-border-radius: 0;
  --lanismd-table-margin: 1em 0;
  
  /* 表头 */
  --lanismd-table-header-bg: #f8fafc;
  --lanismd-table-header-text: var(--lanismd-text-color);
  --lanismd-table-header-font-weight: 600;
  --lanismd-table-header-padding: 10px 14px;
  
  /* 单元格 */
  --lanismd-table-cell-padding: 10px 14px;
  --lanismd-table-cell-border: 1px solid var(--lanismd-border-color);
  
  /* 行悬停 */
  --lanismd-table-row-hover: rgba(0, 0, 0, 0.02);
  
  /* 斑马纹 */
  --lanismd-table-stripe-bg: rgba(0, 0, 0, 0.01);
}
```

---

## 九、源码模式变量

```css
:root {
  /* ===== 源码编辑器 ===== */
  --lanismd-source-bg: var(--lanismd-editor-bg);
  --lanismd-source-text: var(--lanismd-editor-text);
  --lanismd-source-font-family: var(--lanismd-font-mono);
  --lanismd-source-font-size: 15px;
  --lanismd-source-line-height: 1.75;
  
  /* Markdown 语法高亮 */
  --lanismd-source-header-color: var(--lanismd-h1-color);
  --lanismd-source-header-weight: 600;
  --lanismd-source-h1-size: 1.5em;
  --lanismd-source-h2-size: 1.3em;
  --lanismd-source-h3-size: 1.15em;
  
  --lanismd-source-strong-weight: 600;
  --lanismd-source-emphasis-style: italic;
  --lanismd-source-strikethrough-decoration: line-through;
  --lanismd-source-strikethrough-opacity: 0.7;
  
  --lanismd-source-link-color: var(--lanismd-link-color);
  --lanismd-source-url-opacity: 0.7;
  
  --lanismd-source-quote-color: var(--lanismd-blockquote-text-color);
  --lanismd-source-quote-style: italic;
  
  --lanismd-source-list-marker-color: var(--lanismd-accent);
  --lanismd-source-hr-color: var(--lanismd-hr-color);
  
  --lanismd-source-code-fence-color: var(--lanismd-text-muted);
  --lanismd-source-inline-code-bg: var(--lanismd-inline-code-bg);
  --lanismd-source-inline-code-color: var(--lanismd-inline-code-color);
}
```

---

## 十、数学公式/图表变量

```css
:root {
  /* ===== 数学公式 ===== */
  --lanismd-math-text-color: var(--lanismd-text-color);
  --lanismd-math-bg: transparent;
  --lanismd-math-block-margin: 1em 0;
  --lanismd-math-block-padding: 1em;
  
  /* ===== Mermaid 图表 ===== */
  --lanismd-mermaid-bg: transparent;
  --lanismd-mermaid-text: var(--lanismd-text-color);
  --lanismd-mermaid-line: var(--lanismd-border-color);
  --lanismd-mermaid-primary: var(--lanismd-accent);
  --lanismd-mermaid-secondary: #64748b;
}
```

---

## 十一、UI 组件变量

### 11.1 对话框/弹窗 🔧

> ⚠️ **需要组件改造**：当前 `SettingsDialog.tsx` 使用硬编码样式。

```css
:root {
  /* ===== 对话框/弹窗 ===== */
  --lanismd-dialog-bg: var(--lanismd-editor-bg);                    /* 🔧 需组件消费 */
  --lanismd-dialog-border: 1px solid var(--lanismd-border-color);   /* 🔧 需组件消费 */
  --lanismd-dialog-border-radius: 12px;                             /* 🔧 需组件消费 */
  --lanismd-dialog-shadow: var(--lanismd-shadow-lg);                /* 🔧 需组件消费 */
  --lanismd-dialog-header-bg: transparent;
  --lanismd-dialog-header-border: 1px solid var(--lanismd-border-color);
  
  /* 设置弹窗导航 */
  --lanismd-dialog-width: 60%;                                       /* 🔧 需组件消费 */
  --lanismd-dialog-max-width: 900px;                                 /* 🔧 需组件消费 */
  --lanismd-dialog-max-height: 80%;                                  /* 🔧 需组件消费 */
  --lanismd-dialog-nav-width: 160px;                                 /* 🔧 需组件消费 */
  --lanismd-dialog-nav-bg: var(--lanismd-sidebar-bg);               /* 🔧 需组件消费 */
}
```

### 11.2 斜杠菜单 ✅

```css
:root {
  /* ===== 斜杠菜单 ===== */
  --lanismd-slash-menu-bg: var(--lanismd-editor-bg);
  --lanismd-slash-menu-border: 1px solid var(--lanismd-border-color);
  --lanismd-slash-menu-border-radius: 8px;
  --lanismd-slash-menu-shadow: var(--lanismd-shadow-md);
  --lanismd-slash-menu-item-hover-bg: var(--lanismd-hover-bg);
  --lanismd-slash-menu-item-active-bg: var(--lanismd-selected-bg);
}
```

### 11.3 工具提示 ✅

```css
:root {
  /* ===== 工具提示 ===== */
  --lanismd-tooltip-bg: var(--lanismd-editor-bg);
  --lanismd-tooltip-text: var(--lanismd-editor-text);
  --lanismd-tooltip-border: 1px solid var(--lanismd-border-color);
  --lanismd-tooltip-border-radius: 6px;
  --lanismd-tooltip-shadow: var(--lanismd-shadow-md);
}
```

### 11.4 右键菜单

```css
:root {
  /* ===== 右键菜单 ===== */
  --lanismd-context-menu-bg: var(--lanismd-editor-bg);
  --lanismd-context-menu-border: 1px solid var(--lanismd-border-color);
  --lanismd-context-menu-border-radius: 8px;
  --lanismd-context-menu-shadow: var(--lanismd-shadow-lg);
  --lanismd-context-menu-item-hover-bg: var(--lanismd-hover-bg);
  --lanismd-context-menu-separator: var(--lanismd-border-color);
}
```

---

## 十二、专注模式变量

```css
:root {
  --lanismd-focus-mode-blur-opacity: 0.4;
  --lanismd-focus-mode-blur-color: var(--lanismd-text-muted);
  --lanismd-focus-mode-transition: opacity 0.3s ease;
}
```

---

## 十三、打印样式变量

```css
@media print {
  :root {
    --lanismd-print-bg: white;
    --lanismd-print-text: black;
    --lanismd-print-link-color: #0066cc;
    --lanismd-print-code-bg: #f5f5f5;
    --lanismd-print-page-margin: 20mm;
  }
}
```

---

## 十四、变量统计与实现状态

> **更新于 2026-04-08**：阶段 1-3 已完成，新增约 50+ 个 CSS 变量

| 类别 | 当前变量数 | 升级后变量数 | 实现状态 |
|------|----------|-------------|---------|
| 设计 Token | 20 | 20 (不变) | ✅ 已实现 |
| 全局/窗口 | 5 | 5 | ✅ 已实现 |
| 编辑器区域 | 3 | 3 | ✅ 已实现 |
| 侧边栏 | 5 | 7 | ✅ 已实现（新增 active-text/border） |
| 文件树 | 0 | 15 (新增) | 🔧 需组件改造 |
| 大纲 | 0 | 18 (新增) | 🔧 需组件改造 |
| 标题栏 | 2 | 2 | ✅ 已实现 |
| 强调色 | 4 | 4 | ✅ 已实现 |
| 状态色 | 3 | 4 | ✅ 已实现（新增 info） |
| 交互状态 | 3 | 3 | ✅ 已实现 |
| 阴影 | 3 | 3 | ✅ 已实现 |
| 滚动条 | 2 | 5 | ⚠️ 部分实现 |
| 标题 H1-H6 | 1 | 60+ (新增) | ✅ 已实现（颜色变量） |
| 段落 | 0 | 2 (新增) | ❌ 待实现 |
| 链接 | 2 | 4 | ⚠️ 部分实现 |
| 文字格式 | 0 | 10+ (新增) | ❌ 待实现 |
| 行内代码 | 2 | 7 | ⚠️ 部分实现 |
| 引用块 | 3 | 20+ (新增) | ✅ 已实现（分级引用 L1-L4） |
| 列表 | 0 | 25+ (新增) | ✅ 已实现（标记色、任务列表） |
| 代码块 | 18 | 40+ | ✅ 已实现（窗口装饰、工具栏） |
| 语法高亮 | 18 | 18 | ✅ 已实现 |
| 表格 | 4 | 12 | ⚠️ 部分实现 |
| 源码模式 | 0 | 15+ (新增) | ❌ 待实现 |
| 数学/图表 | 0 | 8 (新增) | ❌ 待实现 |
| UI 组件 | 0 | 20+ (新增) | 🔧 需组件改造 |
| **总计** | **~85** | **~300** | **~135 已实现** |

### 实现状态图例

| 状态 | 说明 |
|------|------|
| ✅ 已实现 | 变量已定义且组件已消费 |
| ⚠️ 部分实现 | 变量已定义但组件未完全消费 |
| 🔧 需组件改造 | 需要先完成组件改造（P0 优先级） |
| ❌ 待实现 | 变量和样式都需要实现 |

### 2026-04-08 更新内容

本次更新完成了阶段 1-3 的工作，主要变更包括：

| 变更类型 | 具体内容 |
|---------|---------|
| **H1-H6 颜色变量** | 每级标题可独立设置颜色，4 个主题已定义 |
| **分级引用 L1-L4** | 边框色、背景、文本色，通过 `:has()` 选择器实现 |
| **列表标记变量** | `--lanismd-ul-marker-color`、`--lanismd-ol-marker-color` |
| **任务列表变量** | 复选框边框、背景、选中状态完整自定义 |
| **代码块窗口装饰** | macOS 风格红黄绿点变量 |
| **代码块工具栏** | 语言标签、复制按钮变量化 |
| **侧边栏增强** | 选中项文本色、边框色变量 |
| **状态色增强** | 新增 `--lanismd-info` 变量 |

**变更文件**：
- `src/styles/variables.css` - 默认值定义
- `src/styles/themes/light.css` - 浅色主题
- `src/styles/themes/dark.css` - 深色主题
- `src/styles/themes/sepia.css` - 护眼主题
- `src/styles/themes/nord.css` - Nord 主题
- `src/styles/editor/typography.css` - 标题样式
- `src/styles/editor/blockquote.css` - 引用块样式
- `src/styles/editor/list.css` - 列表样式
- `src/styles/editor/code-block.css` - 代码块样式
- `src/styles/themes/_variables-full.css` - 完整变量参考（新增）

---

## 十五、兼容性说明

### 15.1 向后兼容

- 现有变量保持不变，只是扩展
- 新变量使用 `var()` 引用现有变量作为默认值
- 现有主题文件不需要大改，只需逐步补充新变量

### 15.2 CSS 选择器

保持现有选择器结构：
```css
/* Milkdown 编辑器 */
.milkdown-editor-root .ProseMirror { ... }

/* 源码编辑器 */
.source-editor-root .cm-editor { ... }

/* 组件 */
.milkdown-slash { ... }
.milkdown-tooltip { ... }
```

### 15.3 主题类名

保持现有类名约定：
```css
:root,
.light,
.theme-light { ... }

.dark,
.theme-dark { ... }

.theme-sepia { ... }
.theme-nord { ... }
```

---

## 十六、实现优先级

### 先决条件（P-1，最高优先级）

> ⚠️ 以下任务是实现完整主题自定义能力的**先决条件**，需要在其他工作之前完成。

| 任务 | 说明 | 影响范围 |
|------|------|---------|
| **FileTree.tsx 组件改造** | 添加 CSS 类和 data 属性支持连线 | 文件树连线、缩进样式 |
| **Sidebar.tsx 大纲改造** | 将硬编码样式改为 CSS 变量驱动 | 大纲连线、层级样式 |
| **SettingsDialog.tsx 变量化** | 提取硬编码样式为 CSS 变量 | 设置弹窗外观 |
| **theme-loader.ts 服务** | 实现用户自定义 CSS/字体加载 | 用户主题、自定义字体 |

### P0 - 必须实现（在先决条件完成后）
- ✅ H1-H6 独立变量（颜色已实现）
- ✅ 分级引用变量（L1-L4 已实现）
- ✅ 列表样式变量（标记色、任务列表已实现）
- ✅ 代码块窗口装饰（macOS 风格已实现）
- 🔧 文件树增强变量（需组件改造）
- 🔧 大纲增强变量（需组件改造）

### P1 - 高优先级
- 源码模式变量
- UI 组件变量（斜杠菜单、工具提示等）
- 用户自定义 CSS 加载功能

### P2 - 中优先级
- 自定义字体加载
- 数学公式/图表变量
- 打印样式变量

### P3 - 低优先级
- 专注模式变量
- 自定义图标系统
- Typora 主题兼容层

---

## 十七、用户主题开发指南（预览）

> 📦 **前提**：需要先实现 `theme-loader.ts` 服务。

### 主题文件结构

```
~/.lanismd/themes/
├── base.user.css                     # 全局自定义（所有主题生效）
├── light.user.css                    # light 主题自定义
├── dark.user.css                     # dark 主题自定义
├── my-custom-theme/                  # 自定义主题目录
│   ├── theme.css                     # 主题主文件
│   ├── fonts/                        # 自定义字体
│   │   └── MyFont.woff2
│   └── theme.json                    # 主题元数据
```

### 示例：添加文件树连线

> 🔧 需要先完成 `FileTree.tsx` 组件改造。

```css
/* ~/.lanismd/themes/base.user.css */

/* 启用文件树连线 */
:root {
  --lanismd-file-tree-line-display: block;
  --lanismd-file-tree-line-color: #d0d0d0;
  --lanismd-file-tree-line-style: solid;
}

/* 连线样式通过伪元素实现 */
.file-tree-node::before {
  content: '';
  position: absolute;
  left: calc(var(--tree-depth) * var(--lanismd-file-tree-indent) + 8px);
  top: 0;
  bottom: 0;
  width: var(--lanismd-file-tree-line-width);
  background: var(--lanismd-file-tree-line-color);
  display: var(--lanismd-file-tree-line-display);
}
```

### 示例：自定义字体

> 📦 需要先实现 `theme-loader.ts` 字体加载功能。

```css
/* ~/.lanismd/themes/my-custom-theme/theme.css */

@font-face {
  font-family: 'MyCustomFont';
  src: url('./fonts/MyFont.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
}

:root {
  --lanismd-font-body: 'MyCustomFont', sans-serif;
  --lanismd-editor-font-family: var(--lanismd-font-body);
}
```

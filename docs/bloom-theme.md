# LanisMD Bloom 主题系列实现方案

> 本文档详细规划了将 Typora Bloom 主题系列移植到 LanisMD 的完整实现方案。
>
> **文档版本**: 1.0  
> **创建时间**: 2026-04-09  
> **目标**: 将 16 个 Bloom 主题（8 浅色 + 8 深色）作为内置主题添加到 LanisMD

---

## 一、项目概述

### 1.1 Bloom 主题介绍

Bloom 是一套采用莫兰迪（Morandi）色调的现代 Markdown 主题系列，具有以下特点：

- **8 种色调变体**：Petal（玫瑰粉）、Spring（薰衣草紫）、Amber（琥珀黄）、Ink（朱砂墨）、Mist（雾蓝）、Ripple（青绿）、Stone（石褐）、Verdant（翠绿）
- **深浅双版本**：每种色调都有对应的浅色和深色版本
- **OKLCH 颜色系统**：使用现代 OKLCH 颜色空间定义颜色，支持更精确的色彩控制
- **MiSans 字体**：使用小米 MiSans 字体（Regular/Medium/Semibold）
- **macOS 风格代码块**：红黄绿三色窗口控件装饰
- **渐变背景效果**：使用 radial-gradient 和 linear-gradient 创建层次感
- **GitHub Alerts 支持**：完整支持 NOTE/TIP/WARNING/IMPORTANT/CAUTION 五种提示类型

### 1.2 源文件位置

```
typora-themes/bloom/
├── bloom/fonts/          # MiSans 字体文件
│   ├── MiSans-Regular.ttf
│   ├── MiSans-Medium.ttf
│   └── MiSans-Semibold.ttf
├── bloom-petal.css       # 浅色主题
├── bloom-petal-dark.css  # 深色主题
├── bloom-spring.css
├── bloom-spring-dark.css
├── bloom-amber.css
├── bloom-amber-dark.css
├── bloom-ink.css
├── bloom-ink-dark.css
├── bloom-mist.css
├── bloom-mist-dark.css
├── bloom-ripple.css
├── bloom-ripple-dark.css
├── bloom-stone.css
├── bloom-stone-dark.css
├── bloom-verdant.css
└── bloom-verdant-dark.css
```

---

## 二、主题清单

### 2.1 完整主题列表（16 个）

| 序号 | 主题 ID | 显示名称 | 色调描述 | isDark | Hue (OKLCH) |
|------|---------|----------|----------|--------|-------------|
| 1 | `bloom-petal` | Bloom Petal | 玫瑰粉 | false | 350 |
| 2 | `bloom-petal-dark` | Bloom Petal Dark | 玫瑰粉（深色） | true | 350 |
| 3 | `bloom-spring` | Bloom Spring | 薰衣草紫 | false | 295 |
| 4 | `bloom-spring-dark` | Bloom Spring Dark | 薰衣草紫（深色） | true | 295 |
| 5 | `bloom-amber` | Bloom Amber | 琥珀黄 | false | 65 |
| 6 | `bloom-amber-dark` | Bloom Amber Dark | 琥珀黄（深色） | true | 65 |
| 7 | `bloom-ink` | Bloom Ink | 朱砂墨 | false | 30 |
| 8 | `bloom-ink-dark` | Bloom Ink Dark | 朱砂墨（深色） | true | 30 |
| 9 | `bloom-mist` | Bloom Mist | 雾蓝 | false | 240 |
| 10 | `bloom-mist-dark` | Bloom Mist Dark | 雾蓝（深色） | true | 240 |
| 11 | `bloom-ripple` | Bloom Ripple | 青绿 | false | 195 |
| 12 | `bloom-ripple-dark` | Bloom Ripple Dark | 青绿（深色） | true | 195 |
| 13 | `bloom-stone` | Bloom Stone | 石褐 | false | 40 |
| 14 | `bloom-stone-dark` | Bloom Stone Dark | 石褐（深色） | true | 40 |
| 15 | `bloom-verdant` | Bloom Verdant | 翠绿 | false | 160 |
| 16 | `bloom-verdant-dark` | Bloom Verdant Dark | 翠绿（深色） | true | 160 |

### 2.2 各主题 Accent 配色参数

#### 浅色主题

| 主题 | --accent (OKLCH) | --accent-rgb | --bg (OKLCH) | --text (OKLCH) |
|------|------------------|--------------|--------------|----------------|
| Petal | `oklch(64% 0.22 350)` | `232, 133, 155` | `oklch(98% 0.01 350)` | `oklch(25% 0.02 354)` |
| Spring | `oklch(60% 0.14 295)` | `168, 115, 196` | `oklch(96% 0.01 295)` | `oklch(25% 0.02 295)` |
| Amber | `oklch(60% 0.14 65)` | `195, 135, 75` | `oklch(97% 0.01 45)` | `oklch(25% 0.02 45)` |
| Ink | `oklch(58% 0.16 30)` | `204, 88, 77` | `oklch(97% 0.002 240)` | `oklch(20% 0.01 240)` |
| Mist | `oklch(50% 0.08 240)` | `146, 168, 179` | `oklch(96% 0.01 240)` | `oklch(25% 0.02 240)` |
| Ripple | `oklch(62% 0.12 195)` | `95, 168, 178` | `oklch(96% 0.01 195)` | `oklch(25% 0.02 195)` |
| Stone | `oklch(50% 0.06 40)` | `177, 164, 158` | `oklch(96% 0.01 60)` | `oklch(25% 0.02 40)` |
| Verdant | `oklch(50% 0.07 160)` | `160, 176, 167` | `oklch(96% 0.01 160)` | `oklch(25% 0.02 160)` |

#### 深色主题

| 主题 | --accent (OKLCH) | --bg (OKLCH) | --text (OKLCH) |
|------|------------------|--------------|----------------|
| Petal Dark | `oklch(75% 0.18 350)` | `oklch(28% 0.02 350)` | `oklch(98% 0.01 350)` |
| Spring Dark | `oklch(75% 0.16 295)` | `oklch(28% 0.02 295)` | `oklch(98% 0.01 295)` |
| Amber Dark | `oklch(75% 0.14 65)` | `oklch(28% 0.02 45)` | `oklch(98% 0.01 45)` |
| Ink Dark | `oklch(72% 0.14 30)` | `oklch(22% 0.01 240)` | `oklch(95% 0.01 240)` |
| Mist Dark | `oklch(70% 0.1 240)` | `oklch(28% 0.02 240)` | `oklch(98% 0.01 240)` |
| Ripple Dark | `oklch(75% 0.12 195)` | `oklch(28% 0.02 195)` | `oklch(98% 0.01 195)` |
| Stone Dark | `oklch(70% 0.06 40)` | `oklch(28% 0.02 40)` | `oklch(98% 0.01 40)` |
| Verdant Dark | `oklch(70% 0.08 160)` | `oklch(28% 0.02 160)` | `oklch(98% 0.01 160)` |

---

## 三、技术分析

### 3.1 Bloom 主题变量结构

Bloom 主题使用以下变量层级：

```css
:root {
  /* === 间距系统 (8px 基准) === */
  --space-unit: 8px;
  --space-xs: calc(var(--space-unit) * 1);   /* 8px */
  --space-sm: calc(var(--space-unit) * 1.5); /* 12px */
  --space-md: calc(var(--space-unit) * 2);   /* 16px */
  --space-lg: calc(var(--space-unit) * 3);   /* 24px */
  --space-xl: calc(var(--space-unit) * 4);   /* 32px */
  --space-2xl: calc(var(--space-unit) * 6);  /* 48px */
  --space-3xl: calc(var(--space-unit) * 8);  /* 64px */

  /* === 主色调 === */
  --accent: oklch(64% 0.22 350);
  --accent-rgb: 232, 133, 155;
  --accent-hover: color-mix(in oklch, var(--accent), black 8%);
  --accent-active: color-mix(in oklch, var(--accent), black 15%);
  --accent-soft: color-mix(in oklch, var(--accent), transparent 88%);

  /* === 语义色 === */
  --success: oklch(70% 0.1 150);
  --warning: oklch(75% 0.1 75);
  --error: oklch(60% 0.12 25);
  --info: oklch(62% 0.1 250);
  --important: oklch(65% 0.16 280);

  /* === 中性色 === */
  --bg: oklch(98% 0.01 350);
  --surface: oklch(96% 0.015 350);
  --surface-2: oklch(94% 0.02 350);
  --text: oklch(25% 0.02 354);
  --text-rgb: 68, 58, 62;
  --text-semi: oklch(45% 0.02 354);
  --muted: color-mix(in oklch, var(--text), transparent 45%);
  --border: color-mix(in oklch, var(--text), transparent 90%);
  --border-semi: color-mix(in oklch, var(--text), transparent 80%);

  /* === 阴影 === */
  --shadow-sm: 0 2px 8px color-mix(in oklch, var(--text), transparent 96%);
  --shadow: 0 10px 30px color-mix(in oklch, var(--text), transparent 94%);
  --shadow-lg: 0 24px 60px color-mix(in oklch, var(--text), transparent 90%);

  /* === 字体 === */
  --font-sans: "MiSans", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace;

  /* === 代码块 === */
  --code-bg: var(--surface);
  --code-text: var(--text-semi);
  --code-ink: var(--text);
  --code-dot-red: oklch(65% 0.12 25);
  --code-dot-yellow: oklch(78% 0.12 85);
  --code-dot-green: oklch(72% 0.12 145);

  /* === 代码语法高亮 === */
  --code-token-keyword: oklch(65% 0.2 350);
  --code-token-string: oklch(52% 0.12 140);
  --code-token-number: oklch(58% 0.12 40);
  --code-token-blue: oklch(48% 0.12 260);
}
```

### 3.2 与 LanisMD 变量映射

| Bloom 变量 | LanisMD 变量 | 说明 |
|------------|--------------|------|
| `--bg` | `--lanismd-editor-bg` | 编辑器背景 |
| `--surface` | `--lanismd-sidebar-bg` | 侧边栏背景 |
| `--text` | `--lanismd-editor-text` | 主文本颜色 |
| `--text-semi` | `--lanismd-sidebar-text` | 次要文本 |
| `--accent` | `--lanismd-accent` | 强调色 |
| `--accent-hover` | `--lanismd-accent-hover` | 强调色悬停 |
| `--accent-soft` | `--lanismd-accent-light` | 强调色淡化 |
| `--border` | `--lanismd-editor-border` | 边框色 |
| `--success` | `--lanismd-success` | 成功色 |
| `--warning` | `--lanismd-warning` | 警告色 |
| `--error` | `--lanismd-danger` | 危险色 |
| `--info` | `--lanismd-info` | 信息色 |
| `--shadow` | `--lanismd-shadow-md` | 中等阴影 |
| `--shadow-lg` | `--lanismd-shadow-lg` | 大阴影 |
| `--code-bg` | `--lanismd-code-bg` | 代码块背景 |
| `--code-dot-red/yellow/green` | `--lanismd-codeblock-dot-*` | macOS 窗口装饰 |
| `--code-token-*` | `--lanismd-syntax-*` | 语法高亮 |
| `--font-sans` | `--lanismd-font-sans` | 无衬线字体 |
| `--font-mono` | `--lanismd-font-mono` | 等宽字体 |

### 3.3 特殊样式处理

#### 3.3.1 渐变背景

Bloom 使用多层渐变创建背景层次感：

```css
/* 浅色主题背景 */
html, body {
  background: 
    radial-gradient(1400px circle at 16% 10%, rgba(var(--accent-rgb), 0.08), transparent 36%),
    linear-gradient(150deg, rgba(var(--accent-rgb), 0.05), transparent 48%),
    linear-gradient(180deg, rgba(var(--white-rgb), 0.7), transparent 340px),
    var(--bg);
}

/* 深色主题背景 */
html, body {
  background: 
    radial-gradient(1200px circle at 18% 8%, rgba(var(--accent-rgb), 0.06), transparent 36%),
    linear-gradient(180deg, rgba(var(--white-rgb), 0.02), transparent 300px),
    linear-gradient(180deg, var(--page-depth-1) 0%, var(--page-depth-2) 100%),
    var(--bg);
}
```

**LanisMD 实现方案**：在 `.milkdown-editor-root` 或 `.theme-bloom-*` 选择器上应用渐变背景。

#### 3.3.2 标题装饰线

Bloom 使用 `::after` 伪元素在标题下方添加渐变装饰线：

```css
#write h1::after,
#write h2::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -0.5em;
  width: 76px;
  height: 3px;
  background: linear-gradient(90deg, rgba(var(--accent-rgb), 0.45), transparent);
  border-radius: 999px;
}
```

**LanisMD 实现方案**：在 `typography.css` 中为 Bloom 主题添加标题装饰样式。

#### 3.3.3 代码块 macOS 装饰

Bloom 使用 `::before` 伪元素添加红黄绿三色圆点：

```css
#write pre.md-fences::before {
  content: "";
  position: absolute;
  top: 14px;
  left: 14px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--code-dot-red);
  box-shadow: 18px 0 0 var(--code-dot-yellow), 36px 0 0 var(--code-dot-green);
  z-index: 2;
}
```

**LanisMD 实现方案**：LanisMD 已支持 `--lanismd-codeblock-dot-*` 变量，需在 `code-block.css` 中启用 macOS 装饰。

---

## 四、实现步骤

### 阶段 1: 基础设施准备 [预计 0.5 天]

#### 步骤 1.1: 复制字体文件

```bash
# 创建 Bloom 字体目录
mkdir -p src/styles/themes/bloom/fonts

# 复制 MiSans 字体
cp typora-themes/bloom/bloom/fonts/*.ttf src/styles/themes/bloom/fonts/
```

**需要复制的文件**：
- `MiSans-Regular.ttf`
- `MiSans-Medium.ttf`
- `MiSans-Semibold.ttf`

#### 步骤 1.2: 创建 Bloom 基础样式文件

创建 `src/styles/themes/bloom/bloom-base.css`，包含所有 Bloom 主题共享的样式：

```css
/* src/styles/themes/bloom/bloom-base.css */

/* MiSans 字体定义 */
@font-face {
  font-family: "MiSans";
  src: url("./fonts/MiSans-Regular.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "MiSans";
  src: url("./fonts/MiSans-Medium.ttf") format("truetype");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "MiSans";
  src: url("./fonts/MiSans-Semibold.ttf") format("truetype");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

/* Bloom 主题通用字体设置 */
[class*="theme-bloom"] {
  --lanismd-font-sans: "MiSans", "PingFang SC", "Microsoft YaHei", sans-serif;
}
```

### 阶段 2: 修改类型定义 [预计 0.5 天]

#### 步骤 2.1: 更新 `src/types/config.ts`

```typescript
// 添加 Bloom 主题到 BuiltinTheme 类型
export type BuiltinTheme = 
  | 'light' 
  | 'dark' 
  | 'sepia' 
  | 'nord'
  | 'bloom-petal'
  | 'bloom-petal-dark'
  | 'bloom-spring'
  | 'bloom-spring-dark'
  | 'bloom-amber'
  | 'bloom-amber-dark'
  | 'bloom-ink'
  | 'bloom-ink-dark'
  | 'bloom-mist'
  | 'bloom-mist-dark'
  | 'bloom-ripple'
  | 'bloom-ripple-dark'
  | 'bloom-stone'
  | 'bloom-stone-dark'
  | 'bloom-verdant'
  | 'bloom-verdant-dark';

// 更新 BUILTIN_THEME_LIST
export const BUILTIN_THEME_LIST: ThemeInfo[] = [
  // 原有主题
  { id: 'light', name: 'Light', description: '清爽浅色主题', isDark: false },
  { id: 'dark', name: 'Dark', description: 'Tokyo Night 深色主题', isDark: true },
  { id: 'sepia', name: 'Sepia', description: '护眼复古主题', isDark: false },
  { id: 'nord', name: 'Nord', description: 'Nord 极地风格', isDark: true },
  
  // Bloom 系列 - 浅色
  { id: 'bloom-petal', name: 'Bloom Petal', description: '莫兰迪玫瑰粉', isDark: false },
  { id: 'bloom-spring', name: 'Bloom Spring', description: '莫兰迪薰衣草紫', isDark: false },
  { id: 'bloom-amber', name: 'Bloom Amber', description: '莫兰迪琥珀黄', isDark: false },
  { id: 'bloom-ink', name: 'Bloom Ink', description: '莫兰迪朱砂墨', isDark: false },
  { id: 'bloom-mist', name: 'Bloom Mist', description: '莫兰迪雾蓝', isDark: false },
  { id: 'bloom-ripple', name: 'Bloom Ripple', description: '莫兰迪青绿', isDark: false },
  { id: 'bloom-stone', name: 'Bloom Stone', description: '莫兰迪石褐', isDark: false },
  { id: 'bloom-verdant', name: 'Bloom Verdant', description: '莫兰迪翠绿', isDark: false },
  
  // Bloom 系列 - 深色
  { id: 'bloom-petal-dark', name: 'Bloom Petal Dark', description: '莫兰迪玫瑰粉（深色）', isDark: true },
  { id: 'bloom-spring-dark', name: 'Bloom Spring Dark', description: '莫兰迪薰衣草紫（深色）', isDark: true },
  { id: 'bloom-amber-dark', name: 'Bloom Amber Dark', description: '莫兰迪琥珀黄（深色）', isDark: true },
  { id: 'bloom-ink-dark', name: 'Bloom Ink Dark', description: '莫兰迪朱砂墨（深色）', isDark: true },
  { id: 'bloom-mist-dark', name: 'Bloom Mist Dark', description: '莫兰迪雾蓝（深色）', isDark: true },
  { id: 'bloom-ripple-dark', name: 'Bloom Ripple Dark', description: '莫兰迪青绿（深色）', isDark: true },
  { id: 'bloom-stone-dark', name: 'Bloom Stone Dark', description: '莫兰迪石褐（深色）', isDark: true },
  { id: 'bloom-verdant-dark', name: 'Bloom Verdant Dark', description: '莫兰迪翠绿（深色）', isDark: true },
  
  // 系统主题
  { id: 'system', name: 'System', description: '跟随系统设置', isDark: false },
];
```

### 阶段 3: 实现浅色主题 [预计 2 天]

按以下顺序实现 8 个浅色主题：

#### 步骤 3.1: 创建 Bloom Petal 浅色主题

**文件**: `src/styles/themes/bloom/bloom-petal.css`

```css
/**
 * LanisMD Bloom Petal Theme
 * 莫兰迪玫瑰粉 - 浅色版
 */

@import './bloom-base.css';

.theme-bloom-petal {
  /* === 主色调 (Hue: 350) === */
  --lanismd-accent: oklch(64% 0.22 350);
  --lanismd-accent-hover: oklch(58% 0.22 350);
  --lanismd-accent-light: oklch(90% 0.08 350);
  --lanismd-accent-contrast: #ffffff;
  
  /* === 编辑器区域 === */
  --lanismd-editor-bg: oklch(98% 0.01 350);
  --lanismd-editor-text: oklch(25% 0.02 354);
  --lanismd-editor-border: oklch(90% 0.02 350);
  
  /* === 侧边栏 === */
  --lanismd-sidebar-bg: oklch(96% 0.015 350);
  --lanismd-sidebar-text: oklch(45% 0.02 354);
  --lanismd-sidebar-border: oklch(90% 0.02 350);
  --lanismd-sidebar-hover: oklch(94% 0.02 350);
  --lanismd-sidebar-active: oklch(90% 0.08 350);
  --lanismd-sidebar-active-text: oklch(40% 0.18 350);
  --lanismd-sidebar-active-border: oklch(64% 0.22 350);
  
  /* === 标题栏 === */
  --lanismd-titlebar-bg: oklch(96% 0.015 350);
  --lanismd-titlebar-text: oklch(25% 0.02 354);
  
  /* === 状态色 (莫兰迪风格) === */
  --lanismd-success: oklch(70% 0.1 150);
  --lanismd-warning: oklch(75% 0.1 75);
  --lanismd-danger: oklch(60% 0.12 25);
  --lanismd-info: oklch(62% 0.1 250);
  
  /* === 阴影 === */
  --lanismd-shadow-sm: 0 2px 8px oklch(25% 0.02 354 / 4%);
  --lanismd-shadow-md: 0 10px 30px oklch(25% 0.02 354 / 6%);
  --lanismd-shadow-lg: 0 24px 60px oklch(25% 0.02 354 / 10%);
  
  /* === 代码块 === */
  --lanismd-code-bg: oklch(96% 0.015 350);
  --lanismd-code-toolbar-bg: oklch(94% 0.02 350);
  --lanismd-codeblock-dot-red: oklch(65% 0.12 25);
  --lanismd-codeblock-dot-yellow: oklch(78% 0.12 85);
  --lanismd-codeblock-dot-green: oklch(72% 0.12 145);
  
  /* === 语法高亮 === */
  --lanismd-syntax-keyword: oklch(65% 0.2 350);
  --lanismd-syntax-string: oklch(52% 0.12 140);
  --lanismd-syntax-number: oklch(58% 0.12 40);
  --lanismd-syntax-function: oklch(48% 0.12 260);
  --lanismd-syntax-comment: oklch(60% 0.02 350);
  --lanismd-syntax-variable: oklch(25% 0.02 354);
  --lanismd-syntax-type: oklch(55% 0.14 140);
  --lanismd-syntax-property: oklch(48% 0.12 260);
  
  /* === 标题颜色 === */
  --lanismd-h1-color: oklch(25% 0.02 354);
  --lanismd-h2-color: oklch(30% 0.02 354);
  --lanismd-h3-color: oklch(35% 0.02 354);
  --lanismd-h4-color: oklch(40% 0.02 354);
  --lanismd-h5-color: oklch(45% 0.02 354);
  --lanismd-h6-color: oklch(50% 0.02 354);
  
  /* === 引用块 === */
  --lanismd-blockquote-border: oklch(64% 0.22 350);
  --lanismd-blockquote-bg: oklch(96% 0.015 350);
  
  /* === 列表 === */
  --lanismd-ul-marker-color: oklch(64% 0.18 350);
  --lanismd-ol-marker-color: oklch(64% 0.18 350);
  
  /* === 行内代码 === */
  --lanismd-inline-code-bg: oklch(94% 0.04 350);
  --lanismd-inline-code-text: oklch(50% 0.18 350);
  
  /* === 表格 === */
  --lanismd-table-header-bg: oklch(96% 0.015 350);
  --lanismd-table-border: oklch(90% 0.02 350);
  
  /* === 滚动条 === */
  --lanismd-scrollbar-thumb: oklch(75% 0.04 350);
  --lanismd-scrollbar-thumb-hover: oklch(60% 0.08 350);
}
```

#### 步骤 3.2 - 3.8: 实现其他 7 个浅色主题

按相同模式创建以下文件，仅修改色相值（Hue）：

| 文件名 | Hue 值 |
|--------|--------|
| `bloom-spring.css` | 295 |
| `bloom-amber.css` | 65 |
| `bloom-ink.css` | 30 |
| `bloom-mist.css` | 240 |
| `bloom-ripple.css` | 195 |
| `bloom-stone.css` | 40 |
| `bloom-verdant.css` | 160 |

### 阶段 4: 实现深色主题 [预计 2 天]

#### 步骤 4.1: 创建 Bloom Petal Dark 深色主题

**文件**: `src/styles/themes/bloom/bloom-petal-dark.css`

```css
/**
 * LanisMD Bloom Petal Dark Theme
 * 莫兰迪玫瑰粉 - 深色版
 */

@import './bloom-base.css';

.dark,
.theme-bloom-petal-dark {
  /* === 主色调 (Hue: 350, 深色模式提亮) === */
  --lanismd-accent: oklch(75% 0.18 350);
  --lanismd-accent-hover: oklch(80% 0.18 350);
  --lanismd-accent-light: oklch(35% 0.08 350);
  --lanismd-accent-contrast: oklch(20% 0.02 350);
  
  /* === 编辑器区域 === */
  --lanismd-editor-bg: oklch(28% 0.02 350);
  --lanismd-editor-text: oklch(98% 0.01 350);
  --lanismd-editor-border: oklch(35% 0.02 350);
  
  /* === 侧边栏 === */
  --lanismd-sidebar-bg: oklch(25% 0.02 350);
  --lanismd-sidebar-text: oklch(86% 0.02 350);
  --lanismd-sidebar-border: oklch(35% 0.02 350);
  --lanismd-sidebar-hover: oklch(32% 0.02 350);
  --lanismd-sidebar-active: oklch(35% 0.06 350);
  --lanismd-sidebar-active-text: oklch(90% 0.12 350);
  --lanismd-sidebar-active-border: oklch(75% 0.18 350);
  
  /* === 标题栏 === */
  --lanismd-titlebar-bg: oklch(25% 0.02 350);
  --lanismd-titlebar-text: oklch(98% 0.01 350);
  
  /* === 状态色 (深色模式提亮) === */
  --lanismd-success: oklch(72% 0.1 150);
  --lanismd-warning: oklch(78% 0.1 75);
  --lanismd-danger: oklch(62% 0.12 25);
  --lanismd-info: oklch(65% 0.1 250);
  
  /* === 阴影 === */
  --lanismd-shadow-sm: 0 2px 8px oklch(10% 0.01 350 / 30%);
  --lanismd-shadow-md: 0 16px 48px oklch(10% 0.01 350 / 50%);
  --lanismd-shadow-lg: 0 30px 80px oklch(10% 0.01 350 / 60%);
  
  /* === 代码块 === */
  --lanismd-code-bg: oklch(24% 0.02 350);
  --lanismd-code-toolbar-bg: oklch(22% 0.02 350);
  --lanismd-codeblock-dot-red: oklch(65% 0.12 25);
  --lanismd-codeblock-dot-yellow: oklch(78% 0.12 85);
  --lanismd-codeblock-dot-green: oklch(72% 0.12 145);
  
  /* === 语法高亮 (深色模式提亮) === */
  --lanismd-syntax-keyword: oklch(82% 0.18 350);
  --lanismd-syntax-string: oklch(72% 0.1 145);
  --lanismd-syntax-number: oklch(75% 0.1 75);
  --lanismd-syntax-function: oklch(70% 0.1 250);
  --lanismd-syntax-comment: oklch(55% 0.02 350);
  --lanismd-syntax-variable: oklch(90% 0.01 350);
  --lanismd-syntax-type: oklch(72% 0.1 145);
  --lanismd-syntax-property: oklch(70% 0.1 250);
  
  /* === 标题颜色 === */
  --lanismd-h1-color: oklch(98% 0.01 350);
  --lanismd-h2-color: oklch(92% 0.01 350);
  --lanismd-h3-color: oklch(88% 0.01 350);
  --lanismd-h4-color: oklch(82% 0.01 350);
  --lanismd-h5-color: oklch(78% 0.01 350);
  --lanismd-h6-color: oklch(70% 0.01 350);
  
  /* === 引用块 === */
  --lanismd-blockquote-border: oklch(75% 0.18 350);
  --lanismd-blockquote-bg: oklch(32% 0.02 350);
  
  /* === 列表 === */
  --lanismd-ul-marker-color: oklch(75% 0.14 350);
  --lanismd-ol-marker-color: oklch(75% 0.14 350);
  
  /* === 行内代码 === */
  --lanismd-inline-code-bg: oklch(35% 0.04 350);
  --lanismd-inline-code-text: oklch(80% 0.14 350);
  
  /* === 表格 === */
  --lanismd-table-header-bg: oklch(32% 0.02 350);
  --lanismd-table-border: oklch(38% 0.02 350);
  
  /* === 滚动条 === */
  --lanismd-scrollbar-thumb: oklch(45% 0.04 350);
  --lanismd-scrollbar-thumb-hover: oklch(55% 0.08 350);
}
```

#### 步骤 4.2 - 4.8: 实现其他 7 个深色主题

按相同模式创建以下文件：

| 文件名 | Hue 值 |
|--------|--------|
| `bloom-spring-dark.css` | 295 |
| `bloom-amber-dark.css` | 65 |
| `bloom-ink-dark.css` | 30 |
| `bloom-mist-dark.css` | 240 |
| `bloom-ripple-dark.css` | 195 |
| `bloom-stone-dark.css` | 40 |
| `bloom-verdant-dark.css` | 160 |

### 阶段 5: 主题导入与注册 [预计 0.5 天]

#### 步骤 5.1: 创建主题索引文件

**文件**: `src/styles/themes/bloom/index.css`

```css
/* Bloom 主题系列索引 */
@import './bloom-base.css';

/* 浅色主题 */
@import './bloom-petal.css';
@import './bloom-spring.css';
@import './bloom-amber.css';
@import './bloom-ink.css';
@import './bloom-mist.css';
@import './bloom-ripple.css';
@import './bloom-stone.css';
@import './bloom-verdant.css';

/* 深色主题 */
@import './bloom-petal-dark.css';
@import './bloom-spring-dark.css';
@import './bloom-amber-dark.css';
@import './bloom-ink-dark.css';
@import './bloom-mist-dark.css';
@import './bloom-ripple-dark.css';
@import './bloom-stone-dark.css';
@import './bloom-verdant-dark.css';
```

#### 步骤 5.2: 在主样式文件中导入

更新 `src/styles/index.css`：

```css
/* 内置主题 */
@import './themes/light.css';
@import './themes/dark.css';
@import './themes/sepia.css';
@import './themes/nord.css';

/* Bloom 主题系列 */
@import './themes/bloom/index.css';
```

#### 步骤 5.3: 更新主题切换逻辑

确保 `src/services/theme-service.ts` 能正确处理 Bloom 主题的类名切换：

```typescript
// 主题类名映射
const themeClassMap: Record<string, string> = {
  'light': 'theme-light',
  'dark': 'theme-dark',
  'sepia': 'theme-sepia',
  'nord': 'theme-nord',
  // Bloom 浅色
  'bloom-petal': 'theme-bloom-petal',
  'bloom-spring': 'theme-bloom-spring',
  'bloom-amber': 'theme-bloom-amber',
  'bloom-ink': 'theme-bloom-ink',
  'bloom-mist': 'theme-bloom-mist',
  'bloom-ripple': 'theme-bloom-ripple',
  'bloom-stone': 'theme-bloom-stone',
  'bloom-verdant': 'theme-bloom-verdant',
  // Bloom 深色
  'bloom-petal-dark': 'theme-bloom-petal-dark',
  'bloom-spring-dark': 'theme-bloom-spring-dark',
  'bloom-amber-dark': 'theme-bloom-amber-dark',
  'bloom-ink-dark': 'theme-bloom-ink-dark',
  'bloom-mist-dark': 'theme-bloom-mist-dark',
  'bloom-ripple-dark': 'theme-bloom-ripple-dark',
  'bloom-stone-dark': 'theme-bloom-stone-dark',
  'bloom-verdant-dark': 'theme-bloom-verdant-dark',
};
```

### 阶段 6: 增强样式 [预计 1 天]

#### 步骤 6.1: 添加 Bloom 特有的标题装饰

创建 `src/styles/themes/bloom/bloom-typography.css`：

```css
/* Bloom 主题标题装饰线 */
[class*="theme-bloom"] .milkdown-editor-root h1::after,
[class*="theme-bloom"] .milkdown-editor-root h2::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -0.5em;
  width: 76px;
  height: 3px;
  background: linear-gradient(90deg, var(--lanismd-accent), transparent);
  border-radius: 999px;
}

[class*="theme-bloom"] .milkdown-editor-root h3::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -0.38em;
  width: 44px;
  height: 2px;
  background: linear-gradient(90deg, color-mix(in oklch, var(--lanismd-accent), transparent 30%), transparent);
  border-radius: 999px;
}

[class*="theme-bloom"] .milkdown-editor-root h4::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -0.34em;
  width: 32px;
  height: 2px;
  background: linear-gradient(90deg, color-mix(in oklch, var(--lanismd-accent), transparent 50%), transparent);
  border-radius: 999px;
}
```

#### 步骤 6.2: 启用代码块 macOS 装饰

在 `src/styles/editor/code-block.css` 中为 Bloom 主题启用窗口装饰：

```css
/* Bloom 主题启用 macOS 窗口装饰 */
[class*="theme-bloom"] .code-block-wrapper::before {
  content: "";
  display: block;
  position: absolute;
  top: 12px;
  left: 14px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--lanismd-codeblock-dot-red);
  box-shadow: 
    18px 0 0 var(--lanismd-codeblock-dot-yellow),
    36px 0 0 var(--lanismd-codeblock-dot-green);
  z-index: 2;
}

[class*="theme-bloom"] .code-block-wrapper {
  padding-top: 40px; /* 为窗口装饰预留空间 */
}
```

### 阶段 7: 测试与优化 [预计 1 天]

#### 步骤 7.1: 视觉测试

- [ ] 测试所有 16 个主题的切换
- [ ] 验证浅色/深色模式的对比度是否足够
- [ ] 检查代码块语法高亮的可读性
- [ ] 验证 GFM Alert 样式在各主题下的表现
- [ ] 测试表格、引用块、列表等元素的样式

#### 步骤 7.2: 性能测试

- [ ] 确保主题切换流畅无闪烁
- [ ] 验证字体加载不阻塞渲染
- [ ] 检查 CSS 文件大小是否合理

#### 步骤 7.3: 兼容性测试

- [ ] macOS 测试
- [ ] Windows 测试
- [ ] Linux 测试（如适用）

---

## 五、文件结构总览

实现完成后的文件结构：

```
src/styles/themes/
├── bloom/
│   ├── fonts/
│   │   ├── MiSans-Regular.ttf
│   │   ├── MiSans-Medium.ttf
│   │   └── MiSans-Semibold.ttf
│   ├── bloom-base.css            # 共享基础样式
│   ├── bloom-typography.css      # 标题装饰样式
│   ├── index.css                # 主题索引
│   ├── bloom-petal.css          # 浅色主题
│   ├── bloom-petal-dark.css     # 深色主题
│   ├── bloom-spring.css
│   ├── bloom-spring-dark.css
│   ├── bloom-amber.css
│   ├── bloom-amber-dark.css
│   ├── bloom-ink.css
│   ├── bloom-ink-dark.css
│   ├── bloom-mist.css
│   ├── bloom-mist-dark.css
│   ├── bloom-ripple.css
│   ├── bloom-ripple-dark.css
│   ├── bloom-stone.css
│   ├── bloom-stone-dark.css
│   ├── bloom-verdant.css
│   └── bloom-verdant-dark.css
├── light.css
├── dark.css
├── sepia.css
└── nord.css
```

---

## 六、工作量估算

| 阶段 | 任务 | 预计时间 | 优先级 |
|------|------|----------|--------|
| 阶段 1 | 基础设施准备（字体、基础样式） | 0.5 天 | P0 |
| 阶段 2 | 修改类型定义 | 0.5 天 | P0 |
| 阶段 3 | 实现 8 个浅色主题 | 2 天 | P0 |
| 阶段 4 | 实现 8 个深色主题 | 2 天 | P1 |
| 阶段 5 | 主题导入与注册 | 0.5 天 | P0 |
| 阶段 6 | 增强样式（标题装饰、代码块装饰） | 1 天 | P1 |
| 阶段 7 | 测试与优化 | 1 天 | P0 |
| **总计** | | **7.5 天** | |

---

## 七、实现顺序建议

### 推荐实现顺序（按优先级）

1. **第 1 轮（核心功能）**：
   - 阶段 1: 复制字体，创建基础样式
   - 阶段 2: 更新类型定义
   - 阶段 5: 主题导入注册
   - 实现 1 个浅色主题作为模板（bloom-petal）

2. **第 2 轮（浅色主题）**：
   - 基于模板批量生成其他 7 个浅色主题
   - 测试浅色主题

3. **第 3 轮（深色主题）**：
   - 实现 1 个深色主题作为模板（bloom-petal-dark）
   - 基于模板批量生成其他 7 个深色主题

4. **第 4 轮（增强与优化）**：
   - 阶段 6: 添加标题装饰、代码块装饰等增强样式
   - 阶段 7: 全面测试

---

## 八、注意事项

### 8.1 OKLCH 颜色兼容性

OKLCH 是现代 CSS 颜色格式，需要确保目标浏览器支持：

```css
/* 回退方案 */
:root {
  --lanismd-accent: #e8859b; /* HEX 回退 */
  --lanismd-accent: oklch(64% 0.22 350); /* OKLCH 优先 */
}
```

**支持情况**：
- Chrome 111+ ✅
- Firefox 113+ ✅
- Safari 15.4+ ✅
- Tauri WebView 使用系统浏览器，通常支持

### 8.2 字体加载策略

MiSans 字体文件较大，建议：

1. 使用 `font-display: swap` 避免 FOIT
2. 考虑字体子集化减小文件大小
3. 提供系统字体回退

### 8.3 主题选择器优先级

确保 Bloom 主题选择器优先级足够高：

```css
/* 使用具体类名 */
.theme-bloom-petal { }

/* 而不是 */
[data-theme="bloom-petal"] { }
```

---

## 九、参考资料

- [Typora Bloom 主题源代码](../typora-themes/bloom/)
- [LanisMD 主题变量参考](./theme-css-variables-reference.md)
- [LanisMD 主题系统分析](./theme-system-analysis.md)
- [OKLCH 颜色空间](https://oklch.com/)
- [MiSans 字体](https://hyperos.mi.com/font)

---

## 十、变更记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0 | 2026-04-09 | 初始版本，包含完整实现方案 |

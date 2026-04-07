# LanisMD 主题贡献指南

本文档面向希望为 LanisMD 贡献新主题的开发者，详细说明了主题系统的架构、命名规范以及接入新主题的完整流程。

## 目录

- [架构概览](#架构概览)
- [快速开始](#快速开始)
- [详细步骤](#详细步骤)
  - [Step 1: 创建主题 CSS 文件](#step-1-创建主题-css-文件)
  - [Step 2: 注册主题入口](#step-2-注册主题入口)
  - [Step 3: 扩展类型定义](#step-3-扩展类型定义)
  - [Step 4: 更新 useTheme Hook](#step-4-更新-usetheme-hook)
  - [Step 5: 添加主题图标](#step-5-添加主题图标)
- [CSS 变量命名规范](#css-变量命名规范)
- [变量分类说明](#变量分类说明)
- [设计原则](#设计原则)
- [测试清单](#测试清单)
- [提交规范](#提交规范)

---

## 架构概览

LanisMD 主题系统基于 **CSS 自定义属性（CSS Variables）** 实现，核心思想是：

```
主题文件定义变量 → 组件消费变量 → 切换主题 = 切换 CSS class
```

**核心文件结构：**

```
src/
├── styles/
│   ├── variables.css          # 设计 Token（与主题无关的常量）
│   └── themes/
│       ├── index.css          # 主题入口（汇总导入所有主题）
│       ├── light.css          # Light 主题
│       ├── dark.css           # Dark 主题
│       ├── sepia.css          # Sepia 主题
│       └── nord.css           # Nord 主题
├── types/
│   └── config.ts              # ThemeMode 类型 & THEME_LIST 元数据
├── hooks/
│   └── useTheme.ts            # 主题切换 Hook
└── components/settings/
    └── SettingsDialog.tsx     # 设置界面（主题选择 UI）
```

---

## 快速开始

添加一个新主题只需 **5 个步骤**，涉及 **5 个文件**：

| 步骤 | 文件 | 操作 |
|------|------|------|
| 1 | `src/styles/themes/{name}.css` | 创建主题 CSS 文件 |
| 2 | `src/styles/themes/index.css` | 添加 `@import` |
| 3 | `src/types/config.ts` | 扩展 `ThemeMode` 类型和 `THEME_LIST` |
| 4 | `src/hooks/useTheme.ts` | 添加主题 class 映射 |
| 5 | `src/components/settings/SettingsDialog.tsx` | 添加主题图标 |

---

## 详细步骤

### Step 1: 创建主题 CSS 文件

在 `src/styles/themes/` 目录下创建新主题文件，如 `dracula.css`：

```css
/**
 * LanisMD Dracula Theme
 * Dracula 主题 - 经典暗色编程主题
 */

.theme-dracula {
  /* ===== 1. 应用 UI ===== */
  
  /* Editor Area */
  --lanismd-editor-bg: #282a36;
  --lanismd-editor-text: #f8f8f2;
  --lanismd-editor-border: #44475a;
  
  /* Sidebar */
  --lanismd-sidebar-bg: #21222c;
  --lanismd-sidebar-text: #6272a4;
  /* ... 更多变量 */
  
  /* ===== 2. 编辑器内容 ===== */
  /* ... */
  
  /* ===== 3. 代码块 ===== */
  /* ... */
}
```

**重要**：
- 选择器格式为 `.theme-{name}`（如 `.theme-dracula`）
- 必须定义**所有**变量，参考 `light.css` 获取完整变量列表
- 建议从现有主题文件复制结构，然后修改颜色值

### Step 2: 注册主题入口

编辑 `src/styles/themes/index.css`，添加新主题的导入：

```css
@import './light.css';
@import './dark.css';
@import './sepia.css';
@import './nord.css';
@import './dracula.css';  /* 新增 */
```

### Step 3: 扩展类型定义

编辑 `src/types/config.ts`：

**3.1 扩展 ThemeMode 类型**

```typescript
// 修改前
export type ThemeMode = 'light' | 'dark' | 'sepia' | 'nord' | 'system';

// 修改后
export type ThemeMode = 'light' | 'dark' | 'sepia' | 'nord' | 'dracula' | 'system';
```

**3.2 添加主题元数据**

在 `THEME_LIST` 数组中添加新主题信息（注意：`system` 应保持在最后）：

```typescript
export const THEME_LIST: ThemeInfo[] = [
  { id: 'light', name: 'Light', description: '清爽浅色主题', isDark: false },
  { id: 'dark', name: 'Dark', description: 'Tokyo Night 深色主题', isDark: true },
  { id: 'sepia', name: 'Sepia', description: '护眼复古主题', isDark: false },
  { id: 'nord', name: 'Nord', description: 'Nord 极地风格', isDark: true },
  { id: 'dracula', name: 'Dracula', description: '经典暗色编程主题', isDark: true },  // 新增
  { id: 'system', name: 'System', description: '跟随系统设置', isDark: false },
];
```

**字段说明**：
- `id`: 主题唯一标识，与 `ThemeMode` 类型值一致
- `name`: 显示名称（建议使用英文主题名）
- `description`: 主题描述（中文）
- `isDark`: 是否为深色主题（影响 Tailwind `dark:` 类的生效）

### Step 4: 更新 useTheme Hook

编辑 `src/hooks/useTheme.ts`：

**4.1 添加 class 映射**

```typescript
const THEME_CLASS_MAP: Record<Exclude<ThemeMode, 'system'>, string[]> = {
  light: ['theme-light'],
  dark: ['theme-dark', 'dark'],
  sepia: ['theme-sepia'],
  nord: ['theme-nord', 'dark'],
  dracula: ['theme-dracula', 'dark'],  // 新增：深色主题需要 'dark' class
};
```

**4.2 更新 class 列表**

```typescript
const ALL_THEME_CLASSES = [
  'light', 'dark', 
  'theme-light', 'theme-dark', 'theme-sepia', 'theme-nord',
  'theme-dracula',  // 新增
];
```

**关于 `dark` class**：
- 深色主题需要同时添加 `dark` class，用于兼容 Tailwind CSS 的 `dark:` 变体
- 浅色主题不需要添加 `dark` class

### Step 5: 添加主题图标

编辑 `src/components/settings/SettingsDialog.tsx`：

**5.1 导入图标**

```typescript
import { RiCloseLine, RiSunLine, RiMoonLine, RiComputerLine } from 'react-icons/ri';
import { TbLeaf, TbSnowflake, TbGhost } from 'react-icons/tb';  // 添加 TbGhost
```

**5.2 添加图标映射**

```typescript
const THEME_ICONS: Record<ThemeMode, React.ReactNode> = {
  system: <RiComputerLine size={13} />,
  light: <RiSunLine size={13} />,
  dark: <RiMoonLine size={13} />,
  sepia: <TbLeaf size={13} />,
  nord: <TbSnowflake size={13} />,
  dracula: <TbGhost size={13} />,  // 新增
};
```

**图标选择建议**：
- 使用 [React Icons](https://react-icons.github.io/react-icons/) 库
- 优先使用 `ri`（Remix Icon）或 `tb`（Tabler Icons）图标集
- 图标应能直观反映主题风格

---

## CSS 变量命名规范

所有变量使用 `--lanismd-` 前缀，采用分层命名：

```
--lanismd-{区域}-{属性}[-{状态}]
```

**示例**：
- `--lanismd-editor-bg` — 编辑器背景色
- `--lanismd-sidebar-hover` — 侧边栏悬停背景
- `--lanismd-accent-light` — 强调色的浅色变体

---

## 变量分类说明

主题需要定义以下几类变量，完整列表请参考 `src/styles/themes/light.css`：

### 1. 应用 UI（约 25 个变量）

| 分类 | 变量前缀 | 说明 |
|------|----------|------|
| Editor | `--lanismd-editor-*` | 编辑器区域背景、文字、边框 |
| Sidebar | `--lanismd-sidebar-*` | 侧边栏背景、文字、悬停、选中状态 |
| Titlebar | `--lanismd-titlebar-*` | 标题栏背景、文字 |
| Accent | `--lanismd-accent*` | 强调色及其变体 |
| Status | `--lanismd-success/warning/danger` | 状态颜色 |
| Interactive | `--lanismd-hover-bg/selected-bg/focus-ring` | 交互状态 |
| Shadows | `--lanismd-shadow-*` | 阴影效果 |
| Scrollbar | `--lanismd-scrollbar-*` | 滚动条样式 |

### 2. 编辑器内容（约 20 个变量）

| 分类 | 变量前缀 | 说明 |
|------|----------|------|
| Typography | `--lanismd-heading-color/text-muted/link-*` | 标题、文字、链接 |
| Inline Code | `--lanismd-inline-code-*` | 行内代码样式 |
| Blockquote | `--lanismd-blockquote-*` | 引用块样式 |
| Table | `--lanismd-table-*` | 表格样式 |
| Selection | `--lanismd-selection-*` | 文本选中样式 |

### 3. 代码块语法高亮（约 20 个变量）

| 变量 | 说明 |
|------|------|
| `--lanismd-code-bg/text/border` | 代码块基础样式 |
| `--lanismd-code-keyword` | 关键字（if, for, return 等） |
| `--lanismd-code-string` | 字符串字面量 |
| `--lanismd-code-number` | 数字字面量 |
| `--lanismd-code-comment` | 注释 |
| `--lanismd-code-function` | 函数名 |
| `--lanismd-code-variable` | 变量名 |
| `--lanismd-code-operator` | 运算符 |
| `--lanismd-code-class` | 类名 |
| `--lanismd-code-property` | 属性名 |
| `--lanismd-code-punctuation` | 标点符号 |
| `--lanismd-code-tag` | HTML/XML 标签 |
| `--lanismd-code-attribute` | 属性 |
| ... | 更多见 `light.css` |

---

## 设计原则

### 颜色对比度

- 主要文字与背景的对比度应 ≥ 4.5:1（WCAG AA 标准）
- 大号文字（≥18px）对比度应 ≥ 3:1
- 可使用 [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) 验证

### 语义一致性

- `--lanismd-accent` 应在所有主题中保持"强调"的语义
- `--lanismd-success/warning/danger` 应保持直觉上的绿/黄/红色系

### 代码高亮协调

- 代码高亮颜色应与整体主题风格协调
- 建议参考知名编辑器主题（VS Code、Sublime Text 等）的配色

### 深色主题注意事项

- 阴影在深色背景上效果较弱，可适当加深或使用发光效果
- 边框颜色应适度提亮以保持可见性

---

## 测试清单

提交新主题前，请确保以下场景测试通过：

### 基础 UI

- [ ] 编辑器区域背景、文字颜色正确
- [ ] 侧边栏文件树可正常显示和交互
- [ ] 标题栏样式正确
- [ ] 滚动条样式正确
- [ ] 设置对话框显示正常

### 编辑器内容

- [ ] 标题（H1-H6）样式正确
- [ ] 引用块样式正确
- [ ] 表格样式正确（包含悬停效果）
- [ ] 链接颜色正确（包含悬停效果）
- [ ] 行内代码样式正确
- [ ] 分隔线样式正确
- [ ] 文本选中高亮正确

### 代码块

- [ ] 代码块背景和边框正确
- [ ] 语法高亮颜色协调且可辨识
- [ ] 行号显示正确
- [ ] 代码复制按钮可见且可交互

### 交互状态

- [ ] 悬停效果明显但不刺眼
- [ ] 选中/激活状态清晰
- [ ] 焦点环可见

### 源码模式

- [ ] 切换到源码模式，CodeMirror 编辑器样式正确

---

## 提交规范

### 分支命名

```
feature/theme-{theme-name}
```

示例：`feature/theme-dracula`

### Commit 信息

```
feat(theme): add {ThemeName} theme

- Add {theme-name}.css with full variable definitions
- Register theme in types and hooks
- Add theme icon for settings UI
```

### PR 描述模板

```markdown
## 新增主题：{ThemeName}

### 主题信息
- **名称**: {ThemeName}
- **类型**: 深色/浅色主题
- **灵感来源**: {来源说明，如 "基于 Dracula 官方配色"}

### 截图预览
{附上编辑器截图，展示主要 UI 和代码高亮效果}

### 测试情况
- [x] 基础 UI 测试通过
- [x] 编辑器内容测试通过
- [x] 代码块测试通过
- [x] 交互状态测试通过
- [x] 源码模式测试通过
```

---

## 参考资源

- **现有主题文件**：`src/styles/themes/*.css`
- **设计 Token**：`src/styles/variables.css`
- **React Icons 图标库**：https://react-icons.github.io/react-icons/
- **配色灵感**：
  - [VS Code Themes](https://vscodethemes.com/)
  - [Dracula Theme](https://draculatheme.com/)
  - [Nord Theme](https://www.nordtheme.com/)
  - [Tokyo Night](https://github.com/enkia/tokyo-night-vscode-theme)

---

如有疑问，欢迎在 Issue 或 PR 中讨论！

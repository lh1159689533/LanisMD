# 专注模式 & 打字机模式 实施计划

> **执行指南：** 使用 executing-plans 技能逐任务实施此计划。

**目标：** 实现 Typora 风格的专注模式（淡化非当前块级元素）和打字机模式（光标始终在视口中央），WYSIWYG 和源码模式均支持。

**架构：**
- 专注模式通过 ProseMirror Decoration（WYSIWYG）和 CodeMirror 扩展（源码）为非活动块添加 CSS 类，配合纯 CSS 实现淡化效果
- 打字机模式通过监听光标变化事件，计算滚动偏移，将光标行滚动到外层 `.editor-content` 容器的垂直中央
- 两个模式完全独立，状态已在 `editor-store` 中预设，UI 入口在状态栏 + 全局快捷键

**技术栈：** ProseMirror Plugin API、CodeMirror 6 Extension API、Zustand、React、CSS

---

### 任务 1: 专注模式 CSS 样式

**文件：**
- 创建: `src/styles/editor/focus-mode.css`
- 修改: `src/styles/editor/index.css`（添加 import）

**实现：**
- 为 WYSIWYG 模式定义 `.lanismd-focus-blur` 类（应用于非当前块的顶层节点）
- 为源码模式定义 `.cm-focus-blur` 类（应用于非当前行的 `.cm-line`）
- 使用已有 CSS 变量 `--lanismd-focus-mode-blur-opacity` 和 `--lanismd-focus-mode-transition`
- 在 `index.css` 中添加 import

---

### 任务 2: 专注模式 ProseMirror 插件（WYSIWYG）

**文件：**
- 创建: `src/editor/plugins/focus-mode.ts`

**实现：**
- 使用 `$prose` 创建 ProseMirror 插件
- 通过 `Plugin` 的 `decorations` 方法，读取 `useEditorStore.getState().focusMode`
- 当 focusMode 开启时，遍历文档顶层节点，为非光标所在块添加 `Decoration.node` 的 `lanismd-focus-blur` CSS 类
- 监听 `selectionSet` 事务，触发装饰重新计算

---

### 任务 3: 专注模式 CodeMirror 扩展（源码模式）

**文件：**
- 创建: `src/editor/plugins/focus-mode-source.ts`

**实现：**
- 创建 CodeMirror `ViewPlugin`，监听选区变化
- 当 focusMode 开启时，为所有非当前行的 `.cm-line` 添加 `cm-focus-blur` 类
- 通过 `decorations` facet 或直接操作 DOM class 实现

---

### 任务 4: 打字机模式滚动逻辑

**文件：**
- 创建: `src/editor/plugins/typewriter-mode.ts`

**实现：**
- 导出一个 `scrollCursorToCenter` 工具函数，接受滚动容器和光标 Y 坐标
- 计算滚动偏移 = 光标Y - 容器顶部 - 容器高度/2，执行 `scrollBy`
- 导出 ProseMirror 插件：监听事务的 `selectionSet`，在 `typewriterMode` 开启时调用滚动
- 导出 CodeMirror 用的 `typewriterScrollEffect` 函数，供源码模式调用

---

### 任务 5: 注册插件到编辑器

**文件：**
- 修改: `src/editor/editor-setup.ts`（注册 ProseMirror 插件）
- 修改: `src/editor/components/SourceEditor.tsx`（注册 CodeMirror 扩展）

**实现：**
- 在 `editor-setup.ts` 中 import 并注册 `focusModePlugin` 和 `typewriterPlugin`
- 在 `SourceEditor.tsx` 的 extensions 数组中添加 `focusModeSourceExtension` 和打字机模式监听

---

### 任务 6: 状态栏 UI 入口

**文件：**
- 修改: `src/components/layout/StatusBar.tsx`

**实现：**
- 从 `react-icons/ri` 导入 `RiCrosshair2Line`（专注模式图标）和 `RiAlignCenter`（打字机模式图标）
- 在右侧区域（编辑模式切换按钮之前）添加两个切换按钮
- 激活状态下按钮高亮（使用 accent 色）
- 显示 tooltip 说明功能和快捷键

---

### 任务 7: 全局快捷键

**文件：**
- 修改: `src/hooks/useShortcuts.ts`
- 修改: `src/App.tsx`

**实现：**
- 在 `useShortcuts` 中添加 `onToggleFocusMode` 和 `onToggleTypewriterMode` handler
- 绑定快捷键：`Cmd+Shift+F`（专注模式）、`Cmd+Shift+9`（打字机模式）— 按照文档规划
- 注意 `Cmd+Shift+F` 可能与全局搜索冲突，需确认并调整
- 在 `App.tsx` 中传入 toggle 回调

---

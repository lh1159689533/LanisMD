# Milkdown 插件调研 — LanisMD 功能规划参考

> **产品定位**：轻量笔记应用（类 Typora），兼顾新手友好与高级用户操作效率
>
> **调研日期**：2026-03-30
>
> **Milkdown 版本**：^7.19.2

---

## 一、当前已使用的插件

| 插件 | 来源 | 状态 |
|------|------|------|
| commonmark | `@milkdown/kit/preset/commonmark` | ✅ 已集成 |
| gfm | `@milkdown/kit/preset/gfm` | ✅ 已集成 |
| history | `@milkdown/kit/plugin/history` | ✅ 已集成 |
| listener | `@milkdown/kit/plugin/listener` | ✅ 已集成 |
| clipboard | `@milkdown/kit/plugin/clipboard` | ✅ 已集成 |
| cursor | `@milkdown/kit/plugin/cursor` | ✅ 已集成 |
| indent | `@milkdown/kit/plugin/indent` | ✅ 已集成 |
| trailing | `@milkdown/kit/plugin/trailing` | ✅ 已集成 |
| upload | `@milkdown/plugin-upload` | ✅ 已集成 |
| slash | `@milkdown/plugin-slash` | ⚠️ 已注册，配置为空 |
| tooltip | `@milkdown/kit/plugin/tooltip` | ⚠️ 已注册，配置为空 |

**备注**：`@milkdown/react`、`@milkdown/theme-nord`、`@milkdown/utils` 已安装但代码中未使用，可考虑清理。

---

## 二、插件推荐（按优先级分层）

### 🔴 P0 — 必备（核心书写体验，不可或缺）

#### 1. plugin-block — 块级拖拽手柄

- **包名**：`@milkdown/kit/plugin/block`（已包含在 kit 中）
- **功能**：为每个块级元素（段落、标题、代码块等）添加拖拽手柄，支持通过拖拽调整内容顺序
- **为什么必备**：轻量笔记应用的核心交互，Typora/Notion 均有此功能。对新手用户极其友好，无需了解 Markdown 语法即可组织内容
- **实现方案**：
  ```ts
  import { block } from '@milkdown/kit/plugin/block';
  // 在 editor-setup.ts 中
  .use(block)
  .config((ctx) => {
    ctx.set(block.key, {
      // 自定义拖拽手柄的渲染 DOM
    });
  })
  ```
- **工作量**：🟢 低（插件注册即用，需自定义手柄样式）
- **依赖**：`@floating-ui/dom`（kit 已内置）

#### 2. Slash 命令菜单 — 完善配置

- **包名**：`@milkdown/plugin-slash`（已安装）
- **功能**：输入 `/` 触发命令菜单，快速插入标题、列表、代码块、表格、分割线、引用等
- **为什么必备**：当前已注册但配置为空（`ctx.set(slash.key, {})`），实际没有任何可用命令。这是新手用户发现和使用 Markdown 功能的主要入口
- **实现方案**：
  ```ts
  ctx.set(slash.key, {
    view: (view) => {
      // 返回自定义的 slash 菜单 DOM
      // 包含：标题1-3、无序列表、有序列表、任务列表、
      //       代码块、引用、分割线、表格、图片等命令项
    },
    // 可选：自定义过滤逻辑
  });
  ```
- **工作量**：🟡 中（需要实现自定义菜单 UI + 命令列表 + 键盘导航）

#### 3. Tooltip 浮动工具栏 — 完善配置

- **包名**：`@milkdown/kit/plugin/tooltip`（已安装）
- **功能**：选中文字后浮出格式化工具栏（加粗、斜体、删除线、行内代码、链接等）
- **为什么必备**：当前同样配置为空。这是"对新手友好"的核心：不需要记快捷键，选中文字就能看到格式化选项
- **实现方案**：
  ```ts
  ctx.set(tooltip.key, {
    view: (view) => {
      // 返回自定义的 tooltip DOM
      // 包含：加粗(B) / 斜体(I) / 删除线(S) /
      //       行内代码(``) / 链接(🔗) 等按钮
    },
  });
  ```
- **工作量**：🟡 中（需要实现工具栏 UI + 各格式切换命令）

#### 4. component/link-tooltip — 链接预览与编辑

- **包名**：`@milkdown/components/link-tooltip`（需通过 kit 导入）
- **功能**：悬停链接时显示预览浮层（显示 URL），点击可编辑/打开链接
- **为什么必备**：轻量笔记中链接是最常用的功能之一。没有链接 tooltip，用户无法方便地查看和编辑已有链接
- **实现方案**：
  ```ts
  import { linkTooltipPlugin } from '@milkdown/components/link-tooltip';
  // .use(linkTooltipPlugin)
  ```
- **工作量**：🟢 低（组件注册即用，需自定义样式）

---

### 🟡 P1 — 推荐（显著提升体验，建议尽早实现）

#### 5. plugin-prism — 代码块语法高亮

- **包名**：`@milkdown/plugin-prism`（需单独安装）
- **功能**：为代码块添加语法高亮（基于 Prism.js / refractor），支持 100+ 种编程语言
- **为什么推荐**：当前代码块没有语法高亮，对技术用户来说体验很差。作为「兼顾技术用户」的笔记应用，这是高优先级功能
- **实现方案**：
  ```bash
  pnpm add @milkdown/plugin-prism
  ```
  ```ts
  import { prism, prismConfig } from '@milkdown/plugin-prism';
  import { refractor } from 'refractor';
  // .use(prism)
  // .config((ctx) => { ctx.set(prismConfig.key, { configureRefractor: () => refractor }); })
  ```
- **替代方案**：使用 `@milkdown/components/code-block` 组件（集成 CodeMirror 6），提供更强大的代码编辑体验（行号、折叠等），但体积更大
- **工作量**：🟢 低（prism 方案）/ 🟡 中（CodeMirror 方案）

#### 6. component/code-block — 增强代码块（CodeMirror）

- **包名**：`@milkdown/components/code-block`
- **功能**：用 CodeMirror 6 替换默认代码块渲染，提供：语言选择下拉菜单、语法高亮、行号、自动缩进、括号匹配等
- **为什么推荐**：比 plugin-prism 体验更好，支持语言切换 UI。如果目标用户中有开发者，这是更佳选择
- **实现方案**：
  ```ts
  import { codeBlockComponent } from '@milkdown/components/code-block';
  // .use(codeBlockComponent)
  ```
- **工作量**：🟡 中（需要自定义语言选择器 UI 和样式）
- **注意**：与 plugin-prism 二选一，不要同时使用

#### 7. component/image-block — 增强图片块

- **包名**：`@milkdown/components/image-block`
- **功能**：替换默认的图片渲染，支持：图片上传、拖拽调整大小、标题/alt 编辑、居中/左/右对齐
- **为什么推荐**：当前图片功能较基础（仅显示），无法调整大小或添加标题。笔记中图片操作很频繁
- **实现方案**：
  ```ts
  import { imageBlockComponent } from '@milkdown/components/image-block';
  // .use(imageBlockComponent)
  ```
- **工作量**：🟡 中（需要自定义上传逻辑和样式）

#### 8. component/list-item-block — 增强列表项

- **包名**：`@milkdown/components/list-item-block`
- **功能**：增强列表项渲染，支持：复选框切换（任务列表）、项目符号类型切换（无序/有序）、拖拽排序
- **为什么推荐**：任务列表是轻量笔记的核心功能。增强组件提供更好的交互体验
- **实现方案**：
  ```ts
  import { listItemBlockComponent } from '@milkdown/components/list-item-block';
  // .use(listItemBlockComponent)
  ```
- **工作量**：🟡 中

#### 9. component/table-block — 增强表格

- **包名**：`@milkdown/components/table-block`
- **功能**：替换默认 GFM 表格渲染，支持：列/行拖拽排序、添加/删除行列、单元格选中
- **为什么推荐**：当前表格功能基础，编辑体验不佳。增强表格让用户可以像 Excel 一样直觉操作
- **实现方案**：
  ```ts
  import { tableBlockComponent } from '@milkdown/components/table-block';
  // .use(tableBlockComponent)
  ```
- **工作量**：🟡 中（需要自定义操作按钮 UI）

#### 10. plugin-automd — 自动 Markdown 转换

- **包名**：`@milkdown/plugin-automd`（需单独安装）
- **功能**：输入时自动应用 Markdown 语法转换（如输入 `**text**` 自动变粗体，`# ` 自动变标题等）
- **为什么推荐**：Typora 的标志性功能！让编辑器具有「所见即所得」的书写体验。对于熟悉 Markdown 的用户，这是最自然的输入方式
- **实现方案**：
  ```bash
  pnpm add @milkdown/plugin-automd
  ```
  ```ts
  import { automd } from '@milkdown/plugin-automd';
  // .use(automd)
  ```
- **工作量**：🟢 低（注册即用）
- **注意**：commonmark preset 已内置部分 inputRules，automd 提供更完整的覆盖

---

### 🟢 P2 — 可选（锦上添花，可根据用户反馈按需添加）

#### 11. plugin-emoji — 表情符号支持

- **包名**：`@milkdown/plugin-emoji`（需单独安装）
- **功能**：支持 `:emoji_name:` 快捷输入（如 `:smile:` → 😄），使用 Twemoji 统一渲染
- **为什么可选**：增强表达能力，但对笔记应用不是必须功能
- **实现方案**：
  ```bash
  pnpm add @milkdown/plugin-emoji
  ```
  ```ts
  import { emoji } from '@milkdown/plugin-emoji';
  // .use(emoji)
  ```
- **工作量**：🟢 低
- **注意**：引入了 `twemoji`、`node-emoji`、`remark-emoji` 等依赖，会增加约 200KB+ 包体积

#### 12. component/image-inline — 行内图片

- **包名**：`@milkdown/components/image-inline`
- **功能**：支持在文本行内嵌入小图片/图标
- **为什么可选**：使用场景较少，大部分笔记场景用块级图片即可
- **实现方案**：
  ```ts
  import { imageInlineComponent } from '@milkdown/components/image-inline';
  // .use(imageInlineComponent)
  ```
- **工作量**：🟢 低

#### 13. plugin-collab — 协同编辑

- **包名**：`@milkdown/plugin-collab`（需单独安装）
- **功能**：基于 Yjs 的实时协同编辑，支持多人同时编辑同一文档
- **为什么可选**：LanisMD 定位为本地轻量笔记应用（Tauri 桌面端），协同编辑需要服务端支持，复杂度极高。但如果未来考虑云同步或团队协作，可以作为远期规划
- **实现方案**：
  ```bash
  pnpm add @milkdown/plugin-collab yjs y-prosemirror y-protocols y-websocket
  ```
  ```ts
  import { collab, collabServiceCtx } from '@milkdown/plugin-collab';
  // .use(collab)
  // 需要配置 WebSocket 连接和 Yjs 文档
  ```
- **工作量**：🔴 极高（需要搭建 WebSocket 服务 + 冲突解决 + 同步逻辑）
- **建议**：列入远期规划（v2.0+）

---

## 三、社区插件参考

以下社区插件可根据需求评估引入：

| 插件 | 功能 | 适用性 |
|------|------|--------|
| [milkdown-plugin-shiki](https://github.com/nicolo-ribaudo/milkdown-plugin-shiki) | 使用 Shiki 进行代码高亮（比 Prism 更精准） | ⭐⭐⭐ 可替代 plugin-prism |
| [milkdown-plugin-placeholder](https://github.com/nicolo-ribaudo/milkdown-plugin-placeholder) | 空文档时显示占位提示文字 | ⭐⭐⭐ 推荐（已通过 CSS 预实现） |
| [milkdown-plugin-image-picker](https://github.com/nicolo-ribaudo/milkdown-plugin-image-picker) | 从文件选择器选择和上传图片 | ⭐⭐ 可选 |
| [@milkdown-lab/plugin-split-editing](https://github.com/nicolo-ribaudo/milkdown-lab) | 分屏编辑（Markdown 源码 + 预览） | ⭐⭐ 可选（类 Typora 源码模式） |

---

## 四、实施建议与路线图

### Phase 1 — 核心体验完善（1-2 周）

1. **完善 Slash 命令菜单**（P0）— 实现自定义命令列表和菜单 UI
2. **完善 Tooltip 工具栏**（P0）— 实现格式化按钮和交互
3. **添加 plugin-block**（P0）— 启用块级拖拽
4. **添加 link-tooltip 组件**（P0）— 链接预览与编辑

### Phase 2 — 增强功能（2-3 周）

5. **代码块增强**（P1）— 选择 plugin-prism 或 component/code-block
6. **图片块增强**（P1）— 添加 image-block 组件
7. **列表项增强**（P1）— 添加 list-item-block 组件
8. **表格增强**（P1）— 添加 table-block 组件

### Phase 3 — 进阶优化（按需）

9. **plugin-automd**（P1）— 自动 Markdown 语法转换
10. **plugin-emoji**（P2）— 表情符号支持
11. **清理未使用依赖** — 移除 `@milkdown/react`、`@milkdown/theme-nord`、`@milkdown/utils`

---

## 五、注意事项

1. **Components 是无样式的**：`@milkdown/components` 下的所有组件默认不带 CSS，需要自行编写样式（通过 `.milkdown-*` 类名选择器）
2. **Components 基于 Vue 3 渲染**：自 v7.9.0 起从 Web Components 迁移到 Vue 3，但 API 保持框架无关，在 React 项目中也可正常使用
3. **plugin-prism 和 component/code-block 二选一**：两者都提供代码高亮，但实现方式不同（Prism vs CodeMirror）
4. **Floating UI 共享**：plugin-block、plugin-tooltip、plugin-slash 三个插件共同依赖 `@floating-ui/dom`，已内置在 kit 中
5. **Tree-shaking 友好**：所有插件包都声明了 `sideEffects: false`，未使用的插件不会打包进最终产物
6. **CSS 预留已就绪**：`editor.css` 中已为 KaTeX 数学公式和 Mermaid 图表预留了样式，如需添加这些功能只需安装对应插件

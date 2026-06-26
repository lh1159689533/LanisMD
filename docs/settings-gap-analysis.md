# LanisMD vs Typora 可配置项差距分析

> 生成时间：2026-04-20
> 目标：全面对比 Typora 的可配置项体系，分析 LanisMD 当前状态，产出可落地的配置项清单

---

## 一、总览

| 维度 | Typora | LanisMD 当前状态 |
|------|--------|-----------------|
| 设置面板分区 | 通用、外观、编辑器、图片、Markdown、导出 | 通用、外观、编辑器、快捷键 |
| 可交互配置项数 | ~60+ | ~3（代码块行号开关、主题选择、面板行为开关） |
| 配置持久化 | JSON 文件 + 系统注册表 | Zustand persist (localStorage) + Rust config.json |
| 前后端配置一致性 | -- | 不一致（autoSave、image 等字段前后端不同步） |

---

## 二、逐项对比

### 状态标识说明

| 标识 | 含义 |
|------|------|
| **已完成** | 类型定义 + Store + UI 控件 + 生效逻辑，全部就绪 |
| **UI 缺失** | Store 有字段、有默认值，但设置页面只读展示或无控件 |
| **类型已定义** | TypeScript 类型中有定义但未在 UI/Store 中实际使用 |
| **硬编码** | 功能存在但值硬编码在代码中，无配置入口 |
| **未实现** | 功能和配置均不存在 |

---

### 2.1 通用设置 (General)

| # | Typora 配置项 | Typora 选项 | LanisMD 状态 | 详情 |
|---|-------------|------------|-------------|------|
| G1 | 启动时行为 | 打开新文件 / 恢复上次会话 / 打开指定目录 | **UI 缺失** | `restoreSession: false` 在 Store 中有定义，但设置页面无控件 |
| G2 | 自动保存 | 开关 + 延迟时间 | **硬编码** | 前端 `AUTO_SAVE_DELAY = 1000ms` 硬编码。Rust 后端有 `autoSave: { enabled: true, interval: 5000 }` 配置结构，但前端 `AppConfig` 类型中**没有** autoSave 字段，二者完全脱节 |
| G3 | 文件默认编码 | UTF-8 / GBK / ... | **硬编码** | 新建文件硬编码 `encoding: 'utf-8'`，无法切换默认编码 |
| G4 | 行尾符号 | LF / CRLF / Auto | **未实现** | 无相关配置或实现 |
| G5 | 最近文件数量上限 | 数字输入 | **UI 缺失** | `recentFiles.maxCount: 20` 在 Store 和 Rust 后端均有定义，但设置页面无控件 |
| G6 | 语言 | 系统 / 中文 / 英文 / ... | **UI 缺失** | `language: 'system' \| 'zh-CN' \| 'en'` 类型定义完整，Store 有默认值，但 UI 中无控件，且 i18n 翻译系统完全未实现（所有文字硬编码中文） |
| G7 | 窗口样式 | 原生 / 一体化 | **不适用** | Tauri 窗口样式在 `lib.rs` 中固定为 macOS overlay 风格 |
| G8 | 最近文件夹面板行为 | 点击外部关闭开关 | **已完成** | `recentFolders.closeOnClickOutside` 有完整的类型+Store+UI toggle |
| G9 | 检查更新 | 自动检查开关 | **未实现** | 无 autoUpdate 相关代码 |
| G10 | 发送匿名使用数据 | 开关 | **不适用** | 隐私相关，暂不需要 |

---

### 2.2 外观设置 (Appearance)

| # | Typora 配置项 | Typora 选项 | LanisMD 状态 | 详情 |
|---|-------------|------------|-------------|------|
| A1 | 主题选择 | 内置主题列表 + 用户自定义主题 | **已完成** | 20 种内置主题 + system + 用户自定义主题（CSS 目录发现机制），UI 完善 |
| A2 | 字体大小（全局） | Slider / 数字输入 | **硬编码** | 注意：此处指窗口/UI 全局缩放。LanisMD 无 zoom/scale 功能 |
| A3 | 侧边栏位置 | 左 / 右 | **UI 缺失** | `sidebar.position: 'left' \| 'right'` 类型和 Store 均有定义，但设置页面无控件 |
| A4 | 侧边栏默认宽度 | 数字输入 | **UI 缺失** | `sidebar.width: 280` 有定义和拖拽调整功能，但无设置页面重置入口 |
| A5 | 状态栏显示 | 开关 | **未实现** | 状态栏始终显示，无开关控制 |
| A6 | 窗口缩放 | Cmd+=/- 放大缩小 | **未实现** | 无 zoom 相关代码 |
| A7 | 自定义 CSS 说明 | 打开主题目录按钮 | **已完成** | 设置页面有主题目录说明和"打开目录"按钮 |

---

### 2.3 编辑器设置 (Editor)

| # | Typora 配置项 | Typora 选项 | LanisMD 状态 | 详情 |
|---|-------------|------------|-------------|------|
| E1 | 编辑器字体大小 | Slider (12-24) | **UI 缺失** | `editor.fontSize: 16` Store 有值，设置页面只有 `<span>16px</span>` 只读展示 |
| E2 | 编辑器字体 | 下拉选择 / 输入 | **UI 缺失** | `editor.fontFamily: 'system'` Store 有值，设置页面无控件 |
| E3 | 编辑器最大宽度 | Slider (600-1200) | **UI 缺失** | `editor.maxWidth: 800` Store 有值，设置页面只有只读展示 |
| E4 | 编辑器行高 | Slider (1.2-2.5) | **UI 缺失** | `editor.lineHeight: 1.75` Store 有值，设置页面只有只读展示 |
| E5 | 自动换行 | 软换行 / 硬换行 / 关闭 | **UI 缺失** | `editor.wordWrap: 'soft' \| 'hard' \| 'off'` 类型完整，Store 有值，设置页面无控件 |
| E6 | 代码块行号 | 开关 | **已完成** | Store + UI toggle + CSS 控制显示/隐藏，完整可用 |
| E7 | 编辑器显示行号 | 开关 | **UI 缺失** | `editor.showLineNumbers: true` Store 有值，但设置页面只展示了"代码块行号"，没有"编辑器行号" |
| E8 | 拼写检查 | 开关 | **硬编码** | 全项目 `spellCheck={false}` 硬编码关闭（EditorCore、SourceEditor、Mermaid、MathBlock 等至少 6 处） |
| E9 | Tab 缩进宽度 | 2 / 4 / 8 | **硬编码** | 使用 CodeMirror 默认 `tabSize=4`，无法配置 |
| E10 | 使用空格代替 Tab | 开关 | **未实现** | 无相关配置 |
| E11 | 打字机模式 | 开关（及是否默认开启） | **运行时only** | `typewriterMode` 在 `editor-store` 中作为运行时状态，重启后重置为 false，不在 `AppConfig` 中持久化 |
| E12 | 专注模式 | 开关（及是否默认开启） | **运行时only** | `focusMode` 同上，不持久化 |
| E13 | 默认编辑模式 | 所见即所得 / 源码模式 | **硬编码** | 新文件始终以 `editorMode: 'wysiwyg'` 打开，无法设置默认为源码模式 |
| E14 | 即时渲染 vs 源码模式切换 | 全局默认模式选择 | 同上 | -- |
| E15 | 源码模式字体大小 | Slider / 输入 | **硬编码** | `SourceEditor.tsx:135` 中 `fontSize: '16px'` 硬编码，不读取 `editor.fontSize` 配置 |
| E16 | 源码模式行高 | Slider / 输入 | **硬编码** | CSS 变量 `--lanismd-source-line-height: 1.75` 存在，但无 UI 控件 |

---

### 2.4 图片设置 (Image)

| # | Typora 配置项 | Typora 选项 | LanisMD 状态 | 详情 |
|---|-------------|------------|-------------|------|
| I1 | 图片插入行为 | 复制到 assets / 相对路径 / 绝对路径 | **UI 缺失** | `image.insertAction: 'copy-to-assets' \| 'relative-path' \| 'absolute-path'` 类型完整，Store 有默认值，但设置页面无控件 |
| I2 | 图片资源目录名 | 文本输入 | **UI 缺失** | `image.assetsFolderName: 'assets'` 同上 |
| I3 | 图片上传服务 | iPic / PicGo / 自定义命令 | **未实现** | 无图床上传功能 |
| I4 | 优先使用相对路径 | 开关 | 部分覆盖 | 由 `insertAction` 选项间接实现 |
| I5 | 允许根据规则自动移动图片 | 开关 | **未实现** | 无自动移动图片功能 |
| I6 | 图片缩放默认行为 | 适应宽度 / 原始大小 | **未实现** | 图片缩放通过拖拽实现，无默认行为配置 |

---

### 2.5 Markdown 设置

| # | Typora 配置项 | Typora 选项 | LanisMD 状态 | 详情 |
|---|-------------|------------|-------------|------|
| M1 | 严格模式 | 开关（影响解析规则） | **未实现** | 无严格/宽松 Markdown 解析切换 |
| M2 | 数学公式块 | 自动编号开关 | **未实现** | 数学公式无编号支持 |
| M3 | 代码块自动匹配括号 | 开关 | **硬编码** | `bracketMatching()` 在 code-block.ts 中始终启用 |
| M4 | 高亮代码块行 | 开关 | **硬编码** | `highlightActiveLine()` 在 SourceEditor 中始终启用 |
| M5 | 下标/上标语法 | 开关 | **硬编码** | 已实现但始终启用，不可配置关闭 |
| M6 | 高亮语法 | 开关 (==highlight==) | **硬编码** | 同上 |
| M7 | Front Matter | 开关 (YAML front matter) | **硬编码** | 已实现 front-matter 插件，始终启用 |
| M8 | TOC (目录) | 开关 ([toc]) | **硬编码** | 已实现 toc-block 插件，始终启用 |
| M9 | Mermaid 图表 | 开关 | **硬编码** | 已实现，始终启用 |

---

### 2.6 快捷键设置 (Shortcuts)

| # | Typora 配置项 | Typora 选项 | LanisMD 状态 | 详情 |
|---|-------------|------------|-------------|------|
| S1 | 快捷键查看 | 只读展示列表 | **已完成** | 设置页面分 3 组展示（段落格式 16 个、文本格式 9 个、通用 4 个） |
| S2 | 自定义快捷键 | 录入修改 | **类型已定义** | `keyBindings?: Record<string, string>` 在 `AppConfig` 类型中定义，但从未被使用或暴露 UI |

---

### 2.7 导出设置 (Export)

| # | Typora 配置项 | Typora 选项 | LanisMD 状态 | 详情 |
|---|-------------|------------|-------------|------|
| X1 | PDF 导出边距 | 上/下/左/右 (mm) | **未实现** | `useExport.ts` 中 `exportToPDF` 存在但无边距配置 |
| X2 | PDF 页面尺寸 | A4 / Letter / 自定义 | **未实现** | 同上 |
| X3 | PDF 头部/页脚 | 模板字符串 | **未实现** | -- |
| X4 | HTML 导出样式 | 是否包含主题样式 | **未实现** | `exportToHTML` 存在但无选项 |
| X5 | 导出时图片处理 | 内嵌 base64 / 保留路径 | **未实现** | -- |

---

## 三、前后端配置不一致问题

| 问题 | 详情 | 建议 |
|------|------|------|
| **autoSave 字段脱节** | Rust 后端 `AppConfig` 有 `auto_save: AutoSaveConfig { enabled, interval }`；前端 TS `AppConfig` 接口中无 `autoSave` 字段；前端自动保存通过 `useAutoSave` hook 硬编码 `1000ms` debounce | 统一为一个 `autoSave` 配置项，前端读取后端配置 |
| **image 字段缺失** | 前端有 `image: { insertAction, assetsFolderName }`；Rust `default_config()` 中无 `image` 字段 | 在 Rust 默认配置中补充 image 字段 |
| **recentFolders 字段缺失** | 前端有 `recentFolders.closeOnClickOutside`；Rust 端无此字段 | 补充或确认是否仅前端管理 |
| **codeBlock.showLineNumbers 缺失** | 前端 Store 有 `editor.codeBlock.showLineNumbers`；Rust `EditorConfig` 中无此嵌套字段 | 在 Rust 端补充 |

---

## 四、优先级分层建议

### P0 - 高优先级（用户高频使用，实现成本低）

> Store 已有字段，只需补齐 UI 控件

| 序号 | 配置项 | 当前状态 | 工作量预估 |
|------|--------|---------|-----------|
| 1 | **编辑器字体大小** (E1) | UI 缺失 → 需加 Slider | 小 |
| 2 | **编辑器最大宽度** (E3) | UI 缺失 → 需加 Slider | 小 |
| 3 | **编辑器行高** (E4) | UI 缺失 → 需加 Slider | 小 |
| 4 | **图片插入行为** (I1) | UI 缺失 → 需加 Select | 小 |
| 5 | **图片资源目录名** (I2) | UI 缺失 → 需加 Input | 小 |
| 6 | **侧边栏位置** (A3) | UI 缺失 → 需加 SegmentedControl | 小 |
| 7 | **编辑器字体** (E2) | UI 缺失 → 需加 Select/Input | 小 |
| 8 | **自动换行模式** (E5) | UI 缺失 → 需加 Select | 小 |
| 9 | **恢复上次会话** (G1) | UI 缺失 → 需加 Toggle | 小 |
| 10 | **最近文件数量上限** (G5) | UI 缺失 → 需加 NumberInput | 小 |

### P1 - 中优先级（需要从硬编码提取 + 新增 UI）

| 序号 | 配置项 | 当前状态 | 工作量预估 |
|------|--------|---------|-----------|
| 11 | **自动保存延迟时间** (G2) | 硬编码 1000ms → 需提取到 AppConfig + UI | 中 |
| 13 | **Tab 缩进宽度** (E9) | 硬编码 → 需传入 CodeMirror + UI | 中 |
| 14 | **默认编辑模式** (E13) | 硬编码 wysiwyg → 需在 AppConfig 新增字段 + UI | 中 |
| 15 | **打字机模式持久化** (E11) | 运行时状态 → 需加入 AppConfig + 设置 Toggle | 小 |
| 16 | **专注模式持久化** (E12) | 同上 | 小 |
| 17 | **源码模式字体大小** (E15) | 硬编码 16px → 需读取配置或新增独立字段 | 小 |
| 18 | **代码块括号匹配** (M3) | 硬编码开启 → 需加开关 | 小 |

### P2 - 低优先级（需要新功能模块支持）

| 序号 | 配置项 | 当前状态 | 工作量预估 |
|------|--------|---------|-----------|
| 19 | **自定义快捷键** (S2) | 类型已定义 → 需实现快捷键录入 UI + 运行时绑定 | 大 |
| 20 | **多语言/i18n** (G6) | 类型已定义 → 需实现完整 i18n 框架 | 大 |
| 21 | **窗口缩放** (A6) | 未实现 → 需 Tauri webview zoom API | 中 |
| 22 | **状态栏显示开关** (A5) | 未实现 → 需新增字段 + UI + 条件渲染 | 小 |
| 23 | **行尾符号** (G4) | 未实现 → 需文件 I/O 层支持 | 中 |
| 24 | **默认编码** (G3) | 硬编码 UTF-8 → 需编码检测/切换支持 | 中 |
| 12 | **拼写检查** (E8) | 硬编码关闭（6+ 处） → 需统一收口 + Toggle | 中 |

### P3 - 远期规划

| 序号 | 配置项 | 说明 |
|------|--------|------|
| 25 | **PDF 导出选项** (X1-X3) | 需要完善导出模块 |
| 26 | **HTML 导出选项** (X4-X5) | 同上 |
| 27 | **图床上传** (I3) | 需要新功能模块 |
| 28 | **自动更新** (G9) | 需要 Tauri updater 插件 |
| 29 | **Markdown 语法开关** (M1, M5-M9) | Milkdown 插件动态加载能力 |
| 30 | **数学公式编号** (M2) | KaTeX 编号扩展 |

---

## 五、设置页面结构建议

基于以上分析，建议将设置面板重构为 **6 个分区**：

```
设置
├── 通用 (General)
│   ├── 启动行为 (恢复会话 Toggle)
│   ├── 自动保存 (开关 + 延迟 Slider)
│   ├── 最近文件上限 (NumberInput)
│   ├── 默认编码 (Select) [P2]
│   ├── 行尾符号 (Select) [P2]
│   └── 语言 (Select) [P2]
│
├── 外观 (Appearance)
│   ├── 主题选择 (内置 + 自定义)
│   ├── 自定义 CSS (说明 + 打开目录)
│   ├── 侧边栏位置 (左/右 SegmentedControl)
│   ├── 状态栏显示 (Toggle) [P2]
│   └── 窗口缩放 [P2]
│
├── 编辑器 (Editor)
│   ├── 字体大小 (Slider 12-24)
│   ├── 字体 (Select/Input)
│   ├── 最大宽度 (Slider 600-1200)
│   ├── 行高 (Slider 1.2-2.5)
│   ├── 自动换行 (Select: 软/硬/关闭)
│   ├── 默认编辑模式 (Select: 所见即所得/源码)
│   ├── 显示行号 (Toggle)
│   ├── 代码块行号 (Toggle)
│   ├── Tab 宽度 (Select: 2/4/8)
│   ├── 拼写检查 (Toggle)
│   ├── 打字机模式默认开启 (Toggle)
│   ├── 专注模式默认开启 (Toggle)
│   └── 括号自动匹配 (Toggle)
│
├── 图片 (Image)  ← 新增分区
│   ├── 插入行为 (Select: 复制到 assets/相对路径/绝对路径)
│   └── 资源目录名 (Input)
│
├── 快捷键 (Shortcuts)
│   ├── 快捷键参考列表 (只读)
│   └── 自定义快捷键 [P2]
│
└── 导出 (Export) ← 新增分区 [P3]
    ├── PDF 页面尺寸
    ├── PDF 边距
    └── HTML 样式选项
```

---

## 六、技术实施注意事项

### 6.1 前后端配置同步
1. 前端 `AppConfig` 接口需补充 `autoSave` 字段
2. Rust `default_config()` 需补充 `image`、`recentFolders`、`codeBlock` 字段
3. 建议统一配置源为 Rust 端 `config.json`，前端 Zustand persist 仅作缓存/fallback

### 6.2 硬编码收口
1. 所有 `spellCheck={false}` 需统一从配置读取
2. `AUTO_SAVE_DELAY` 需从 Store 读取而非常量
3. 源码模式的 `fontSize: '16px'` 和 `lineHeight` 需从配置或 CSS 变量读取
4. `tabSize` 需传入 CodeMirror 的 `EditorState.tabSize` facet

### 6.3 UI 组件需求
P0 阶段需要以下通用 UI 组件（设置页面专用）：
- **Slider**: 用于 fontSize、maxWidth、lineHeight、autoSave delay
- **NumberInput**: 用于最近文件上限
- **Select/Dropdown**: 用于字体、编码、编辑模式、自动换行、Tab 宽度
- **TextInput**: 用于资源目录名
- **SegmentedControl**: 用于侧边栏位置（左/右）
- **Toggle**: 现有（用于各类开关）

### 6.4 CSS 变量与配置联动
编辑器设置（fontSize、maxWidth、lineHeight、fontFamily）修改后需同步更新对应 CSS 变量：
- `--lanismd-editor-max-width`
- 编辑器 inline style 或 CSS 变量注入

---

## 七、快速参考：所有硬编码值清单

| 文件 | 常量 | 值 | 应提取为配置 |
|------|------|---|-------------|
| `hooks/useAutoSave.ts:6` | `AUTO_SAVE_DELAY` | 1000ms | `autoSave.delay` |
| `hooks/useBrowserFile.ts:5` | `AUTO_SAVE_INTERVAL` | 3000ms | 浏览器模式独立配置 |
| `hooks/useFileWatcher.ts:10` | `TREE_REFRESH_DEBOUNCE` | 500ms | 可保持硬编码（内部优化） |
| `hooks/useFileWatcher.ts:13` | `SELF_WRITE_COOLDOWN` | 1500ms | 可保持硬编码 |
| `hooks/useFileWatcher.ts:16` | `TREE_REFRESH_SUPPRESS_COOLDOWN` | 2000ms | 可保持硬编码 |
| `hooks/useFileWatcher.ts:124` | `delayMs` | 300ms | 可保持硬编码 |
| `stores/file-store.ts:136` | 保存状态重置 | 2000ms | 可保持硬编码 |
| `editor/components/SourceEditor.tsx:135` | 源码字体大小 | 16px | `editor.fontSize` 或独立字段 |
| `editor/plugins/code-block.ts:139` | indentWithTab | 默认 tabSize=4 | `editor.tabSize` |
| `editor/plugins/mermaid-block/types.ts:88` | `RENDER_DEBOUNCE_MS` | 500ms | 可保持硬编码 |
| `editor/plugins/math-inline/types.ts:15` | `RENDER_DEBOUNCE_MS` | 150ms | 可保持硬编码 |
| `editor/plugins/table-block/types.ts:65` | `HIDE_DELAY` | 200ms | 可保持硬编码 |
| `editor/plugins/outline-sync.ts:23` | `SCROLL_THROTTLE_MS` | 100ms | 可保持硬编码 |
| `editor/plugins/outline-sync.ts:218` | `SCROLL_COOLDOWN_MS` | 300ms | 可保持硬编码 |
| `editor/plugins/code-block-fold.ts:52` | `FOLD_ANIMATION_DURATION` | 250ms | 可保持硬编码 |
| `editor/plugins/slash-menu.ts:1142` | debounce | 50ms | 可保持硬编码 |
| `components/layout/SearchPanel.tsx:148` | 搜索防抖 | 300ms | 可保持硬编码 |
| `components/layout/FileTree.tsx:369` | 拖放展开延迟 | 500ms | 可保持硬编码 |
| `components/layout/Sidebar.tsx:92-93` | 侧边栏宽度范围 | 150-500px | 可保持硬编码 |
| `src-tauri/.../config_service.rs:139` | Rust 自动保存间隔 | 5000ms | `autoSave.interval` |
| `editor/components/EditorCore.tsx:304` | spellCheck | false | `editor.spellCheck` |
| `editor/components/SourceEditor.tsx:196` | spellCheck | false | 同上 |

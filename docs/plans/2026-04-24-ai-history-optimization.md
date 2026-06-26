# AI 历史面板优化 实施计划

> **执行指南：** 使用 executing-plans 技能逐任务实施此计划。

**目标：** 优化 AI 历史面板，支持显示原文+结果、覆盖式布局、拖拽宽度调整、持久化存储
**架构：** 修改历史记录数据结构增加 `originalText` 字段；面板从 flex 子元素改为 `position: absolute` 覆盖在编辑区右侧；增加拖拽手柄调整宽度；持久化从 sessionStorage 改为 Tauri 文件系统存储（带可配置条数上限）
**技术栈：** React + TypeScript + Zustand + Tauri invoke + CSS

---

## 当前问题分析

1. **数据结构缺失**：`AiHistoryEntry` 只有 `result`，没有 `originalText`（原文）
2. **解释场景**：`recordAiHistory(command, '')` 传空字符串，无法回溯
3. **面板布局**：280px 固定宽度 flex 子元素，挤压编辑区空间
4. **持久化**：使用 `sessionStorage`，关闭窗口即丢失，最多 50 条
5. **不可拖拽**：无法调整面板宽度

---

### 任务 1: 扩展历史记录数据结构（类型+Store）

**文件：**
- 修改: `src/stores/ai-store.ts` (AiHistoryEntry 类型、addHistory、持久化逻辑)
- 修改: `src/types/config.ts` (AppConfig.ai 增加 maxHistoryCount)

**步骤：**

1. 在 `AiHistoryEntry` 中新增 `originalText` 字段（可选字符串，原文截取前 500 字符）
2. 在 `AiHistoryInput` 中相应添加 `originalText`
3. 在 `AppConfig.ai` 中新增 `maxHistoryCount: number`（默认 200）
4. 修改 `MAX_HISTORY` 为从配置读取，回退默认 200
5. 持久化从 `sessionStorage` 改为 `localStorage`（Tauri 持久化后续如需可升级为文件系统，但 localStorage 在 Tauri WebView 中已足够持久）
6. 将 loadHistory/saveHistory 改为使用 `localStorage`，key 改为 `lanismd-ai-history`

---

### 任务 2: 修改 recordAiHistory 传递原文

**文件：**
- 修改: `src/editor/plugins/ai-edit/generator.ts` (recordAiHistory 函数及所有调用点)

**步骤：**

1. 修改 `recordAiHistory` 签名：增加 `originalText` 参数
2. 修改所有 5 处调用点，传入 `ctx.selection` 作为原文：
   - 润色 inline-diff 接受时（第212行）：传 `ctx.selection`
   - 翻译弹窗替换原文时（第270行）：传 `ctx.selection`
   - 翻译弹窗插入原文之后时（第274行）：传 `ctx.selection`
   - 解释弹窗完成时（第373行）：需要改造，将 accumulated 文本传给 result，将 `ctx.selection` 传给 originalText
   - 占位符模式写入文档时（第419行）：传 `ctx.selection`
3. 解释场景特殊处理：当前 `recordAiHistory(command, '')` 的问题，需改为传 accumulated（解释结果）到 result，ctx.selection 到 originalText

---

### 任务 3: 面板布局改为覆盖式 + 拖拽宽度调整

**文件：**
- 修改: `src/components/layout/MainLayout.tsx` (面板渲染位置)
- 修改: `src/components/layout/AiHistoryPanel.tsx` (覆盖式布局 + 拖拽逻辑)
- 修改: `src/styles/layout/ai-history.css` (覆盖式样式 + 拖拽手柄)
- 修改: `src/stores/ui-store.ts` (新增 aiHistoryWidth 状态)

**步骤：**

1. `ui-store.ts`：新增 `aiHistoryWidth: number`（默认 320）和 `setAiHistoryWidth` action
2. `MainLayout.tsx`：面板不再作为 flex 兄弟元素，改为在 `editor-container` 内部以 `position: absolute` 渲染，从右侧覆盖
3. `AiHistoryPanel.tsx`：
   - 接收宽度属性，使用内联 style 设置 width
   - 添加左侧拖拽手柄（mousedown → mousemove → mouseup）
   - 拖拽限制：最小 200px，最大为 `.editor-container` 宽度的 80%
   - **拖拽吸附交互**（参照左侧 Sidebar 实现 `snapCollapsedRef` 模式）：
     - 拖拽过程中宽度 `< MIN_WIDTH(200px)` 时：瞬间隐藏面板（宽度设为 0），设置 `snapCollapsedRef = true`
     - 隐藏后鼠标未松开继续往左拖（使宽度重新 `>= MIN_WIDTH`）：恢复面板到最小宽度，`snapCollapsedRef = false`
     - 松开鼠标时：若 `width < MIN_WIDTH` 则关闭面板（调用 `setAiHistoryOpen(false)`）；否则保存最终宽度
   - 拖拽期间禁用 CSS transition（通过 `isDragging` 状态控制 `no-transition` 类名），避免吸附时出现动画延迟
   - 拖拽手柄使用 CSS `:hover` 和拖拽中高亮效果
4. `ai-history.css`：
   - 面板改为 `position: absolute; right: 0; top: 0; bottom: 0;`
   - 添加拖拽手柄样式 `.lanismd-ai-history-resize-handle`
   - 添加过渡动画

---

### 任务 4: 面板 UI 优化 - 显示原文+结果

**文件：**
- 修改: `src/components/layout/AiHistoryPanel.tsx` (HistoryItem 展示逻辑)
- 修改: `src/styles/layout/ai-history.css` (新增原文展示区样式)

**步骤：**

1. `HistoryItem` 组件改造：
   - 解释场景：显示「原文」标签 + 原文内容 + 「解释」标签 + 解释结果
   - 润色场景：显示「原文」标签 + 原文内容 + 「润色后」标签 + 润色结果
   - 翻译场景：显示「原文」标签 + 原文内容 + 「译文」标签 + 翻译结果
   - 其他场景（mermaid/latex）：仅显示结果（保持现有行为）
2. 添加对应的 CSS 样式：
   - `.lanismd-ai-history-item-original`：原文区域（带淡色背景、左侧标签）
   - `.lanismd-ai-history-item-result`：结果区域
   - `.lanismd-ai-history-item-label`：区域标签（「原文」「解释」等）

---

### 任务 5: 配置项支持

**文件：**
- 修改: `src/types/config.ts` (已在任务1处理)
- 修改: `src/stores/settings-store.ts` (默认值)

**步骤：**

1. 确保 `settings-store.ts` 的默认配置中包含 `ai.maxHistoryCount: 200`
2. 历史面板的 `addHistory` 在新增记录时读取配置中的 `maxHistoryCount`

---

## 影响范围

- **类型**：`AiHistoryEntry` 增加 `originalText` 字段
- **数据存储**：从 sessionStorage 迁移到 localStorage（key 变更）
- **布局**：面板从 flex 改为 absolute 覆盖
- **UI**：历史条目增加原文+结果的双区域展示
- **配置**：AppConfig.ai 增加 maxHistoryCount

## 向后兼容

- localStorage 中无历史数据时返回空数组（新安装兼容）
- `originalText` 为可选字段，旧记录没有此字段时 UI 只显示 result

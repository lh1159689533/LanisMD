# AI Edit 插件重构实施计划

> **执行指南：** 使用 executing-plans 技能逐任务实施此计划。

**目标：** 将 ai-inline 重构为 ai-edit，去除续写/大纲/调参面板，为润色/翻译/解释新增差异化交互（行内 diff、就地弹窗），调整 slash-menu 和 tooltip-toolbar 的触发范围，新增编辑器右键菜单 AI 入口。

**架构：** AI 功能划分为 ai-edit（编辑类，本次实现）和 copilot（幽灵补全，本次不实现）两个插件。ai-edit 负责润色（行内 diff）、翻译（就地弹窗+语言切换）、解释（就地弹窗仅关闭）、转图表和转公式。右键菜单提供润色(2种模式)+翻译+解释共 4 个 AI 入口。

**技术栈：** Milkdown 7.x / ProseMirror / TypeScript / TailwindCSS + CSS Variables

---

## 需求确认摘要

### 指令保留与触发方式

| 指令 | slash-menu | tooltip 工具栏 | 右键菜单 |
|------|:---:|:---:|:---:|
| 转图表 (mermaid) | 有 | - | - |
| 转公式 (latex) | 有 | - | - |
| 润色 (polish) | - | 有（默认：仅选中内容） | 有（两项：仅选中 / 完整上下文） |
| 翻译 (translate) | - | 有（默认英语） | 有（默认英语） |
| 解释 (explain) | - | 有 | 有 |

### 交互设计

- **润色**：行内 diff 就地展示（删除线+高亮新增），可编辑润色结果，接受/拒绝 按钮
- **翻译**：就地弹窗展示结果，可切换语言（英/日/韩/法/德/西）重新翻译，替换原文/插入原文之后/关闭
- **解释**：就地弹窗展示（与翻译共用弹窗组件），仅关闭按钮

### 删除内容

- `continue`（续写）指令及相关代码
- `outline`（生成大纲）指令及相关代码
- `param-tuner.ts`（参数微调面板）

### 保留内容

- `first-use-guide.ts`（首次使用引导）

---

## 任务总览

| 任务 | 描述 | 预计时间 |
|------|------|----------|
| 任务 1 | 插件目录重命名 + 类型定义更新（删除 continue/outline） | 3-5 min |
| 任务 2 | 清理废弃代码（param-tuner、continue/outline 指令） | 3-5 min |
| 任务 3 | 指令定义重构 + insertMode 扩展 | 3-5 min |
| 任务 4 | 润色行内 diff 交互实现 | 10-15 min |
| 任务 5 | 就地弹窗组件（翻译+解释共用） | 10-15 min |
| 任务 6 | 翻译弹窗完整交互（语言切换+重新翻译） | 5-10 min |
| 任务 7 | generator.ts 重构（按 insertMode 分发到新交互） | 5-10 min |
| 任务 8 | tooltip-toolbar 调整（润色/翻译/解释触发方式） | 3-5 min |
| 任务 9 | slash-menu AI 子菜单精简（仅保留转图表+转公式） | 3-5 min |
| 任务 10 | 编辑器右键菜单 AI 入口 | 10-15 min |
| 任务 11 | 样式文件更新（diff、弹窗、右键菜单） | 5-10 min |
| 任务 12 | 编译验证 + 导入路径全量更新 | 3-5 min |

---

### 任务 1: 插件目录重命名 + 类型定义更新

**文件：**
- 重命名: `src/editor/plugins/ai-inline/` -> `src/editor/plugins/ai-edit/`
- 修改: `src/types/ai.ts`（删除 `continue` | `outline`，新增 `AiInsertMode` 值）
- 修改: `src/editor/plugins/ai-edit/index.ts`（更新模块注释）

**步骤 1: 重命名目录**
```bash
mv src/editor/plugins/ai-inline src/editor/plugins/ai-edit
```

**步骤 2: 更新 AiCommandId 类型**
在 `src/types/ai.ts` 中：
```typescript
// 删除 'continue' | 'outline'
export type AiCommandId = 'polish' | 'translate' | 'explain' | 'mermaid' | 'latex';

// 扩展 AiInsertMode：新增润色 diff、翻译弹窗、解释弹窗三种模式
export type AiInsertMode =
  | 'replace-selection'    // 转图表/转公式之外的旧逻辑保底
  | 'insert-after'         // 保留（翻译的"插入原文之后"使用）
  | 'insert-as-mermaid'    // 转图表
  | 'insert-as-latex'      // 转公式
  | 'inline-diff'          // 润色：行内 diff 展示
  | 'popup-translate'      // 翻译：就地弹窗
  | 'popup-explain';       // 解释：就地弹窗（仅关闭）
```

**步骤 3: 更新 AiCommand 接口**
```typescript
export interface AiCommand {
  id: AiCommandId;
  label: string;
  icon: string;
  keywords: string[];
  insertMode: AiInsertMode;
  /** 是否必须有选中文本才能执行 */
  requireSelection?: boolean;
  /** 是否需要用户输入参数（如 /mermaid <描述>） */
  requireArg?: boolean;
  /** 参数输入提示文本 */
  argPlaceholder?: string;
  /** 构造 prompt */
  buildPrompt: (input: AiPromptInput) => AiChatMessage[];
}
```

**步骤 4: 更新 AiPromptInput**
```typescript
export interface AiPromptInput {
  /** 用户选中的文本 */
  selection?: string;
  /** 参数型指令的用户输入 */
  arg?: string;
  /** 上下文（光标前 N 段）— 润色上下文模式使用 */
  context?: string;
  /** 完整文档文本 — 润色"完整文档上下文"模式使用 */
  fullDocument?: string;
  /** 额外参数（如翻译目标语言） */
  options?: Record<string, string>;
}
```

**步骤 5: 提交**
```bash
git commit -m "refactor: rename ai-inline to ai-edit, update type definitions"
```

---

### 任务 2: 清理废弃代码

**文件：**
- 修改: `src/services/ai/commands.ts`（删除 continue / outline 指令定义）
- 删除: `src/editor/plugins/ai-edit/param-tuner.ts`
- 修改: `src/editor/plugins/ai-edit/generator.ts`（移除 param-tuner 引用和 tuneParams 逻辑）

**步骤 1: 删除 commands.ts 中 continue 和 outline**
在 `AI_COMMANDS` 对象中删除 `continue` 和 `outline` 两个键值对。
在 `AI_COMMAND_ORDER` 数组中删除 `'continue'` 和 `'outline'`。

**步骤 2: 删除 param-tuner.ts**
```bash
rm src/editor/plugins/ai-edit/param-tuner.ts
```

**步骤 3: 清理 generator.ts 中的 param-tuner 引用**
- 删除 `import { showParamTuner } from './param-tuner';`
- 删除 `runAiCommand` 中的 `tuneParams` 分支逻辑
- 删除 `options?: { tuneParams?: boolean }` 参数

**步骤 4: 清理 generator.ts 中的 context 构建逻辑**
`buildRunContext()` 中删除"续写"用的 context 构建代码（取光标前 3 段的部分），改为按需从编辑器获取。

**步骤 5: 提交**
```bash
git commit -m "chore: remove continue/outline commands and param-tuner"
```

---

### 任务 3: 指令定义重构

**文件：**
- 修改: `src/services/ai/commands.ts`

**步骤 1: 更新润色指令**
```typescript
polish: {
  id: 'polish',
  label: '润色',
  icon: ICON_POLISH,
  keywords: ['polish', 'rewrite', '润色', '改写', 'rs'],
  insertMode: 'inline-diff',  // 改为行内 diff 模式
  requireSelection: true,
  buildPrompt: ({ selection, fullDocument, options }) => {
    // 根据是否传入 fullDocument 区分"仅选中"和"完整上下文"模式
    const systemPrompt = fullDocument
      ? `你是一位专业的中文写作编辑。以下是完整文档内容，请仅对"待润色片段"进行润色，保持原意，让表达更通顺自然。只输出润色后的文本，不要任何解释。\n\n---完整文档---\n${fullDocument}\n---文档结束---`
      : '你是一位专业的中文写作编辑。请对下面这段文字进行润色，保持原意，让表达更通顺自然。只输出润色后的文本，不要任何解释。';
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `待润色片段：\n${selection ?? ''}` },
    ];
  },
},
```

**步骤 2: 更新翻译指令**
```typescript
translate: {
  id: 'translate',
  label: '翻译',
  icon: ICON_TRANSLATE,
  keywords: ['translate', 'translation', '翻译', 'fy'],
  insertMode: 'popup-translate',  // 改为就地弹窗模式
  requireSelection: true,
  buildPrompt: ({ selection, options }) => {
    const targetLang = options?.targetLang ?? '英语';
    return [
      {
        role: 'system',
        content: `你是一位专业翻译。请将以下文本翻译为${targetLang}。只输出译文，不要任何解释或注释。`,
      },
      { role: 'user', content: selection ?? '' },
    ];
  },
},
```

**步骤 3: 更新解释指令**
```typescript
explain: {
  id: 'explain',
  label: '解释',
  icon: ICON_EXPLAIN,
  keywords: ['explain', '解释', 'js'],
  insertMode: 'popup-explain',  // 改为就地弹窗（仅关闭）
  requireSelection: true,
  buildPrompt: ({ selection }) => [
    {
      role: 'system',
      content: '请用通俗易懂的中文解释下面的内容。如果是代码，解释它做什么；如果是概念，解释它是什么。输出 Markdown 格式。',
    },
    { role: 'user', content: selection ?? '' },
  ],
},
```

**步骤 4: 提交**
```bash
git commit -m "refactor: update command definitions with new insertModes"
```

---

### 任务 4: 润色行内 diff 交互实现

**文件：**
- 创建: `src/editor/plugins/ai-edit/inline-diff.ts`

**步骤 1: 创建 inline-diff.ts**

实现一个行内 diff 渲染器，核心职责：
1. 接收原文和润色后文本
2. 使用简单的词级 diff 算法（或字符级），计算差异
3. 在原选区位置就地渲染 diff：
   - 删除的文字：红色删除线
   - 新增的文字：绿色高亮，可编辑（contenteditable）
4. 顶部操作栏：`[接受]` `[拒绝]`
5. 接受时用编辑后的内容替换原选区
6. 拒绝时恢复原文（什么都不做，销毁 diff 视图）

```typescript
/**
 * 行内 diff 渲染器
 *
 * 在编辑器选区位置就地展示润色前后的差异：
 * - 删除部分：红色删除线
 * - 新增部分：绿色高亮，可编辑
 * - 操作按钮：接受 / 拒绝
 */

import type { EditorView } from '@milkdown/kit/prose/view';

export interface InlineDiffOptions {
  view: EditorView;
  /** 选区起始位置 */
  from: number;
  /** 选区结束位置 */
  to: number;
  /** 原文 */
  original: string;
  /** 润色后文本 */
  revised: string;
  /** 接受回调：参数为最终文本（用户可能编辑过） */
  onAccept: (finalText: string) => void;
  /** 拒绝回调 */
  onReject: () => void;
}

/**
 * 展示行内 diff。
 * 返回销毁函数。
 */
export function showInlineDiff(options: InlineDiffOptions): () => void {
  // 1. 计算词级 diff
  // 2. 创建浮层 DOM（挂载到 .lanismd-ai-overlay）
  // 3. 渲染 diff 节点（删除线 + 新增高亮）
  // 4. 新增部分设为 contenteditable
  // 5. 绑定接受/拒绝按钮事件
  // 6. 返回销毁函数
}

/**
 * 简单的词级 diff 算法（Myers 或 LCS）
 * 返回操作列表：keep / delete / insert
 */
function computeWordDiff(
  original: string,
  revised: string,
): Array<{ type: 'keep' | 'delete' | 'insert'; text: string }> {
  // 按词拆分（中文按字，英文按空格/标点）
  // 使用 LCS 算法计算最长公共子序列
  // 生成操作列表
}
```

**关键实现细节：**
- diff 浮层挂载在 `.lanismd-ai-overlay` 容器中（与现有占位符一致）
- 使用绝对定位覆盖在原选区位置
- 新增文本的 `contenteditable` 区域允许用户直接修改
- 接受时从 contenteditable 区域提取最终文本

**步骤 2: 提交**
```bash
git commit -m "feat: implement inline diff renderer for polish"
```

---

### 任务 5: 就地弹窗组件（翻译+解释共用）

**文件：**
- 创建: `src/editor/plugins/ai-edit/ai-popup.ts`

**步骤 1: 创建 ai-popup.ts**

实现就地弹窗组件，核心结构：

```typescript
/**
 * AI 就地弹窗（翻译/解释共用）
 *
 * 定位在选区附近，展示 AI 生成结果。
 * 翻译模式：替换原文 / 插入原文之后 / 关闭 + 语言切换
 * 解释模式：仅关闭
 */

import type { EditorView } from '@milkdown/kit/prose/view';

/** 弹窗模式 */
export type PopupMode = 'translate' | 'explain';

/** 支持的翻译语言 */
export const TRANSLATE_LANGUAGES = [
  { id: 'en', label: '英语' },
  { id: 'ja', label: '日语' },
  { id: 'ko', label: '韩语' },
  { id: 'fr', label: '法语' },
  { id: 'de', label: '德语' },
  { id: 'es', label: '西班牙语' },
] as const;

export type TranslateLanguageId = (typeof TRANSLATE_LANGUAGES)[number]['id'];

export interface AiPopupOptions {
  view: EditorView;
  /** 选区起始位置 */
  from: number;
  /** 选区结束位置 */
  to: number;
  /** 弹窗模式 */
  mode: PopupMode;
  /** 初始内容（流式传入时可为空，逐步追加） */
  initialContent?: string;
  /** 替换原文回调 */
  onReplace?: (text: string) => void;
  /** 插入原文之后回调 */
  onInsertAfter?: (text: string) => void;
  /** 关闭回调 */
  onClose?: () => void;
  /** 切换语言重新翻译回调 */
  onLanguageChange?: (langId: TranslateLanguageId) => void;
}

export interface AiPopupHandle {
  /** 追加流式内容 */
  appendContent: (delta: string) => void;
  /** 设为完成状态 */
  setDone: () => void;
  /** 设为错误状态 */
  setError: (message: string) => void;
  /** 更新全部内容（切换语言后重新翻译时使用） */
  resetContent: () => void;
  /** 销毁弹窗 */
  destroy: () => void;
}

/**
 * 创建并显示就地弹窗。
 */
export function createAiPopup(options: AiPopupOptions): AiPopupHandle {
  // 1. 创建弹窗 DOM
  // 2. 定位在选区下方（floating-ui 式定位）
  // 3. 根据 mode 渲染不同的按钮区域：
  //    - translate: [替换原文] [插入原文之后] [关闭] + 语言选择器
  //    - explain: [关闭]
  // 4. 内容区域显示 AI 结果（支持流式追加）
  // 5. 绑定事件
  // 6. 返回 handle
}
```

**弹窗 DOM 结构：**
```
.lanismd-ai-popup-overlay        （全屏透明遮罩，点击关闭）
  .lanismd-ai-popup              （弹窗容器，绝对定位在选区附近）
    .lanismd-ai-popup-header     （标题区域：翻译/解释 + 语言选择器）
    .lanismd-ai-popup-content    （内容区域：流式文本）
    .lanismd-ai-popup-actions    （按钮区域）
```

**步骤 2: 提交**
```bash
git commit -m "feat: create shared AI popup component for translate/explain"
```

---

### 任务 6: 翻译弹窗语言切换交互

**文件：**
- 修改: `src/editor/plugins/ai-edit/ai-popup.ts`（语言选择器 UI）
- 修改: `src/editor/plugins/ai-edit/generator.ts`（onLanguageChange 触发重新翻译）

**步骤 1: 在弹窗 header 中添加语言选择器**

翻译模式的 header 包含：
```
翻译  [英语 v]   （下拉选择器，展示当前语言）
```

点击下拉显示语言列表（英/日/韩/法/德/西），选择后：
1. 清空当前内容
2. 显示"翻译中..."
3. 调用 `onLanguageChange` 回调
4. generator 重新发起 AI 请求，结果流式追加到弹窗

**步骤 2: generator 中实现 onLanguageChange**

当用户切换语言时：
1. 取消当前进行中的请求（如有）
2. 用新语言重新构建 prompt
3. 调用 `aiService.startAiStream()`
4. 通过 `handle.resetContent()` 清空旧内容
5. 流式追加新内容

**步骤 3: 提交**
```bash
git commit -m "feat: implement language switching in translate popup"
```

---

### 任务 7: generator.ts 重构

**文件：**
- 修改: `src/editor/plugins/ai-edit/generator.ts`

**步骤 1: 按 insertMode 分发到不同交互**

重构 `runStreaming()` 函数，根据 `command.insertMode` 分发：

```typescript
async function runStreaming(ctx: AiRunContext, params: AiChatParams): Promise<void> {
  const { command } = ctx;

  switch (command.insertMode) {
    case 'inline-diff':
      return runPolishWithDiff(ctx, params);
    case 'popup-translate':
      return runTranslatePopup(ctx, params);
    case 'popup-explain':
      return runExplainPopup(ctx, params);
    case 'insert-as-mermaid':
    case 'insert-as-latex':
      return runWithPlaceholder(ctx, params);  // 保留原有占位符逻辑
    default:
      return runWithPlaceholder(ctx, params);
  }
}
```

**步骤 2: 实现 runPolishWithDiff**

```typescript
async function runPolishWithDiff(ctx: AiRunContext, params: AiChatParams): Promise<void> {
  // 1. 先用占位符显示"AI 润色中..."
  // 2. 流式收集完整结果
  // 3. 完成后，销毁占位符，调用 showInlineDiff() 展示差异
  // 4. 用户接受/拒绝后执行对应操作
}
```

**步骤 3: 实现 runTranslatePopup**

```typescript
async function runTranslatePopup(ctx: AiRunContext, params: AiChatParams): Promise<void> {
  // 1. 创建弹窗（mode: 'translate'）
  // 2. 启动流式请求，将 delta 追加到弹窗
  // 3. 绑定 onReplace/onInsertAfter/onClose/onLanguageChange
  // 4. onLanguageChange 时重新发起请求
}
```

**步骤 4: 实现 runExplainPopup**

```typescript
async function runExplainPopup(ctx: AiRunContext, params: AiChatParams): Promise<void> {
  // 1. 创建弹窗（mode: 'explain'）
  // 2. 启动流式请求，将 delta 追加到弹窗
  // 3. 仅绑定 onClose
}
```

**步骤 5: 更新 runAiCommand 入口**

- 新增 `polishMode` 参数支持右键菜单的两种润色模式：
  ```typescript
  export async function runAiCommand(
    view: EditorView,
    command: AiCommand,
    extra?: Partial<AiPromptInput>,
  ): Promise<void>
  ```
- 当 `extra.fullDocument` 存在时，润色指令使用完整文档上下文模式

**步骤 6: 提交**
```bash
git commit -m "refactor: dispatch streaming by insertMode in generator"
```

---

### 任务 8: tooltip-toolbar 调整

**文件：**
- 修改: `src/editor/plugins/tooltip-toolbar.ts`

**步骤 1: 更新导入路径**
```typescript
// ai-inline -> ai-edit
import { runAiCommand } from './ai-edit';
```

**步骤 2: 更新 AI 子菜单项**
保持润色/翻译/解释三个子菜单项不变，但：
- 润色：tooltip 触发默认为"仅选中内容"（不传 fullDocument）
- 翻译：触发时传入 `options: { targetLang: '英语' }`（默认英语）
- 解释：无需变化

**步骤 3: 移除 Alt 键调参面板逻辑**
- 删除 `_lastMousedownAlt` 相关代码
- 删除 `handleAiCommand` 中的 `tuneParams` 参数传递

**步骤 4: 提交**
```bash
git commit -m "refactor: update tooltip-toolbar for ai-edit"
```

---

### 任务 9: slash-menu AI 子菜单精简

**文件：**
- 修改: `src/editor/plugins/slash-menu/commands-ai.ts`

**步骤 1: 仅保留转图表和转公式**

删除 polish、translate、continue、explain、outline 的菜单项定义，只保留：
```typescript
export const aiSlashCommands = [
  {
    id: 'ai-mermaid',
    label: '转图表',
    icon: AI_COMMANDS.mermaid.icon,
    // ...
  },
  {
    id: 'ai-latex',
    label: '转公式',
    icon: AI_COMMANDS.latex.icon,
    // ...
  },
];
```

**步骤 2: 更新导入路径**（ai-inline -> ai-edit）

**步骤 3: 提交**
```bash
git commit -m "refactor: slash-menu AI submenu keeps only mermaid and latex"
```

---

### 任务 10: 编辑器右键菜单 AI 入口

**文件：**
- 创建: `src/editor/plugins/ai-edit/context-menu.ts`
- 修改: `src/editor/plugins/ai-edit/index.ts`（注册右键菜单监听）

**步骤 1: 创建 context-menu.ts**

实现编辑器区域内的右键菜单 AI 入口：

```typescript
/**
 * 编辑器右键菜单 AI 入口
 *
 * 当有文本选中时，右键菜单中显示 AI 相关操作项（共 4 项）：
 * - AI 润色（仅当前选中）
 * - AI 润色（完整文档上下文）
 * - AI 翻译
 * - AI 解释
 */

import type { EditorView } from '@milkdown/kit/prose/view';
import { AI_COMMANDS } from '@/services/ai/commands';
import { useSettingsStore } from '@/stores/settings-store';
import { runAiCommand } from './generator';

export interface EditorContextMenuOptions {
  x: number;
  y: number;
  view: EditorView;
  onClose: () => void;
}

/**
 * 创建并显示编辑器右键菜单中的 AI 分组。
 * 仅在有文本选中且 AI 功能启用时显示。
 */
export function showEditorAiContextMenu(options: EditorContextMenuOptions): HTMLElement | null {
  const { view, x, y, onClose } = options;
  const { state } = view;
  const { from, to } = state.selection;

  // 无选中文本时不显示 AI 菜单
  if (from === to) return null;

  // AI 未启用时不显示
  const { config } = useSettingsStore.getState();
  if (!config.ai?.enabled) return null;

  const selectedText = state.doc.textBetween(from, to, '\n', '\n');
  const fullDocument = state.doc.textBetween(0, state.doc.content.size, '\n', '\n');

  // 创建菜单 DOM
  const menu = document.createElement('div');
  menu.className = 'lanismd-ai-context-menu';

  const items = [
    {
      label: 'AI 润色（仅选中）',
      action: () => {
        onClose();
        void runAiCommand(view, AI_COMMANDS.polish);
      },
    },
    {
      label: 'AI 润色（完整上下文）',
      action: () => {
        onClose();
        void runAiCommand(view, AI_COMMANDS.polish, { fullDocument });
      },
    },
    {
      label: 'AI 翻译',
      action: () => {
        onClose();
        void runAiCommand(view, AI_COMMANDS.translate, {
          options: { targetLang: '英语' },
        });
      },
    },
    {
      label: 'AI 解释',
      action: () => {
        onClose();
        void runAiCommand(view, AI_COMMANDS.explain);
      },
    },
  ];

  // 渲染菜单项
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'lanismd-ai-context-menu-item';
    btn.textContent = item.label;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.action();
    });
    menu.appendChild(btn);
  });

  // 定位
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  return menu;
}
```

**步骤 2: 在 ai-edit 插件 index.ts 中注册 contextmenu 事件**

在编辑器 DOM 上监听 `contextmenu` 事件，当有文本选中时在默认浏览器右键菜单之外（或替换为自定义菜单）显示 AI 入口。

方案：拦截编辑器 `contextmenu` 事件，创建一个包含 AI 选项 + 常规选项的自定义右键菜单。

**步骤 3: 提交**
```bash
git commit -m "feat: add AI entries to editor context menu"
```

---

### 任务 11: 样式文件更新

**文件：**
- 修改: `src/styles/editor/ai-inline.css`（更名为 `ai-edit.css` 并添加新样式）
- 修改: `src/styles/editor/index.css`（更新 import）

**步骤 1: 重命名 CSS 文件**
```bash
mv src/styles/editor/ai-inline.css src/styles/editor/ai-edit.css
```

**步骤 2: 添加行内 diff 样式**
```css
/* 行内 diff 样式 */
.lanismd-ai-diff-container {
  position: absolute;
  pointer-events: auto;
  z-index: 15;
}

.lanismd-ai-diff-deleted {
  text-decoration: line-through;
  color: #ef4444;
  background-color: rgba(239, 68, 68, 0.1);
}

.lanismd-ai-diff-inserted {
  color: #22c55e;
  background-color: rgba(34, 197, 94, 0.1);
  outline: none;
}

.lanismd-ai-diff-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
```

**步骤 3: 添加就地弹窗样式**
```css
/* AI 就地弹窗 */
.lanismd-ai-popup-overlay { /* 全屏透明遮罩 */ }
.lanismd-ai-popup { /* 弹窗容器 */ }
.lanismd-ai-popup-header { /* 标题 + 语言选择器 */ }
.lanismd-ai-popup-content { /* 内容区 */ }
.lanismd-ai-popup-actions { /* 按钮区 */ }
.lanismd-ai-popup-lang-select { /* 语言下拉 */ }
```

**步骤 4: 添加编辑器右键菜单 AI 项样式**
```css
.lanismd-ai-context-menu { /* 菜单容器 */ }
.lanismd-ai-context-menu-item { /* 菜单项 */ }
```

**步骤 5: 删除 param-tuner 相关样式**
删除 `.lanismd-ai-tuner-*` 系列样式。

**步骤 6: 更新 index.css 引用**
```css
/* @import './ai-inline.css'; */
@import './ai-edit.css';
```

**步骤 7: 提交**
```bash
git commit -m "style: update CSS for ai-edit (diff, popup, context-menu)"
```

---

### 任务 12: 编译验证 + 导入路径全量更新

**文件：**
- 修改: 所有引用 `ai-inline` 的文件，更新为 `ai-edit`

**步骤 1: 全局搜索并替换导入路径**
需要检查并更新的文件（基于当前代码分析）：
- `src/editor/plugins/tooltip-toolbar.ts`：`import { runAiCommand } from './ai-inline'` -> `'./ai-edit'`
- `src/editor/plugins/slash-menu/commands-ai.ts`：同上
- `src/styles/editor/index.css`：`@import './ai-inline.css'` -> `'./ai-edit.css'`
- 其他可能引用 ai-inline 的文件

**步骤 2: 运行编译验证**
```bash
pnpm build
```
确保无 TypeScript 编译错误。

**步骤 3: 运行 cargo check**
```bash
cd src-tauri && cargo check
```
（Rust 侧本次无修改，仅验证不受影响）

**步骤 4: 提交**
```bash
git commit -m "chore: update all import paths from ai-inline to ai-edit"
```

---

## 风险与注意事项

| 风险 | 缓解措施 |
|------|----------|
| 行内 diff 算法对中文分词不准 | 采用字符级 diff 兜底，后续可优化为分词 diff |
| 弹窗定位在编辑器滚动时偏移 | 弹窗使用 fixed 定位 + scroll 监听动态更新位置 |
| 右键菜单与浏览器默认菜单冲突 | 使用 `e.preventDefault()` 完全拦截，提供完整自定义菜单 |
| 润色结果 contenteditable 区域与 ProseMirror 冲突 | diff 浮层挂载在 overlay 容器中，不参与 ProseMirror DOM 树 |
| 翻译切换语言时旧请求未取消 | 切换语言前调用 `cancelFn()` 取消旧请求 |

## 验收清单

- [ ] `ai-inline` 目录已重命名为 `ai-edit`
- [ ] `continue` 和 `outline` 指令代码已彻底清除
- [ ] `param-tuner.ts` 已删除，相关引用已清理
- [ ] 润色功能使用行内 diff 展示（删除线+高亮新增），结果可编辑，有接受/拒绝按钮
- [ ] 翻译功能使用就地弹窗展示，支持切换 6 种语言重新翻译，有替换/插入/关闭按钮
- [ ] 解释功能使用就地弹窗展示，仅有关闭按钮
- [ ] tooltip 工具栏：润色/翻译/解释 三个按钮正常工作
- [ ] slash-menu AI 子菜单仅显示"转图表"和"转公式"
- [ ] 右键菜单在有选中文本时显示 4 个 AI 入口
- [ ] 右键菜单"AI 润色（仅选中）"和"AI 润色（完整上下文）"行为不同
- [ ] 翻译默认使用英语，弹窗中可切换语言
- [ ] `first-use-guide.ts` 保留且正常工作
- [ ] `pnpm build` 无错误
- [ ] 所有注释为中文
- [ ] 样式类名使用 `.lanismd-ai-` 前缀
- [ ] 无 emoji 夹带

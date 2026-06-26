# 转图表/转公式弹窗交互统一 实施计划

> **执行指南：** 使用 executing-plans 技能逐任务实施此计划。

**目标：** 将转图表(mermaid)和转公式(latex)的参数输入+流式结果展示统一为 `ai-popup.ts` 同款的「全屏遮罩 + 卡片弹窗」风格，两个阶段在同一个弹窗内完成。

**架构：** 新建 `generator-popup.ts`，实现两阶段弹窗（参数输入 -> 结果展示），复用 `ai-popup.ts` 的视觉风格和定位逻辑。在 `generator.ts` 中新增 `runWithGeneratorPopup` 分发函数替代原来的 `runWithPlaceholder` 路径。`commands-ai.ts` 中不再调用 `arg-input.ts`，改为直接走 `runAiCommand` → 新弹窗流程。

**技术栈：** TypeScript, ProseMirror EditorView, DOM API, CSS

---

## 需求规格

### 阶段 1 - 参数输入
- 弹窗定位在**光标行**附近（和 `ai-popup` 同款定位）
- 使用全屏遮罩 + 卡片弹窗（`ai-popup` 同款风格）
- 弹窗内包含：header（标题）+ 文本域（textarea）+ 开始按钮
- Esc / 点击遮罩关闭（取消操作）

### 阶段 2 - 结果展示（同一弹窗内切换）
- 保留阶段 1 的输入文本域（只读，展示用户输入了什么）
- 新增第二个文本域（textarea），流式显示 AI 生成的代码
- 结果文本域**可编辑**（用户可手动修改生成结果）
- 按钮变为：**接受** / **拒绝** / **重试**
  - 接受 -> 将结果（可能被用户手动编辑过）写入编辑器
  - 拒绝 -> 关闭弹窗，不做任何修改
  - 重试 -> 清空结果区，保留用户输入，重新生成

---

## 任务 1: 创建 generator-popup.ts 弹窗组件

**文件：**
- 创建: `src/editor/plugins/ai-edit/generator-popup.ts`

**步骤 1: 创建 generator-popup.ts**

```typescript
/**
 * 转图表/转公式专用弹窗
 *
 * 两阶段交互：
 * - 阶段 1：参数输入（文本域 + 开始按钮）
 * - 阶段 2：结果展示（原始输入只读 + 可编辑结果文本域 + 接受/拒绝/重试按钮）
 *
 * 弹窗风格与 ai-popup.ts 保持一致（全屏遮罩 + 卡片弹窗）。
 */

import type { EditorView } from '@milkdown/kit/prose/view';

/** 弹窗类型 */
export type GeneratorPopupType = 'mermaid' | 'latex';

/** 占位提示映射 */
const PLACEHOLDER_MAP: Record<GeneratorPopupType, string> = {
  mermaid: '描述图表内容，例如：用户登录流程',
  latex: '描述公式，例如：二次方程求根公式',
};

/** 标题映射 */
const TITLE_MAP: Record<GeneratorPopupType, string> = {
  mermaid: '转图表',
  latex: '转公式',
};

export interface GeneratorPopupOptions {
  view: EditorView;
  /** 光标位置（用于定位弹窗） */
  pos: number;
  /** 弹窗类型 */
  type: GeneratorPopupType;
  /** 点击"开始"后回调，返回用户输入的描述 */
  onStart: (arg: string) => void;
  /** 点击"接受"后回调，返回最终结果文本（可能被用户编辑过） */
  onAccept: (result: string) => void;
  /** 点击"拒绝"后回调 */
  onReject: () => void;
  /** 点击"重试"后回调，返回原始用户输入 */
  onRetry: (arg: string) => void;
  /** 关闭回调（Esc / 点击遮罩） */
  onClose: () => void;
}

export interface GeneratorPopupHandle {
  /** 追加流式内容到结果文本域 */
  appendContent: (delta: string) => void;
  /** 设为完成状态（显示接受/拒绝/重试按钮） */
  setDone: () => void;
  /** 设为错误状态 */
  setError: (message: string) => void;
  /** 重置结果区（重试时使用） */
  resetContent: () => void;
  /** 切换到阶段 2（隐藏开始按钮，显示结果区） */
  switchToResult: () => void;
  /** 销毁弹窗 */
  destroy: () => void;
}
```

实现 `createGeneratorPopup(options): GeneratorPopupHandle` 函数，DOM 结构：
- overlay: `.lanismd-ai-popup-overlay`（复用 ai-popup 样式）
- popup: `.lanismd-ai-popup .lanismd-generator-popup`
  - header: `.lanismd-ai-popup-header` (标题)
  - inputArea: `.lanismd-generator-popup-input-area`
    - textarea (输入描述)
  - startArea: `.lanismd-generator-popup-start-area`
    - 开始按钮
  - resultArea: `.lanismd-generator-popup-result-area`（初始隐藏）
    - status 提示
    - textarea (结果，可编辑)
  - actionsArea: `.lanismd-generator-popup-actions`（初始隐藏）
    - 接受按钮 / 拒绝按钮 / 重试按钮

定位逻辑复用 `ai-popup.ts` 中的 `positionPopup` 思路（光标行定位，编辑区等宽）。

**步骤 2: 验证**

手动检查 TypeScript 编译无错误：
运行: `cd /Users/lihui/workspace/My/LanisMD && npx tsc --noEmit --pretty 2>&1 | head -30`
预期: 无与 generator-popup.ts 相关的错误

---

## 任务 2: 添加 generator-popup CSS 样式

**文件：**
- 修改: `src/styles/editor/ai-edit.css`

**步骤 1: 在 ai-edit.css 末尾添加 generator-popup 相关样式**

新增以下 CSS 类：
- `.lanismd-generator-popup` - 弹窗额外样式（继承 `.lanismd-ai-popup` 基础样式）
- `.lanismd-generator-popup-input-area` - 输入区域容器
- `.lanismd-generator-popup-textarea` - 文本域（输入/结果共用基础样式）
- `.lanismd-generator-popup-start-area` - 开始按钮区域
- `.lanismd-generator-popup-result-area` - 结果区域（初始 display:none）
- `.lanismd-generator-popup-actions` - 操作按钮区
- `.lanismd-generator-popup-status` - 状态提示文本

样式风格与现有 `.lanismd-ai-popup-*` 保持一致（相同圆角、间距、颜色变量），
按钮样式复用 `.lanismd-ai-popup-btn` 和 `.lanismd-ai-popup-btn-primary`。

**步骤 2: 验证**

运行: `cd /Users/lihui/workspace/My/LanisMD && npx vite build 2>&1 | tail -5`
预期: 构建成功

---

## 任务 3: 修改 generator.ts 新增 runWithGeneratorPopup 流程

**文件：**
- 修改: `src/editor/plugins/ai-edit/generator.ts`

**步骤 1: 在 generator.ts 中新增 `runWithGeneratorPopup` 函数**

该函数替代 `runWithPlaceholder` 用于 `insert-as-mermaid` 和 `insert-as-latex` 模式：

1. 从 `command.id` 判断 type（'mermaid' | 'latex'）
2. 调用 `createGeneratorPopup` 创建弹窗
3. `onStart` 回调中：
   - 用 `arg` 重新构建 prompt（`command.buildPrompt({ ...promptInput, arg })`）
   - 启动 `aiService.startAiStream`，delta 追加到弹窗
4. `onAccept` 回调中：调用 `commitResult`（将用户可能编辑过的最终结果写入文档）
5. `onReject` 回调中：取消进行中的请求，销毁弹窗
6. `onRetry` 回调中：取消当前请求，resetContent，用同样的 arg 重新生成
7. `onClose` 回调中：取消进行中的请求

**步骤 2: 修改 `runStreaming` 的 switch 分支**

将 `insert-as-mermaid` 和 `insert-as-latex` 的 case 从 `runWithPlaceholder` 改为 `runWithGeneratorPopup`。

注意：`runWithGeneratorPopup` 需要额外接收 `extra` 参数（包含可能的 `arg`）。如果 `extra.arg` 已存在（从 slash menu 直接传参数的场景），则跳过阶段 1 直接进入生成。

**步骤 3: 验证**

运行: `cd /Users/lihui/workspace/My/LanisMD && npx tsc --noEmit --pretty 2>&1 | head -30`
预期: 无错误

---

## 任务 4: 修改 slash-menu commands-ai.ts 移除 arg-input 调用

**文件：**
- 修改: `src/editor/plugins/slash-menu/commands-ai.ts`

**步骤 1: 简化 triggerAiCommand**

移除 `showArgInputAndRun` 函数和相关逻辑。
`triggerAiCommand` 不再检查 `command.requireArg`，统一直接调用 `runAiCommand(view, command)`。
参数输入的交互已经由 `generator-popup` 弹窗接管。

**步骤 2: 验证**

运行: `cd /Users/lihui/workspace/My/LanisMD && npx tsc --noEmit --pretty 2>&1 | head -30`
预期: 无错误

---

## 任务 5: 端到端验证与清理

**文件：**
- 检查: `src/editor/plugins/ai-edit/arg-input.ts`（确认是否还有其他调用方）
- 检查: `src/editor/plugins/ai-edit/placeholder.ts`（确认 mermaid/latex 不再使用）

**步骤 1: 搜索 arg-input 的所有引用**

确认除了 `commands-ai.ts` 外没有其他地方 import `arg-input`。如果没有其他引用，`arg-input.ts` 可以保留（不删除，因为其他指令可能将来需要）。

**步骤 2: 搜索 placeholder 的引用**

确认 `createPlaceholder` 是否仅被 `generator.ts` 的 `runWithPlaceholder` 使用。如果 `runWithPlaceholder` 还被 default 分支使用（通用模式），则 `placeholder.ts` 仍然保留。

**步骤 3: TypeScript 全量检查**

运行: `cd /Users/lihui/workspace/My/LanisMD && npx tsc --noEmit --pretty`
预期: 无错误

**步骤 4: Vite 构建验证**

运行: `cd /Users/lihui/workspace/My/LanisMD && npx vite build 2>&1 | tail -10`
预期: 构建成功

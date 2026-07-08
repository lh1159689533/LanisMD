---
req_id: 20260702-board-block-mindmap
title: 画板插件（Board Block）—— 思维导图 MVP
priority: P1
created_at: 2026-07-02T23:33:00+08:00
keywords: [画板, Board, 思维导图, mindmap, Plait, Slate, ProseMirror, atom节点, 内联编辑, NodeView]
related_archives: [docs/画板插件技术方案.md]
---

# 画板插件（Board Block）—— 思维导图 MVP

> 本 PRD 依据 `docs/画板插件技术方案.md` 细化，并已对照当前代码库核实关键前提（见附录 A）。
> MVP 范围与形态已经决策确认，详见「0. 决策基线」。

## 0. 决策基线（已确认）

| 决策项 | 结论 | 影响 |
|--------|------|------|
| **一期范围** | 只跑通「思维导图」完整闭环（插入→编辑→序列化→重开），流程图/自由画板/导出等作为后续迭代 | Plait 仅引入 `@plait/mind`，`@plait/draw` 本期不接入 |
| **编辑形态** | 文档内内联编辑（固定高度视口，默认 420px 可拖拽）+ 全屏为可选增强 | 需啃 Slate↔ProseMirror 事件共存，是最大风险点 |
| **数据编码** | `base64(JSON)` 明文，**不引入 pako** | `codec.decode` 保留对未来压缩格式的向后兼容分支 |
| **Slash 入口** | 仅 `/board` 一个入口（插入即预置思维导图根节点并自动进编辑） | 不做 `/mindmap`、`/flowchart` 独立入口 |
| **预览态方案** | 采用「只读 Plait 挂载」渲染静态思维导图（`options.readonly = true`），不启用编辑交互 | 预览态即挂载只读 React 子树，双击/点编辑再切换为可编辑 |
| **`slate-react` 依赖** | **未安装**，实现前需 `pnpm add slate-react` | 补齐后方可跑通文本层 |

**本期一律延后到 P2（不在 MVP 范围）**：
- 全屏编辑（3.9）、`pako` 压缩、流程图（`@plait/draw`）、自由画板、`/mindmap`·`/flowchart` 独立子入口、PNG/SVG 导出。

**关键核实结论（与技术方案不符处，PRD 以此为准）**：
- 实际已安装包为 `@plait-board/react-board@0.4.0-0`、`@plait-board/react-text@0.4.0-0`（**非** `@plait/react-board`）。
- React 宿主 API 为 `Wrapper` + `Board` 组合，**不存在** `<PlaitBoard data onChange>`。正确用法见 `4.3`。
- `pako` 未安装，本期按决策不安装。
- `slate-react` 未安装，本期需补装（见 4.6）。

---

## 1. 背景与目标

LanisMD 当前编辑器（Milkdown/ProseMirror）已具备 `mermaid-block`、`toc-block` 等复杂图形/块级节点范式，但缺少「可视化画板」能力。用户在整理知识、做脑图时需离开编辑器到外部工具，割裂了写作流。

**核心目标（MVP）**：
- 在文档中通过 `/board` 插入一个思维导图节点，就地编辑（增删节点、编辑文本、拖拽布局）。
- 画板数据随 `.md` 文件持久化（`plait` 代码围栏内联），关闭重开后原样恢复。
- 画板对 ProseMirror 是一个黑盒 atom 节点，内部为独立 Plait/React 子树，两者仅通过「读初始数据 / 写回数据」窄接口通信。

**非目标（本期不做）**：
- 流程图、自由画板、几何图形、连线（`@plait/draw`）。
- PNG/SVG 导出、手绘贴图、外部 `.plait` 附件存储、数据压缩（pako）。
- 画板协同编辑、历史版本。

---

## 2. 术语与范围约定

| 术语 | 含义 |
|------|------|
| `board_block` | 本期新增的 ProseMirror 块级 atom 节点，`group: 'block'`, `atom: true`, `isolating: true` |
| 预览态（preview） | 节点默认状态，仅展示静态渲染，不挂载 React |
| 编辑态（editing） | 挂载 Plait/React 子树，用户可交互编辑思维导图 |
| codec | 画板数据编解码模块（`board_block.attrs.data` ↔ Plait elements） |

---

## 3. 功能需求

### 3.1 插入画板（Slash 命令 `/board`）

- **描述**：在 slash-menu 新增 `/board` 命令，插入一个预置了思维导图根节点的 `board_block`，并自动进入编辑态。
- **用户故事**：作为用户，我在正文输入 `/board` 回车，就能立即得到一个可编辑的思维导图，光标聚焦在根节点上。
- **优先级**：P0
- **功能细节**：
  - 命令注册在 `src/editor/plugins/slash-menu/commands-basic.ts`（参照现有命令结构与 `icons.ts` 图标注册）。
  - 插入逻辑：`insert(boardBlockSchema.type(ctx).create({ data: encode(DEFAULT_MINDMAP) }))`，其中 `DEFAULT_MINDMAP` 为「一个根节点 + 文本占位」的最小思维导图 elements。
  - 插入后置模块级 `setBoardAutoEdit()` 标记（参照 `mermaid-block` 的 `setMermaidAutoEdit`），NodeView 构造时消费并 `requestAnimationFrame` 自动进编辑。
- **验收标准**：
  - [ ] slash-menu 出现「画板」项，含图标与描述，可键盘/鼠标选中。
  - [ ] 选中后在光标处插入 `board_block`，并自动进入编辑态。
  - [ ] 插入的画板默认包含一个可编辑的思维导图根节点。
  - [ ] 不新增 `/mindmap`、`/flowchart` 入口。

### 3.2 内联编辑思维导图

- **描述**：画板在文档内以固定高度视口呈现，进入编辑态后用户可增删节点、编辑节点文本、拖拽调整、缩放平移画布。
- **用户故事**：作为用户，我双击画板或点编辑按钮即可就地编辑思维导图，无需跳转页面。
- **优先级**：P0
- **功能细节**：
  - 编辑能力由 `@plait/mind` 提供（Tab 增子节点、Enter 增兄弟节点、双击编辑文本等 Plait 内置交互）。
  - 内部文本编辑走 Plait 的 Slate 文本层（`@plait-board/react-text`）。
  - 挂载策略：进入视口即 `createRoot(...).render(<BoardReact readonly/>)`（只读挂载，见 3.3）；双击/点编辑仅切换 `readonly=false`，不重新挂载。
  - 编辑态下所有键盘/IME/鼠标事件交给 Plait/Slate，ProseMirror 不介入（见 3.6 事件隔离）。
- **验收标准**：
  - [ ] 双击画板 / 点工具栏「编辑」进入编辑态。
  - [ ] 可新增子节点、兄弟节点、删除节点。
  - [ ] 可双击节点编辑文本，支持中文输入法（IME）无异常（无重复字符、无光标跳飞）。
  - [ ] 可拖拽画布平移、滚轮缩放。
  - [ ] 焦点离开画板（点击文档其它位置）自动退出编辑态并回写数据。

### 3.3 预览态与懒挂载

- **描述**：画板默认处于预览态，以**只读方式挂载** Plait Board 渲染静态思维导图，不启用编辑交互。
- **优先级**：P1
- **功能细节**：
  - MVP 预览态实现方案（**已决策：只读挂载**）：进入视口即以 `options.readonly = true` 挂载 Plait Board，完整渲染思维导图结构与布局，但屏蔽增删/文本编辑/拖拽等交互。
  - 双击画板 / 点工具栏「编辑」时，切换为可编辑挂载（`readonly = false`，见 3.2）；退出编辑回落只读态。
  - 预览态拦截 `mousedown`（除双击进编辑外），防止选区穿透进内部。
  - 只读态与编辑态共用同一 `createRoot`，仅切换 `readonly` prop，避免重复挂载/卸载开销。
- **验收标准**：
  - [ ] 预览态完整渲染思维导图（节点、层级、布局），视觉与编辑态一致。
  - [ ] 预览态不响应增删节点、文本编辑、拖拽等编辑交互。
  - [ ] 双击 / 点「编辑」平滑切换到可编辑态，无重新挂载导致的闪烁。

### 3.4 Markdown 序列化（持久化闭环）

- **描述**：画板数据以 ` ```plait ` 代码围栏内联存储于 `.md`，实现单文件自包含的读写闭环。
- **用户故事**：作为用户，我编辑完画板保存文件，关闭后重新打开，画板内容原样恢复。
- **优先级**：P0
- **功能细节**：
  - 存储形态：` ```plait ` 围栏，正文为 `base64(JSON)` 字符串（非人类可读，避免污染文档）。
  - 序列化挂在 `schema.ts` 的 `parseMarkdown`/`toMarkdown` runner 上（参照 `toc-block`/`math-block` 的 `$nodeSchema` 写法），无需额外 remark AST 插件。
    - `parseMarkdown.match`: `node.type === 'code' && node.lang === 'plait'` → 转 `board_block`，`attrs.data = node.value`。
    - `toMarkdown`: `board_block` → `code` 节点，`lang: 'plait'`，value = `attrs.data`。
  - `encode`/`decode` 只在 NodeView 边界发生（挂载时 decode、onChange 时 encode 回写 attrs），remark 层把 `attrs.data` 当不透明字符串搬运。
- **验收标准**：
  - [ ] 编辑画板后，文档源码中出现 ` ```plait ` 围栏，正文为 base64 串。
  - [ ] 关闭并重新打开文件，画板内容与编辑时一致。
  - [ ] 手动改动围栏正文为非法内容时，解码失败有兜底（渲染空画板或错误占位，不崩溃）。

### 3.5 数据编解码（codec.ts）

- **描述**：`board_block.attrs.data` 与 Plait elements 之间的编解码，MVP 采用 base64(JSON) 明文。
- **优先级**：P0
- **功能细节**：
  ```
  encode(elements): string
      json = JSON.stringify({ v: SCHEMA_VERSION, children: elements, viewport })
      return base64Encode(utf8(json))          // MVP：不压缩

  decode(text): { version, elements, viewport }
      try:  return JSON.parse(utf8(base64Decode(text)))   // 当前格式
      catch: try JSON.parse(text)                          // 兼容明文 JSON
      catch: return DEFAULT_EMPTY                          // 兜底空画板
  ```
  - `SCHEMA_VERSION` 常量预留，未来引入 pako 压缩时用 `version` 字段判别格式，向后兼容旧数据。
  - base64 需正确处理 UTF-8（中文节点文本），避免 `btoa` 直接吞非 Latin1 字符（用 `TextEncoder` + base64 或等价方案）。
- **验收标准**：
  - [ ] 含中文的思维导图编解码往返一致。
  - [ ] 解码遇到旧明文 JSON / 非法串时不抛未捕获异常。

### 3.6 事件隔离（核心难点）

- **描述**：编辑态下画板内部由 Plait/Slate 全权接管输入，ProseMirror 绝不插手，避免方向键/回车/中文 IME 两边打架。
- **优先级**：P0
- **功能细节**（在 `mermaid-block` 的 `stopEvent` 基础上加严）：
  - 节点 `atom + isolating + selectable`，selection 不进入内部。
  - `stopEvent`：工具栏事件、切换保护期、编辑态一律 `return true`；预览态拦 `mousedown`。（编辑态比 mermaid 更彻底：mermaid 编辑态放行文本编辑，board 编辑态全吞。）
  - `ignoreMutation`：除 `selection` 外一律 `return true`（atom 无 contentDOM，Plait 自管全部内部 DOM，PM 不得 diff/重建）。
  - undo：编辑态 Ctrl+Z 被 `stopEvent` 吞掉，走 Plait 自身 undo 栈；退出编辑后交回 ProseMirror `history`。
- **验收标准**：
  - [ ] 编辑态方向键、回车、退格、Ctrl+Z 均作用于画板，不影响外层文档。
  - [ ] 中文输入法在节点文本编辑时无重复/丢字/光标错位。
  - [ ] 编辑态在画板内敲键盘不会意外移动文档光标或删除文档内容。

### 3.7 React 子树生命周期

- **描述**：NodeView 内以 `createRoot` 挂载 React 子树，`destroy` 时 `unmount`，防止内存泄漏。
- **优先级**：P0
- **功能细节**：
  - 构造函数不立即挂载；进入视口时 `this.root ??= createRoot(el)` 挂载只读子树，双击/点编辑仅切换 `readonly` prop（不 unmount 重挂）。
  - `onChange`（Plait `onValueChange`）→ 防抖 500ms → `setNodeMarkup(pos, undefined, { ...attrs, data: encode(elements) })` → `view.dispatch`。
  - `destroy()` 中 `root?.unmount()`、清理防抖定时器与监听。
- **验收标准**：
  - [ ] 删除画板节点 / 切换文档后，无残留 React 实例（DevTools 检查、无控制台警告）。
  - [ ] 快速插入删除多次不泄漏、不报错。

### 3.8 视口高度控制

- **描述**：文档内画板固定高度视口，默认 420px，底部拖拽手柄可调，高度写入 `attrs.height`。
- **优先级**：P1
- **验收标准**：
  - [ ] 默认高度 420px。
  - [ ] 拖拽底部手柄可调高度，调整后写回 `attrs.height` 并随文档持久化。

### 3.9 全屏编辑（P2，不在 MVP）

- **描述**：工具栏放大按钮打开全屏/覆盖层编辑，关闭时写回数据。全屏时 ProseMirror 在背景，天然缓解事件冲突。
- **优先级**：**P2（本期不做，迭代二再评估）**
- **验收标准**（P2 参考）：
  - [ ] 点放大按钮进入全屏编辑。
  - [ ] 关闭全屏后数据回写并与内联视图一致。

---

## 4. 技术方案要点

### 4.1 文件结构

```
src/editor/plugins/board-block/
├── index.ts          # 插件入口：$node(schema) + $view(nodeView) 注册 + setBoardAutoEdit 导出
├── schema.ts         # $nodeSchema('board_block')：atom/isolating/attrs + parseMarkdown/toMarkdown
├── node-view.ts      # BoardNodeView：容器 + 工具栏 + 事件隔离 + React 挂载生命周期
├── board-react.tsx   # <BoardReact>：封装 Plait Wrapper+Board+Mind 插件 + onValueChange
├── toolbar.ts        # 悬浮工具栏（编辑/全屏/删除）——复用 mermaid 范式
├── codec.ts          # encode/decode（base64 JSON）
├── constants.ts      # DEFAULT_MINDMAP、SCHEMA_VERSION、CSS_PREFIX、默认高度
└── types.ts          # 共享类型

src/styles/editor/board-block.css   # 类名前缀 .lanismd-board-block
```

> 注：本期不建 `export.ts`、`remark.ts`（导出延后；序列化走 schema runner，无需独立 remark）。

### 4.2 Schema（board_block）

参照 `toc-block`/`math-block` 的 `$nodeSchema` 写法：

```typescript
$nodeSchema('board_block', () => ({
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  draggable: true,
  attrs: {
    data: { default: '' },      // base64(JSON) 编码串
    version: { default: 1 },    // 供未来迁移
    height: { default: 420 },   // 视口高度 px
  },
  parseDOM: [ /* div[data-type="board-block"] */ ],
  toDOM: (node) => [ 'div', { 'data-type': 'board-block', 'data-board': ..., 'data-height': ... } ],
  parseMarkdown: { match: n => n.type === 'code' && n.lang === 'plait', runner: ... },
  toMarkdown:    { match: n => n.type.name === 'board_block', runner: ... },
}))
```

### 4.3 React 宿主（board-react.tsx，已核实 API）

**必须使用实际安装的 API**（`@plait-board/react-board`，`Wrapper` + `Board` 组合）：

```tsx
import { Wrapper, Board } from '@plait-board/react-board';
import { withMind } from '@plait/mind';
// 文本层：@plait-board/react-text

function BoardReact({ initial, onChange, readonly }) {
  return (
    <Wrapper
      value={initial.children}
      viewport={initial.viewport}
      plugins={[withMind /* MVP 仅思维导图，不引入 @plait/draw */]}
      options={{ readonly }}       // 预览态 true / 编辑态 false，仅切 prop 不重挂
      onValueChange={(value) => onChange(value)}
    >
      <Board />
    </Wrapper>
  );
}
```

> ⚠️ 技术方案里的 `<PlaitBoard data onChange>` 不存在，实现时以本节为准。`Wrapper` 具体 props（`value`/`plugins`/`options`/`onValueChange`/`onChange`/`viewport`/`theme`）以 `node_modules/@plait-board/react-board/*.d.ts` 为准，实现前再 diff 一次类型定义。

### 4.4 NodeView（node-view.ts）

骨架复刻 `mermaid-block/node-view.ts`，差异：
- 无 `contentDOM`（atom）。
- 渲染核换成 `createRoot(...).render(<BoardReact/>)`。
- `stopEvent`/`ignoreMutation` 按 3.6 加严。
- `writeBack` 用 `setNodeMarkup` 回写 `attrs.data`（参照 mermaid `cancelEdit` 的 `setNodeMarkup`/`replaceWith` 用法）。
- 构造函数接收 `autoEdit`，`true` 时 `requestAnimationFrame(() => enterEdit())`。

### 4.5 编辑器注册（editor-setup.ts）

在 `.use(codeBlockComponent)` 之后、`mermaidBlockPlugin` 附近插入：

```typescript
.use(boardBlockSchema)
.use(boardBlockView)
```

确保 `board_block` 的 `$view` 在 `codeBlockComponent` 之后注册，使 `plait` 围栏不被 code-block 组件抢渲染。

### 4.6 依赖

本期需确保已安装（大部分已随 `package.json` 改动装好，实现前 `pnpm list` 校验）：
- `@plait-board/react-board`、`@plait-board/react-text`、`@plait/core`、`@plait/common`、`@plait/mind`、`slate`（已装）。
- **`slate-react`：已确认未安装，实现第 0 步前需 `pnpm add slate-react`**（Plait 文本层依赖，缺失会导致编辑态文本层报错）。
- **不安装** `pako`、**本期不接入** `@plait/draw`。

---

## 5. 实现步骤（建议顺序）

```
0. 前置：`pnpm add slate-react`（已确认未装），再 `pnpm list slate slate-react @plait/mind` 校验依赖齐备。
0.5 spike（最高优先，先做）：拉起 Wrapper+Board+withMind 最小 demo，
   单独验证「Slate/ProseMirror 中文输入法共存」这一最大风险点。
   —— 若此步不通过，触发降级评审（见第 7 节）。
1. codec.ts：encode/decode（base64 JSON，含中文往返测试）。
2. constants.ts：DEFAULT_MINDMAP、SCHEMA_VERSION、CSS_PREFIX、DEFAULT_HEIGHT。
3. schema.ts：board_block NodeSpec + parseMarkdown/toMarkdown。
4. board-react.tsx：Wrapper+Board+withMind 封装 + onValueChange + readonly 切换。
5. node-view.ts：容器 + 事件隔离 + 只读挂载/编辑切换生命周期 + writeBack。
6. index.ts：$node + $view + setBoardAutoEdit 导出。
7. editor-setup.ts 注册（4.5）。
8. slash-menu 加 /board 入口（3.1）。
9. board-block.css 样式（前缀 .lanismd-board-block）。
10. 联调：插入→编辑→切文档→重开，验证序列化闭环与无内存泄漏。
```

---

## 6. 验收 checklist（MVP 完成标准）

- [ ] `/board` 插入思维导图并自动进编辑态。
- [ ] 可增删节点、编辑文本（中文 IME 正常）、拖拽平移缩放。
- [ ] 编辑态事件完全隔离，不影响外层文档。
- [ ] 焦点离开自动退出并回写数据。
- [ ] 数据以 ` ```plait ` 围栏（base64 JSON）持久化，重开原样恢复。
- [ ] 删除节点/切文档无 React 内存泄漏、无控制台错误。
- [ ] 视口默认 420px，可拖拽调高。
- [ ] 所有新增文件头部含 `@changelog`，关联 `REQ: 20260702-board-block-mindmap`。

---

## 7. 风险与降级

| 风险 | 等级 | 应对 |
|------|------|------|
| Slate↔ProseMirror 焦点/中文 IME 冲突 | 高 | **第 0 步 spike 先验证**；不通过则启用降级 A |
| 降级 A | — | 预览快照 + 仅全屏独立编辑（放弃内联编辑），绕开事件共存 |
| 降级 B | — | 退回 code_block 分流（mermaid 式，lang=plait），牺牲数据隐藏性换速度 |
| 包体积增量（Plait+Slate 数百 KB） | 中 | React 子树懒加载；仅引入 `@plait/mind`，不引 `@plait/draw` |
| 多画板性能 | 中 | 预览态不挂载/只读最小挂载，进编辑再全量挂载 |

---

## 8. 决策记录（原待定项，已全部拍板）

| 编号 | 议题 | 决策 |
|------|------|------|
| Q1 | 预览态方案 | **只读挂载**：预览态即以 `readonly=true` 挂载 Plait Board 渲染完整思维导图，双击/点编辑切 `readonly=false`，共用同一 `createRoot`（见 3.3） |
| Q2 | 全屏编辑（3.9） | **P2 延后**，不在 MVP |
| Q3 | `slate-react` 是否已装 | **未安装**，实现第 0 步前 `pnpm add slate-react`（见 4.6 / §5 步骤 0） |

**统一延后到 P2 的能力清单**：全屏编辑、`pako` 压缩、流程图（`@plait/draw`）、自由画板、`/mindmap`·`/flowchart` 独立子入口、PNG/SVG 导出。

---

## 附录 A. 代码库核实记录（2026-07-02）

| 核实项 | 结论 |
|--------|------|
| Plait 依赖 | 已装 `@plait-board/react-board@0.4.0-0`、`@plait-board/react-text@0.4.0-0`、`@plait/core|common|mind|draw@^0.93.2`、`slate@0.116`、`roughjs@4.6.6`（`package.json` 已改动） |
| pako | **未安装**（本期决策不装） |
| slate-react | **未安装**（实现第 0 步前需 `pnpm add slate-react`） |
| React 宿主 API | 实际为 `Wrapper` + `Board`，**非** `<PlaitBoard>`；props 见 `wrapper.d.ts`/`board.d.ts` |
| mermaid-block 范式 | `stopEvent`/`ignoreMutation`/`switchingState` 保护/`setNodeMarkup` 回写/`setMermaidAutoEdit` 模块级标记——全部可复用 |
| toc-block 范式 | `$nodeSchema` 的 `parseMarkdown`/`toMarkdown` 双向 runner 可直接借鉴 |
| 注册点 | `editor-setup.ts` 中 `mermaidBlockPlugin` 在 `codeBlockComponent` 之后；board 插件插同区域 |
| slash 命令结构 | `slash-menu/commands-basic.ts` + `icons.ts`，与 `setMermaidAutoEdit` 自动进编辑机制配套 |

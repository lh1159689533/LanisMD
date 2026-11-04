---
req_id: 20260826-board-style-toolbar
title: 画板插件（Board Block）—— 节点样式工具栏
priority: P1
created_at: 2026-08-26T18:47:00+08:00
author: hhhuilli
keywords: [画板, Board, 思维导图, mindmap, Plait, 节点样式, 工具栏, 描边, 填充, 分支, 文字样式]
related_archives: [docs/prd/20260702-board-block-mindmap.md, docs/画板插件技术方案.md]
status: planned
---

# 画板插件（Board Block）—— 节点样式工具栏 技术方案

> 本方案基于已完成的 board-block MVP（插入/编辑/序列化闭环，底层 `@plait/mind`）做功能完善。
> 目标：在编辑态选中思维导图节点时浮现一条样式工具栏，涵盖结构/分支/形状/填充/描边/文字样式。
> 关键实现约束已通过 deep-asking 与用户确认，详见「一、需求与决策基线」。

---

## 一、需求与决策基线（已确认）

需求来源：7 张思维导图节点样式工具栏截图（节点结构、文字样式、节点描边、节点填充、节点形状、分支样式1、分支样式2）。

| 决策项 | 结论 |
|--------|------|
| **触发与位置** | 选中节点时在画板视口内浮现工具栏，仅编辑态生效；采用**画板视口顶部居中浮条**（不跟随选中节点，规避坐标换算复杂度与遮挡问题） |
| **取色面板** | 完全还原截图：主题配色 + 默认配色两个 Tab + 色彩梯度 |
| **文字样式范围** | 本期仅做基础 4 项（加粗/斜体/字号/字色）；删除线/下划线/对齐延后 |
| **连线结构** | Plait `BranchShape` 仅 2 种（曲线 `bight`/折线 `polyline`），只展示 2 项 |
| **节点形状** | Plait `MindElementShape` 仅 2 种（`roundRectangle`/`underline`），第 3 项「直角矩形」用 `roundRectangle` + `rectangleRadius: 0` 近似，共展示 3 项 |
| **截图右侧图标**（标记/链接/展开） | 不在本次范围 |
| **实现形态** | 纯 DOM（非 React），与现有 `toolbar.ts` 一致，避免在 NodeView 内再起 React 树 |
| **持久化** | 所有样式字段均为 `MindElement`/`CustomText` 标准字段，随现有 `encode/decode` 原样序列化，**无需改 schema/codec/序列化**，旧文档向后兼容 |

---

## 二、能力组与 Plait 底层映射

在编辑态选中节点时浮现，含以下能力组（从截图左到右）：

| # | 能力组 | 对应截图 | 交互 | Plait 底层能力 |
|---|--------|---------|------|---------------|
| 1 | **连线结构** | 分支样式2 | 图标→下拉，2 种连线走向（曲线/折线） | `MindTransforms.setBranchShape` |
| 2 | **分支样式** | 分支样式1 / 节点结构 | 下拉：方向（布局）+ 宽度输入 + 颜色 | `MindTransforms.setLayout` + `setBranchWidth` + `setBranchColor` |
| 3 | **节点形状** | 节点形状 | 下拉，3 种（下划线/直角矩形/圆角矩形） | `MindTransforms.setShape`（直角=圆角矩形 `rectangleRadius: 0`） |
| 4 | **节点填充** | 节点填充 | 下拉取色面板 | `PropertyTransforms.setFillColor` |
| 5 | **节点描边** | 节点描边 | 下拉：宽度输入 + 取色 | `PropertyTransforms.setStrokeWidth` + `setStrokeColor` |
| 6 | **文字样式** | 文字样式 | 下拉：粗/斜/字号/字色 | Slate `Editor.addMark`（`CustomText`） |

### 能力探明清单（已核实底层 API 存在）

- `MindTransforms.setLayout / setShape / setBranchShape / setBranchWidth / setBranchColor` — `@plait/mind/transforms`
- `PropertyTransforms.setFillColor / setStrokeColor / setStrokeWidth / setStrokeStyle` — `@plait/common/transforms`
- `MindElement` 接口字段：`fill / strokeColor / strokeWidth / strokeStyle / branchColor / branchWidth / branchShape / shape / layout`
- 文字层：`CustomText` 支持 `bold / italic / color / font-size` mark；`getTextEditorsByElement` 拿到 Slate editor，`Editor.addMark` 写入
- 选中元素：`getSelectedElements(board)`（`@plait/core`）
- 主题色板：`MindThemeColors[].branchColors`

---

## 三、架构设计

### 3.1 目录结构（遵循多文件插件规范）

现有 `board-block/` 已是目录结构。新增 **style-toolbar 子模块**：

```
src/editor/plugins/board-block/
├── ...（现有文件不动）
├── node-view.ts          # 改：编辑态挂载 selection 监听 + 承载浮动工具栏
├── board-react.tsx       # 改：afterInit 透出 board 实例给 NodeView
└── style-toolbar/        # 新增：节点样式工具栏
    ├── index.ts          # 创建/挂载/定位/selection 联动入口
    ├── types.ts          # 工具栏内部类型
    ├── transforms.ts     # 封装对 Plait 的所有样式写操作
    ├── selection.ts      # 获取选中节点 + 读取当前样式值（回填 UI 态）
    ├── color-panel.ts    # 取色面板（主题/默认 Tab + 色彩梯度）
    ├── segments/         # 各能力组的下拉面板 DOM
    │   ├── branch-shape.ts   # 连线结构
    │   ├── branch-style.ts   # 分支方向/宽/色
    │   ├── node-shape.ts     # 节点形状
    │   ├── fill.ts           # 节点填充
    │   ├── stroke.ts         # 节点描边
    │   └── text-style.ts     # 文字样式（粗/斜/字号/字色）
    ├── icons.ts          # 工具栏 SVG 图标集
    └── constants.ts      # 主题色板、默认色板、字号档位等

src/styles/editor/board-style-toolbar.css   # 前缀 .lanismd-board-style-toolbar
```

### 3.2 与 Plait 的通信（关键链路）

- **拿到 board 实例**：`board-react.tsx` 的 `afterInit` 已捕获 board，需通过回调把实例透出给 NodeView（当前仅存在组件内 ref）。
- **监听选中变化**：订阅 Plait 变更后读取 `getSelectedElements(board)`；有 mind 节点选中→显示工具栏并回填样式值，无选中→隐藏。
- **定位**：工具栏浮在画板视口顶部居中（稳健，避免坐标换算与遮挡）。
- **写操作**：全部封装在 `transforms.ts`，调用 `MindTransforms.*` / `PropertyTransforms.*` / Slate `addMark`；写入后 Plait 自动触发 `onValueChange` → 走现有防抖回写 `attrs.data`，持久化零改动。

### 3.3 数据兼容性

所有样式字段本就是 `MindElement`/`CustomText` 标准字段，随现有 `encode/decode` 原样序列化进 base64。无需改 schema/codec/序列化，旧文档向后兼容。

---

## 四、分批实施计划

> 每批次独立可验收、可回退，遵循「先地基后能力」原则。逐批推进，每批完成后由用户验收再进入下一批。

### 批次 1 —— 地基（selection 联动 + 浮动工具栏骨架）已实现

- board 实例透出给 NodeView
- selection 监听：`getSelectedElements(board)` + 变更订阅
- 空浮动工具栏（含定位/显隐/hover 交互）
- CSS 骨架（`.lanismd-board-style-toolbar`）
- **验收**：选中/取消选中节点时工具栏正确显隐与定位；无实际样式项也可跑通联动。
- **风险点**：Plait selection 事件订阅 API 细节 → 本批 spike 先跑通。

### 批次 2 —— 节点级样式（形状 + 填充 + 描边）

- 节点形状（下划线/直角矩形/圆角矩形）：`setShape` + `rectangleRadius`
- 节点填充：`PropertyTransforms.setFillColor` + 取色面板
- 节点描边：`setStrokeWidth` + `setStrokeColor` + 取色面板
- **取色面板**（本批一并实现，后续复用）：主题配色 / 默认配色 Tab + 色彩梯度
- **验收**：选中节点后可改形状/填充色/描边宽与色，重开文档样式保留。

### 批次 3 —— 分支 / 结构

- 连线结构：`setBranchShape`（曲线/折线 2 项）
- 分支样式：`setLayout`（方向）+ `setBranchWidth`（宽）+ `setBranchColor`（色，复用批次 2 取色面板）
- **验收**：分支连线走向/宽/色可调，重开保留。

### 批次 4 —— 文字样式（基础 4 项）

- 加粗 / 斜体 / 字号 / 字色
- 通过 `getTextEditorsByElement` 拿选中节点 Slate editor + `Editor.addMark`
- **验收**：选中节点后文字可加粗/斜体/改字号/改色，重开保留。
- **风险点**：mark 写入需选中节点的 Slate editor 且节点未处于文本编辑态 → 本批单独验证 `getTextEditorsByElement` + `addMark` 时机。

---

## 五、主要风险与应对

| 风险 | 应对 |
|------|------|
| Plait selection 事件订阅 API 细节 | 批次 1 spike 先跑通 `getSelectedElements` + 变更订阅 |
| 文字 mark 写入需选中节点 Slate editor 且非文本编辑态 | 批次 4 单独验证 `getTextEditorsByElement` + `addMark` 时机 |
| 工具栏 DOM 事件误触发 PM 或 Plait | 沿用现有 `mousedown + preventDefault + stopPropagation` 范式 |
| 取色面板「色彩梯度」算法 | 用 HSL 明度插值生成 6 级，主色取自 `branchColors` |
| 能力边界与截图差异（连线 2 项、形状 radius=0 凑 3 项） | 已与用户确认接受 |

---

## 六、验收总纲

- [ ] 编辑态选中节点浮现工具栏，取消选中隐藏（批次 1）
- [ ] 节点形状/填充/描边可调并持久化（批次 2）
- [ ] 分支连线结构/方向/宽/色可调并持久化（批次 3）
- [ ] 文字加粗/斜体/字号/字色可调并持久化（批次 4）
- [ ] 旧文档打开无异常，样式字段向后兼容
- [ ] 工具栏交互不干扰 ProseMirror / Plait 原有编辑

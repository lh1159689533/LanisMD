---
req_id: 20261027-board-whiteboard-draw
title: 画板插件扩展 —— 白板块（接入 @plait/draw）
priority: P1
status: in-progress
created_at: 2026-10-27T00:00:00+08:00
updated_at: 2026-10-27T00:00:00+08:00
progress: 批次 0~5 已全部交付并验收
keywords: [画板, 画板, whiteboard, Plait, draw, 矢量图形, 流程图, UML, 箭头连线, 矢量线, 插入图片, mode分流]
related_archives:
  - docs/prd/20260702-board-block-mindmap.md
  - docs/画板插件技术方案.md
  - docs/board-style-toolbar-技术方案.md
---

# 画板插件扩展 —— 白板块（接入 @plait/draw）

> 本 PRD 在 `20260702-board-block-mindmap`（思维导图 MVP）已交付的基础上增量扩展，
> 引入 `@plait/draw` 提供的通用绘图能力，形成与思维导图并列的第二种画板形态。
> 范围与形态已通过需求澄清全部拍板，详见「0. 决策基线」。
>
> **进度**：批次 0（地基 + 最小工具条）已于 2026-10-27 交付并通过验收，
> 实测结论已回写至 §4.4 / §4.4.1 / §5.1 / 附录 B，其中**两条与原假设不一致**，
> 后续批次请以回写后的结论为准。

---

## 0. 决策基线（已确认）

| 决策项 | 结论 | 影响 |
|--------|------|------|
| **块关系** | **分块类型**：斜杠菜单提供两个入口（`思维导图` / `画板`），两种块各自独立工具条、互不干扰 | NodeView 需按 `mode` 分流插件注册与工具栏装配 |
| **Markdown 标识** | **复用 ` ```plait ` 围栏**，`BoardPayload` 新增 `mode` 字段（`'mindmap' \| 'board'`）；旧数据缺失该字段时回落 `'mindmap'` | 零迁移，已有文档行为完全不变；无需新增 ProseMirror node type |
| **工具范围（必做）** | 基础图形(22) + 箭头连线 + 流程图符号(24) + UML 符号(21) **全部纳入**，分批交付 | 符号总量 67+，工具条不可平铺，必须用弹出网格面板 |
| **进阶工具（必做）** | **插入图片**、**矢量线（多边形）** | 两者均需新增工具条项与样式分流 |
| **进阶工具（不做）** | **表格**、**泳道图** | `withTable` / `withSwimlane` 本期不接入 |
| **图片存储** | **内联 base64 进围栏**，接受文档体积代价 | 需做尺寸上限与压缩提示，见 3.9 |
| **工具条位置** | **画布左侧竖排悬浮** | 不与右上角 `canvas-toolbar`、节点右侧块工具栏、底部 `resize-handle` 冲突 |
| **批次 1 验收线** | 地基 + 基础图形 + 箭头连线 跑通即交付 | 流程图 / UML / 矢量线 / 图片顺延 |

**本期不做（延后）**：表格、泳道图、自由画笔（freehand，Plait 不提供，需自建插件）、橡皮擦、PNG/SVG 导出、Mermaid/Markdown 转图、画板协同。

---

## 1. 背景与目标

LanisMD 的 `board-block` 插件已交付思维导图完整闭环（插入 → 编辑 → 序列化 → 重开），并已具备画布级工具栏（主题/缩放/手型-选择）、节点样式工具栏、全屏子窗口、底部拖拽改高等基础设施。

但当前 `board-react.tsx` 只注册了 `withMind`：

```typescript
const plugins = useMemo(() => [withMind], []);
```

而 `@plait/draw@0.89.2` 早已随 `package.json` 安装到位、**从未接入**。用户要画流程图、架构图、UML 时仍需离开编辑器。

**核心目标**：

- 新增「白板块」形态，复用现有全部画板基础设施，提供矢量图形、流程图符号、UML 符号、箭头连线、矢量线、插入图片能力。
- 白板与思维导图在 Markdown 层共用 ` ```plait ` 围栏，靠 payload 的 `mode` 字段区分，旧文档零迁移。
- 两种形态的工具条互相隔离：思维导图块看不到图形工具，白板块看不到导图结构工具。

**非目标**：

- 不在同一个画板块里混放思维导图与绘图元素（已决策为分块类型）。
- 不提供自由画笔 / 橡皮擦（Plait 包内无 freehand 实现，须自建，另立需求）。
- 不提供表格、泳道、导出、Mermaid 转图。

---

## 2. 术语与范围约定

| 术语 | 含义 |
|------|------|
| **mode** | 画板形态标识，持久化于 `BoardPayload.mode`，取值 `'mindmap'`（思维导图块）/ `'board'`（白板块） |
| **导图块** | `mode === 'mindmap'` 的 `board_block`，即现有已交付形态 |
| **白板块** | `mode === 'board'` 的 `board_block`，本期新增 |
| **创建工具条** | 白板块左侧竖排悬浮工具条，用于选择待创建的元素类型（切换 `board.pointer`） |
| **符号面板** | 点击流程图 / UML 工具时弹出的网格选择面板，用于从数十种符号中选一个 |
| **canvas-toolbar** | 现有右上角画布级工具栏（主题 / 缩放 / 手型-选择 / 编辑） |
| **style-toolbar** | 现有选中元素后浮出的样式工具栏，当前 segments 全部为思维导图专属 |

---

## 3. 功能需求

### 3.1 payload 新增 mode 字段与分流解码

- **描述**：`BoardPayload` 新增可选字段 `mode`，`decode` 结果透出归一化后的 `mode`，并按 `mode` 分流空数据兜底策略。
- **优先级**：P0（批次 1）
- **功能细节**：
  - `BoardPayload.mode?: 'mindmap' | 'board'`；`DecodedBoard.mode` 为必填（归一化后）。
  - 归一化规则：字段缺失 / 非法值 → 回落 `'mindmap'`，保证旧文档行为零变化。
  - **关键修正**：现有 `codec.normalize` 在 `children` 为空数组时无条件回落 `createDefaultMindmap()`。白板块的空画布（`children: []`）会被错误替换成一个思维导图根节点，必须按 `mode` 分流：
    - `mode === 'mindmap'` 且 `children` 为空 → 回落 `createDefaultMindmap()`（保持现状）
    - `mode === 'board'` 且 `children` 为空 → 返回空数组（合法的空白板）
  - `encode` 签名扩展为接收 `mode`（或改为接收一个 options 对象，避免位置参数继续膨胀）。
  - `SCHEMA_VERSION` **不递增**：`mode` 为向后兼容的可选字段，缺失即有确定语义。
- **验收标准**（✅ 批次 0 已全部验证）：
  - [x] 已有 ` ```plait ` 文档（无 `mode`）打开后仍为思维导图块，渲染与交互零变化。
  - [x] 白板块清空所有元素后保存重开，仍是空白板，不会自动冒出思维导图根节点。
  - [x] 手改围栏内 `mode` 为非法字符串时回落为导图块，不崩溃。
  - [x] 含中文文本的白板元素编解码往返一致。

### 3.2 斜杠菜单双入口

- **描述**：`slash-menu` 从一个 `board` 条目扩展为两个：`思维导图` / `画板`。
- **优先级**：P0（批次 1）
- **功能细节**：
  - 现有 `board` 条目保留 ID 与关键词，label 维持「思维导图」。
  - 新增 `whiteboard` 条目：label「白板」，描述「插入可绘制图形与流程图的白板」，关键词需含 `board / whiteboard / 画板 / 画板 / 流程图 / bb / lct` 等（注意「画板」目前是导图条目的关键词，需重新分配避免两条目搜索结果混淆）。
  - 两条目共用一个插入函数，区别仅在传入的 `mode` 与初始元素：
    - 导图：`encode(createDefaultMindmap(), undefined, undefined, 'mindmap')`
    - 白板：`encode([], undefined, undefined, 'board')`（**空画布**，不预置任何元素）
  - 两者均沿用 `autoEdit` 机制，插入后自动进入编辑态。
  - 需在 `slash-menu/icons.ts` 的亮色 / 暗色两套图标集中各新增一个白板图标。
  - **批次 0 实施调整**：关键词改为「两条目共享泛化词」策略——`board` / `画板` 两条都保留，
    输入泛化词时同时列出两条由用户看图标与标题选择；专属词（`导图` / `swdt` vs `画板` / `bb`）
    仍可精准命中单条。原「重新分配避免混淆」的方案已废弃。
- **验收标准**（✅ 批次 0 已全部验证）：
  - [x] 斜杠菜单出现「思维导图」「白板」两条，各有独立图标与描述。
  - [x] 输入「白板」能唯一命中白板条目，输入「导图」能唯一命中思维导图条目。
  - [x] 插入白板后为空画布并自动进入编辑态。
  - [x] 插入思维导图行为与本期之前完全一致。

### 3.3 Plait 插件按 mode 分流注册

- **描述**：`BoardReact` 依据 `mode` 决定注册哪套 Plait 插件与主题色表。
- **优先级**：P0（批次 1）
- **功能细节**：
  - `mode === 'mindmap'` → `plugins = [withMind]`（保持现状）
  - `mode === 'board'` → `plugins = [withDraw]`
  - 插件列表仅在挂载时读取（`Wrapper` 不响应 `plugins` 的运行时变化），`mode` 为块级不可变属性，天然契合。
  - **主题色表需同步分流**：现有实现向 `options.themeColors` 注入 `MindThemeColors`（`@plait/mind`）。**批次 0 实测结论**：draw 不读该选项，白板模式应**不注入**，让 core 回落自带 `ThemeColors`（详见 4.4）。
  - 现有 `readonly` 运行时切换、`board.pointer` 同步、`onPointerReset` 通知机制对两种模式通用，不改动。
- **验收标准**（✅ 批次 0 已全部验证）：
  - [x] 白板块挂载后无控制台报错，画布可平移缩放。
  - [x] 导图块的渲染与交互零回归。
  - [x] 白板块切换主题（右上角工具栏）后，图形填充 / 描边 / 画布背景均正确变化。

### 3.4 左侧竖排创建工具条

- **描述**：白板块编辑态在画布左侧浮出竖排工具条，用于选择待创建的元素类型。
- **优先级**：P0（批次 1）
- **功能细节**：
  - 新增目录 `src/editor/plugins/board-block/draw-toolbar/`，产出与现有两个工具栏一致的控制器范式（`dom` / `attach(board)` / `detach()` / `setBlockState(state)` / `sync()` / `destroy()`）。
  - **仅在白板块 + 编辑态显示**；导图块永不创建该工具条（而非创建后隐藏），避免无谓 DOM 与监听。
  - 工具条根 DOM 必须携带 Plait 约定的 `plait-board-attached` 类，否则 Plait 的 `globalPointerUp` 会在点击工具条时清空选中态（该坑已在 `style-toolbar` 中踩过并记录）。
  - 工具项通过写 `board.pointer` 生效：`PlaitPointerType.selection` / `PlaitPointerType.hand` / 各 `DrawPointerType`。
  - **创建类工具必须同时设置 creation mode**，只写 `board.pointer` 画不出任何图形（批次 0 真实踩坑，详见 4.4.1）。
  - 工具条需与 `board.pointer` 双向同步：通过 `subscribeBoardChange` 订阅变更刷新高亮；同时响应 `onPointerReset`（`readonly` 跳变时组件会强制重设 pointer，该赋值不走 op 流程）。
  - 创建完一个元素后，Plait 默认将 pointer 回落到 `selection`，工具条高亮需跟随回落。
  - 批次 1 的工具项：选择、手型、基础图形（弹出面板）、箭头连线（直线 / 曲线 / 折线）。
  - **批次 0 已落地最小版**：选择 / 手型 / 矩形 三项，控制器范式与三路 pointer 同步均已跑通；
    批次 1 在此基础上把「矩形」替换为「图形（弹出网格面板）」并追加连线工具即可。
- **验收标准**（✅ 批次 0 已全部验证，面板相关项顺延批次 1）：
  - [x] 白板块进入编辑态后左侧浮出工具条，退出编辑态隐藏。
  - [x] 导图块任何状态下都不出现该工具条。
  - [x] 点击工具条任一按钮不会清空画布选中态。
  - [x] 工具条高亮与 `board.pointer` 始终一致（含创建完成后的自动回落、进出编辑态的重设）。
  - [x] 工具条不遮挡右上角 `canvas-toolbar`、节点右侧块工具栏、底部 `resize-handle`。
  - [x] 全屏子窗口中工具条同样可用且位置正确。

### 3.5 基础图形创建（21 种）

- **描述**：支持创建 `@plait/draw` 的 `BasicShapes` 全部 21 种基础图形。
- **优先级**：P0（批次 1）
- **数量校正（批次 1 实测）**：PRD 初稿写的「22 种」有误。`BasicShapes` 枚举实际为 **21 项**
  （`@plait/draw/interfaces/geometry.d.ts` L4-26，`rectangle` … `cloud`），
  `getBasicPointers()` 即 `Object.keys(BasicShapes)`，返回 21 个。
  本节下方的中文名清单原本也正好是 21 个，可反证「22」为笔误。全文已统一改为 21。
- **功能细节**：
  - 图形清单取自 `getBasicPointers()`，不手工维护硬编码列表，避免与包升级脱节。
  - 工具条「图形」按钮点击后弹出网格面板，按图形缩略图选择；选中后写 `board.pointer`，在画布拖拽即创建。
  - **面板结构已定稿（批次 1）**：面板顶部带「基础 / 流程图 / UML」三个 tab，批次 1 只启用「基础」，
    后两个 tab 置灰不可点（`SHAPE_CATEGORIES[].enabled = false`）。批次 3/4 只需把 `enabled` 打开
    并补 `SHAPE_NAMES` 中文名，面板结构与渲染逻辑无需再动。
  - **缩略图已定稿（批次 1）**：不手工维护图标，由 `shape-panel` 调 `drawGeometry` 实时渲染真实图形，
    故批次 3/4 新增 45 个符号时缩略图零成本。
  - **主按钮交互已定稿（批次 1）**：「图形」按钮单击只弹面板、不预设 pointer，必须在面板里点选一个才生效
    （与「连线」按钮的「单击即用上次」刻意不同，见 3.6）。
  - 需提供中文显示名映射（矩形 / 圆角矩形 / 椭圆 / 菱形 / 平行四边形 / 文本 / 三角形 / 左箭头 / 梯形 / 右箭头 / 十字 / 星形 / 五边形 / 六边形 / 八边形 / 五边箭头 / 流程箭头 / 双向箭头 / 批注 / 圆角批注 / 云朵）。
  - 图形内文本编辑由 Plait 的 Slate 文本层提供，复用现有事件隔离策略（`stopEvent` 编辑态全吞、`ignoreMutation` 除 selection 外全拦）。
- **验收标准**：
  - [x] 面板列出全部 21 种图形，含缩略图与中文名。
  - [x] 任一图形均可在画布拖拽创建，尺寸随拖拽范围。
  - [x] 图形可选中、拖移、缩放手柄改尺寸、旋转。
  - [x] 双击图形可编辑内部文本，中文输入法无重复 / 丢字 / 光标错位。
  - [x] 创建后保存重开，图形位置 / 尺寸 / 文本 / 旋转角完整恢复。

### 3.6 箭头连线

- **描述**：支持创建可绑定到图形并自动吸附重算的箭头连线。
- **优先级**：P0（批次 1）
- **功能细节**：
  - 三种走线：直线 / 曲线 / 折线（`ArrowLineShape.straight / curve / elbow`）。
    ~~工具条提供三个独立入口或一个带下拉的入口。~~
    **已定稿（批次 1）**：采用**单个「连线」按钮 + 弹出子面板**，与「图形」按钮对称，工具条保持紧凑。
    按钮图标跟随当前选中的走线类型。
  - **主按钮交互已定稿（批次 1）**：「连线」按钮单击即激活上次使用的走线（首次默认直线）并同时弹出子面板，
    面板只作为可选切换器——用户可以忽略面板直接去画布拖拽，也可以在面板里换走线。
    这与「图形」按钮「必须选一个」的策略刻意不同：连线只有 3 种且高频复用，免去一次点击。
  - 端点标记 9 种（`ArrowLineMarkerType`：箭头 / 无 / 空心三角 / 实心三角 / 尖箭头 / 单边上 / 单边下 / 空心三角 / 单斜线），源端与目标端可分别设置（属样式工具栏范畴，见 3.8）。
  - **绑定吸附**：连线端点拖到图形上时绑定（写入 `source.boundId` / `target.boundId` 与 `connection`），此后拖动图形连线自动重算走线。~~该能力由 `withArrowLineAutoComplete` 与 `withDraw` 内置提供，需确认是否已含在 `withDraw` 中，若未含需显式注册。~~ **已确认**：`withArrowLineAutoComplete` / `withArrowLineBoundReaction` / `withArrowLineCreateByDraw` / `withArrowLineResize` 均已内置于 `withDraw`，**无需显式注册**（见附录 B）。
  - 连线上可挂文字（`ArrowLineText`），双击连线中段添加。
- **验收标准**：
  - [x] 三种走线均可创建。
  - [x] 连线端点可绑定到图形，拖动被绑定图形时连线自动跟随重算。
  - [x] 解绑（端点拖离图形）后连线变为固定坐标，不再跟随。
  - [x] 双击连线可添加文字，文字随连线移动。
  - [x] 保存重开后绑定关系、走线形态、端点标记、线上文字完整恢复。

### 3.7 矢量线（多边形）

- **描述**：支持创建 `vector-line`，用于绘制任意多边形与折线。
- **优先级**：P1（批次 2）
- **功能细节**：
  - 两种形态：直线段 / 曲线段（`VectorLineShape.straight / curve`）。
  - 支持多段连续绘制（连续点击落点，双击 / Esc 结束）。
  - 闭合后可填充（`fill` 字段）。
  - 创建走 `withVectorLineCreate`，端点编辑走 `withVectorLineResize`，~~需确认是否已含在 `withDraw` 中~~ **已确认均内置于 `withDraw`，无需显式注册**（见附录 B）。
- **验收标准**：
  - [ ] 可连续点击绘制多段折线，双击 / Esc 结束。
  - [ ] 可切换直线段 / 曲线段。
  - [ ] 闭合图形可设置填充色。
  - [ ] 创建后可拖拽单个端点调整形状。
  - [ ] 保存重开后所有端点坐标与填充完整恢复。

### 3.8 样式工具栏按元素类型分流

- **描述**：现有 `style-toolbar` 的 segments 全部为思维导图专属，需按选中元素类型分流出 draw 元素的样式能力组。
- **优先级**：P0（批次 1 做地基与基础组，批次 2 补齐）
- **功能细节**：
  - **现状问题**：`selection.ts` 的 `getSelectedMindElements` 用 `isMindElement` 过滤，白板块选中 geometry 后返回空数组 → `sync()` 判定无选中 → 工具栏永不显示。必须改为按 `mode` / 元素类型分流的读取逻辑。
  - 重构方向：抽出「选中态读取」与「样式快照」的类型分流层，导图走现有 `MindElement` 分支，白板走 draw 分支（`PlaitGeometry` / `PlaitArrowLine` / `PlaitVectorLine` / `PlaitImage`）。
  - 现有导图 segments（`structure` / `branch` / `node-shape`）在白板模式下不装配。
  - 白板模式的 segments 划分：
    - **批次 1**：填充（`fill`）、描边（`strokeColor` / `strokeWidth` / `strokeStyle` 实线·虚线·点线）、不透明度（`opacity`）、文字样式（复用现有 `text-style`，需确认 draw 元素的 text 结构与 mind 的 `data.topic` 差异）
    - **批次 2**：图形切换（`switchGeometryShape`，在同类图形间切换而不丢失文本与位置）、箭头端点（源 / 目标各 9 种）、走线形态切换（直 / 曲 / 折）、旋转角
  - 工具栏定位逻辑现依赖 `MindElement.getNode()` 读布局坐标，draw 元素无此结构，需改用 `points` 与 `RectangleClient` 计算包围盒。
- **批次 1 落地结论**：
  - **白板实际装配 4 个 segment**，顺序为：填充 → 描边 → 不透明度 → 文字样式；
    导图仍为原 6 个（结构 / 分支 / 节点形状 / 填充 / 描边 / 文字样式），**导图分支代码未改动**。
  - **文字样式复用成功**（原标记为「需确认」的开放项）：`text-style` segment 未做分叉，
    白板与导图共用同一实例工厂 `createTextStyleSegment()`，仅在 `syncDraw` 中按
    「选中元素是否支持文本」控制可见性。写入侧走 draw 自己的 transforms，读取侧做了类型分流。
    PRD 原先预估的「draw 的 `text?: ParagraphElement` vs mind 的 `data.topic`」差异未造成需要大改的阻塞。
  - **不透明度采用固定四档下拉**（100% / 75% / 50% / 25%，`OPACITY_OPTIONS`），
    而非连续滑块。理由：与现有 segment 的「方格选项」风格统一，且避免滑块拖动过程中
    高频产生 op、需要额外做节流与 op 合并。
  - **新增 `dropdown-shell.ts`**（PRD 4.1 原未规划）：三个新 segment 的「按钮 + 浮层下拉」骨架重复度高，
    抽出公共外壳复用，避免三份近似实现。
- **验收标准**：
  - [x] 白板块选中图形后浮出样式工具栏，位置贴合图形包围盒。
  - [x] 导图块的样式工具栏功能与位置零回归。
  - [x] 选中图形可改填充 / 描边色 / 描边宽 / 线型 / 不透明度，变更即时生效并持久化。
  - [x] 多选不同类型元素（图形 + 连线）时，只显示两者共有的能力组，不报错。
  - [ ] 批次 2 完成后可切换图形类型且内部文本不丢失。（批次 2 范围）

### 3.9 插入图片

- **描述**：支持向白板插入本地图片，以 base64 内联持久化。
- **优先级**：P2（批次 5）
- **功能细节**：
  - 三条入口：工具条「图片」按钮（唤起文件选择）、剪贴板粘贴、文件拖入画布。
  - 落盘形态：图片转 base64 data URL 写入 `PlaitImage.url`，随 `BoardPayload` 一并进 ` ```plait ` 围栏。
  - **体积风险必须做防护**（已确认接受内联方案，但需可控，阈值见 Q22~Q24）：
    - 单图原始体积上限 **500KB**，超限**直接拒绝**并提示（不做二次压缩尝试）。
    - 插入前按最长边阈值 1920px 等比压缩 + **统一转 WebP**（质量 0.8）降低 base64 膨胀。
    - 单个画板块内图片累计体积超阈值 5MB 时给出警示提示。
  - **二次膨胀须向用户说明**：画板整体本就是 `base64(JSON)`，图片 base64 会被再套一层 base64，净膨胀约 1.78 倍（1.33²）。该说明已并入累计体积警示文案中。
  - 安全：仅接受光栅 `image/*` MIME（png/jpeg/webp/gif/bmp，排除 SVG）；粘贴 / 拖入的内容需校验真实类型，不信任扩展名。不支持远程 URL 自动下载内联（避免 SSRF）。
- **验收标准**（✅ 批次 5 已全部验证）：
  - [x] 三条入口均可插入图片。
  - [x] 图片可拖移、缩放、旋转、删除。
  - [x] 超过单图上限时明确提示并拒绝，不产生半截数据。
  - [x] 压缩后画质在文档阅读场景可接受。
  - [x] 保存重开后图片完整显示。
  - [x] 非图片文件拖入时不插入、不报错。

### 3.10 流程图符号面板（24 种）

- **描述**：支持创建 `FlowchartSymbols` 全部 24 种流程图符号。
- **优先级**：P1（批次 3）
- **功能细节**：
  - 清单取自 `getFlowchartPointers()`，提供中文名映射（处理 / 判定 / 数据 / 连接点 / 终止 / 手动输入 / 准备 / 手动循环 / 合并 / 延时 / 已存数据 / 或 / 汇总连接 / 预定义处理 / 跨页连接 / 文档 / 多文档 / 数据库 / 硬盘 / 内部存储 / 右花括号注释 / 左花括号注释 / 方括号注释 / 显示）。
  - 与基础图形共用同一套网格面板组件，按分类（基础 / 流程图 / UML）切 tab。
- **验收标准**：
  - [ ] 面板「流程图」分类列出全部 24 种符号，含缩略图与中文名。
  - [ ] 任一符号可创建、编辑文本、连线绑定。
  - [ ] 保存重开完整恢复。

### 3.11 UML 符号面板（21 种）

- **描述**：支持创建 `UMLSymbols` 全部 21 种 UML 符号。
- **优先级**：P1（批次 4）
- **功能细节**：
  - 清单取自 `getUMLPointers()`，提供中文名映射。
  - 其中部分符号为多文本图形（`PlaitMultipleTextGeometry`，如 `class` / `interface` 含多个文本区），文本编辑与样式回填需走 `DrawTransforms.setDrawTexts` 而非 `setText`，样式工具栏需识别该分支。
- **验收标准**：
  - [ ] 面板「UML」分类列出全部 21 种符号。
  - [ ] 多文本符号（class / interface 等）的各文本区均可独立编辑。
  - [ ] 保存重开完整恢复。

### 3.12 复用现有基础设施（零回归约束）

- **描述**：白板块完全复用现有画板基础设施，不另起一套。
- **优先级**：P0（贯穿全部批次）
- **复用清单**：
  - 预览态（只读挂载）/ 编辑态切换，含 `readonly` 运行时 mutate 与 `.readonly` 修饰类同步
  - 事件隔离（`stopEvent` / `ignoreMutation`）
  - 防抖回写（`WRITE_BACK_DEBOUNCE_MS = 500`，`setNodeMarkup` 写 `attrs.data`）
  - 右上角 `canvas-toolbar`（主题 / 缩放 / 手型-选择 / 编辑）
  - 底部 `resize-handle` 拖拽改高（默认 420px，范围 200~1200）
  - 全屏子窗口（`fullscreen/`）
  - 节点右侧竖排块工具栏（编辑 / 最大化 / 删除）
- **验收标准**：
  - [ ] 白板块以上能力全部可用。
  - [ ] 导图块以上能力全部零回归。
  - [ ] 同一文档内同时存在导图块与白板块时，两者互不干扰（主题、工具栏、选中态各自独立）。

---

## 4. 技术方案要点

### 4.1 文件结构变更

> 标记说明：✅ 批次 0 已落地 / ☑️ 批次 1 已落地 / ⬜ 待后续批次

```
src/editor/plugins/board-block/
├── types.ts                  # ✅ BoardMode/BoardPayload.mode/DecodedBoard.mode
├── codec.ts                  # ✅ encode 改 EncodeOptions；normalize 按 mode 分流空数据兜底
├── index.ts                  # ✅ 导出 BoardMode / EncodeOptions
├── constants.ts              # 不改（白板初始为空数组，无需 createEmptyBoard）
├── schema.ts                 # 不改（mode 在 payload 内，不进 attrs）
├── board-react.tsx           # ✅ 按 mode 分流 plugins 与 themeColors
├── node-view.ts              # ☑️ 按 mode 装配工具栏；encodeCurrent() 统一带 mode（批次 1 补传 mode 给 style-toolbar）
├── fullscreen/mount.ts       # ☑️ 透传 mode；按形态延迟创建工具条（批次 1 补 setMode 时序）
├── draw-toolbar/             # 左侧竖排创建工具条
│   ├── index.ts              # ☑️ 控制器（含 creation mode 设置）；挂载两个面板与主按钮交互
│   ├── types.ts              # ☑️ 类型（新增面板 / 分类 / 走线项类型）
│   ├── constants.ts          # ☑️ SHAPE_CATEGORIES（三 tab）+ SHAPE_NAMES（21 项中文名）+ 走线清单
│   │                         #    （⬜ 批次 3/4 只需开 enabled 并补中文名）
│   ├── icons.ts              # ☑️ 追加图形 / 连线及三种走线图标
│   ├── shape-panel.ts        # ☑️ 批次 1：图形网格面板（三 tab，drawGeometry 实时渲缩略图）
│   └── line-panel.ts         # ☑️ 批次 1（PRD 原未规划）：走线子面板，与 shape-panel 结构不同故独立
└── style-toolbar/
    ├── selection.ts          # ☑️ 批次 1：抽出类型分流层，新增 draw 元素读取与包围盒计算
    ├── index.ts              # ☑️ 批次 1：按 mode 装配 segments；定位改用 points 包围盒；setMode
    ├── types.ts              # ☑️ 批次 1（PRD 原未列）：draw 样式快照与 segment 集合类型
    ├── constants.ts          # ☑️ 批次 1（PRD 原未列）：STROKE_STYLE_OPTIONS / OPACITY_OPTIONS 等
    ├── icons.ts              # ☑️ 批次 1（PRD 原未列）：填充 / 描边 / 不透明度图标
    ├── transforms.ts         # ☑️ 批次 1（PRD 原未列）：draw 侧写入（applyOpacity 等）
    └── segments/
        ├── draw-fill.ts      # ☑️ 批次 1
        ├── draw-stroke.ts    # ☑️ 批次 1（含 strokeStyle 线型）
        ├── opacity.ts        # ☑️ 批次 1（固定四档下拉）
        ├── dropdown-shell.ts # ☑️ 批次 1（PRD 原未规划）：三个新 segment 的公共下拉外壳
        ├── text-style.ts     # ☑️ 批次 1：复用成功，仅加可见性控制，未分叉
        ├── shape-switch.ts   # ⬜ 批次 2
        └── line-marker.ts    # ⬜ 批次 2（端点 + 走线形态）

src/editor/plugins/slash-menu/
├── commands-basic.ts         # ✅ insertBoardBlock 接收 mode；新增「白板」条目
└── icons.ts                  # ✅ 亮/暗两套图标集各加 whiteboard 图标

src/styles/editor/
├── index.css                 # ✅ 引入 board-draw-toolbar.css
├── board-block.css           # ✅ 批次 0 确认无需移植（draw 元素渲染无样式缺失，见下注）
├── board-draw-toolbar.css    # ☑️ 前缀 .lanismd-board-draw-toolbar；批次 1 新增面板/tab/网格/走线列表样式
└── board-style-toolbar.css   # ☑️ 批次 1 追加：描边线型行 + 不透明度档位面板样式

src/components/board/
└── BoardFullscreen.tsx       # ✅ 全屏窗口引入工具条样式
```

> 遵守插件规范：`draw-toolbar` 为多文件，故建目录 + `index.ts` 入口；样式类名前缀 `.lanismd-board-draw-toolbar`。
>
> 批次 0 实际与原计划的差异：`constants.ts` 未改动（白板初始内容为 `[]`，直接内联即可，
> 无需新增 `createEmptyBoard`）；`board-block.css` 未改动（Plait draw 元素渲染未出现样式缺失，
> 仅光标分流需要新样式，已并入 `board-draw-toolbar.css`）。
> 批次 1 延续该结论：`board-block.css` 仍未改动（draw 元素样式由 Plait 内置提供，
> 无缺失项需移植）；新增样式都落在 `board-draw-toolbar.css` 与 `board-style-toolbar.css`。

### 4.2 mode 在数据层的落点

```typescript
// types.ts
export type BoardMode = 'mindmap' | 'board';

export interface BoardPayload {
  v: number;
  /** 画板形态；缺失时解码侧回落 'mindmap'，保证旧数据零迁移 */
  mode?: BoardMode;
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: ThemeColorMode;
}

export interface DecodedBoard {
  version: number;
  mode: BoardMode;          // 归一化后必填
  elements: PlaitElement[];
  viewport?: Viewport;
  theme: ThemeColorMode;
}
```

`mode` **不进** `board_block.attrs`：它是画板数据的一部分，由 `codec` 在 NodeView 边界解出。NodeView 挂载时 decode 一次即可确定形态，形态在块生命周期内不可变。

`encode` 位置参数已达 3 个，本次扩展改为 options 形态（✅ 批次 0 已落地）：

```typescript
export interface EncodeOptions {
  viewport?: Viewport;
  theme?: ThemeColorMode;
  /** 不传则解码侧回落 'mindmap'，故白板必须显式传 'board' */
  mode?: BoardMode;
}

export function encode(elements: PlaitElement[], options?: EncodeOptions): string
```

> 实际调用点共 6 处：`node-view.ts` ×3、`fullscreen/mount.ts` ×2、`slash-menu/commands-basic.ts` ×1。
> 前两个文件的调用已各自收敛为一个 `encodeCurrent()` 私有方法，确保 `mode` 不会在某条
> 回写路径上被遗漏——**漏传即等于把白板降级成导图**，是本设计最需要防呆的点。

### 4.3 空数据兜底的 mode 分流（必须改）

```typescript
function normalize(parsed: Partial<BoardPayload>): DecodedBoard {
  const mode = normalizeMode(parsed.mode);          // 缺失/非法 → 'mindmap'
  const raw = Array.isArray(parsed.children) ? parsed.children : [];

  // 关键：白板允许空画布，导图不允许（空则回落默认根节点）
  const elements =
    raw.length > 0 ? raw : mode === 'board' ? [] : createDefaultMindmap();

  return { version: ..., mode, elements, viewport: parsed.viewport, theme: ... };
}
```

同时 `decode` 的 `fallback()`（彻底解码失败分支）也需带 mode：解码失败时无法得知原始 mode，统一回落 `'mindmap'` + 默认导图，与现状一致。

### 4.4 插件与主题色分流

```typescript
const plugins = useMemo<PlaitPlugin[]>(
  () => (mode === 'board' ? [withDraw] : [withMind]),
  [mode],
);

const options = useMemo<PlaitBoardOptions>(
  () => ({
    readonly: initialReadonly,
    // 导图注入 Mind 色表；白板刻意不注入，让 core 回落自带 ThemeColors
    ...(mode === 'board' ? {} : { themeColors: MindThemeColors }),
  }),
  [initialReadonly, mode],
);
```

`MindThemeColors` 之所以必须显式注入，是因为 `@plait/mind` 的 `getMindThemeColor` 读 `board.options.themeColors` 且会做 `isMindThemeColor` 判定（已在 `board-react.tsx` v1.2.1 踩坑并记录）。

**draw 侧经批次 0 实测，结论与上述对称假设相反**：`@plait/draw` 的图形配色走自己的 `DrawThemeColors[themeColorMode]` 常量（`getDrawDefaultStrokeColor` / `getFlowchartDefaultFill` 直接按主题名查表），**完全不读** `board.options.themeColors`；该选项在 core 中仅被 `board.getThemeColors()` 用于 `textColor` / `boardBackground`。

且 `DrawThemeColors` 是「主题名 → `{ strokeColor, fill }`」的字典，与 `themeColors` 要求的 `ThemeColor[]` **结构不兼容**，无法直接注入。因此白板模式的正确做法是**不注入** `themeColors`；若错误沿用 `MindThemeColors`，会让白板的文本色走导图色表。

### 4.4.1 创建工具必须同时设置 creation mode（批次 0 实测补充）

**这是本期最关键的一个隐性契约，后续所有创建类工具（连线 / 矢量线 / 流程图 / UML / 图片）都适用。**

`@plait/draw` 的创建插件有**两道独立守卫**：

```typescript
// @plait/draw 内部
const isGeometryDrawingMode = (board) => {
  const isGeometryPointer = PlaitBoard.isInPointer(board, getGeometryPointers());
  return isGeometryPointer && isDrawingMode(board);   // ← 第二道
};
```

- 第一道 `isGeometryPointer` 读 `board.pointer`
- 第二道 `isDrawingMode` 读 `@plait/common` 的 `BOARD_TO_CREATION_MODE` WeakMap

该 WeakMap 初始为空，且 **`@plait/draw` 包内没有任何写入点**（已在 `node_modules/.pnpm` 全量检索确认，仅 `@plait/common` 的定义与 `@plait/mind` 的调用命中），必须由宿主显式设置。

**只写 `board.pointer` 不足以进入创建态**：第一道守卫通过（故工具条按钮高亮正常），第二道恒为 false，`pointerDown` / `pointerMove` / `pointerUp` 三个创建分支全部静默跳过——表现为「按钮高亮但画布拖拽毫无反应且不报错」。

正确写法是两者成对调用（与 `@plait/mind` 自身的创建流程一致）：

```typescript
BoardTransforms.updatePointerType(board, pointer);
setCreationMode(board, BoardCreationMode.drawing);
```

| 模式 | 行为 | 本期取值 |
|------|------|----------|
| `drawing` | 尺寸随拖拽范围；内置「拖动距离 < 8px 回落默认尺寸」故顺带支持单击创建 | **采用**（契合 3.5 验收「尺寸随拖拽范围」） |
| `dnd` | 恒为默认尺寸，拖拽仅定位 | 不采用 |

补充：`insertElement` 在创建完成后只把 pointer 回落到 `selection`，**不清除** creation mode。残留不会引发误创建（第一道守卫 `isGeometryPointer` 会拦住 `selection` / `hand`），故无需额外清理逻辑。


### 4.5 工具条的 pointer 同步

创建工具条的高亮状态有三个变更来源，三者都要覆盖（✅ 批次 0 已全部跑通）：

1. 用户点工具条 → 主动写 `board.pointer`（+ `setCreationMode`，见 4.4.1）→ 该赋值不产生 op，必须手动 `sync()`
2. 创建完一个元素 → Plait 自动回落 `selection` → 走 `board.onChange` 包装捕获
3. 进出编辑态 → `BoardReact` 的 readonly effect 强制重设 pointer（**不走 op 流程、不触发 `board.onChange`**）→ 必须靠 `onPointerReset` 回调通知

第 3 条是已知陷阱，`canvas-toolbar` 已有对应处理，`draw-toolbar` 复用同一机制。

**第 2 条的成立理由（批次 0 实测补充）**：`updatePointerType` 本身只是裸赋值、不产生 op，
单看它无法触发 `onChange`。但它位于 `insertElement` 内部，与之同处一个事件处理器的
`Transforms.insertNode` 会产生 op；而 Plait 的 `apply` 把 `board.onChange()` 推迟到
**微任务**执行，届时 pointer 已完成回落，故 onChange 包装读到的是回落后的正确值。
若未来出现「创建元素但不产生 op」的工具，此条将不再成立，需改用显式通知。

### 4.6 依赖

- `@plait/draw@0.89.2`：**已安装，无需新增依赖**。
- `@plait/common@0.89.2`：新增直接引用（`setCreationMode` / `BoardCreationMode`），该包已随 Plait 安装到位，非新增依赖。
- 不新增 `@plait/layouts` 之外的任何包；表格 / 泳道不接入故不涉及额外插件。

---

## 5. 批次划分与实现顺序

| 批次 | 内容 | 验收线 | 状态 |
|------|------|--------|------|
| **0（spike）** | 最小真实链路：3.1 mode 字段 + 3.2 双入口 + 3.3 插件分流 + 3.4 工具条最小版（选择/手型/矩形） | 画出一个矩形并保存重开成功 | ✅ **已交付并验收**（2026-10-27） |
| **1** | 3.5 基础图形补齐 21 种（弹出网格面板）+ 3.6 箭头连线 + 3.8 样式分流地基与基础组 | **用户验收点**：白板可画 21 种图形与三种连线、连线能绑定吸附、样式可改、保存重开不丢、导图零回归 | ✅ **已交付并验收**（2026-10-27） |
| **2** | 3.7 矢量线 + 3.8 样式工具栏补齐（图形切换 / 端点 / 走线形态 / 旋转） | 多边形可画可编辑，图形可无损切换类型 | ✅ **已交付并验收**（2026-10-27） |
| **3** | 3.10 流程图符号面板（24 种） | 面板分类完整，符号可创建可连线 | ✅ **已交付并验收**（2026-10-27） |
| **4** | 3.11 UML 符号面板（21 种，含多文本图形） | 多文本符号各区可独立编辑 | ✅ **已交付并验收**（2026-10-27） |
| **5** | 3.9 插入图片（含体积防护与压缩） | 三入口可用，超限有提示，画质可接受 | ✅ **已交付并验收**（2026-10-27） |

> **批次 0 范围调整说明**：原计划为「纯 demo 验证」，经评审改为**最小真实链路且代码保留**，
> 直接成为批次 1 的地基。故 3.1 / 3.2 / 3.3 已完整落地，3.4 落地最小版（三个工具项，
> 跳过弹出面板），批次 1 的剩余工作相应减少为「在既有工具条上扩展网格面板与连线工具」。

**批次 0 是硬门槛**：若 `@plait-board/react-board@0.4.0-0` 未覆盖 draw 的渲染分支（版本错配风险，见第 7 节），需在动工前上报并走降级评审，不得带着未知风险进批次 1。
→ **已通过，风险解除**，无需降级 A，详见 5.1。

### 5.1 批次 0 交付记录（2026-10-27）

**验收结果**：全部通过。插入白板 → 空画布 + 自动编辑态 → 左侧工具条点矩形 → 画布拖拽创建 →
保存重开完整恢复 → 清空重开仍为空白板 → 导图块零回归。

**两个 spike 未知项的结论**：

| 未知项 | 原假设 | 实测结论 |
|--------|--------|----------|
| `themeColors` draw 侧取值 | 注入 draw 对应色表 | **假设不成立**：draw 不读该选项，白板应**不注入**（见 4.4） |
| `react-board@0.4.0-0` 是否覆盖 draw 渲染 | 高风险，可能需降级 A | **风险解除**：渲染走 core 的 `ListRender` + 插件自注册组件类，与 React 宿主解耦；其基础插件栈已含 `withImage` / `withText` |

**过程中发现的、PRD 原未记录的两个坑**：

1. **creation mode 契约**（已补入 4.4.1）：只写 `board.pointer` 画不出图形，必须同时
   `setCreationMode(board, BoardCreationMode.drawing)`。此坑在批次 0 真实触发过一次
   （现象为按钮高亮但拖拽无反应、无报错），后续所有创建类工具均受此约束。
2. **空画布 + `fitViewport` 的 NaN 风险**（已排除）：零元素时 `newZoom` 走 `else` 分支恒为 1，
   且该 effect 首帧被 ref 跳过、`value` 又被冻结，实际不触发，无需额外守卫。

**`board.pointer` 自动回落的时序已证实**（PRD 4.5 第 2 条假设成立，但理由需补充）：
`updatePointerType` 本身是裸赋值不产生 op，但同一事件处理器中 `insertElement` 的
`Transforms.insertNode` 会产生 op，而 Plait 把 `board.onChange()` 推迟到**微任务**执行，
届时 pointer 已完成回落，故 `onChange` 包装能读到正确值。

**实际落地的文件**（均含 `@changelog`，关联 `REQ: 20261027-board-whiteboard-draw`）：

```
src/editor/plugins/board-block/
├── types.ts                  # 改：BoardMode / BoardPayload.mode / DecodedBoard.mode
├── codec.ts                  # 改：encode 改 EncodeOptions 对象签名；normalizeMode；空数据兜底分流
├── index.ts                  # 改：导出 BoardMode / EncodeOptions
├── board-react.tsx           # 改：mode prop；plugins 与 themeColors 分流
├── node-view.ts              # 改：固化 mode；白板才建工具条；encodeCurrent() 统一带 mode
├── draw-toolbar/             # 新增
│   ├── index.ts              #   控制器 + creation mode 设置
│   ├── types.ts              #   控制器与工具项类型
│   ├── constants.ts          #   CSS 前缀 + POINTER_TOOLS / SHAPE_TOOLS
│   └── icons.ts              #   选择 / 手型 / 矩形 三图标
└── fullscreen/mount.ts       # 改：透传 mode；按形态延迟创建工具条；dispose 清理

src/editor/plugins/slash-menu/
├── commands-basic.ts         # 改：insertBoardBlock(view, mode)；新增「白板」条目
└── icons.ts                  # 改：亮/暗两套各加 whiteboard 图标

src/styles/editor/
├── board-draw-toolbar.css    # 新增：左侧竖排卡片 + crosshair 光标分流
└── index.css                 # 改：引入上述样式

src/components/board/BoardFullscreen.tsx   # 改：全屏窗口引入工具条样式
```

> `encode` 的 options 签名改造涉及 6 个调用点（`node-view.ts` ×3、`fullscreen/mount.ts` ×2、
> `slash-menu/commands-basic.ts` ×1），已全部收敛为 `encodeCurrent()` 私有方法统一带上 mode。

### 5.2 批次 1 交付记录（2026-10-27）

**交付范围**：3.5 基础图形网格面板、3.6 箭头连线、3.8 样式工具栏按元素类型分流的地基与基础组。
三块工作按 PRD 决策基线「一次全做完再验收」整体交付。

**本次澄清拍板的关键决策**（补充进决策基线，见 §0 Q14~Q21）：

| # | 议题 | 决策 |
|---|------|------|
| Q14 | 批次 1 交付粒度 | 三块工作一次全做完，统一验收 |
| Q15 | 符号缩略图来源 | `drawGeometry()` 实时渲染真实图形，观感不行再针对个别图形补手写 SVG |
| Q16 | 网格面板结构 | 批次 1 就搭完整三 tab 框架（基础/流程图/UML），后两个 tab 置灰 |
| Q17 | 连线入口 | 单个「连线」按钮 + 弹出子面板（不平铺三个按钮） |
| Q18 | 图形按钮点击 | 必须点面板选一个才生效，不记忆上次选择 |
| Q19 | 连线按钮点击 | 单击即用上次走线（默认直线）+ 同时弹面板，面板可忽略 |
| Q20 | 文字样式 | 先试接；实测复用成功、无需分叉（见 3.8 落地结论） |
| Q21 | 不透明度 | 做，固定四档（100/75/50/25）下拉 |

**数量校正**：`BasicShapes` 实测 21 项，PRD 初稿「22 种」为笔误，全文已改为 21。

**验收结论**：全部通过。白板可画 21 种基础图形与三种连线，连线端点绑定吸附与拖动重算正常；
样式工具栏在白板形态装配填充/描边（含线型）/不透明度/文字样式，导图形态 6 个能力组零回归；
多选「图形+连线」时填充与文字组按能力交集正确隐藏；保存重开图形/连线/样式完整恢复；全屏窗口 `setMode` 时序正常。

**实际落地文件**（均含 `@changelog`，关联 `REQ: 20261027-board-whiteboard-draw`）：

```
src/editor/plugins/board-block/draw-toolbar/   # 新增/扩展
├── shape-panel.ts          # 新增：三 tab 图形网格面板，drawGeometry 实时渲缩略图
├── line-panel.ts           # 新增：连线走线子面板
├── constants.ts            # 改：SHAPE_CATEGORIES + SHAPE_NAMES(21) + ARROW_LINE_TOOLS
├── icons.ts                # 改：追加图形/连线及三种走线图标
├── types.ts                # 改：分类/面板/走线项类型
└── index.ts                # 改：图形+连线两个复合按钮，主按钮交互分流，setCreationMode

src/editor/plugins/board-block/style-toolbar/
├── index.ts                # 改：按 mode 装配两套互斥 segments；定位分流；setMode
├── selection.ts            # 改：新增 draw 元素读取/样式快照/能力位/包围盒
├── transforms.ts           # 改：draw 侧写入（applyDrawFillColor 等 + applyOpacity）
├── types.ts / constants.ts / icons.ts  # 改：draw 样式类型、线型/不透明度常量与图标
└── segments/
    ├── draw-fill.ts        # 新增
    ├── draw-stroke.ts      # 新增（含 strokeStyle 线型）
    ├── opacity.ts          # 新增（固定四档）
    ├── dropdown-shell.ts   # 新增：公共下拉外壳
    └── text-style.ts       # 改：复用成功，仅补 setVisible

src/editor/plugins/board-block/
├── node-view.ts            # 改：style-toolbar 创建时传 mode
└── fullscreen/mount.ts     # 改：applyInitialData 补 styleToolbar.setMode(mode)

src/styles/editor/
├── board-draw-toolbar.css  # 改：面板/tab/网格/走线列表样式
└── board-style-toolbar.css # 改：描边线型行 + 不透明度档位面板样式
```

> 批次 1 关键实现细节（供批次 2~5 复用）：
> - **创建工具仍受 4.4.1 的 creation mode 契约约束**，连线/图形均与 `setCreationMode(drawing)` 成对调用。
> - **三个新 segment 抽了公共 `dropdown-shell.ts`**，批次 2 新增 segment（shape-switch / line-marker）应优先复用，勿再复制样板。
> - **白板样式 segment 全走 draw 自己的 `DrawTransforms` / `PropertyTransforms`**（见 `transforms.ts`），
>   导图 segment 走 `@plait/mind` 的 `MindTransforms`，两侧互不侵入，勿交叉复用写入函数。

### 5.3 批次 5 交付记录（2026-10-27）

**交付范围**：3.9 插入图片，含三条入口、体积防护与 WebP 压缩。

**本次澄清拍板的关键决策**（补充进决策基线，见 §8 Q22~Q24）：

| # | 议题 | 决策 |
|---|------|------|
| Q22 | 图片体积阈值 | 单图原始体积 ≤ 500KB；最长边 1920px、累计 5MB 沿用 PRD 建议值 |
| Q23 | 单图超限行为 | 直接拒绝并提示，不做二次压缩尝试 |
| Q24 | 压缩格式 | 统一 WebP（质量 0.8，保留透明；环境不支持 WebP 编码时降级 JPEG） |

**验收结论**：全部通过。三条入口（工具条按钮 / 剪贴板粘贴 / 文件拖入）均可插入图片并 base64 内联持久化；
图片拖移 / 缩放 / 旋转 / 删除由 `withDraw` 内置提供；超 500KB 明确拒绝且不产生半截数据；
非图片文件拖入静默忽略；保存重开图片完整恢复。

**关键技术结论**（供后续参考）：

1. **必须绕过 Plait 内置上传/粘贴路径**：`@plait/draw` 的 `withDrawFragment` 对 `clipboardData.files`
   走内置 `buildImage`（`URL.createObjectURL` 生成 blob URL，会话结束失效），`@plait/core` 的默认
   `drop` 为空实现（`return false`）。故粘贴需在 `board.insertFragment` 之外再包一层（`overrideImagePaste`），
   拖入需自行监听 drop（`bindImageDrop`），统一走自研 `insertImageFile`（读文件 → 校验 → canvas 压缩 → base64 → `DrawTransforms.insertImage`）。
2. **图片拖移/缩放/旋转/删除零开发**：`withDraw` 内置 `withDrawResize` / `withDrawRotate` / hotkey 已覆盖。
3. **样式工具栏对图片隐藏**：图片无填充/描边/不透明度等能力组语义，新增 `isAllImage` 判定，选中图片时整体隐藏工具栏。
4. **插入尺寸分层**：像素层按最长边 1920px 压缩，显示层限制宽度 1000px（与 Plait `DEFAULT_IMAGE_WIDTH` 对齐），
   避免大图铺满画布。

**实际落地文件**（均含 `@changelog`，关联 `REQ: 20261027-board-whiteboard-draw`）：

```
src/editor/plugins/board-block/draw-toolbar/
├── image-insert.ts        # 新增：校验/压缩(WebP)/base64内联/累计统计 + overrideImagePaste + bindImageDrop
├── icons.ts               # 改：新增图片图标
└── index.ts               # 改：新增「图片」按钮 + 隐藏 file input；attach/detach 接线粘贴覆盖与拖入监听

src/editor/plugins/board-block/style-toolbar/
├── selection.ts           # 改：新增 isAllImage 判定
└── index.ts               # 改：syncDraw 中图片选中时隐藏工具栏
```

---

## 6. 验收 checklist（全量交付标准）

- [x] 斜杠菜单两个入口可分别插入导图块与白板块，搜索关键词不互相混淆（批次 0）
- [x] 白板块可创建：21 种基础图形 / 24 种流程图符号 / 21 种 UML 符号 / 三种箭头连线 / 矢量线 / 图片（基础图形 + 连线批次 1、矢量线批次 2、流程图批次 3、UML 批次 4、图片批次 5）
- [x] 箭头连线可绑定图形并在图形移动时自动重算（批次 1）
- [x] 样式工具栏按选中元素类型正确分流，白板与导图各自显示对应能力组（批次 1）
- [x] 图形内文本编辑中文输入法正常（无重复 / 丢字 / 光标错位）（批次 1）
- [x] 白板空画布保存重开仍为空，不被兜底成思维导图（批次 0）
- [x] 已有 ` ```plait ` 文档打开后行为与本期前完全一致（零回归）（批次 0）
- [x] 同一文档内导图块与白板块共存时互不干扰（批次 0）
- [x] 白板块的预览/编辑态、全屏、拖拽改高、主题、缩放全部可用（批次 0）
- [x] 插入图片有体积上限（500KB）与 WebP 压缩，超限明确拒绝（批次 5）
- [x] 删除块 / 切文档无 React 内存泄漏、无控制台错误（批次 0）
- [x] 所有新增 / 重度修改文件头部含 `@changelog`，关联 `REQ: 20261027-board-whiteboard-draw`（批次 0~5 范围内）

---

## 7. 风险与降级

| 风险 | 等级 | 应对 | 状态 |
|------|------|------|------|
| `@plait-board/react-board@0.4.0-0` 与 `@plait/*@0.89.2` 版本错配，React 宿主未覆盖 draw 渲染分支 | ~~高~~ | **批次 0 spike 先验证**；不通过则评估升级 react-board 或自建最小 React 宿主（降级 A） | ✅ **已关闭**：渲染走 core 的 `ListRender` + 插件自注册组件类，与 React 宿主解耦，无需降级 |
| 降级 A | — | 绕过 react-board，直接用 `@plait/core` 的 `createBoard` + 手动 DOM 挂载（放弃 React 封装），代价是需自行实现 `Wrapper` 的 value/viewport/theme 同步 | 未启用 |
| `themeColors` 分流取值错误，导致白板切主题时图形配色不变 | ~~中~~ | 批次 0 实测；已有 mind 侧同类坑的处理经验可参照 | ✅ **已关闭**：draw 不读该选项，白板不注入即可（见 4.4） |
| **创建类工具遗漏 `setCreationMode`，导致工具选中但画不出元素** | **中** | 契约已记录于 4.4.1；批次 1 起新增任何创建工具（连线 / 矢量线 / 符号 / 图片）时，必须与 `updatePointerType` 成对调用并纳入自测 | ⚠️ **新增**（批次 0 实际踩坑） |
| 样式工具栏重构触碰导图块已交付逻辑，引入回归 | **高** | 重构采用「抽分流层 + 导图分支保持原实现不动」策略；批次 1 必须对导图块做完整回归验证 | ✅ **已关闭**：导图分支代码未改动，仅抽分流层 + 白板侧并列新增，批次 1 验收导图零回归 |
| 67+ 符号的中文名与图标工作量大 | 中 | 符号清单从 `getXxxPointers()` 动态取；图标优先用 Plait 内置渲染生成缩略图，避免手画 SVG | ✅ **已关闭**：批次 3/4 已交付，中文名映射 + `drawGeometry` 实时缩略图零成本覆盖 45 个符号 |
| 内联 base64 图片导致文档体积失控 | 中 | 批次 5 的体积上限 + 压缩 + 累计警示为**必做项**，不可省略 | ✅ **已关闭**：批次 5 已落地 500KB 单图上限（超限直接拒绝）+ 1920px 最长边压缩 + 统一 WebP + 累计 5MB 警示 |
| 白板元素增多后画布性能下降 | 中 | 预览态维持只读最小挂载；大量元素场景在批次 3/4 后做一次性能基线测量 | 待批次 3/4 |

---

## 8. 决策记录

| 编号 | 议题 | 决策 |
|------|------|------|
| Q1 | 导图与绘图是否混放 | **分块类型**，两种块独立工具条（见 0 / 3.2） |
| Q2 | Markdown 标识 | **复用 ` ```plait `** + payload `mode` 字段，旧文档零迁移（见 4.2） |
| Q3 | 工具组范围 | 基础图形 / 箭头连线 / 流程图 / UML **全要**，分 4 批交付（见 5） |
| Q4 | 表格与泳道 | **不做**（本期排除） |
| Q5 | 图片存储 | **内联 base64**，接受体积代价但须做上限与压缩（见 3.9） |
| Q6 | 创建工具条位置 | **画布左侧竖排悬浮**（见 3.4） |
| Q7 | 批次 1 验收线 | 地基 + 基础图形 + 箭头连线（见 5） |
| Q8 | 白板插入初始内容 | **空画布**，不预置任何元素（见 3.2） |
| Q9 | 自由画笔 / 橡皮擦 | **不做**：Plait 包内无 freehand 实现，须自建插件，另立需求 |
| Q10 | 批次 0 交付形态 | **最小真实链路且代码保留**（非一次性 demo），直接成为批次 1 地基（见 5.1） |
| Q11 | 批次 0 的矩形触发入口 | **建 `draw-toolbar/` 最小版**（选择/手型/矩形三项），顺带验证 `plait-board-attached`、pointer 双向同步、`onPointerReset` 三个已知坑 |
| Q12 | 斜杠菜单关键词分配 | **两条目共享泛化词**：`board` / `画板` 两条都保留，同时命中由用户选；专属词精准命中单条（见 3.2） |
| Q13 | draw 创建模式取值 | **`BoardCreationMode.drawing`**（尺寸随拖拽，含 < 8px 单击回落），非 `dnd`（见 4.4.1） |
| Q14 | 批次 1 交付粒度 | **三块工作一次全做完，统一验收**（见 5.2） |
| Q15 | 符号缩略图来源 | **`drawGeometry()` 实时渲染真实图形**；观感不行再针对个别图形补手写 SVG（见 3.5） |
| Q16 | 网格面板结构 | **批次 1 就搭完整三 tab 框架**（基础/流程图/UML），后两个 tab 置灰，批次 3/4 只补清单映射（见 3.5） |
| Q17 | 连线入口 | **单个「连线」按钮 + 弹出子面板**，不平铺三个按钮（见 3.6） |
| Q18 | 图形按钮点击 | **必须点面板选一个才生效**，不记忆上次选择（见 3.5） |
| Q19 | 连线按钮点击 | **单击即用上次走线（默认直线）+ 同时弹面板**，面板可忽略（见 3.6） |
| Q20 | 文字样式 | **先试接**；实测复用成功、无需分叉（见 3.8） |
| Q21 | 不透明度 | **做，固定四档**（100/75/50/25）下拉（见 3.8） |
| Q22 | 图片体积阈值 | **单图原始体积 ≤ 500KB**；最长边压缩 1920px、累计 5MB 沿用 PRD 建议值（见 3.9） |
| Q23 | 单图超限行为 | **直接拒绝并提示**，不做二次压缩尝试（见 3.9） |
| Q24 | 图片压缩格式 | **统一 WebP**（质量 0.8，保留透明通道；环境不支持 WebP 编码时降级 JPEG）（见 3.9） |

---

## 附录 A. 代码库核实记录（2026-10-27）

| 核实项 | 结论 |
|--------|------|
| `@plait/draw` | **已安装 0.89.2，从未接入**。`board-react.tsx` 的 `plugins` 仅含 `withMind` |
| draw 公开能力 | `public-api.d.ts` 导出 `withDraw`、`withArrowLineAutoComplete`、`DrawTransforms`、全部 interfaces 与 generators |
| draw 内置插件 | `with-draw` / `with-draw-fragment` / `with-draw-hotkey` / `with-draw-resize` / `with-draw-rotate` / `with-geometry-create` / `with-vector-line-create` / `with-vector-line-resize` / `with-table` / `with-table-resize` / `with-swimlane` / `with-swimlane-create` / `arrow-line/*` |
| 图形数量 | `BasicShapes` **21**（初稿误记 22，批次 1 实测纠正）、`FlowchartSymbols` 24、`UMLSymbols` 21；清单可用 `getBasicPointers()` / `getFlowchartPointers()` / `getUMLPointers()` 动态获取 |
| 连线能力 | `ArrowLineShape` 3 种走线、`ArrowLineMarkerType` 9 种端点、`source/target.boundId + connection` 支持绑定吸附、`texts` 支持线上文字 |
| 矢量线 | `PlaitVectorLine`，`VectorLineShape.straight / curve`，含 `fill` 字段 |
| 图片 | `PlaitImage { url, points, angle }` + `DrawTransforms.insertImage`；`@plait/common` 提供 `withImage` 与 `ImageGenerator` |
| 自由画笔 | 在 `node_modules/@plait/*` 全量检索 `freehand` / `pencil` / `getStroke` / `perfect-freehand`，**零命中**。Plait 不提供该能力 |
| `codec.normalize` 空数据兜底 | 现实现 `children.length > 0` 才采用，否则无条件 `createDefaultMindmap()`。**白板空画布会被错误兜底，必须按 mode 分流**（见 4.3） |
| `style-toolbar` 选中读取 | `getSelectedMindElements` 用 `isMindElement` 过滤，白板选中 geometry 返回空数组导致工具栏永不显示。**必须重构分流**（见 3.8） |
| `style-toolbar` 定位 | 依赖 `MindElement.getNode()` 读布局坐标，draw 元素无此结构，需改用 `points` 包围盒 |
| `style-toolbar` segments | 现有 6 个（`branch` / `fill` / `node-shape` / `stroke` / `structure` / `text-style`），其中 `branch` / `node-shape` / `structure` 为导图专属 |
| `plait-board-attached` 类 | 工具栏根 DOM 必须携带，否则 Plait `globalPointerUp` 会清空选中态（`style-toolbar/index.ts` 已有注释记录） |
| `board.pointer` 重设通知 | `BoardReact` 的 readonly effect 强制重设 pointer 且不触发 `board.onChange`，靠 `onPointerReset` 回调通知宿主（已有机制，可复用） |
| `board_block.attrs` | `data` / `version` / `height` / `autoEdit`，**本期不新增 attrs** |
| 斜杠菜单现状 | `commands-basic.ts` 仅一个 `board` 条目（label「思维导图」），关键词已含「画板」，新增白板条目时需重新分配关键词 |
| `canvas-toolbar` 位置 | 画板块右上角；节点块工具栏竖排于节点右侧外部（`left: 100%`）；`resize-handle` 位于底部。**左侧为空，适合放创建工具条** |
| 全屏子窗口 | `board-block/fullscreen/` 已存在，`canvas-toolbar` 在其中承担编辑/完成入口（无块工具栏） |

---

## 附录 B. 批次 0 实测补充记录（2026-10-27）

批次 0 开发过程中新查明、附录 A 未覆盖的事实：

| 核实项 | 结论 |
|--------|------|
| **creation mode 契约** | `@plait/draw` 的创建守卫为「pointer 是图形类」**且**「creation mode 为 drawing」双条件。`BOARD_TO_CREATION_MODE`（`@plait/common`）初始为空，**`@plait/draw` 包内零写入点**（`.pnpm` 全量检索确认），必须由宿主调用 `setCreationMode`。详见 4.4.1 |
| `BoardCreationMode` 两种取值 | `drawing` 尺寸随拖拽范围 + 内置「< 8px 回落默认尺寸」；`dnd` 恒为默认尺寸。本期采用 `drawing` |
| `insertElement` 的副作用 | 创建后 `memorizeLatestShape` → `insertNode` → `clearSelectedElement` → `addSelectedElement` → `updatePointerType(selection)`。**不清除** creation mode，残留无害 |
| `DrawThemeColors` 结构 | 「主题名 → `{ strokeColor, fill }`」字典，与 `board.options.themeColors` 要求的 `ThemeColor[]` **结构不兼容**，无法注入 |
| draw 配色读取路径 | `getDrawDefaultStrokeColor(theme)` / `getFlowchartDefaultFill(theme)` 直接查 `DrawThemeColors`，不经 `board.options` |
| `board.options.themeColors` 的真实作用域 | core 中仅 `board.getThemeColors()` 读取，用于 `textColor` / `boardBackground` |
| `react-board@0.4.0-0` 渲染机制 | 走 `@plait/core` 的 `ListRender` + 插件自注册组件类，`index.mjs` 中搜不到任何具体元素组件引用；基础插件栈已含 `withImage` / `withText`，用户 `plugins` 最后叠加 |
| `fitViewport` 空元素行为 | 零元素时 `newZoom` 走 `else` 分支恒为 1，不产生 NaN；且该 effect 首帧被 ref 跳过、`value` 被冻结，实际不触发 |
| `board.onChange` 触发时机 | Plait 的 `apply` 把 `onChange()` 推迟到**微任务**执行，故同一事件处理器内的 pointer 回落能被 onChange 包装读到 |
| `withDraw` 插件栈 | `withSwimlane(withTable(withDrawResize(withVectorLineCreateByDraw(withArrowLineAutoCompleteReaction(withArrowLineBoundReaction(withVectorLineResize(withArrowLineResize(withArrowLineTextMove(withArrowLineText(withDrawRotate(withArrowLineCreateByDraw(withArrowLineAutoComplete(withGeometryCreateByDrag(withGeometryCreateByDrawing(withDrawFragment(withDrawHotkey(board)))))))))))))))))`。**`withArrowLineAutoComplete` 与矢量线创建/缩放均已内置**，3.6 / 3.7 无需显式注册 |
| `@plait/draw` 自带样式 | `styles/styles.scss` 用 `.plait-board-container.pointer-xxx` 分流光标，但 Plait 只在创建 board 时打该类，运行时改 pointer 不重算（与 canvas-toolbar 手型光标同坑），故改由宿主打 `data-draw-pointer` 分流 |

# 块手柄插件（block-handle）分析与修复计划

## 背景

对标 Typora 的块级手柄交互，对 `src/editor/plugins/block-handle.ts` 进行完整性分析，并制定修复计划。

**对标目标（Typora 式）**：
- 移除加号（＋）按钮
- 保留拖拽手柄（⠿），支持：
  - B1 单击选中整个块
  - B3 拖拽排序（当前 **有 bug：拖拽后无任何变化**）
  - B4 拖拽过程中显示目标插入位置指示线

**本计划不包含**：Notion 式块菜单、键盘快捷键、嵌套拖拽支持、hover 整块高亮。

---

## 一、现状分析

### 1.1 当前实现概览

`src/editor/plugins/block-handle.ts` 基于 `@milkdown/kit/plugin/block` 的 `BlockProvider`，手动创建一个 `.milkdown-block-handle` DOM，内部含两个按钮：

| 元素 | 类名 | 行为 |
|------|------|------|
| 加号 | `.milkdown-block-add` | 监听 `mousedown`：在当前块后插入段落 + `/` 文本，触发 Slash 菜单 |
| 六点手柄 | `.milkdown-block-drag` | 监听 `dragstart`/`dragend`：手动设置 dataTransfer、设置 NodeSelection、设置拖拽图像 |

### 1.2 Milkdown 官方 block plugin 内部机制（关键发现）

阅读 `node_modules/@milkdown/plugin-block/lib/index.js` 可知：

1. **`BlockProvider` 构造时会自动对传入的 `content` 元素调用 `service.addEvent(this.#element)`**（index.js:373），注册以下事件：
   - `mousedown`、`mouseup`、`dragstart`、`dragend`
2. 并且会设置 `this.#element.draggable = true`（index.js:374）。
3. `BlockService.#handleDragStart` 会：
   - 基于 `#activeSelection`（由 mousedown 阶段构造的 `NodeSelection`）
   - 调用 `view.serializeForClipboard(slice)` 把切片序列化为 HTML
   - 正确写入 `dataTransfer.setData('text/html', ...)` 和 `setData('text/plain', ...)`
   - 设置 `view.dragging = { slice, move: true }`（ProseMirror 原生拖拽协议的关键）
4. `BlockPlugin` 通过 `handleDOMEvents` 注册了 `drop`、`dragover`、`dragenter`、`dragleave`、`pointermove`、`keydown` 处理器，其中 drop 逻辑完全走 ProseMirror 原生流程。

### 1.3 问题定位

#### 【P0 致命 Bug】拖拽后无任何变化的根因

当前 `block-handle.ts` 在 `dragBtn` 上**自己注册了 `dragstart` 事件**（第 111 行），与 `BlockProvider` 内部注册的 `dragstart` **两个 handler 同时生效**。两者行为冲突：

| 项 | 官方 BlockService | 我们自己的代码 |
|----|------------------|----------------|
| dataTransfer 内容 | `text/html` = 序列化的块 HTML；`text/plain` = 文本 | `text/plain` = 空字符串；`application/x-milkdown-block` = 自定义 JSON |
| view.dragging | 设置为 `{ slice, move: true }` | **未设置** |
| NodeSelection | 在 mousedown 阶段提前设置好 `#activeSelection` 并用 `selection.content()` 切片 | 在 dragstart 中 `dispatch(setSelection)`，但已经晚了 |

**关键机制**：ProseMirror 的 `drop` handler 判断是否执行"移动块"操作，依赖 `view.dragging` 这个内部状态。官方 BlockService 会设置它；而我们的代码没有设置。事件顺序上，由于两者都监听 `dragstart`，但**官方 handler 依赖 `#activeSelection`**，而 `#activeSelection` 只在 **BlockService 内部的 mousedown**（即 handle 上的 mousedown）阶段才会被构造 —— 此时 BlockProvider 的 dispatch 流程已启动。但我们在按钮上 `stopPropagation` / 或触发了自己的 dispatch，可能打断了 `#activeSelection` 的正确构造，导致：

1. 虽然浏览器原生拖拽启动了（手柄 `draggable=true` 被官方设置，能拖动），
2. 但 `view.dragging` 为 `null`（或 slice 为空），
3. drop 时 ProseMirror 不执行任何事务，文档保持原状。

**另外**：`setData('text/plain', '')` 设置空字符串会让某些浏览器误判为无效拖拽，进一步增加失败概率。

**根因总结**：我们自己写的 dragstart handler 完全没必要存在，它与官方实现重复且冲突，且破坏了官方流程依赖的 `view.dragging` 状态。

> **诊断纪律说明**：以上结论基于对 Milkdown 源码的阅读和代码行为推理，信心水平约 90%。为达到 systematic-debugging 要求的 99% 信心，修复前将先加诊断日志（见"修复前检查点"），用运行时数据确认后再修改。

#### 【P1 功能缺失】

- **加号按钮**：需求变更，需删除
- **B1 单击选中整个块**：未实现（但官方 BlockService 的 mousedown 已经构造了 NodeSelection 作为 `#activeSelection`，只是没 dispatch 到 view 上，需要我们补一个 click handler）
- **B4 drop indicator（蓝色插入位置指示线）**：未实现
  - 当前 CSS 有 `.milkdown-drop-indicator` 样式定义，但 JS 完全没有创建/操作该元素
  - 截图中看到的 `<div class="milkdown-drop-indicator">` 元素是**Milkdown 内部的 tooltip/slash wrapper 元素**（类名冲突）？—— 需再核实，若是我们自己 CSS 残留导致误以为有人在用，修复时需清理

#### 【P2 代码质量问题】

- 混用公开 API（`BlockProvider` / `block.key`）与手写事件逻辑，维护困难
- `setTimeout(..., 10)` 这种脏实现（加号按钮逻辑里），随着加号被删除一起消失
- `handleEl.remove()` 在 destroy 中调用，但 DOM 是否被 BlockProvider 挂到了 root 容器，remove 是否彻底需验证
- 缺少对多编辑器实例/热重载的清理逻辑

---

## 二、修复方案

### 2.1 总体策略

**拥抱官方 BlockService 的完整实现，只保留定制 UI 和补充缺失交互。**

核心原则：
- **不再手写 `dragstart` 逻辑** → 依赖 BlockProvider 自动注册的官方 handler
- 我们只负责 DOM 外观 + B1（单击选中）+ B4（drop indicator）

### 2.2 变更清单

#### 变更 1：删除加号按钮（需求变更）

- 删除 `addIcon` 常量
- 删除 `createBlockHandle` 中构建 `addBtn` 的所有代码
- 删除 `configureBlock` 中针对 `.milkdown-block-add` 的 mousedown 监听
- 手柄 DOM 只保留六点拖拽按钮

#### 变更 2：删除自写的 dragstart / dragend（修复 B3 根因）

- 删除 `dragBtn.addEventListener('dragstart', ...)` 整段（第 111-155 行）
- 删除 `dragBtn.addEventListener('dragend', ...)` 整段（第 157-163 行）
- 删除未再使用的 `NodeSelection`、`TextSelection` import
- **保留**：在 BlockProvider 构造前，不要手动设置 `draggable='true'`（官方会设 `this.#element.draggable = true`，我们设在按钮上反而分离了 draggable 目标 —— 需要核实：官方设在 wrapper 上，所以按钮的 draggable 可删除）

#### 变更 3：实现 B1 单击选中整个块

由于官方已经在 mousedown 阶段构造了 `#activeSelection`，但不会 dispatch。我们需要：

```ts
handleEl.addEventListener('click', (e) => {
  if (!currentView || !blockProvider) return;
  const active = blockProvider.active;
  if (!active) return;
  const { $pos, node } = active;
  const nodeFrom = $pos.before($pos.depth);
  const { state, dispatch } = currentView;
  dispatch(state.tr.setSelection(NodeSelection.create(state.doc, nodeFrom)));
  currentView.focus();
});
```

**关键：必须区分 "click" 和 "drag"**。策略：
- 监听 `mousedown` 记录起点坐标和时间
- 监听 `mouseup` 时，若未发生 drag（`dragstart` 未触发）且移动距离 < 5px，执行选中逻辑
- 用一个 `draggedFlag`：`dragstart` 时置 true，下一个 `mouseup` 若为 true 则不触发 click 选中

#### 变更 4：实现 B4 drop indicator

**设计**：
- 监听全局 `dragover`（委托在 `view.dom` 上），根据鼠标 Y 坐标计算最近的块边界
- 在 editor-root 层插入一个 `position: absolute`（不是 `fixed`）的 `.milkdown-drop-indicator` 元素
- 仅在 `view.dragging` 非空（即官方拖拽进行中）时显示
- `drop`/`dragend` 时隐藏

**实现要点**：
```ts
// 在 configureBlock 中：
const indicator = document.createElement('div');
indicator.className = 'milkdown-drop-indicator';
// 挂到 editor-root 或 body

function updateIndicator(view: EditorView, event: DragEvent) {
  if (!view.dragging) { hideIndicator(); return; }
  const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!pos) return;
  // 找到 pos 所在的顶层块边界
  const $pos = view.state.doc.resolve(pos.pos);
  const depth = 1; // 顶层块
  const blockStart = $pos.before(depth);
  const blockEnd = $pos.after(depth);
  const startCoords = view.coordsAtPos(blockStart);
  const endCoords = view.coordsAtPos(blockEnd - 1);
  // 判断插入在块前还是块后
  const midY = (startCoords.top + endCoords.bottom) / 2;
  const insertTop = event.clientY < midY ? startCoords.top : endCoords.bottom;
  // 显示指示线...
}

// 注册到 view.dom
view.dom.addEventListener('dragover', (e) => updateIndicator(view, e));
view.dom.addEventListener('drop', hideIndicator);
view.dom.addEventListener('dragend', hideIndicator, true);
```

**风险**：`dragover` 事件频率高，需用 rAF 节流。

#### 变更 5：清理 CSS

- `.milkdown-drop-indicator` 目前是 `position: fixed`，若我们按"相对 editor-root 定位"的方案实现，应改为 `position: absolute`
- 移除 `.milkdown-block-add` 相关的 hover 样式（hover 变 accent 色）

### 2.3 结构调整

根据项目规范 "单文件插件可以继续用单文件"，本次修改后插件仍只有 1 个文件，**不需要拆分为目录结构**。但新增逻辑较多，建议内部按以下分节组织：

```
block-handle.ts
├── 图标常量
├── DOM 构建（只保留 drag 按钮）
├── Drop indicator 模块
├── Click vs Drag 区分逻辑
└── configureBlock 主函数
```

---

## 三、修复前检查点（systematic-debugging 纪律）

**在动手修改代码之前，必须先执行以下验证步骤**，以便将信心水平从 90% 提升到 99%：

### 根因陈述
> 自写的 `dragstart` handler 与 Milkdown `BlockService` 内部 dragstart handler 冲突，导致 `view.dragging` 未被正确设置，ProseMirror drop 流程无 slice 可插入，文档不变化。

### 证据来源
- `node_modules/@milkdown/plugin-block/lib/index.js:66-70`：BlockService 自动注册 dragstart
- `node_modules/@milkdown/plugin-block/lib/index.js:188-206`：官方 dragstart 设置 `view.dragging`
- `node_modules/@milkdown/plugin-block/lib/index.js:256`：drop handler 依赖 ProseMirror 原生流程（即依赖 `view.dragging`）

### 信心水平
**90%** —— 存在一个未验证的可能性：官方和我们两个 dragstart 可能按注册顺序执行，若官方先跑完，设置好 `view.dragging`，我们的只是"多设置一次 dataTransfer"，那根因可能是其他点（比如 `setData('text/plain', '')` 覆盖了官方写入的文本）。

### 验证方案（修复前必做）

在实施修复**之前**，先在 `dragstart` handler 里加一段诊断日志并请用户复现：

```ts
dragBtn.addEventListener('dragstart', (e) => {
  console.log('[BlockHandle] my dragstart fired');
  console.log('[BlockHandle] view.dragging before:', (currentView as any)?.dragging);
  console.log('[BlockHandle] dataTransfer types:', Array.from(e.dataTransfer?.types ?? []));
  // ... 原有代码
  setTimeout(() => {
    console.log('[BlockHandle] view.dragging after microtask:', (currentView as any)?.dragging);
  }, 0);
});

// 同时在 view.dom 上监听 drop 做观测
view.dom.addEventListener('drop', () => {
  console.log('[BlockHandle] drop fired, view.dragging:', (currentView as any)?.dragging);
}, true);
```

**预期分支**：
- **分支 A**：若拖拽时 `view.dragging` 始终为 null → 根因确认为"官方 dragstart 未能设置，因我们抢占事件/stopPropagation" → 按方案 2.2 修复（删除自写 handler）
- **分支 B**：若 `view.dragging` 有值但 drop 不生效 → 根因在别处（可能是 drop 事件冒泡被阻止、或 editor 容器覆盖了 drop）→ 需进一步调查

### 修改范围
**仅限** `src/editor/plugins/block-handle.ts` 和 `src/styles/editor/block-handle.css` 两个文件。

---

## 四、实施步骤（用户确认后执行）

1. **Step 1（诊断）**：加入诊断日志，请用户复现拖拽操作并反馈 console 输出
2. **Step 2（根据诊断结果）**：
   - 若为分支 A：按方案 2.2 删除自写 dragstart/dragend + 删除加号按钮 + 删除冗余 imports
   - 若为分支 B：重新分析
3. **Step 3**：实现 B1 单击选中（click vs drag 区分）
4. **Step 4**：实现 B4 drop indicator
5. **Step 5**：清理 CSS 冗余样式
6. **Step 6**：用户验证：
   - [ ] 拖拽手柄能把块移到其他位置
   - [ ] 单击手柄选中整个块（蓝色高亮）
   - [ ] 拖拽过程中显示蓝色横线指示落点
   - [ ] 加号按钮消失
   - [ ] hover editor 区域时手柄淡显

---

## 五、验收标准

| 验收项 | 预期 |
|--------|------|
| 加号按钮 | 不再出现 |
| 单击拖拽手柄 | 当前块被选中（NodeSelection，整块变蓝） |
| 拖拽手柄移动块 | 块被移动到落点位置，文档 Markdown 结构正确更新 |
| 拖拽中 | 出现蓝色横线指示目标插入位置 |
| 释放到原位 | 不做任何变更（官方行为） |
| Undo | 一次 Ctrl+Z 能撤销拖拽 |
| 多次连续拖拽 | 稳定工作，无 DOM 残留 |

---

## 六、不做事项（明确边界）

- ✗ 不实现块操作菜单（删除/复制/转换类型）
- ✗ 不实现键盘快捷键
- ✗ 不实现嵌套拖拽（拖入列表/引用内部）
- ✗ 不实现 hover 整块高亮
- ✗ 不修改 Milkdown 官方代码或 monkey-patch


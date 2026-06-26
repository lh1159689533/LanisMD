# Math Inline 内联数学公式优化方案

> 创建日期：2026-04-14
> 状态：待实施

## 一、问题清单

### 问题 1: 先输入 `$$` 再在中间输入内容无法识别

**现象**：用户必须依次输入 `$lim$` 才能触发 InputRule；如果先输入 `$$`，再把光标移到中间输入内容，公式无法被识别。

**根因**：当前 InputRule 的正则 `/(?:^|[^$\\])\$([^$\s][^$]*[^$\s])\$$/` 只能匹配 **末尾字符为 `$`** 的输入序列。先输入 `$$` 再在中间填写内容时，最后输入的字符不是 `$`，InputRule 永远不会触发。这是 ProseMirror InputRule 的固有限制——它只在每次文本输入后检查光标所在行的末尾文本。

### 问题 2: 手动输入 `$lim$` 渲染正确，但需要再次点击才能进入编辑

**现象**：通过 InputRule 触发后，公式正确渲染为预览态，但用户想修改时需要额外点击一次。

**根因**：InputRule 触发后创建的 `math_inline` 节点默认处于预览态（`editing = false`），事务只执行了 `replaceWith`，没有设置光标进入节点内部。需要再次点击才能触发 `mousedown` 进入编辑态。

**判定**：这实际上 **是预期行为**——Typora 也是输入完成后公式进入预览态，用户继续向后输入。但需要确保点击后能顺畅进入编辑态。

### 问题 3: 公式删除后占位提示 `$□$` 还在

**现象**：删除公式内容后，节点变成空公式，显示 `$□$` 占位符，但不会被自动清除。

**根因**：`exitEdit()` 中有删除空节点的逻辑，但只在退出编辑态时检查。以下场景不会触发清除：
1. 用户在预览态直接按 Backspace 删除——此时不走 `exitEdit()`
2. 用户在编辑态清空内容后，`deselectNode` 没有被调用（见问题 5），`exitEdit()` 不执行

### 问题 4: 换行后显示 `$\square$` 源码而不是渲染公式

**现象**：在公式后按 Enter 换行时，公式显示异常，出现 `$\square$` 字面文本。

**根因**：`renderPreview()` 方法第 201 行：
```typescript
this.renderContainer.innerHTML = `<span class="${CSS_PREFIX}-empty">$\\square$</span>`;
```
这里 `$\\square$` 是作为 **HTML 文本** 插入的，浏览器直接显示为 `$\square$`，而不是经过 KaTeX 渲染。ProseMirror 在分割段落时可能导致节点内容被清空，触发此占位显示。

### 问题 5: 光标移走后，预览气泡未隐藏

**现象**：光标已离开公式节点，但编辑态的预览气泡仍然可见。

**根因**：`exitEdit()` 依赖 `deselectNode()` 回调。但当前 Schema 定义为 `atom: false`，ProseMirror **不会自动调用** `selectNode/deselectNode`——这些回调仅对 `atom: true` 的节点生效。光标移走时没有任何机制通知 NodeView 退出编辑态。

---

## 二、Typora 交互调研结论

### Typora 内联数学公式的核心交互流程

1. **输入触发**：用户输入 `$`，Typora 自动补全为 `$$`，光标定位在两个 `$` 之间，**直接进入编辑态**
2. **编辑态**：显示 `$` 左右定界符 + LaTeX 源码编辑区 + 下方实时预览气泡
3. **退出编辑**：光标移出节点（方向键 Left/Right 移出边界、点击外部区域、Esc 键）后，自动切换为预览态（只显示 KaTeX 渲染后的公式）
4. **重新进入编辑**：点击渲染后的公式，自动进入编辑态，显示源码 + 预览气泡
5. **空公式处理**：退出编辑时如果公式内容为空，自动删除整个节点
6. **Backspace 行为**：在公式左边界按 Backspace 不是删除节点，而是进入编辑态

### 关键交互差异对比

| 交互点 | Typora 行为 | 当前实现 | 需要修改 |
|--------|------------|---------|---------|
| 输入 `$` | 自动补全 `$$`，光标在中间，进入编辑态 | 无此功能，只有 `$text$` 的 InputRule | **是** |
| 光标离开节点 | 自动退出编辑、隐藏气泡 | 依赖 `deselectNode` 但 `atom:false` 不触发 | **是** |
| 退出时空公式 | 自动删除空节点 | 只在 `exitEdit()` 中检查，覆盖不全 | **是** |
| 空公式占位 | 无占位（空则删除） | `$\square$` 文本未经 KaTeX 渲染 | **是** |
| Backspace 进入编辑 | 在公式左侧按 Backspace 进入编辑 | 无此行为 | **是** |
| 方向键穿过公式 | 左右方向键可穿越，到达边界时自动进入/退出编辑 | 无此行为 | **可选** |

### prosemirror-math 的最佳实践参考

`prosemirror-math` 是 ProseMirror 社区最成熟的数学公式实现，其架构选择：

1. **`atom: true`** —— 确保 `selectNode/deselectNode` 被正确调用
2. **`content: "text*"` + 无 `contentDOM`** —— NodeView 自己管理编辑区的输入
3. **自定义 Backspace 命令** —— 光标在公式左侧按 Backspace 进入编辑而不是删除
4. **Selection 监听 Plugin** —— 监听 transaction 变化检测光标是否在节点内部

---

## 三、核心架构变更

### 方案核心：`atom: false` -> `atom: true`，内容从 `content` 改为 `attrs`

**当前架构**（有问题）：
```
Schema: atom: false, content: "text*"
NodeView: 有 contentDOM，ProseMirror 管理编辑区
触发: selectNode/deselectNode 不被调用
```

**目标架构**：
```
Schema: atom: true, attrs: { value: '' }
NodeView: 无 contentDOM，自己用 <input> 或 contenteditable span 管理编辑
触发: selectNode/deselectNode 被正确调用 + selection 监听 Plugin 兜底
```

### 变更影响分析

| 影响项 | 说明 | 处理方式 |
|--------|------|---------|
| Schema 定义 | `content: "text*"` -> `attrs: { value: '' }` | 修改 `index.ts` |
| Remark 插件 | 解析/序列化数据流变化 | 修改 `index.ts` 的 parseMarkdown/toMarkdown |
| NodeView | 完全重写，不再有 `contentDOM` | 重写 `node-view.ts` |
| InputRule | 改为输入 `$` 自动创建空节点并进入编辑 | 修改 `index.ts` |
| CSS | 需适配新的 DOM 结构 | 修改 `math.css` |
| editor-setup | 需注册新的 selection 监听 Plugin | 修改 `editor-setup.ts` |

---

## 四、详细实现设计

### 4.1 Schema 变更（`index.ts`）

```typescript
// 变更前
export const mathInlineSchema = $nodeSchema('math_inline', () => ({
  group: 'inline',
  inline: true,
  content: 'text*',    // ProseMirror 管理内容
  marks: '',
  atom: false,          // 不触发 selectNode/deselectNode
  // ...
}));

// 变更后
export const mathInlineSchema = $nodeSchema('math_inline', () => ({
  group: 'inline',
  inline: true,
  atom: true,           // 触发 selectNode/deselectNode
  attrs: {
    value: { default: '' },  // LaTeX 源码存在 attrs 中
  },
  // 无 content，无 contentDOM
  // ...
}));
```

### 4.2 Remark 插件变更（`index.ts`）

#### parseMarkdown

```typescript
// 变更前：打开节点，添加文本子节点
parseMarkdown: {
  match: (node) => node.type === 'math_inline',
  runner: (state, node, nodeType) => {
    const textContent = node.children?.map(c => c.value ?? '').join('') ?? '';
    state.openNode(nodeType);
    if (textContent) state.addText(textContent);
    state.closeNode();
  },
},

// 变更后：直接创建带 attrs 的 atom 节点
parseMarkdown: {
  match: (node) => node.type === 'math_inline',
  runner: (state, node, nodeType) => {
    const value = node.children?.map(c => c.value ?? '').join('') ?? '';
    state.addNode(nodeType, { value });
  },
},
```

#### toMarkdown

```typescript
// 变更前：从 textContent 取值
toMarkdown: {
  match: (node) => node.type.name === 'math_inline',
  runner: (state, node) => {
    state.addNode('math_inline', undefined, undefined, {
      children: [{ type: 'text', value: node.textContent }],
    });
  },
},

// 变更后：从 attrs.value 取值
toMarkdown: {
  match: (node) => node.type.name === 'math_inline',
  runner: (state, node) => {
    state.addNode('math_inline', undefined, undefined, {
      children: [{ type: 'text', value: node.attrs.value }],
    });
  },
},
```

#### toMarkdown handler（remarkMathInline）

```typescript
// 变更前
math_inline(node: any) {
  const value = node.children?.map(c => c.value ?? '').join('') ?? node.value ?? '';
  return `$${value}$`;
},

// 无需变更，逻辑不变
```

### 4.3 InputRule 变更（`index.ts`）

替换原来的 `$text$` 匹配规则，改为输入单个 `$` 时自动创建空的 `math_inline` 节点：

```typescript
export const mathInlineInputRulePlugin = $prose((ctx) => {
  const mathInlineType = ctx.get(mathInlineSchema.node);

  // 规则 1: 输入 $ 自动创建空 math_inline 节点
  const dollarRule = new InputRule(
    /\$$/,  // 匹配行尾输入的 $
    (state, _match, start, end) => {
      // 排除 $$（块级公式）的触发，检查前一个字符是否也是 $
      const before = state.doc.textBetween(Math.max(0, start - 1), start, '\0');
      if (before === '$') return null;

      // 创建空的 math_inline 节点
      const mathNode = mathInlineType.create({ value: '' });
      const tr = state.tr.replaceWith(start, end, mathNode);

      // 将光标定位到新节点上（触发 selectNode -> 进入编辑态）
      const resolvedPos = tr.doc.resolve(start);
      tr.setSelection(
        NodeSelection.create(tr.doc, resolvedPos.pos)
      );

      return tr;
    },
  );

  // 规则 2: 保留 $text$ 的完整匹配（从 Markdown 粘贴或快速输入场景）
  const fullRule = new InputRule(
    /(?:^|[^$\\])\$([^$\s][^$]*[^$\s])\$$/,
    (state, match, start, end) => {
      const formulaText = match[1];
      if (!formulaText?.trim()) return null;

      const fullMatch = match[0];
      const prefixLen = fullMatch.length - formulaText.length - 2;
      const nodeStart = start + prefixLen;

      const mathNode = mathInlineType.create({ value: formulaText });
      return state.tr.replaceWith(nodeStart, end, mathNode);
    },
  );

  return inputRules({ rules: [fullRule, dollarRule] });
});
```

**注意**：`dollarRule` 必须放在 `fullRule` 后面，这样 `$text$` 的完整匹配会优先触发。

### 4.4 NodeView 重写（`node-view.ts`）

#### 核心变化

- **去掉 `contentDOM`**：不再让 ProseMirror 管理编辑区内容
- **使用 `<input>` 元素**：作为 LaTeX 源码的编辑区
- **通过 `setNodeMarkup` 更新 `attrs.value`**：编辑区内容变化时同步到 ProseMirror 文档

#### DOM 结构

```
<span class="lanismd-math-inline" data-type="math-inline">
  <!-- 预览态（默认显示） -->
  <span class="lanismd-math-inline-render">
    [KaTeX 渲染结果]
  </span>

  <!-- 编辑态（默认隐藏） -->
  <span class="lanismd-math-inline-edit">
    <span class="lanismd-math-inline-delimiter">$</span>
    <input class="lanismd-math-inline-input"
           type="text"
           spellcheck="false" />
    <span class="lanismd-math-inline-delimiter">$</span>

    <!-- 实时预览气泡 -->
    <span class="lanismd-math-inline-preview-bubble">
      [KaTeX 实时预览]
    </span>
  </span>
</span>
```

#### 关键方法设计

```typescript
export class MathInlineNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM: undefined;  // 明确无 contentDOM

  private inputEl: HTMLInputElement;  // 替代原来的 contentDOM
  private renderContainer: HTMLElement;
  private editContainer: HTMLElement;
  private previewBubble: HTMLElement;
  private editing = false;
  private node: Node;
  private view: EditorView;
  private getPos: () => number | undefined;

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    // ... 创建 DOM 结构 ...
    // 使用 <input> 替代 contentDOM
    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = `${CSS_PREFIX}-input`;
    this.inputEl.spellcheck = false;
    this.inputEl.value = node.attrs.value;

    // 监听 input 事件，同步值到 ProseMirror
    this.inputEl.addEventListener('input', () => this.onInputChange());

    // 监听键盘事件
    this.inputEl.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  /** 输入变化时同步到 ProseMirror 文档 */
  private onInputChange(): void {
    const pos = this.getPos();
    if (pos === undefined) return;

    const value = this.inputEl.value;
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
      ...this.node.attrs,
      value,
    });
    this.view.dispatch(tr);

    // 更新预览气泡
    this.debouncedUpdatePreview();
  }

  /** 键盘事件处理 */
  private onKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.exitEdit();
        // 光标移到节点后方
        this.moveCursorAfterNode();
        break;

      case 'ArrowRight':
        // 光标在 input 末尾时，移到节点后方
        if (this.inputEl.selectionStart === this.inputEl.value.length) {
          e.preventDefault();
          this.exitEdit();
          this.moveCursorAfterNode();
        }
        break;

      case 'ArrowLeft':
        // 光标在 input 开头时，移到节点前方
        if (this.inputEl.selectionStart === 0) {
          e.preventDefault();
          this.exitEdit();
          this.moveCursorBeforeNode();
        }
        break;

      case 'Enter':
        // Enter 退出编辑，等同于 Esc
        e.preventDefault();
        this.exitEdit();
        this.moveCursorAfterNode();
        break;

      case 'Backspace':
        // input 为空时按 Backspace，删除节点
        if (this.inputEl.value === '') {
          e.preventDefault();
          this.deleteNode();
        }
        break;
    }
  }

  /** 进入编辑模式 */
  enterEdit(): void {
    if (this.editing) return;
    this.editing = true;
    this.dom.classList.add('is-editing');
    this.renderContainer.style.display = 'none';
    this.editContainer.style.display = '';
    this.inputEl.value = this.node.attrs.value;
    this.updatePreviewBubble();

    // 聚焦 input，光标放到末尾
    requestAnimationFrame(() => {
      this.inputEl.focus();
      this.inputEl.setSelectionRange(
        this.inputEl.value.length,
        this.inputEl.value.length
      );
    });
  }

  /** 退出编辑模式 */
  exitEdit(): void {
    if (!this.editing) return;
    this.editing = false;
    this.dom.classList.remove('is-editing');
    this.renderContainer.style.display = '';
    this.editContainer.style.display = 'none';
    this.renderPreview();

    // 空公式自动删除
    if (!this.node.attrs.value.trim()) {
      this.deleteNode();
    }
  }

  // --- ProseMirror NodeView 接口 ---

  /** 节点更新 */
  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    if (this.editing) {
      // 避免循环更新：只有值不同时才更新 input
      if (this.inputEl.value !== node.attrs.value) {
        this.inputEl.value = node.attrs.value;
      }
      this.debouncedUpdatePreview();
    } else {
      this.renderPreview();
    }
    return true;
  }

  /** 选中节点（atom:true 时会被调用） */
  selectNode(): void {
    this.dom.classList.add('is-selected');
    this.enterEdit();
  }

  /** 取消选中（atom:true 时会被调用） */
  deselectNode(): void {
    this.dom.classList.remove('is-selected');
    this.exitEdit();
  }

  /** 拦截事件 */
  stopEvent(event: Event): boolean {
    // 编辑态下拦截所有键盘和输入事件，由 input 自己处理
    if (this.editing) {
      if (event instanceof KeyboardEvent || event instanceof InputEvent) {
        return true;
      }
    }
    // 预览态拦截鼠标事件（由 click handler 处理进入编辑）
    if (event.type === 'mousedown') return true;
    return false;
  }

  /** 忽略 DOM 变更 */
  ignoreMutation(): boolean {
    return true;  // atom:true，所有 DOM 变更由我们自己管理
  }
}
```

### 4.5 Selection 监听 Plugin（新文件 `selection-plugin.ts`）

作为 `deselectNode` 的补充保障，监听 selection 变化以确保光标离开节点时退出编辑：

```typescript
/**
 * Math Inline - Selection 监听插件
 *
 * 监听 ProseMirror selection 变化，当光标离开 math_inline 节点时，
 * 确保节点退出编辑态（作为 deselectNode 的兜底机制）
 */
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';

export const mathInlineSelectionPluginKey = new PluginKey('mathInlineSelection');

export function createMathInlineSelectionPlugin() {
  return new Plugin({
    key: mathInlineSelectionPluginKey,
    view() {
      return {
        update(view) {
          const { selection } = view.state;
          const { from, to } = selection;

          // 遍历所有 math_inline NodeView，检查是否需要退出编辑
          view.state.doc.descendants((node, pos) => {
            if (node.type.name !== 'math_inline') return;
            const nodeEnd = pos + node.nodeSize;

            // 如果 selection 不在此节点范围内，通知退出编辑
            if (from < pos || from > nodeEnd || to < pos || to > nodeEnd) {
              // 通过 DOM 查找对应的 NodeView 实例并调用 exitEdit
              const domNode = view.nodeDOM(pos);
              if (domNode instanceof HTMLElement) {
                const nodeView = domNode._mathInlineView;
                if (nodeView?.editing) {
                  nodeView.exitEdit();
                }
              }
            }
          });
        },
      };
    },
  });
}
```

**注意**：在 NodeView 构造函数中需要将 NodeView 实例挂载到 DOM 上：

```typescript
// 在 MathInlineNodeView 构造函数末尾
(this.dom as any)._mathInlineView = this;
```

### 4.6 Backspace 进入编辑的自定义命令

当光标在 `math_inline` 节点右边紧邻位置按 Backspace 时，不应该删除节点，而是进入编辑态：

```typescript
/**
 * 自定义 Backspace 命令
 * 光标在 math_inline 右边界时，按 Backspace 进入编辑而不是删除
 */
export function mathInlineBackspaceCmd(
  state: EditorState,
  dispatch?: (tr: Transaction) => void
): boolean {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return false;
  if (!selection.empty) return false;

  const { $from } = selection;
  // 检查光标前面是否紧邻 math_inline 节点
  const nodeBefore = $from.nodeBefore;
  if (!nodeBefore || nodeBefore.type.name !== 'math_inline') return false;

  if (dispatch) {
    // 选中该 math_inline 节点（触发 selectNode -> 进入编辑）
    const nodePos = $from.pos - nodeBefore.nodeSize;
    const tr = state.tr.setSelection(
      NodeSelection.create(state.doc, nodePos)
    );
    dispatch(tr);
  }
  return true;
}
```

在 editor-setup.ts 中注册此命令到 keymap：

```typescript
import { keymap } from '@milkdown/kit/prose/keymap';

// 在 Plugin 注册中
keymap({
  'Backspace': mathInlineBackspaceCmd,
})
```

**注意**：需要确保此 keymap 在 ProseMirror 默认 Backspace 之前注册（优先级更高）。

### 4.7 CSS 变更（`math.css`）

#### 变更 1: 将 `-source` 替换为 `-input` 的样式

```css
/* 变更前 */
.milkdown-editor-root .lanismd-math-inline-source {
  font-family: var(--lanismd-font-mono);
  font-size: 0.9em;
  /* ... */
}

/* 变更后：改为 <input> 元素的样式 */
.milkdown-editor-root .lanismd-math-inline-input {
  font-family: var(--lanismd-font-mono);
  font-size: 0.9em;
  color: var(--lanismd-text-color);
  background: transparent;
  border: none;
  outline: none;
  padding: 0;
  margin: 0;
  min-width: 2ch;
  /* input 宽度自适应内容 */
  width: auto;
  /* 使 input 在 inline 布局中正确显示 */
  display: inline;
  vertical-align: baseline;
  line-height: inherit;
}

/* input 的 placeholder 样式 */
.milkdown-editor-root .lanismd-math-inline-input::placeholder {
  color: var(--lanismd-text-muted, #94a3b8);
  font-style: italic;
}
```

#### 变更 2: 移除空公式占位样式（不再需要）

```css
/* 删除以下样式块 */
/* .milkdown-editor-root .lanismd-math-inline-empty { ... } */
```

空公式的场景不再出现，因为退出编辑时空公式会自动删除。

---

## 五、文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/editor/plugins/math-inline/index.ts` | 修改 | Schema attrs 化、Remark 插件适配、InputRule 重写 |
| `src/editor/plugins/math-inline/node-view.ts` | **重写** | 去掉 contentDOM，用 input 元素管理编辑、键盘事件处理 |
| `src/editor/plugins/math-inline/types.ts` | 微调 | 可能新增常量/类型 |
| `src/editor/plugins/math-inline/selection-plugin.ts` | **新建** | Selection 监听插件 |
| `src/editor/plugins/math-inline/backspace-cmd.ts` | **新建** | Backspace 进入编辑的自定义命令 |
| `src/styles/editor/math.css` | 修改 | 适配新的 DOM 结构（input 替代 contentDOM span） |
| `src/editor/editor-setup.ts` | 修改 | 注册 selection 监听 Plugin 和 Backspace keymap |

---

## 六、问题与方案映射

| # | 问题 | 修复方式 | 涉及文件 |
|---|------|---------|---------|
| 1 | 先输入 `$$` 再填内容无法识别 | 输入 `$` 自动创建空节点进入编辑态 | `index.ts`（InputRule） |
| 2 | InputRule 触发后需要二次点击 | 预期行为，但点击进入编辑态的流程保持顺畅 | `node-view.ts` |
| 3 | 公式删除后占位还在 | `exitEdit()` 自动删除空节点 + Backspace 空 input 直接删除节点 | `node-view.ts` |
| 4 | 换行显示 `$\square$` 源码 | 去掉空公式占位逻辑（空则删除），不再出现此场景 | `node-view.ts`, `math.css` |
| 5 | 光标移走气泡未隐藏 | `atom:true` + `deselectNode` 正确触发 + selection Plugin 兜底 | `index.ts`, `node-view.ts`, `selection-plugin.ts` |

---

## 七、实施步骤

### Phase 1: Schema 和 Remark 适配

1. 修改 `mathInlineSchema`：`atom: true`，添加 `attrs: { value: '' }`，去掉 `content: 'text*'`
2. 修改 `parseMarkdown`：用 `state.addNode(nodeType, { value })` 替代 open/close
3. 修改 `toMarkdown`：从 `node.attrs.value` 取值
4. 修改 `remarkMathInlinePlugin`：remark AST 到 ProseMirror 的转换适配

### Phase 2: NodeView 重写

1. 去掉 `contentDOM`，创建 `<input>` 元素作为编辑区
2. 实现 `onInputChange()`：通过 `setNodeMarkup` 同步值到文档
3. 实现 `onKeyDown()`：处理 Escape、Enter、ArrowLeft/Right、Backspace
4. 实现 `enterEdit()` / `exitEdit()`：状态切换 + 空公式自动删除
5. 实现 `selectNode()` / `deselectNode()`：进入/退出编辑态
6. 实现 `stopEvent()`：编辑态拦截键盘事件
7. 实现 `ignoreMutation()`：全部返回 true

### Phase 3: InputRule 重写

1. 新增 `$` 触发规则：创建空 `math_inline` 节点 + NodeSelection
2. 保留 `$text$` 完整匹配规则：兼容粘贴和快速输入
3. 确保两个规则的优先级正确

### Phase 4: 辅助 Plugin

1. 新建 `selection-plugin.ts`：监听 selection 变化，兜底退出编辑
2. 新建 `backspace-cmd.ts`：Backspace 进入编辑而不是删除
3. 在 `editor-setup.ts` 中注册新 Plugin 和 keymap

### Phase 5: CSS 适配

1. 将 `-source` 样式替换为 `-input` 样式
2. 删除 `-empty` 占位样式
3. 确保 `<input>` 在 inline 布局中正确显示和自适应宽度

### Phase 6: 测试验证

1. **输入 `$` 测试**：自动创建节点、进入编辑态、光标在 input 中
2. **输入 `$lim$` 测试**：InputRule 触发、渲染为预览态
3. **编辑态交互**：输入 LaTeX、实时预览气泡更新
4. **退出编辑**：Esc/Enter/方向键移出/点击外部 -> 预览态、气泡隐藏
5. **空公式删除**：清空内容退出 -> 节点被删除
6. **Backspace**：在公式右侧按 Backspace -> 进入编辑态
7. **光标移走**：气泡正确隐藏
8. **Markdown 往返**：打开含公式的 .md 文件，编辑后保存，检查格式正确

---

## 八、注意事项和风险

### `<input>` 宽度自适应

HTML `<input>` 没有内容自适应宽度的原生支持。需要用 JS 动态计算：

```typescript
private adjustInputWidth(): void {
  // 使用一个隐藏的 span 测量文本宽度
  const measurer = document.createElement('span');
  measurer.style.cssText =
    'position:absolute;visibility:hidden;white-space:pre;' +
    `font:${getComputedStyle(this.inputEl).font}`;
  measurer.textContent = this.inputEl.value || this.inputEl.placeholder || ' ';
  document.body.appendChild(measurer);
  this.inputEl.style.width = `${measurer.offsetWidth + 4}px`;
  document.body.removeChild(measurer);
}
```

每次 `onInputChange()` 和 `enterEdit()` 时调用。

### 替代方案：使用 `contenteditable span`

如果 `<input>` 的宽度自适应、光标定位等问题过于复杂，可以考虑使用 `<span contenteditable="true">` 作为替代。这样：
- 天然支持内容自适应宽度
- 支持内部选区（多字符选择、光标定位）
- 但需要额外处理 `input` 事件和防止 ProseMirror 接管编辑

**建议**：先尝试 `<input>` 方案（实现更简单、行为更可控），如果遇到问题再切换到 `contenteditable span`。

### Undo/Redo 兼容性

`atom: true` + `setNodeMarkup` 的方式，每次 `onInputChange()` 都会创建一个 transaction，Undo 时会逐字符回退。可以考虑：
- 在 `exitEdit()` 时才一次性提交变更（减少 history 条目）
- 或使用 `appendTransaction` 合并连续的 `setNodeMarkup` 操作

### 与 math-block（块级公式）的关系

块级公式 `$$...$$` 使用独立的插件（`math-block`），此次优化不涉及。但需注意 InputRule 中排除 `$$` 触发的逻辑，避免与块级公式的 InputRule 冲突。

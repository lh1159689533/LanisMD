# 单实例编辑器优化方案

> 目标：将 Milkdown 编辑器从"每次切换文件都 destroy/create"改为"单实例 + 内容替换"，  
> 消除切换文件时 ~800ms 的创建延迟。

---

## 1. 问题现状

### 1.1 当前流程

```
切换文件 → useEffect 触发 cleanup
  → editorRef.current.destroy()
  → createEditor(root, newContent)
  → editor.create()          // 同步组装 70+ 插件 Schema/State ~800ms
  → setupEditorListeners()
  → 恢复光标/滚动位置
```

**每次切换文件都要承受 ~800ms 的 `.create()` 开销**。

### 1.2 瓶颈分析

- `.create()` 的核心工作是：解析所有插件 → 合并 Schema → 创建 ProseMirror EditorState → 创建 EditorView → 挂载到 DOM
- 其中 Schema 和插件集在不同文件间完全相同（所有文件共享一套编辑器能力）
- 唯一变化的是「文档内容」和「编辑历史」

---

## 2. 方案概述

### 核心思路

> **编辑器只创建一次，切换文件时只替换 EditorState（文档 + 历史）**

```
首次加载:
  createEditor(root, firstFileContent) → .create()  → ~800ms（仅此一次）

切换文件:
  view.updateState(newEditorState)                   → <50ms
```

### 技术依据

| 来源 | 结论 |
|------|------|
| ProseMirror 官方论坛 (marijn) | `view.updateState(EditorState.create({...}))` 是重置文档+历史的推荐方式 |
| Milkdown ProseMirror API 文档 | 通过 `ctx.get(editorViewCtx)` 可获取底层 EditorView |
| Milkdown FAQ | `replaceAll` 用于内容替换但保留 undo 历史 |

**选择 `view.updateState()` 而非 `replaceAll` 的原因**：
- 切换到不同文件时，不应保留旧文件的 undo 历史
- `updateState` 创建全新 State，history 插件状态自动重置
- `replaceAll` 会把新旧内容之间的差异记入 undo 栈（不符合预期）

---

## 3. 详细设计

### 3.1 新增 `switchDocument` 函数

**位置**: `src/editor/editor-setup.ts`

```typescript
import { editorViewCtx, parserCtx } from '@milkdown/kit/core';
import { EditorState } from '@milkdown/kit/prose/state';
import type { Editor } from '@milkdown/kit/core';

/**
 * 切换文档内容（不销毁/重建编辑器实例）
 *
 * 原理：创建全新的 EditorState（含新文档 + 空 undo 历史），
 * 通过 view.updateState() 替换，ProseMirror 会 diff 新旧 DOM 做最小更新。
 */
export function switchDocument(editor: Editor, newMarkdown: string): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const parser = ctx.get(parserCtx);

    // 1. 将 markdown 解析为 ProseMirror doc
    const doc = parser(newMarkdown);

    // 2. 创建全新的 EditorState（复用当前插件集，重置 history）
    const newState = EditorState.create({
      doc,
      plugins: view.state.plugins, // 包含 history、keymap、inputRules 等
    });

    // 3. 替换 EditorView 的 State
    view.updateState(newState);

    // 4. 触发一次空事务，让 listener 插件感知新文档
    //    （updateState 不走 dispatchTransaction，listener 不会自动回调）
    view.dispatch(view.state.tr);
  });
}
```

### 3.2 改造 `use-editor.ts`

**核心变更**：将 `useEffect` 的依赖从 `[currentFileId, mode]` 拆分为两个独立 Effect：

#### Effect 1：编辑器实例生命周期（仅在挂载/卸载时执行）

```typescript
// 编辑器只创建一次（或在 mode 从 source 切回时重建）
useEffect(() => {
  const root = rootRef.current;
  if (!root || mode === 'source') return;

  const file = useFileStore.getState().currentFile;
  const content = file?.content ?? '';

  let cancelled = false;
  let destroyContextMenu: (() => void) | null = null;

  const editorInstance = createEditor(root, content);
  editorInstance.create().then((editor) => {
    if (cancelled) { editor.destroy(); return; }

    editorRef.current = editor;
    // ... 注册 listener、恢复光标等（与现有逻辑相同）
    readyFileIdRef.current = file?.id ?? null;
    forceUpdate((n) => n + 1);
  });

  return () => {
    cancelled = true;
    if (destroyContextMenu) destroyContextMenu();
    useEditorStore.getState().setWysiwygView(null);
    if (editorRef.current) {
      editorRef.current.destroy();
      editorRef.current = null;
    }
  };
}, [mode]); // 注意：不再依赖 currentFileId
```

#### Effect 2：文件切换时替换内容

```typescript
// 文件 ID 变化时，通过 updateState 切换文档（不重建编辑器）
useEffect(() => {
  const editor = editorRef.current;
  if (!editor || !currentFileId || mode === 'source') return;

  const file = useFileStore.getState().currentFile;
  if (!file) return;

  // 如果是首次创建（readyFileIdRef 已经匹配），跳过
  if (readyFileIdRef.current === currentFileId) return;

  // 1. 保存当前文件的光标/滚动状态（在切换前）
  saveCurrentViewState();

  // 2. 切换文档内容
  switchDocument(editor, file.content);

  // 3. 恢复目标文件的光标/滚动位置
  restoreViewState(editor, file);

  // 4. 更新 listener 闭包中的文件归属
  updateListenerFileBinding(file.id);

  // 5. 更新统计信息
  updateStats(file.content);

  // 6. 标记就绪
  readyFileIdRef.current = currentFileId;
  forceUpdate((n) => n + 1);
}, [currentFileId, mode]);
```

### 3.3 Listener 文件归属问题

**问题**：`onMarkdownUpdated` 闭包中捕获了 `file.id`，切换文件后闭包仍指向旧文件。

**解决方案**：改用 Ref 持有当前文件 ID

```typescript
const currentFileRef = useRef<string | null>(null);
currentFileRef.current = currentFileId;

const listeners: EditorListener = {
  onMarkdownUpdated: (markdown) => {
    const state = useFileStore.getState();
    // 使用 ref 而非闭包捕获的 file.id
    if (state.currentFile?.id === currentFileRef.current) {
      state.updateContent(markdown);
    }
    updateStats(markdown);
  },
};
```

### 3.4 保存/恢复 ViewState

利用现有的 `scroll-position-cache` 机制：

```typescript
function saveCurrentViewState() {
  const view = useEditorStore.getState().wysiwygView;
  if (!view) return;
  const file = useFileStore.getState().currentFile;
  if (!file?.filePath) return;

  const scrollContainer = findScrollContainer(view.dom.parentElement);
  const { anchor, head } = view.state.selection;

  saveViewState(file.filePath, {
    scrollTop: scrollContainer?.scrollTop ?? 0,
    cursorAnchor: anchor,
    cursorHead: head,
  });
}

function restoreViewState(editor: Editor, file: FileInfo) {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    if (!file.filePath) return;

    const cached = getViewState(file.filePath);
    requestAnimationFrame(() => {
      const scrollContainer = findScrollContainer(view.dom.parentElement);

      if (cached) {
        try {
          const docSize = view.state.doc.content.size;
          const anchor = Math.min(cached.cursorAnchor, docSize);
          const head = Math.min(cached.cursorHead, docSize);
          const selection = TextSelection.create(view.state.doc, anchor, head);
          view.dispatch(view.state.tr.setSelection(selection));
        } catch { /* 位置无效时忽略 */ }
        if (scrollContainer) scrollContainer.scrollTop = cached.scrollTop;
      } else {
        if (scrollContainer) scrollContainer.scrollTop = 0;
      }
    });
  });
}
```

---

## 4. 风险点与应对

| 风险 | 影响 | 应对策略 |
|------|------|---------|
| **Milkdown 内部 `editorStateCtx` 脱同步** | Milkdown 可能缓存 EditorState 引用，导致后续 action 读取到旧 State | 在 `switchDocument` 中同步更新 `ctx.set(editorStateCtx, newState)`；或验证 Milkdown 是否自动同步 |
| **Listener 插件不感知 `updateState`** | `markdownUpdated` 不会被触发（因为 `updateState` 不走 `dispatchTransaction`） | 在 `updateState` 后手动 `view.dispatch(view.state.tr)` 触发一次空事务 |
| **NodeView 实例生命周期** | 复杂 NodeView（mermaid-block、math-block 等）在文档变化时是否正确销毁/重建 | ProseMirror `updateState` 会做 DOM diff，与 `dispatch(tr)` 行为一致；需实测验证 |
| **`replaceAll` macro 内部逻辑** | 项目中搜索替换使用的 `handleReplaceAll` 是直接操作 `view.state.tr`，不依赖 Milkdown 的 `replaceAll` action | 无影响 |
| **空 dispatch 触发不必要的保存** | 切换文件后的空事务会触发 `markdownUpdated`，但内容未变 | 在 listener 中比较 `markdown === prevMarkdown` 跳过相同内容 |
| **首次创建时传空内容** | 如果 mount 时还没有 `currentFile`，编辑器可能以空文档创建 | 在 Effect 1 中等待 `currentFile` 存在后再创建；或创建后立即 `switchDocument` |

---

## 5. 需要验证的假设

在实现前需要通过实验确认：

1. **`view.updateState()` 后 Milkdown ctx 中的 `editorStateCtx` 是否自动更新？**
   - 如果 Milkdown 在 `view.dispatchTransaction` 中同步了 `editorStateCtx`，那么 `updateState` 绕过了这个同步
   - 需要检查 Milkdown 源码中 `editorStateCtx` 的更新时机

2. **NodeView 在 `updateState` 后的行为是否正常？**
   - 特别是 `mermaid-block`、`math-block`、`code-block` 这类有复杂渲染逻辑的 NodeView
   - ProseMirror 文档说 `updateState` 会调用 NodeView 的 `update` 方法做 diff

3. **`listenerCtx` 的 `markdownUpdated` 在 `updateState` 后是否能正常工作？**
   - 需要确认 listener 是挂在 `dispatchTransaction` 上还是有其他机制

---

## 6. 实现步骤

### Phase 1：基础改造（核心路径）

1. 在 `editor-setup.ts` 中新增 `switchDocument()` 函数
2. 改造 `use-editor.ts`：拆分为两个 Effect（实例生命周期 + 文件切换）
3. 将 listener 的文件归属改为 Ref 模式
4. 测试基本的文件切换功能

### Phase 2：状态同步完善

5. 验证并修复 `editorStateCtx` 同步问题
6. 确保 listener 在切换后正常工作（防止重复保存或丢失变更）
7. 处理切换文件后第一次空 dispatch 不触发错误保存

### Phase 3：边界场景

8. 处理从 source 模式切回 wysiwyg 时的重建逻辑
9. 处理当前文件被删除/重命名时的编辑器状态
10. 处理应用启动时尚无打开文件的初始状态
11. 骨架屏逻辑适配：首次创建仍显示骨架屏，后续切换无需骨架屏（<50ms 无感）

### Phase 4：验证与清理

12. 实测所有 NodeView（mermaid、math、code-block、image-block、front-matter）切换行为
13. 实测搜索高亮在切换后的表现
14. 实测沉浸式阅读模式切换
15. 移除不再需要的骨架屏相关代码（或简化为仅首次加载使用）

---

## 7. 预期收益

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 首次加载 | ~800ms（骨架屏覆盖） | ~800ms（不变） |
| 切换文件 | ~800ms（destroy + create） | **<50ms**（updateState） |
| DOM 操作 | 每次销毁重建整个 EditorView | 仅 diff 更新变化的 DOM 节点 |
| 插件实例 | 每次重新实例化所有插件 | 复用，仅 State 更新 |
| 骨架屏闪烁 | 每次切换都有骨架屏过渡 | 仅首次加载有骨架屏 |
| 内存 GC 压力 | 每次创建大量临时对象 | 大幅减少 |

---

## 8. 回退方案

如果验证阶段发现 `view.updateState()` 与 Milkdown 内部机制严重冲突（如 NodeView 不更新、ctx 无法同步等），可降级为：

**备选方案：使用 Milkdown 的 `replaceAll` + 手动重置 history**

```typescript
import { replaceAll, getMarkdown } from '@milkdown/kit/utils';

function switchDocumentFallback(editor: Editor, newMarkdown: string): void {
  // 使用 Milkdown 官方 API 替换内容
  editor.action(replaceAll(newMarkdown));

  // 然后手动清空 history（通过创建新的 history plugin state）
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    // 找到 history plugin 并重置其 state
    // ... 具体实现取决于 prosemirror-history 的内部结构
  });
}
```

这种方式兼容性更好（走 Milkdown 正常流程），但需要额外处理 undo 历史清理。

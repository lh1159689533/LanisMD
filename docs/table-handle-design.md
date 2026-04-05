# LanisMD 表格手柄完整改造方案

> 复刻 Notion 表格手柄交互体验的详细设计文档

## 目录

- [一、当前架构分析](#一当前架构分析)
- [二、Notion 六状态机规格](#二notion-六状态机规格)
- [三、实现方案架构](#三实现方案架构)
- [四、详细实现代码](#四详细实现代码)
- [五、实现优先级建议](#五实现优先级建议)

---

## 一、当前架构分析

### 1.1 Milkdown table-block 核心机制

通过分析 Milkdown 源码，发现其手柄状态管理机制：

1. **使用 `data-show` 属性**控制显示/隐藏（`"true"` / `"false"`）
2. **button-group** 也用 `data-show` 控制菜单显示
3. **没有原生的 `data-selected` 属性** — 需要通过 CSS 自行添加
4. **pointerMove 事件**直接切换 `data-show="true"` 显示手柄
5. **pointerLeave 事件** 200ms 后隐藏所有手柄

### 1.2 关键发现

Milkdown 源码中**没有"条状中间态"**的概念，它直接从隐藏跳到显示六点手柄。要实现 Notion 的效果，需要：

1. 引入新的状态属性 `data-state`
2. 修改 pointerMove 逻辑
3. 监听单元格选中事件
4. 实现状态机转换

### 1.3 Milkdown 源码关键片段

```javascript
// node_modules/@milkdown/components/lib/table-block/index.js

// 手柄显示逻辑
pointerMove: (item) => {
  const { $pos } = item;
  // 更新手柄位置和显示状态
  dragHandleRef.dataset.show = "true";
  buttonGroupRef.dataset.show = "false";
}

// 手柄隐藏逻辑
pointerLeave: () => {
  setTimeout(() => {
    dragHandleRef.dataset.show = "false";
  }, 200);
}
```

---

## 二、Notion 六状态机规格

### 2.1 状态图

```
┌─────────────────────────────────────────────────────────────────┐
│                     Notion 表格手柄状态机                        │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────┐
        ┌──────────►│ HIDDEN  │◄──────────┐
        │           └────┬────┘           │
        │                │                │
        │    pointerEnterCell             │ pointerLeaveTable
        │                │                │ clickOutside (from selected_no_menu)
        │                ▼                │
        │           ┌─────────┐           │
        │           │   BAR   │───────────┘
        │           └────┬────┘
        │                │
        │    pointerEnterHandle
        │                │
        │                ▼
        │           ┌─────────┐
        └───────────│  HOVER  │
   pointerLeaveHandle└────┬────┘
                         │
                    click│
                         │
                         ▼
                    ┌─────────┐
            ┌──────│SELECTED │◄─────┐
            │      └────┬────┘      │
            │           │           │
    clickOutside        │     click │
            │           │           │
            ▼           │           │
    ┌───────────────┐   │           │
    │SELECTED_NO_MENU│──┴───────────┘
    └───────┬───────┘
            │
    clickOutside
            │
            ▼
       ┌─────────┐
       │ HIDDEN  │
       └─────────┘
```

### 2.2 状态详细定义

#### 状态1: HIDDEN（隐藏）

| 属性 | 值 |
|------|-----|
| 条件 | 表格未聚焦 \|\| 鼠标离开表格区域 200ms |
| 外观 | `opacity: 0`, `pointer-events: none` |
| 转换 | → 鼠标进入单元格 → **BAR** |

#### 状态2: BAR（条状）

| 属性 | 值 |
|------|-----|
| 条件 | 鼠标在单元格内，但不在手柄区域 |
| 外观 | 细条（4px 高度/宽度），无六点图标 |
| 颜色 | 灰色背景 (`#e5e7eb`) |
| 转换 | → 鼠标进入手柄区域 → **HOVER** |
|      | → 鼠标离开单元格 → **HIDDEN** |

#### 状态3: HOVER（悬停）

| 属性 | 值 |
|------|-----|
| 条件 | 鼠标在手柄区域 |
| 外观 | 正常尺寸，白色背景，灰色六点 |
| 颜色 | `bg: #fff`, `border: #e5e7eb`, `icon: #6b7280` |
| 转换 | → 点击手柄 → **SELECTED** |
|      | → 鼠标离开手柄 → **BAR** |

#### 状态4: SELECTED（选中+菜单）

| 属性 | 值 |
|------|-----|
| 条件 | 点击了手柄 |
| 外观 | 蓝色背景，白色六点，显示菜单 |
| 颜色 | `bg: var(--accent)`, `icon: #fff` |
| 附加 | 整行/列显示蓝色边框 |
| 转换 | → 点击外部区域 → **SELECTED_NO_MENU** |
|      | → 执行菜单操作 → 根据操作变化 |

#### 状态5: SELECTED_NO_MENU（选中无菜单）

| 属性 | 值 |
|------|-----|
| 条件 | 在 SELECTED 状态下点击外部区域 |
| 外观 | 蓝色背景，白色六点，菜单隐藏 |
| 颜色 | 同 SELECTED |
| 附加 | 整行/列边框保持 |
| 转换 | → 再次点击外部 → **HIDDEN** |
|      | → 再次点击手柄 → **SELECTED** |
|      | → 鼠标移动到其他单元格 → 当前隐藏，新位置显示 **BAR** |

#### 状态6: DRAGGING（拖拽中）

| 属性 | 值 |
|------|-----|
| 条件 | 从任何非 HIDDEN 状态开始拖拽 |
| 外观 | 显示拖拽预览 |
| 转换 | → 拖拽结束 → **SELECTED_NO_MENU**（新位置） |

---

## 三、实现方案架构

### 3.1 架构图

```
                    ┌──────────────────┐
                    │  table-block.ts  │  配置 + 状态机逻辑
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼──────────┐       ┌──────────▼─────────┐
    │ ProseMirror Plugin │       │    CSS Styles      │
    │  (事件监听)         │       │  (状态样式)         │
    └────────────────────┘       └────────────────────┘
```

### 3.2 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `src/editor/plugins/table-block.ts` | 新增状态机插件 |
| `src/styles/editor.css` | 新增状态样式 |
| `src/editor/editor-setup.ts` | 注册新插件 |

---

## 四、详细实现代码

### 4.1 状态机核心逻辑

```typescript
/**
 * Table Handle State Machine
 * 
 * 实现 Notion 风格的表格手柄六状态机
 */

// 状态枚举
type HandleState = 'hidden' | 'bar' | 'hover' | 'selected' | 'selected_no_menu' | 'dragging';

interface StateContext {
  colState: HandleState;
  rowState: HandleState;
  selectedColIndex: number | null;
  selectedRowIndex: number | null;
}

let stateContext: StateContext = {
  colState: 'hidden',
  rowState: 'hidden',
  selectedColIndex: null,
  selectedRowIndex: null,
};

/**
 * 状态机转换逻辑
 */
function transitionState(
  currentState: HandleState, 
  event: 'pointerEnterCell' | 'pointerEnterHandle' | 'pointerLeaveHandle' | 'pointerLeaveTable' | 'click' | 'clickOutside' | 'dragStart' | 'dragEnd'
): HandleState {
  switch (currentState) {
    case 'hidden':
      if (event === 'pointerEnterCell') return 'bar';
      return 'hidden';
      
    case 'bar':
      if (event === 'pointerEnterHandle') return 'hover';
      if (event === 'pointerLeaveTable') return 'hidden';
      return 'bar';
      
    case 'hover':
      if (event === 'click') return 'selected';
      if (event === 'pointerLeaveHandle') return 'bar';
      if (event === 'dragStart') return 'dragging';
      return 'hover';
      
    case 'selected':
      if (event === 'clickOutside') return 'selected_no_menu';
      if (event === 'click') return 'selected'; // 再次点击保持
      if (event === 'dragStart') return 'dragging';
      return 'selected';
      
    case 'selected_no_menu':
      if (event === 'clickOutside') return 'hidden';
      if (event === 'click') return 'selected';
      if (event === 'pointerEnterHandle') return 'selected'; // 重新悬停时恢复菜单
      return 'selected_no_menu';
      
    case 'dragging':
      if (event === 'dragEnd') return 'selected_no_menu';
      return 'dragging';
      
    default:
      return 'hidden';
  }
}
```

### 4.2 DOM 操作辅助函数

```typescript
function getColHandle(): HTMLElement | null {
  return document.querySelector('.milkdown-table-block .cell-handle[data-role="col-drag-handle"]');
}

function getRowHandle(): HTMLElement | null {
  return document.querySelector('.milkdown-table-block .cell-handle[data-role="row-drag-handle"]');
}

function updateHandleState(handle: HTMLElement | null, state: HandleState) {
  if (!handle) return;
  
  // 设置状态属性
  handle.dataset.state = state;
  
  // 根据状态更新 data-show
  handle.dataset.show = state === 'hidden' ? 'false' : 'true';
  
  // 根据状态更新 data-selected
  handle.dataset.selected = (state === 'selected' || state === 'selected_no_menu') ? 'true' : 'false';
  
  // 控制 button-group 显示
  const buttonGroup = handle.querySelector('.button-group') as HTMLElement;
  if (buttonGroup) {
    buttonGroup.dataset.show = state === 'selected' ? 'true' : 'false';
  }
}
```

### 4.3 ProseMirror 插件实现

```typescript
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { Ctx } from '@milkdown/kit/ctx';

export function createTableHandleStatePlugin(ctx: Ctx): Plugin {
  return new Plugin({
    key: new PluginKey('table-handle-state'),
    
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target as HTMLElement;
          const colHandle = getColHandle();
          const rowHandle = getRowHandle();
          const isOnColHandle = colHandle?.contains(target);
          const isOnRowHandle = rowHandle?.contains(target);
          const isOnButtonGroup = target.closest('.button-group');
          const isOnTable = target.closest('.milkdown-table-block');

          // 点击列手柄
          if (isOnColHandle && !isOnButtonGroup) {
            stateContext.colState = transitionState(stateContext.colState, 'click');
            updateHandleState(colHandle, stateContext.colState);
            return false;
          }

          // 点击行手柄
          if (isOnRowHandle && !isOnButtonGroup) {
            stateContext.rowState = transitionState(stateContext.rowState, 'click');
            updateHandleState(rowHandle, stateContext.rowState);
            return false;
          }

          // 点击外部区域
          if (!isOnColHandle && !isOnRowHandle) {
            if (stateContext.colState === 'selected' || stateContext.colState === 'selected_no_menu') {
              stateContext.colState = transitionState(stateContext.colState, 'clickOutside');
              updateHandleState(colHandle, stateContext.colState);
            }
            if (stateContext.rowState === 'selected' || stateContext.rowState === 'selected_no_menu') {
              stateContext.rowState = transitionState(stateContext.rowState, 'clickOutside');
              updateHandleState(rowHandle, stateContext.rowState);
            }
          }

          return false;
        },
      },
    },

    view() {
      // 初始化时为手柄添加额外的事件监听
      const setupHandleListeners = () => {
        const colHandle = getColHandle();
        const rowHandle = getRowHandle();

        if (colHandle) {
          // 悬停进入
          colHandle.addEventListener('pointerenter', () => {
            if (stateContext.colState === 'bar' || stateContext.colState === 'selected_no_menu') {
              stateContext.colState = transitionState(stateContext.colState, 'pointerEnterHandle');
              updateHandleState(colHandle, stateContext.colState);
            }
          });
          
          // 悬停离开
          colHandle.addEventListener('pointerleave', () => {
            if (stateContext.colState === 'hover') {
              stateContext.colState = transitionState(stateContext.colState, 'pointerLeaveHandle');
              updateHandleState(colHandle, stateContext.colState);
            }
          });
        }

        if (rowHandle) {
          rowHandle.addEventListener('pointerenter', () => {
            if (stateContext.rowState === 'bar' || stateContext.rowState === 'selected_no_menu') {
              stateContext.rowState = transitionState(stateContext.rowState, 'pointerEnterHandle');
              updateHandleState(rowHandle, stateContext.rowState);
            }
          });
          
          rowHandle.addEventListener('pointerleave', () => {
            if (stateContext.rowState === 'hover') {
              stateContext.rowState = transitionState(stateContext.rowState, 'pointerLeaveHandle');
              updateHandleState(rowHandle, stateContext.rowState);
            }
          });
        }
      };

      // 使用 MutationObserver 等待手柄元素创建
      const observer = new MutationObserver((mutations, obs) => {
        if (getColHandle() && getRowHandle()) {
          setupHandleListeners();
          obs.disconnect();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      return {
        destroy() {
          observer.disconnect();
        },
      };
    },
  });
}
```

### 4.4 CSS 样式

```css
/* =====================================================
   Notion 风格表格手柄状态机样式
   ===================================================== */

/* 状态1: HIDDEN */
.milkdown-table-block .cell-handle[data-state='hidden'],
.milkdown-table-block .cell-handle[data-show='false'] {
  opacity: 0;
  pointer-events: none;
}

/* 状态2: BAR (条状) */
.milkdown-table-block .cell-handle[data-state='bar'] {
  opacity: 1;
  pointer-events: auto;
  background-color: var(--editor-border);
  border-color: transparent;
}

/* 列手柄条状：变窄变矮 */
.milkdown-table-block .cell-handle[data-role='col-drag-handle'][data-state='bar'] {
  height: 4px !important;
  min-height: 4px;
  padding: 0;
  border-radius: 2px;
}

/* 行手柄条状：变窄 */
.milkdown-table-block .cell-handle[data-role='row-drag-handle'][data-state='bar'] {
  width: 4px !important;
  min-width: 4px;
  padding: 0;
  border-radius: 2px;
}

/* 条状时隐藏六点图标 */
.milkdown-table-block .cell-handle[data-state='bar'] .milkdown-icon {
  display: none;
}

/* 状态3: HOVER */
.milkdown-table-block .cell-handle[data-state='hover'],
.milkdown-table-block .cell-handle[data-state='bar']:hover {
  opacity: 1;
  background-color: #fff;
  border-color: var(--editor-border);
  color: #6b7280;
  /* 恢复正常尺寸 */
  height: auto !important;
  width: auto !important;
  min-height: auto;
  min-width: auto;
}

/* 列手柄 hover 尺寸恢复 */
.milkdown-table-block .cell-handle[data-role='col-drag-handle'][data-state='hover'],
.milkdown-table-block .cell-handle[data-role='col-drag-handle'][data-state='bar']:hover {
  height: 20px !important;
  padding: 0 8px;
}

/* 行手柄 hover 尺寸恢复 */
.milkdown-table-block .cell-handle[data-role='row-drag-handle'][data-state='hover'],
.milkdown-table-block .cell-handle[data-role='row-drag-handle'][data-state='bar']:hover {
  width: 20px !important;
  padding: 8px 0;
}

/* Hover 时显示六点图标 */
.milkdown-table-block .cell-handle[data-state='hover'] .milkdown-icon,
.milkdown-table-block .cell-handle[data-state='bar']:hover .milkdown-icon {
  display: flex;
}

/* 状态4 & 5: SELECTED / SELECTED_NO_MENU */
.milkdown-table-block .cell-handle[data-state='selected'],
.milkdown-table-block .cell-handle[data-state='selected_no_menu'],
.milkdown-table-block .cell-handle[data-selected='true'] {
  opacity: 1;
  background-color: var(--accent);
  border-color: var(--accent);
  color: #fff;
  /* 恢复正常尺寸 */
  height: auto !important;
  width: auto !important;
}

/* 列手柄选中尺寸 */
.milkdown-table-block .cell-handle[data-role='col-drag-handle'][data-state='selected'],
.milkdown-table-block .cell-handle[data-role='col-drag-handle'][data-state='selected_no_menu'] {
  height: 20px !important;
  padding: 0 8px;
}

/* 行手柄选中尺寸 */
.milkdown-table-block .cell-handle[data-role='row-drag-handle'][data-state='selected'],
.milkdown-table-block .cell-handle[data-role='row-drag-handle'][data-state='selected_no_menu'] {
  width: 20px !important;
  padding: 8px 0;
}

.milkdown-table-block .cell-handle[data-state='selected'] .milkdown-icon,
.milkdown-table-block .cell-handle[data-state='selected_no_menu'] .milkdown-icon {
  display: flex;
}

/* 选中状态 hover */
.milkdown-table-block .cell-handle[data-state='selected']:hover,
.milkdown-table-block .cell-handle[data-state='selected_no_menu']:hover {
  background-color: var(--accent-hover);
  border-color: var(--accent-hover);
}

/* 暗色模式适配 */
.dark .milkdown-table-block .cell-handle[data-state='bar'] {
  background-color: var(--editor-border);
}

.dark .milkdown-table-block .cell-handle[data-state='hover'],
.dark .milkdown-table-block .cell-handle[data-state='bar']:hover {
  background-color: var(--sidebar-bg);
  border-color: var(--editor-border);
  color: var(--sidebar-text);
}

/* =====================================================
   整行/列选中边框
   ===================================================== */

/* 当手柄处于 selected 状态时，通过 JS 添加 .selected-col 或 .selected-row */
.milkdown-table-block th.selected-col,
.milkdown-table-block td.selected-col {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  background-color: rgba(37, 99, 235, 0.05);
}

.milkdown-table-block tr.selected-row th,
.milkdown-table-block tr.selected-row td {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  background-color: rgba(37, 99, 235, 0.05);
}

.dark .milkdown-table-block th.selected-col,
.dark .milkdown-table-block td.selected-col,
.dark .milkdown-table-block tr.selected-row th,
.dark .milkdown-table-block tr.selected-row td {
  background-color: rgba(122, 162, 247, 0.08);
}
```

---

## 五、实现优先级建议

由于这是一个较大的改动，建议分阶段实施：

### Phase 1: 仅 CSS 改动（立即可做）⏱️ 5分钟

修改 hover 样式为白底灰点，与 Notion 一致：

```css
.milkdown-table-block .cell-handle:hover {
  background-color: #fff;
  border-color: var(--editor-border);
  color: #6b7280;
}
```

**效果**：
- ✅ hover 时白色背景
- ✅ 灰色六点图标
- ❌ 无条状中间态

### Phase 2: 条状中间态（需要 JS）⏱️ 30分钟

添加 `data-state` 属性和条状样式，需要少量 JS 逻辑：

**需要修改**：
- `table-block.ts`: 添加状态属性设置
- `editor.css`: 添加条状样式

**效果**：
- ✅ hover 时白色背景
- ✅ 灰色六点图标
- ✅ 条状中间态
- ❌ 完整状态机转换

### Phase 3: 完整状态机（需要插件）⏱️ 2小时

实现完整的六状态转换逻辑：

**需要修改**：
- `table-block.ts`: 完整状态机实现
- `editor.css`: 所有状态样式
- `editor-setup.ts`: 注册状态机插件

**效果**：
- ✅ 完整复刻 Notion 交互
- ✅ 所有六种状态
- ✅ 正确的状态转换
- ✅ 选中行/列高亮

---

## 六、交互对比表

| 交互 | 当前 LanisMD | Notion | Phase 1 | Phase 2 | Phase 3 |
|------|-------------|--------|---------|---------|---------|
| 鼠标进入单元格 | 直接显示六点手柄 | 显示条状 | 直接显示 | 显示条状 | 显示条状 |
| 鼠标悬停手柄 | 灰底灰点 | 白底灰点 | 白底灰点 | 白底灰点 | 白底灰点 |
| 点击手柄 | 蓝底白点+菜单 | 蓝底白点+菜单 | 蓝底白点+菜单 | 蓝底白点+菜单 | 蓝底白点+菜单 |
| 点击外部 | 直接隐藏 | 先关菜单，再隐藏 | 直接隐藏 | 直接隐藏 | 先关菜单，再隐藏 |
| 选中行/列高亮 | ❌ | ✅ 蓝色边框 | ❌ | ❌ | ✅ 蓝色边框 |

---

## 七、注意事项

### 7.1 与 Milkdown 原生逻辑的冲突

Milkdown 的 `tableBlockConfig` 中有自己的 `pointerMove` 和 `pointerLeave` 处理逻辑。实现状态机时需要：

1. **覆盖默认行为**：通过 ProseMirror 插件拦截事件
2. **保持兼容性**：不破坏拖拽等核心功能
3. **使用 MutationObserver**：等待 Milkdown 创建 DOM 后再附加监听器

### 7.2 性能考虑

- 状态机转换是同步的，不会造成性能问题
- MutationObserver 在找到目标后立即断开
- 事件监听器只在必要时触发状态更新

### 7.3 可访问性

- 保持键盘导航功能
- 保持 focus 状态样式
- 保持 ARIA 属性

---

## 八、参考资料

- [Milkdown Table Block 源码](https://github.com/Milkdown/milkdown/tree/main/packages/components/src/table-block)
- [ProseMirror Plugin API](https://prosemirror.net/docs/ref/#state.Plugin)
- [Notion Table 交互设计](https://notion.so)

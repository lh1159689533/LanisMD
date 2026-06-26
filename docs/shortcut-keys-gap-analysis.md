# Typora vs LanisMD 快捷键差距分析

> 本文档是 LanisMD 快捷键体系完善（P0）的前期调研成果。
> 将 Typora 全部快捷键与 LanisMD 当前实现逐项对比，作为后续开发的总参考。
>
> 生成时间：2026-04-16

## 状态图例

| 标记 | 含义 |
|------|------|
| ✅ 已实现 | 功能和快捷键均已实现 |
| 🔧 框架自带 | Milkdown/ProseMirror 框架默认提供，LanisMD 未自行编码但可用 |
| ⚡ 部分实现 | 功能存在但未绑定快捷键，或快捷键与 Typora 不同 |
| ❌ 未实现 | 功能或快捷键均未实现 |

---

## 1. 文件操作 (File)

| Typora 快捷键 (macOS) | 功能 | LanisMD 状态 | 实现位置 / 备注 |
|---|---|---|---|
| `Cmd+N` | 新建文件 | ✅ 已实现 | `useShortcuts.ts` → `onNewFile` |
| `Cmd+O` | 打开文件 | ✅ 已实现 | `useShortcuts.ts` → `onOpenFile` |
| `Cmd+Shift+O` | 快速打开 | ✅ 已实现 | LanisMD 用 `Cmd+P` 实现（VS Code 风格），Typora 用 `Cmd+Shift+O` |
| `Cmd+S` | 保存 | ✅ 已实现 | `useShortcuts.ts` → `onSaveFile` |
| `Cmd+,` | 偏好设置 | ✅ 已实现 | `useShortcuts.ts` → `onOpenSettings` |

**小计**: 5/5 已实现

---

## 2. 编辑操作 (Edit)

| Typora 快捷键 (macOS) | 功能 | LanisMD 状态 | 实现位置 / 备注 |
|---|---|---|---|
| `Cmd+Z` | 撤销 | 🔧 框架自带 | Milkdown `history` 插件自动注册 |
| `Cmd+Shift+Z` | 重做 | 🔧 框架自带 | Milkdown `history` 插件自动注册 |
| `Cmd+X` | 剪切 | 🔧 框架自带 | ProseMirror/浏览器原生 |
| `Cmd+C` | 复制 | 🔧 框架自带 | ProseMirror/浏览器原生 |
| `Cmd+V` | 粘贴 | 🔧 框架自带 | Milkdown `clipboard` 插件增强 |
| `Cmd+A` | 全选 | 🔧 框架自带 | 浏览器原生 |
| `Cmd+]` | 增加缩进 | 🔧 框架自带 | Milkdown `indent` 插件提供 |
| `Cmd+[` | 减少缩进 | 🔧 框架自带 | Milkdown `indent` 插件提供 |
| `Cmd+Shift+V` | 粘贴为纯文本 | ❌ 未实现 | 需拦截粘贴事件，剥离格式 |
| `Cmd+Shift+C` | 复制为 Markdown | ❌ 未实现 | 需新增 |
| `Cmd+Shift+D` | 删除当前行/块 | ❌ 未实现 | 需新增 ProseMirror command |
| `Cmd+G` | 查找下一个 | ⚡ 部分实现 | `SearchReplace.tsx` 中 `Enter` 导航，但无全局 `Cmd+G` 快捷键 |
| `Cmd+Shift+G` | 查找上一个 | ⚡ 部分实现 | `SearchReplace.tsx` 中 `Shift+Enter` 导航，但无全局快捷键 |
| `Cmd+H` | 替换 | ⚡ 部分实现 | 搜索面板自带替换功能，但无独立 `Cmd+H` 快捷键直接打开替换 |
| `Cmd+F` | 查找 | ✅ 已实现 | `useShortcuts.ts` → `onToggleSearch` |

**小计**: 1/15 已实现，8 框架自带，3 部分实现，3 未实现

---

## 3. 段落格式 (Paragraph)

| Typora 快捷键 (macOS) | 功能 | LanisMD 状态 | 实现位置 / 备注 |
|---|---|---|---|
| `Cmd+1` | 一级标题 | ❌ 未实现 | 需新增 ProseMirror keymap。Slash 菜单可插入但无快捷键 |
| `Cmd+2` | 二级标题 | ❌ 未实现 | 同上 |
| `Cmd+3` | 三级标题 | ❌ 未实现 | 同上 |
| `Cmd+4` | 四级标题 | ❌ 未实现 | 同上 |
| `Cmd+5` | 五级标题 | ❌ 未实现 | 同上 |
| `Cmd+6` | 六级标题 | ❌ 未实现 | 同上 |
| `Cmd+0` | 正文段落 | ❌ 未实现 | 将当前块恢复为普通段落 |
| `Cmd+=` | 提升标题级别 | ❌ 未实现 | 需新增。如 H3 → H2 |
| `Cmd+-` | 降低标题级别 | ❌ 未实现 | 需新增。如 H2 → H3 |
| `Cmd+Option+T` | 表格 | ❌ 未实现 | 需新增。Slash 菜单可插入但无快捷键 |
| `Cmd+Option+C` | 代码围栏（Code Fences） | ❌ 未实现 | 需新增。Slash 菜单 + ``` InputRule 可插入但无快捷键 |
| `Cmd+Option+B` | 数学公式块 | ❌ 未实现 | 需新增。Slash 菜单可插入但无快捷键 |
| `Cmd+Option+Q` | 引用 | ❌ 未实现 | 需新增。Slash 菜单 + `>` InputRule 可插入但无快捷键 |
| `Cmd+Option+O` | 有序列表 | ❌ 未实现 | 需新增。Slash 菜单可插入但无快捷键 |
| `Cmd+Option+U` | 无序列表 | ❌ 未实现 | 需新增。Slash 菜单可插入但无快捷键 |
| `Cmd+Return` | 在块内另起一行 | ❌ 未实现 | `<br>` / hard break |
| `Cmd+Shift+Return` | 跳出当前块 | ❌ 未实现 | 光标移到块后新段落 |
| `Cmd+[` / `Tab` | 增加缩进 | 🔧 框架自带 | Milkdown `indent` / list 插件处理 |
| `Cmd+]` / `Shift+Tab` | 减少缩进 | 🔧 框架自带 | Milkdown `indent` / list 插件处理 |

**小计**: 0/19 已实现，2 框架自带，0 部分实现，17 未实现

---

## 4. 文本样式 (Format)

| Typora 快捷键 (macOS) | 功能 | LanisMD 状态 | 实现位置 / 备注 |
|---|---|---|---|
| `Cmd+B` | 加粗 | 🔧 框架自带 | Milkdown `commonmark` 预设自带 `toggleStrongCommand` keymap |
| `Cmd+I` | 斜体 | 🔧 框架自带 | Milkdown `commonmark` 预设自带 `toggleEmphasisCommand` keymap |
| `Cmd+U` | 下划线 | ❌ 未实现 | `underline-mark` schema 已有，但未绑定快捷键。工具栏仅鼠标点击 |
| `Cmd+Shift+`` ` `` | 行内代码 | ❌ 未实现 | 需绑定新快捷键。框架自带 `Cmd+E` 可用，此为 Typora 风格备选 |
| `Ctrl+Shift+`` ` `` | 删除线 | ❌ 未实现 | GFM `strikethrough` mark 已有，但未绑定快捷键。工具栏仅鼠标点击 |
| `Cmd+K` | 超链接 | ❌ 未实现 | 链接插件已有完整功能，但未绑定 `Cmd+K` 快捷键。工具栏仅鼠标点击 |
| `Cmd+Option+I` | 插入图片 | ❌ 未实现 | 图片插件已完整，但未绑定快捷键 |
| `Cmd+Option+H` | 高亮 | ❌ 未实现 | `highlight-mark` schema 已有，但未绑定快捷键。工具栏仅鼠标点击 |
| `Cmd+\` | 清除格式 | ❌ 未实现 | `tooltip-toolbar.ts` 中 `clearAllMarks()` 已有，但未绑定快捷键 |

**小计**: 0/9 已实现，2 框架自带，0 部分实现，7 未实现

---

## 5. 视图操作 (View)

| Typora 快捷键 (macOS) | 功能 | LanisMD 状态 | 实现位置 / 备注 |
|---|---|---|---|
| `Cmd+Shift+B` | 切换侧边栏 | ✅ 已实现 | `useShortcuts.ts` → `onToggleSidebar`。注意：Typora 无此快捷键（Typora 侧边栏不同），此为 LanisMD 自定义 |
| `Cmd+Shift+L` | 切换大纲面板 | ✅ 已实现 | `useShortcuts.ts` → `onToggleOutline`。注意：Typora 中 `Cmd+Shift+L` 为切换侧边栏 |
| `Cmd+/` | 切换源码模式 | ❌ 未实现 | 需新增。LanisMD 已有源码模式 (`SourceEditor.tsx`) 但未绑定快捷键 |
| `Cmd+Shift+F` | 专注模式（Focus Mode） | ❌ 未实现 | 功能和快捷键均未实现 |
| `Cmd+Shift+9` | 打字机模式（Typewriter Mode）| ❌ 未实现 | 功能和快捷键均未实现 |
| `Cmd+=` / `Cmd+Shift+=` | 放大 | ❌ 未实现 | `Cmd+=` 已分配给提升标题级别（P0），放大功能需另行规划快捷键 |
| `Cmd+-` | 缩小 | ❌ 未实现 | `Cmd+-` 已分配给降低标题级别（P0），缩小功能需另行规划快捷键 |
| `Cmd+0` | 重置缩放 | ❌ 未实现 | `Cmd+0` 已分配给恢复段落（P0），重置缩放需另行规划快捷键 |
| `Cmd+Shift+1` | 大纲视图 | ⚡ 部分实现 | LanisMD 大纲面板已有，但使用 `Cmd+Shift+L` 而非 `Cmd+Shift+1` |
| `Cmd+Shift+2` | 文件列表视图 | ⚡ 部分实现 | LanisMD 侧边栏文件树已有，但使用 `Cmd+Shift+B` 而非 `Cmd+Shift+2` |
| `Cmd+Shift+3` | 文件树视图 | ⚡ 部分实现 | 同上，Typora 区分列表/树视图，LanisMD 只有树视图 |
| `F11` / `Cmd+Ctrl+F` | 全屏 | ❌ 未实现 | Tauri 窗口全屏 API |

**小计**: 2/12 已实现，0 框架自带，3 部分实现，7 未实现

---

## 6. 自动完成 / 特殊操作

| Typora 快捷键 (macOS) | 功能 | LanisMD 状态 | 实现位置 / 备注 |
|---|---|---|---|
| `Escape` | 关闭浮动面板/退出编辑 | ✅ 已实现 | 各 NodeView (mermaid/math/image)、SearchReplace、QuickOpen 均支持 |
| `Enter` | 确认输入/斜杠菜单选择 | ✅ 已实现 | SlashMenu、QuickOpen、SearchReplace 等 |
| `↑ / ↓` | 菜单导航 | ✅ 已实现 | SlashMenu、QuickOpen 等 |
| `/` | 触发斜杠命令菜单 | ✅ 已实现 | `slash-menu.ts` |
| `Cmd+Shift+\` | 打开 Emoji 面板 | ❌ 未实现 | 系统级 Emoji 面板（macOS `Ctrl+Cmd+Space`），或自定义 |

**小计**: 4/5 已实现，0 框架自带，0 部分实现，1 未实现

---

## 汇总统计

| 分类 | 总数 | ✅ 已实现 | 🔧 框架自带 | ⚡ 部分实现 | ❌ 未实现 |
|------|------|-----------|-------------|-------------|-----------|
| 文件操作 | 8 | 4 | 0 | 1 | 3 |
| 编辑操作 | 15 | 1 | 8 | 3 | 3 |
| 段落格式 | 19 | 0 | 2 | 0 | 17 |
| 文本样式 | 9 | 0 | 2 | 0 | 7 |
| 视图操作 | 12 | 2 | 0 | 3 | 7 |
| 特殊操作 | 5 | 4 | 0 | 0 | 1 |

---

## 优先级建议

### P0 - 刚需

#### 1. 段落格式快捷键

| 功能 | 快捷键(Windows/Linux) | 快捷键(macOS) |
|---|---|---|
| Heading 1 to 6 |	Ctrl + 1/2/3/4/5/6 | Command + 1/2/3/4/5/6 |
| Paragraph | Ctrl + 0 | Command + 0 |
| Increase Heading Level | Ctrl + = | Command + = |
| Decrease Heading Level | Ctrl + - | Command + - |
| Table | Ctrl + T | Command + Option + T |
| Code Fences | Ctrl + Shift + K | Command + Option + C |
| Math Block | Ctrl + Shift + M | Command + Option + B |
| Quote | Ctrl + Shift + Q | Command + Option + Q |
| Ordered List | Ctrl + Shift + [ | Command + Option + O |
| Unordered List | Ctrl + Shift + ] | Command + Option + U |
| Indent | Ctrl + [ / Tab | Command + [ / Tab |
| Outdent | Ctrl + ] / Shift + Tab | Command + ] / Shift + Tab |

#### 2. Format

| 功能 | 快捷键(Windows/Linux) | 快捷键(macOS) |
|---|---|---|
| Strong | Ctrl + B | Command + B |
| Emphasis | Ctrl + I | Command + I |
| Underline | Ctrl + U | Command + U |
| Code | Ctrl + Shift + ` | Command + Shift + ` |
| Strike | Alt + Shift + 5 | Control + Shift + ` |
| Hyperlink | Ctrl + K | Command + K |
| Image | Ctrl + Shift + I | Command + Option + I |
| 高亮 | Ctrl + Shift + H | Command + Option + H |
| Clear Format | Ctrl + \ | Command + \ |

### P2 - 高级功能（规划后实现）

| 快捷键 | 功能 | 说明 |
|---|---|---|
| `Cmd+Shift+S` | 另存为 | 需 Tauri 文件对话框支持 |
| `Cmd+W` | 关闭文件 | 需考虑未保存提示 |
| `Cmd+Shift+C` | 复制为 Markdown | 需实现选区 → Markdown 转换 |
| `Cmd+Shift+D` | 删除当前行/块 | ProseMirror command |
| `Cmd+Return` | 块内换行（hard break） | ProseMirror hard_break 节点 |
| `Cmd+Shift+Return` | 跳出当前块 | 自定义 command |

### P3 - 锦上添花（远期考虑）

| 快捷键 | 功能 | 说明 |
|---|---|---|
| 专注模式 | 仅高亮当前段落 | 需全新 UI 功能 |
| 打字机模式 | 光标始终居中 | 需滚动逻辑 |
| 缩放控制 | 需另行规划（Cmd+= / Cmd+- 已用于标题级别） | Tauri WebView 缩放 |
| 全屏 | F11 | Tauri 窗口 API |
| 新建窗口 | Cmd+Shift+N | Tauri 多窗口 |
| 上标/下标 | Cmd+Shift+= / Cmd+= | 需先实现 mark schema |

---

## 快捷键冲突注意事项

以下快捷键在 Typora 中存在多义或与 LanisMD 现有绑定冲突：

| 快捷键 | Typora 用途 | LanisMD 现有用途 | 建议 |
|---|---|---|---|
| `Cmd+0` | 恢复段落 / 重置缩放 | 无 | 优先用于恢复段落（与 Cmd+1~6 配套） |
| `Cmd+=` / `Cmd+-` | 提升/降低标题级别 / 放大缩小 | 无 | 优先用于标题级别调整（P0），缩放功能留待 P3 另行规划 |
| `Cmd+Shift+L` | Typora 切换侧边栏 | LanisMD 切换大纲 | 保持 LanisMD 现有绑定 |
| `Cmd+P` | Typora 打印 | LanisMD 快速打开 | 保持 LanisMD 现有绑定（VS Code 习惯） |

---

## 实现架构建议

### 统一快捷键注册层

建议新建一个 Milkdown 插件 `src/editor/plugins/editor-keymap.ts`，将所有编辑器内快捷键（段落格式、文本样式）统一注册：

```typescript
// src/editor/plugins/editor-keymap.ts
import { $prose } from '@milkdown/kit/utils';
import { keymap } from '@milkdown/kit/prose/keymap';

export const editorKeymapPlugin = $prose((ctx) => {
  const schema = /* 从 ctx 获取 schema */;
  return keymap({
    // 段落格式
    'Mod-1': setHeading(1),
    'Mod-2': setHeading(2),
    // ... Mod-3 ~ Mod-6
    'Mod-0': setParagraph(),
    'Mod-=': increaseHeadingLevel(),
    'Mod--': decreaseHeadingLevel(),
    'Mod-Alt-t': insertTable(),
    'Mod-Alt-c': insertCodeFences(),
    'Mod-Alt-b': insertMathBlock(),
    'Mod-Alt-q': toggleBlockquote(),
    'Mod-Alt-o': toggleOrderedList(),
    'Mod-Alt-u': toggleBulletList(),
    // 文本样式
    'Mod-u': toggleUnderline(schema),
    'Mod-Shift-`': toggleInlineCode(),
    'Ctrl-Shift-`': toggleStrikethrough(schema),
    'Mod-k': insertLink(),
    'Mod-Alt-i': insertImage(),
    'Mod-Alt-h': toggleHighlight(schema),
    'Mod-\\': clearFormat(),
  });
});
```

### 全局快捷键扩展

在 `useShortcuts.ts` 中扩展：

```typescript
// 新增处理器
onSaveAs?: () => void;        // Cmd+Shift+S
onCloseFile?: () => void;     // Cmd+W
onToggleSourceMode?: () => void; // Cmd+/
onFindNext?: () => void;      // Cmd+G
onFindPrev?: () => void;      // Cmd+Shift+G
onReplace?: () => void;       // Cmd+H
```

### 自定义快捷键配置

`AppConfig.keyBindings` 已预留，后续可实现：

```typescript
// src/types/config.ts 中已有
keyBindings?: Record<string, string>;

// 用户可自定义覆盖默认绑定
// 例如: { "toggleBold": "Cmd+Shift+B" }
```

---

## 附录：Milkdown/ProseMirror 框架自带快捷键清单

以下快捷键由 Milkdown 的 `commonmark` / `gfm` 预设 + `history` 插件自动注册，**无需 LanisMD 自行实现**：

| 快捷键 | 功能 | 来源 |
|---|---|---|
| `Cmd+B` | 加粗 | `commonmark` → `toggleStrongCommand` |
| `Cmd+I` | 斜体 | `commonmark` → `toggleEmphasisCommand` |
| `Cmd+E` | 行内代码 | `commonmark` → `toggleInlineCodeCommand` |
| `Cmd+Z` | 撤销 | `history` 插件 |
| `Cmd+Shift+Z` / `Cmd+Y` | 重做 | `history` 插件 |
| `Enter` | 新段落 / 列表延续 | `commonmark` 内置 |
| `Shift+Enter` | 硬换行 (hard break) | `commonmark` → `insertHardbreakCommand` |
| `Tab` / `Shift+Tab` | 缩进/取消缩进 | `indent` 插件 + 列表插件 |
| `Backspace` / `Delete` | 删除 | ProseMirror baseKeymap |
| `Cmd+A` | 全选 | 浏览器原生 |
| `Cmd+X/C/V` | 剪切/复制/粘贴 | 浏览器原生 + `clipboard` 插件增强 |
| `Mod-]` / `Mod-[` | 增加/减少列表缩进 | `indent` 插件 |

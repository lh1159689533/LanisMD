# 空状态欢迎页（WelcomeScreen）实施计划

> **执行指南：** 使用 executing-plans 技能逐任务实施此计划。

**目标：** 当 `currentFile` 为空时，替换原有"没有打开的文件"占位文本为一个可在「仪表板视图（方案 C）」与「极简视图（方案 A）」之间切换的欢迎页，用户可通过底部复选框控制下次启动/下次进入空状态时是否继续显示仪表板。

**架构：**
- 新增 `src/components/layout/WelcomeScreen/` 目录（多文件组件遵循项目规范）。
- 在 `settings-store` 中新增 `welcome.showOnStartup` 偏好字段，默认 `true`，持久化到 zustand persist。
- `MainLayout.tsx` 原占位 div 替换为 `<WelcomeScreen />`，组件内部按偏好分发到 `DashboardView`（C）或 `MinimalView`（A）。
- 使用"每次 `currentFile` 从非空变空时重新读取偏好"的策略，满足"当前会话保留 C、下次进入空状态按最新偏好显示"的交互语义。
- 设置对话框"通用"分组追加"启动时显示欢迎页"开关，作为唯一回滚入口。

**技术栈：** React 18, TypeScript, Zustand 5, TailwindCSS 3, CSS Variables (`--lanismd-*`), lucide-react（已安装，用于替代 emoji）。

---

## 需求规格（已对齐）

### 交互规则

| 场景 | 行为 |
|------|------|
| 首次安装 / `showOnStartup = true` | 进入空状态显示方案 C（仪表板） |
| `showOnStartup = false` | 进入空状态显示方案 A（极简） |
| 用户在 C 底部取消勾选 | 立即持久化 `false`，但当前显示保持 C 不切换 |
| 用户关闭最后一个文件再次进入空状态 | 按最新 `showOnStartup` 值重新决定显示 C 或 A |
| 用户想从 A 回到 C | 仅能通过设置对话框重新勾选 |

### 方案 C（DashboardView）布局

1. **欢迎标题**：`欢迎使用 LanisMD` + slogan `专注书写，所见即所得`
2. **开始（左列）**：打开文件夹 / 新建文件 / 打开命令面板 / 偏好设置（4 个入口，带图标与快捷键 badge）
3. **最近（右列）**：最多 5 条最近文件，点击打开；无则显示"暂无最近文件"
4. **核心功能徽章**：AI 编辑 / Mermaid 图表 / 数学公式 / 斜杠菜单 / 主题（hover 显示 tooltip）
5. **快捷键速查**：单行 5 组键帽（⌘N/⌘O/⌘S/⌘B/⌘,）
6. **底部**：分隔线 + 复选框`启动时显示此页`（默认勾选）

### 方案 A（MinimalView）布局

- 垂直居中：Logo（字重 300）+ 产品名 + slogan
- 下方 `💡 小提示` 单行轮播（10s 切换一条，至少 6 条提示）
- 整体 opacity 0.5，无背景装饰

### 约束

- 所有 emoji 在实现中替换为 `lucide-react` 图标
- 样式类名前缀 `.lanismd-welcome-`
- 样式文件 `src/styles/layout/welcome-screen.css`，由 `src/styles/index.css` 或 `src/styles/layout/index.css` 统一引入
- 注释使用中文
- 深浅色主题自动适配（用 CSS 变量）

---

## 任务 1: 扩展 AppConfig 类型增加 welcome 字段

**文件：**
- 修改: `src/types/config.ts`

**步骤 1: 在 `AppConfig` 中追加 `welcome` 配置**

在 `image` 字段之后、`ai` 字段之前插入：

```ts
  /** 欢迎页配置 */
  welcome: {
    /** 空状态是否显示仪表板视图；false 则显示极简视图 */
    showOnStartup: boolean;
  };
```

**步骤 2: 类型编译验证**

运行: `pnpm tsc --noEmit -p tsconfig.app.json`
预期: FAIL，提示 `src/stores/settings-store.ts` 中 `DEFAULT_CONFIG` 缺少 `welcome` 字段。

**步骤 3: 提交**

```bash
git add src/types/config.ts
git commit -m "feat(welcome): add welcome config type"
```

---

## 任务 2: 在 settings-store 添加 welcome 默认值

**文件：**
- 修改: `src/stores/settings-store.ts:5-50`

**步骤 1: 在 `DEFAULT_CONFIG` 中追加**

在 `image: { ... }` 和 `ai: { ... }` 之间插入：

```ts
  welcome: {
    showOnStartup: true,
  },
```

**步骤 2: 验证类型通过**

运行: `pnpm tsc --noEmit -p tsconfig.app.json`
预期: PASS（无类型错误）。

**步骤 3: 手动冒烟：检查 persist merge**

人工确认：旧版本已持久化的 `settings-store` localStorage 在升级后能通过 `deepMergeDefaults` 自动补齐 `welcome.showOnStartup = true`（无需改代码，现有 merge 逻辑已处理）。

**步骤 4: 提交**

```bash
git add src/stores/settings-store.ts
git commit -m "feat(welcome): add welcome.showOnStartup default to settings store"
```

---

## 任务 3: 创建 WelcomeScreen 目录与分发入口

**文件：**
- 创建: `src/components/layout/WelcomeScreen/index.tsx`

**步骤 1: 编写分发逻辑**

```tsx
import { useEffect, useRef, useState } from 'react';
import { useFileStore } from '@/stores/file-store';
import { useSettingsStore } from '@/stores/settings-store';
import { DashboardView } from './DashboardView';
import { MinimalView } from './MinimalView';

/**
 * 空状态欢迎页入口。
 *
 * 分发规则：
 * - 每次 currentFile 从"非空"变为"空"时，重新读取 welcome.showOnStartup
 *   以决定本次空状态应显示 DashboardView 还是 MinimalView；
 * - 在当前空状态期间，即使用户在 Dashboard 中取消勾选，也不会立即切换；
 *   该改动会在下次进入空状态时生效。
 */
export function WelcomeScreen() {
  const currentFile = useFileStore((s) => s.currentFile);
  const prevFileRef = useRef(currentFile);
  const [showDashboard, setShowDashboard] = useState(
    () => useSettingsStore.getState().config.welcome.showOnStartup,
  );

  useEffect(() => {
    // 仅在 "有文件 → 无文件" 的切换时刷新偏好
    const wasOpen = prevFileRef.current !== null && prevFileRef.current !== undefined;
    const nowEmpty = currentFile === null || currentFile === undefined;
    if (wasOpen && nowEmpty) {
      setShowDashboard(useSettingsStore.getState().config.welcome.showOnStartup);
    }
    prevFileRef.current = currentFile;
  }, [currentFile]);

  return showDashboard ? <DashboardView /> : <MinimalView />;
}
```

**步骤 2: 类型检查**

运行: `pnpm tsc --noEmit -p tsconfig.app.json`
预期: FAIL，提示找不到 `./DashboardView` 和 `./MinimalView`。

**步骤 3: 提交（等子视图建好后一起提交，本步骤暂不 commit）**

跳过提交，保留未编译状态直到任务 4、5 完成。

---

## 任务 4: 实现 MinimalView（方案 A）+ 提示文案池 + 轮播

**文件：**
- 创建: `src/components/layout/WelcomeScreen/tips.ts`
- 创建: `src/components/layout/WelcomeScreen/TipCarousel.tsx`
- 创建: `src/components/layout/WelcomeScreen/MinimalView.tsx`

**步骤 1: 编写 tips.ts**

```ts
/** 极简视图底部轮播的小提示文案池 */
export const WELCOME_TIPS: string[] = [
  '按 / 触发斜杠菜单，快速插入元素',
  '按 Cmd/Ctrl + N 新建文件，Cmd/Ctrl + O 打开文件',
  '选中文字后呼出工具条，体验 AI 编辑',
  '输入 $E=mc^2$ 渲染数学公式',
  '用三个反引号 + mermaid 绘制图表',
  'Cmd/Ctrl + B 切换侧栏，Cmd/Ctrl + , 打开设置',
];
```

**步骤 2: 编写 TipCarousel.tsx**

```tsx
import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { WELCOME_TIPS } from './tips';

/** 每条提示展示时长（毫秒） */
const ROTATE_INTERVAL = 10000;

/**
 * 单行提示轮播组件。
 * 每 10 秒切换一条，使用淡入淡出过渡。
 */
export function TipCarousel() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % WELCOME_TIPS.length);
    }, ROTATE_INTERVAL);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="lanismd-welcome-tip">
      <Lightbulb size={14} className="lanismd-welcome-tip-icon" />
      <span key={index} className="lanismd-welcome-tip-text">
        {WELCOME_TIPS[index]}
      </span>
    </div>
  );
}
```

**步骤 3: 编写 MinimalView.tsx**

```tsx
import { Feather } from 'lucide-react';
import { TipCarousel } from './TipCarousel';

/**
 * 方案 A：禅意极简视图。
 * 垂直居中，信息密度极低，整体低透明度以减少存在感。
 */
export function MinimalView() {
  return (
    <div className="lanismd-welcome-minimal">
      <div className="lanismd-welcome-minimal-brand">
        <Feather size={28} strokeWidth={1.2} />
        <h1 className="lanismd-welcome-minimal-title">LanisMD</h1>
        <p className="lanismd-welcome-minimal-slogan">专注书写，所见即所得</p>
      </div>
      <TipCarousel />
    </div>
  );
}
```

**步骤 4: 类型检查**

运行: `pnpm tsc --noEmit -p tsconfig.app.json`
预期: FAIL，`index.tsx` 仍找不到 `./DashboardView`（预期之中，下一任务补齐）。

**步骤 5: 暂不提交**

---

## 任务 5: 实现 DashboardView 之 StartActions（开始区）

**文件：**
- 创建: `src/components/layout/WelcomeScreen/StartActions.tsx`

**步骤 1: 编写 StartActions.tsx**

```tsx
import { FolderOpen, FilePlus, Command, Settings } from 'lucide-react';
import { useFile } from '@/hooks/useFile';
import { useUIStore } from '@/stores/ui-store';

interface ActionItem {
  /** 展示图标 */
  icon: React.ReactNode;
  /** 操作标签 */
  label: string;
  /** 右侧快捷键提示 */
  shortcut: string;
  /** 点击回调 */
  onClick: () => void;
}

/**
 * Dashboard 左栏：常用操作入口
 */
export function StartActions() {
  const { openFileFromDisk, newFile } = useFile();
  const openSettings = useUIStore((s) => s.openSettings);
  const toggleQuickOpen = useUIStore((s) => s.toggleQuickOpen);

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const modKey = isMac ? '⌘' : 'Ctrl';

  const actions: ActionItem[] = [
    {
      icon: <FolderOpen size={16} />,
      label: '打开文件',
      shortcut: `${modKey}O`,
      onClick: () => {
        void openFileFromDisk();
      },
    },
    {
      icon: <FilePlus size={16} />,
      label: '新建文件',
      shortcut: `${modKey}N`,
      onClick: () => {
        void newFile();
      },
    },
    {
      icon: <Command size={16} />,
      label: '命令面板',
      shortcut: `${modKey}K`,
      onClick: () => toggleQuickOpen(),
    },
    {
      icon: <Settings size={16} />,
      label: '偏好设置',
      shortcut: `${modKey},`,
      onClick: () => openSettings(),
    },
  ];

  return (
    <div className="lanismd-welcome-start">
      <h3 className="lanismd-welcome-section-title">开始</h3>
      <ul className="lanismd-welcome-start-list">
        {actions.map((action) => (
          <li key={action.label}>
            <button
              type="button"
              className="lanismd-welcome-start-item"
              onClick={action.onClick}
            >
              <span className="lanismd-welcome-start-icon">{action.icon}</span>
              <span className="lanismd-welcome-start-label">{action.label}</span>
              <kbd className="lanismd-welcome-start-shortcut">{action.shortcut}</kbd>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**步骤 2: 确认依赖 API 存在**

在继续前搜索确认：
- `useFile` 导出 `openFileFromDisk` 与 `newFile`（已确认）
- `useUIStore` 有 `openSettings` 与 `toggleQuickOpen`（若 `toggleQuickOpen` 不存在则降级为 `setState({ quickOpenVisible: true })` 或用现有名字，实施时 grep 确认）

运行: `rg "toggleQuickOpen|quickOpen" src/stores/ui-store.ts`
预期: 输出相关字段；若无此方法，调整为 store 中实际存在的 action 名称。

**步骤 3: 类型检查**

运行: `pnpm tsc --noEmit -p tsconfig.app.json`
预期: 仅剩 `WelcomeScreen/index.tsx` 找不到 `./DashboardView` 的错误。

**步骤 4: 暂不提交**

---

## 任务 6: 实现 DashboardView 之 RecentFilesList（最近文件）

**文件：**
- 创建: `src/components/layout/WelcomeScreen/RecentFilesList.tsx`

**步骤 1: 编写 RecentFilesList.tsx**

```tsx
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { configService } from '@/services/tauri';
import { useFile } from '@/hooks/useFile';
import type { RecentFile } from '@/types';

/** 最多展示的最近文件条数 */
const MAX_RECENT = 5;

/**
 * Dashboard 右栏：最近文件列表
 */
export function RecentFilesList() {
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const { openFileFromPath } = useFile() as unknown as {
    openFileFromPath?: (path: string) => Promise<void>;
  };

  useEffect(() => {
    let cancelled = false;
    void configService.getRecentFiles(MAX_RECENT).then((list) => {
      if (!cancelled) setRecent(list.slice(0, MAX_RECENT));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="lanismd-welcome-recent">
      <h3 className="lanismd-welcome-section-title">最近</h3>
      {recent.length === 0 ? (
        <p className="lanismd-welcome-recent-empty">暂无最近文件</p>
      ) : (
        <ul className="lanismd-welcome-recent-list">
          {recent.map((file) => (
            <li key={file.path}>
              <button
                type="button"
                className="lanismd-welcome-recent-item"
                onClick={() => openFileFromPath?.(file.path)}
                title={file.path}
              >
                <FileText size={14} className="lanismd-welcome-recent-icon" />
                <span className="lanismd-welcome-recent-name">{file.fileName}</span>
                <span className="lanismd-welcome-recent-path">{file.path}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**步骤 2: 确认 `useFile` 中是否有 `openFileFromPath`**

运行: `rg "openFileFromPath|openByPath|openFileByPath" src/hooks/useFile.ts src/stores/file-store.ts`
若不存在，则改为调用 `useFileStore.getState().openFile(path, content, encoding, fileName)` 之前需要先读取文件内容（`fileService.readFile(path)`），封装为一个本地函数 `openPath(path: string)`。

**步骤 3: 若缺失打开方法，补齐封装**

在 `RecentFilesList.tsx` 顶部引入 `fileService` 与 `useFileStore`，并写入一个本地 helper：

```ts
async function openPath(path: string) {
  const { fileService } = await import('@/services/tauri');
  const result = await fileService.readFile(path);
  const fileName = path.split(/[/\\]/).pop() ?? path;
  useFileStore.getState().openFile(path, result.content, result.encoding ?? 'utf-8', fileName);
  await configService.addRecentFile(path);
}
```

并把按钮 onClick 改为 `onClick={() => void openPath(file.path)}`。

**步骤 4: 类型检查**

运行: `pnpm tsc --noEmit -p tsconfig.app.json`
预期: 只剩 `index.tsx` 找不到 `./DashboardView`。

**步骤 5: 暂不提交**

---

## 任务 7: 实现 DashboardView 之 FeatureBadges（核心功能徽章）

**文件：**
- 创建: `src/components/layout/WelcomeScreen/FeatureBadges.tsx`

**步骤 1: 编写 FeatureBadges.tsx**

```tsx
import { Sparkles, GitBranch, Sigma, Slash, Palette } from 'lucide-react';

interface FeatureItem {
  icon: React.ReactNode;
  label: string;
  /** hover tooltip 描述 */
  desc: string;
}

const FEATURES: FeatureItem[] = [
  { icon: <Sparkles size={14} />, label: 'AI 编辑', desc: '选中文字即可续写、润色、翻译' },
  { icon: <GitBranch size={14} />, label: 'Mermaid 图表', desc: '用代码描述流程图、时序图' },
  { icon: <Sigma size={14} />, label: '数学公式', desc: '基于 KaTeX 的 LaTeX 渲染' },
  { icon: <Slash size={14} />, label: '斜杠菜单', desc: '输入 / 快速插入各类块' },
  { icon: <Palette size={14} />, label: '主题', desc: '多套内置主题 + 自定义主题' },
];

/**
 * Dashboard 核心功能徽章展示（无点击行为，仅信息展示 + hover tooltip）
 */
export function FeatureBadges() {
  return (
    <div className="lanismd-welcome-features">
      <h3 className="lanismd-welcome-section-title">核心功能</h3>
      <div className="lanismd-welcome-features-list">
        {FEATURES.map((feature) => (
          <span
            key={feature.label}
            className="lanismd-welcome-feature"
            title={feature.desc}
          >
            {feature.icon}
            <span>{feature.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
```

**步骤 2: 暂不提交**

---

## 任务 8: 实现 DashboardView 之 ShortcutsBar（快捷键速查）

**文件：**
- 创建: `src/components/layout/WelcomeScreen/ShortcutsBar.tsx`

**步骤 1: 编写 ShortcutsBar.tsx**

```tsx
interface ShortcutEntry {
  keys: string;
  label: string;
}

/**
 * Dashboard 底部快捷键速查条
 */
export function ShortcutsBar() {
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  const entries: ShortcutEntry[] = [
    { keys: `${mod}N`, label: '新建' },
    { keys: `${mod}O`, label: '打开' },
    { keys: `${mod}S`, label: '保存' },
    { keys: `${mod}B`, label: '侧栏' },
    { keys: `${mod},`, label: '设置' },
  ];

  return (
    <div className="lanismd-welcome-shortcuts">
      {entries.map((entry) => (
        <span key={entry.label} className="lanismd-welcome-shortcut">
          <kbd>{entry.keys}</kbd>
          <span className="lanismd-welcome-shortcut-label">{entry.label}</span>
        </span>
      ))}
    </div>
  );
}
```

**步骤 2: 暂不提交**

---

## 任务 9: 实现 DashboardView 主体 + 勾选框

**文件：**
- 创建: `src/components/layout/WelcomeScreen/DashboardView.tsx`

**步骤 1: 编写 DashboardView.tsx**

```tsx
import { useSettingsStore } from '@/stores/settings-store';
import { StartActions } from './StartActions';
import { RecentFilesList } from './RecentFilesList';
import { FeatureBadges } from './FeatureBadges';
import { ShortcutsBar } from './ShortcutsBar';

/**
 * 方案 C：仪表板视图。
 * 分为欢迎标题 / 开始+最近双栏 / 核心功能 / 快捷键速查 / 底部勾选。
 */
export function DashboardView() {
  const showOnStartup = useSettingsStore((s) => s.config.welcome.showOnStartup);
  const setNestedConfig = useSettingsStore((s) => s.setNestedConfig);

  return (
    <div className="lanismd-welcome-dashboard">
      <div className="lanismd-welcome-dashboard-inner">
        <header className="lanismd-welcome-header">
          <h1 className="lanismd-welcome-title">欢迎使用 LanisMD</h1>
          <p className="lanismd-welcome-slogan">专注书写，所见即所得</p>
        </header>

        <section className="lanismd-welcome-grid">
          <StartActions />
          <RecentFilesList />
        </section>

        <FeatureBadges />
        <ShortcutsBar />

        <footer className="lanismd-welcome-footer">
          <label className="lanismd-welcome-toggle">
            <input
              type="checkbox"
              checked={showOnStartup}
              onChange={(e) => setNestedConfig('welcome.showOnStartup', e.target.checked)}
            />
            <span>启动时显示此页</span>
          </label>
        </footer>
      </div>
    </div>
  );
}
```

**步骤 2: 类型检查**

运行: `pnpm tsc --noEmit -p tsconfig.app.json`
预期: PASS（WelcomeScreen 完整，无类型错误）。

**步骤 3: 暂不提交（等样式到位后一起提交）**

---

## 任务 10: 添加 welcome-screen.css 样式文件

**文件：**
- 创建: `src/styles/layout/welcome-screen.css`

**步骤 1: 编写样式（覆盖 Dashboard + Minimal + 响应式 + 深浅色适配）**

关键样式骨架：

```css
/* 欢迎页容器 - 填满空状态区 */
.lanismd-welcome-dashboard,
.lanismd-welcome-minimal {
  height: 100%;
  width: 100%;
  overflow: auto;
  color: var(--lanismd-text-color);
  background: var(--lanismd-editor-bg);
}

/* Dashboard 内部居中布局 */
.lanismd-welcome-dashboard-inner {
  max-width: 760px;
  margin: 0 auto;
  padding: 80px 40px 40px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.lanismd-welcome-title {
  font-size: 24px;
  font-weight: 700;
  margin: 0;
}

.lanismd-welcome-slogan {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--lanismd-text-muted, var(--lanismd-sidebar-text));
  opacity: 0.7;
}

.lanismd-welcome-section-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--lanismd-text-color);
  opacity: 0.85;
}

/* 开始 + 最近 双栏 */
.lanismd-welcome-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

@media (max-width: 640px) {
  .lanismd-welcome-grid {
    grid-template-columns: 1fr;
  }
}

/* 开始区按钮 */
.lanismd-welcome-start-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lanismd-welcome-start-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  text-align: left;
  transition: background-color 0.15s ease;
}

.lanismd-welcome-start-item:hover {
  background: var(--lanismd-hover-bg, rgba(127, 127, 127, 0.08));
}

.lanismd-welcome-start-label {
  flex: 1;
}

.lanismd-welcome-start-shortcut {
  font-size: 11px;
  opacity: 0.6;
  font-family: var(--lanismd-font-mono, monospace);
}

/* 最近文件 */
.lanismd-welcome-recent-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lanismd-welcome-recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  text-align: left;
}

.lanismd-welcome-recent-item:hover {
  background: var(--lanismd-hover-bg, rgba(127, 127, 127, 0.08));
}

.lanismd-welcome-recent-name {
  font-weight: 500;
  flex-shrink: 0;
}

.lanismd-welcome-recent-path {
  font-size: 11px;
  opacity: 0.55;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.lanismd-welcome-recent-empty {
  font-size: 12px;
  opacity: 0.5;
  margin: 0;
}

/* 核心功能徽章 */
.lanismd-welcome-features-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lanismd-welcome-feature {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--lanismd-hover-bg, rgba(127, 127, 127, 0.08));
  font-size: 12px;
  cursor: default;
}

/* 快捷键速查 */
.lanismd-welcome-shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  font-size: 12px;
  opacity: 0.75;
}

.lanismd-welcome-shortcut {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.lanismd-welcome-shortcut kbd {
  font-family: var(--lanismd-font-mono, monospace);
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--lanismd-hover-bg, rgba(127, 127, 127, 0.12));
  font-size: 11px;
}

/* 底部 */
.lanismd-welcome-footer {
  border-top: 1px solid var(--lanismd-border-color);
  padding-top: 16px;
}

.lanismd-welcome-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  opacity: 0.7;
  cursor: pointer;
  user-select: none;
}

.lanismd-welcome-toggle input {
  cursor: pointer;
}

/* MinimalView */
.lanismd-welcome-minimal {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 48px;
  opacity: 0.55;
  user-select: none;
}

.lanismd-welcome-minimal-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.lanismd-welcome-minimal-title {
  font-size: 32px;
  font-weight: 300;
  letter-spacing: 0.5px;
  margin: 0;
}

.lanismd-welcome-minimal-slogan {
  margin: 0;
  font-size: 13px;
  opacity: 0.8;
}

/* 小提示轮播 */
.lanismd-welcome-tip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.lanismd-welcome-tip-text {
  animation: lanismd-welcome-tip-fade 0.4s ease;
}

@keyframes lanismd-welcome-tip-fade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**步骤 2: 在 `src/styles/editor/index.css` 或等效的样式入口中 `@import`**

先定位入口：

运行: `rg "@import .*layout" src/styles`
预期: 看到已有 layout 样式被引入的文件。

在该文件追加：

```css
@import './layout/welcome-screen.css';
```

若 `src/styles` 下没有 layout 子目录入口，则直接在 `src/main.tsx` 或 `src/styles/index.css` 中追加 import（实施时根据实际结构选择）。

**步骤 3: 暂不提交**

---

## 任务 11: 替换 MainLayout 占位 div 为 WelcomeScreen

**文件：**
- 修改: `src/components/layout/MainLayout.tsx:26-37`

**步骤 1: 替换渲染**

将：

```tsx
{currentFile ? (
  <EditorCore />
) : (
  <div
    className={cn(
      'flex h-full select-none items-center justify-center',
      'text-sm text-[var(--lanismd-sidebar-text)] opacity-40',
    )}
  >
    没有打开的文件
  </div>
)}
```

替换为：

```tsx
{currentFile ? <EditorCore /> : <WelcomeScreen />}
```

并在文件顶部 import：

```ts
import { WelcomeScreen } from './WelcomeScreen';
```

**步骤 2: 类型 + 构建检查**

运行: `pnpm tsc --noEmit -p tsconfig.app.json`
预期: PASS。

运行: `pnpm build` 或 `pnpm vite build` 的 dry run 不跑（耗时过长），改为：

运行: `pnpm dev` 或 `pnpm tauri dev` 手动验证（此步骤为人工冒烟，见下节）。

**步骤 3: 提交（合并任务 3–11 的新增组件与样式）**

```bash
git add src/components/layout/WelcomeScreen src/components/layout/MainLayout.tsx src/styles/layout/welcome-screen.css src/styles/editor/index.css
git commit -m "feat(welcome): implement WelcomeScreen dashboard and minimal views"
```

---

## 任务 12: 设置对话框追加"启动时显示欢迎页"开关

**文件：**
- 修改: `src/components/settings/SettingsDialog.tsx`（通用分组 `settingsActiveSection === 'general'` 内）

**步骤 1: 在"通用"分组底部追加一个 `settings-item`**

参考已有"自动保存延迟"的结构，加入：

```tsx
<div className="settings-item">
  <label className="settings-item-label">启动时显示欢迎页</label>
  <input
    type="checkbox"
    checked={config.welcome.showOnStartup}
    onChange={(e) =>
      setNestedConfig('welcome.showOnStartup', e.target.checked)
    }
  />
</div>
```

> 实施前先阅读该文件同分组内其他 bool 开关的实际 DOM 结构，保持一致（例如若使用 `SettingsSegmentedControl` 或自定义 toggle 组件，则沿用）。

**步骤 2: 类型检查**

运行: `pnpm tsc --noEmit -p tsconfig.app.json`
预期: PASS。

**步骤 3: 提交**

```bash
git add src/components/settings/SettingsDialog.tsx
git commit -m "feat(welcome): add welcome toggle in general settings"
```

---

## 任务 13: 端到端人工冒烟

**前置：** 任务 1–12 全部完成并 commit。

**步骤 1: 启动应用**

运行: `pnpm tauri dev`

**步骤 2: 验证首次/默认进入**

- 关闭所有文件（或全新启动）→ 应看到 **DashboardView (C)**
- 底部复选框默认勾选

**步骤 3: 验证"取消勾选不立即切换"**

- 取消底部复选框
- 当前视图**仍是 C**，不切换

**步骤 4: 验证"下次进入空状态生效"**

- 打开任意文件（进入编辑态）
- 关闭该文件 → 应看到 **MinimalView (A)**
- 小提示每 10s 切换一次

**步骤 5: 验证"通过设置回滚"**

- 打开偏好设置（⌘, / Ctrl+,）→ 通用 → 勾选"启动时显示欢迎页"
- 打开一个文件 → 关闭 → 应再次看到 **DashboardView (C)**

**步骤 6: 验证深浅色主题**

- 切换主题（浅色 / 深色 / 自定义），两种视图均应保持可读。

**步骤 7: 验证快捷操作**

- C 中"打开文件"点击触发 `openFileFromDisk`
- C 中"新建文件"点击触发 `newFile`
- C 中"偏好设置"点击打开设置对话框
- C 中"命令面板"点击打开 QuickOpen
- C 中最近文件点击打开对应文件

**步骤 8: 视觉检查**

- 窄屏（< 640px）下两栏退化为单列
- 极简视图垂直居中且整体透明度合适

**若全部通过，提交收尾：**

```bash
git commit --allow-empty -m "chore(welcome): e2e smoke passed"
```

---

## 收尾

- 删除计划实施前的草稿文件 `MyTypora 实现差距分析与修复计划.md`（若与该任务无关，不动）
- 无需新增测试文件：该功能为 UI 展示层，通过人工冒烟验证即可（无逻辑可被单元覆盖的核心分支）

---

## 风险与兜底

| 风险 | 说明 | 兜底 |
|------|------|------|
| `useUIStore.toggleQuickOpen` 不存在 | 目前仅确认 `openSettings`，未确认 quickOpen action 名 | 任务 5 步骤 2 的 grep 必做；若名字不同则改用真实 action 名 |
| `useFile` 缺少 `openFileFromPath` | 目前 hooks 只有 `openFileFromDisk` + `newFile` | 任务 6 步骤 2/3 已写明用 `fileService.readFile + useFileStore.openFile` 兜底 |
| persist 旧数据不含 welcome 字段 | settings-store 旧版 localStorage 可能无此键 | 现有 `deepMergeDefaults` 已处理（任务 2 步骤 3 已核查） |
| 最近文件点击需要激活相应文件夹文件树 | 可能导致 FileTree 不高亮 | 本期不处理，后续迭代（不阻塞验收） |

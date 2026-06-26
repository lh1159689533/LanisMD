# 文件树拖拽移动文件 - 技术设计文档

## 1. 需求概述

在左侧文件树的**树视图**模式下，支持通过拖拽将文件移动到目标文件夹或根目录。

### 功能边界

| 维度 | 规则 |
|------|------|
| 可拖动对象 | 仅文件（`.md` 等），文件夹不可拖动 |
| 拖放目标 | 文件夹节点、文件树空白区域（= 根目录） |
| 生效范围 | 仅树视图，列表视图不支持 |
| 多选拖动 | 不支持，一次只拖一个 |
| 同名冲突 | 阻止操作 + toast 提示 |
| 当前编辑文件 | 正常移动，自动更新编辑器路径 |
| 悬停展开 | 拖到收起的文件夹上 ~500ms 后自动展开 |
| 拖到空白处 | 移动到工作区根目录 |

---

## 2. 技术架构

### 2.1 整体分层

```
┌──────────────────────────────────────────────────┐
│  FileTreeItem (拖拽源 + 拖放目标)                  │
│  FileTree.file-tree-content (空白区域拖放目标)      │
│                                                    │
│  HTML5 Drag & Drop API                             │
│  ├── dragStart / dragEnd  (文件节点)                │
│  ├── dragOver / dragEnter / dragLeave / drop        │
│  │   (文件夹节点 + 空白区域)                        │
│  └── 悬停自动展开 (setTimeout 500ms)                │
├──────────────────────────────────────────────────┤
│  fileService.moveFile(sourcePath, targetDir)       │
│  → invoke('move_file', { params })                 │
├──────────────────────────────────────────────────┤
│  Rust: move_file command                           │
│  → fs_service::FileSystemService::move_file()     │
│  → 同名检测 → std::fs::rename()                   │
└──────────────────────────────────────────────────┘
```

### 2.2 涉及文件清单

| 层 | 文件 | 修改内容 |
|----|------|----------|
| Rust 服务 | `src-tauri/src/services/fs_service.rs` | 新增 `move_file` 方法 |
| Rust 命令 | `src-tauri/src/commands/file_commands.rs` | 新增 `move_file` 命令 + `MoveFileParams` |
| Rust 入口 | `src-tauri/src/lib.rs` | 注册 `move_file` 命令 |
| 前端服务 | `src/services/tauri/index.ts` | `FileService` 新增 `moveFile` 方法 |
| 前端组件 | `src/components/layout/FileTree.tsx` | `FileTreeItem` 添加拖拽事件，`FileTree` 添加空白区域 drop |
| 前端样式 | `src/styles/layout/file-tree.css` | 拖拽视觉反馈样式 |

---

## 3. 后端实现

### 3.1 Rust 数据结构

```rust
// src-tauri/src/commands/file_commands.rs

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveFileParams {
    /// 源文件的完整路径
    pub source_path: String,
    /// 目标目录的完整路径
    pub target_dir: String,
}
```

### 3.2 Rust 命令

```rust
// src-tauri/src/commands/file_commands.rs

/// 将文件移动到目标目录
#[tauri::command]
pub async fn move_file(params: MoveFileParams) -> AppResult<String> {
    crate::services::fs_service::FileSystemService::move_file(
        &params.source_path,
        &params.target_dir,
    )
}
```

### 3.3 Rust 服务实现

```rust
// src-tauri/src/services/fs_service.rs

/// 将文件移动到目标目录
/// 返回移动后的新路径
pub fn move_file(source_path: &str, target_dir: &str) -> AppResult<String> {
    let source = Path::new(source_path);
    let target = Path::new(target_dir);

    // 1. 校验源文件存在
    if !source.exists() {
        return Err(AppError::FileNotFound(source_path.to_string()));
    }

    // 2. 校验源是文件（不允许移动目录）
    if !source.is_file() {
        return Err(AppError::InvalidPath(
            "Only files can be moved".to_string(),
        ));
    }

    // 3. 校验目标目录存在
    if !target.exists() || !target.is_dir() {
        return Err(AppError::InvalidPath(
            "Target directory does not exist".to_string(),
        ));
    }

    // 4. 获取文件名
    let file_name = source
        .file_name()
        .ok_or_else(|| AppError::InvalidPath("Cannot determine file name".to_string()))?;

    // 5. 检查源和目标是否在同一目录（无需移动）
    let source_parent = source.parent().ok_or_else(|| {
        AppError::InvalidPath("Cannot determine source parent directory".to_string())
    })?;
    if source_parent == target {
        return Ok(source_path.to_string());
    }

    // 6. 检查目标目录中是否已存在同名文件
    let new_path = target.join(file_name);
    if new_path.exists() {
        return Err(AppError::InvalidPath(format!(
            "目标文件夹已存在同名文件 \"{}\"",
            file_name.to_string_lossy()
        )));
    }

    // 7. 执行移动（使用 fs::rename，同文件系统内为原子操作）
    fs::rename(source, &new_path).map_err(|e| {
        // rename 跨文件系统失败时，回退到复制+删除
        if e.raw_os_error() == Some(18) {
            // EXDEV: cross-device link
            match fs::copy(source, &new_path) {
                Ok(_) => match fs::remove_file(source) {
                    Ok(_) => return AppError::Io(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "should not reach here",
                    )),
                    Err(del_err) => return AppError::Io(del_err),
                },
                Err(copy_err) => return AppError::Io(copy_err),
            }
        }
        AppError::Io(e)
    })?;

    Ok(new_path.to_string_lossy().to_string())
}
```

> **注意**：跨文件系统的 `rename` 会失败（EXDEV），此时回退到 copy + delete。但在实际场景中，文件树内操作通常在同一文件系统，所以 `fs::rename` 大多数情况下足够。为简洁起见，可先只用 `fs::rename`，后续遇到跨设备场景再补充回退逻辑。

**简化版（推荐首次实现）：**

```rust
pub fn move_file(source_path: &str, target_dir: &str) -> AppResult<String> {
    let source = Path::new(source_path);
    let target = Path::new(target_dir);

    if !source.exists() {
        return Err(AppError::FileNotFound(source_path.to_string()));
    }
    if !source.is_file() {
        return Err(AppError::InvalidPath("Only files can be moved".to_string()));
    }
    if !target.exists() || !target.is_dir() {
        return Err(AppError::InvalidPath("Target directory does not exist".to_string()));
    }

    let file_name = source.file_name()
        .ok_or_else(|| AppError::InvalidPath("Cannot determine file name".to_string()))?;

    // 同目录无需移动
    if source.parent() == Some(target) {
        return Ok(source_path.to_string());
    }

    let new_path = target.join(file_name);
    if new_path.exists() {
        return Err(AppError::InvalidPath(format!(
            "目标文件夹已存在同名文件 \"{}\"",
            file_name.to_string_lossy()
        )));
    }

    fs::rename(source, &new_path).map_err(AppError::Io)?;
    Ok(new_path.to_string_lossy().to_string())
}
```

### 3.4 命令注册

```rust
// src-tauri/src/lib.rs  invoke_handler 中新增：
file_commands::move_file,
```

---

## 4. 前端服务层

### 4.1 FileService 新增方法

```typescript
// src/services/tauri/index.ts

class FileService {
  // ... 已有方法 ...

  /** 移动文件到目标目录，返回新路径 */
  async moveFile(sourcePath: string, targetDir: string): Promise<string> {
    return invoke<string>('move_file', {
      params: { sourcePath, targetDir },
    });
  }
}
```

---

## 5. 前端拖拽实现

### 5.1 拖拽数据传递

使用 `dataTransfer` 传递被拖动文件的路径：

```typescript
// 拖拽开始：设置数据
e.dataTransfer.setData('text/plain', node.path);
e.dataTransfer.effectAllowed = 'move';

// 拖放时：获取数据
const sourcePath = e.dataTransfer.getData('text/plain');
```

### 5.2 FileTreeItem 组件修改

在 `FileTreeItem` 组件中，根据节点类型添加不同的拖拽行为：

#### 文件节点（可拖动 + 不可接收）

```tsx
// 文件节点的 props
draggable={!node.isDir}
onDragStart={handleDragStart}   // 仅文件
onDragEnd={handleDragEnd}       // 仅文件
```

#### 文件夹节点（不可拖动 + 可接收）

```tsx
// 文件夹节点的 props
onDragOver={handleDragOver}     // 仅文件夹
onDragEnter={handleDragEnter}   // 仅文件夹
onDragLeave={handleDragLeave}   // 仅文件夹
onDrop={handleDrop}             // 仅文件夹
```

### 5.3 事件处理函数

```typescript
// ─── 拖拽相关状态 ───
// 在 FileTree 组件中管理全局拖拽状态
const [dragOverPath, setDragOverPath] = useState<string | null>(null);
const [isDragging, setIsDragging] = useState(false);
const dragExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// ─── FileTreeItem 内部 ───

/** 文件节点：开始拖拽 */
const handleDragStart = useCallback((e: React.DragEvent) => {
  e.dataTransfer.setData('text/plain', node.path);
  e.dataTransfer.effectAllowed = 'move';
  // 设置拖拽图片（可选：使用节点文本作为拖拽预览）
  onDragStateChange(true);
}, [node.path, onDragStateChange]);

/** 文件节点：拖拽结束 */
const handleDragEnd = useCallback(() => {
  onDragStateChange(false);
}, [onDragStateChange]);

/** 文件夹节点：dragOver（允许放置） */
const handleDragOver = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
}, []);

/** 文件夹节点：dragEnter（高亮 + 启动自动展开计时器） */
const handleDragEnter = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  onDragOverChange(node.path);

  // 如果文件夹未展开，启动 500ms 自动展开计时器
  if (!expandedDirs.has(node.path)) {
    onStartDragExpandTimer(node.path);
  }
}, [node.path, expandedDirs, onDragOverChange, onStartDragExpandTimer]);

/** 文件夹节点：dragLeave（取消高亮 + 清除计时器） */
const handleDragLeave = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  // 仅当离开的是当前高亮目标时才取消
  onDragOverChange(null);
  onClearDragExpandTimer();
}, [onDragOverChange, onClearDragExpandTimer]);

/** 文件夹节点：drop（执行移动） */
const handleDrop = useCallback(async (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  onDragOverChange(null);
  onClearDragExpandTimer();

  const sourcePath = e.dataTransfer.getData('text/plain');
  if (!sourcePath || sourcePath === node.path) return;

  await onMoveFile(sourcePath, node.path);
}, [node.path, onDragOverChange, onClearDragExpandTimer, onMoveFile]);
```

### 5.4 FileTree 组件修改（空白区域 drop）

```tsx
// 文件树内容区域（空白处 = 根目录）
<div
  className="file-tree-content"
  onContextMenu={handleBlankContextMenu}
  onDragOver={handleBlankDragOver}
  onDrop={handleBlankDrop}
>
```

```typescript
/** 空白区域：允许放置 */
const handleBlankDragOver = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  // 设置拖放目标为根目录
  setDragOverPath('__root__');
}, []);

/** 空白区域：放置到根目录 */
const handleBlankDrop = useCallback(async (e: React.DragEvent) => {
  e.preventDefault();
  setDragOverPath(null);
  setIsDragging(false);

  if (!rootPath) return;
  const sourcePath = e.dataTransfer.getData('text/plain');
  if (!sourcePath) return;

  await handleMoveFile(sourcePath, rootPath);
}, [rootPath, handleMoveFile]);
```

### 5.5 核心移动逻辑

```typescript
/** 执行文件移动 */
const handleMoveFile = useCallback(async (sourcePath: string, targetDir: string) => {
  try {
    useFileTreeStore.getState().notifyUserOp();
    const newPath = await fileService.moveFile(sourcePath, targetDir);
    await refreshTree();

    // 如果移动的是当前打开的文件，更新编辑器路径
    const currentFile = useFileStore.getState().currentFile;
    if (currentFile?.filePath === sourcePath) {
      const newName = newPath.split('/').pop() ?? newPath.split('\\').pop() ?? '';
      useFileStore.getState().updateFilePath(newPath, newName);
    }

    // 更新文件树选中状态
    useFileTreeStore.getState().selectFile(newPath);
  } catch (err) {
    // 同名冲突等错误 → toast 提示
    const message = err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '移动文件失败';
    useUIStore.getState().addToast({
      type: 'error',
      message,
    });
  }
}, [refreshTree]);
```

### 5.6 悬停自动展开

```typescript
/** 启动悬停自动展开计时器 */
const startDragExpandTimer = useCallback((dirPath: string) => {
  clearDragExpandTimer();
  dragExpandTimerRef.current = setTimeout(() => {
    const { expandedDirs, toggleDir } = useFileTreeStore.getState();
    if (!expandedDirs.has(dirPath)) {
      toggleDir(dirPath);
    }
    dragExpandTimerRef.current = null;
  }, 500);
}, []);

/** 清除悬停自动展开计时器 */
const clearDragExpandTimer = useCallback(() => {
  if (dragExpandTimerRef.current) {
    clearTimeout(dragExpandTimerRef.current);
    dragExpandTimerRef.current = null;
  }
}, []);
```

### 5.7 传递给 FileTreeItem 的新 Props

```typescript
interface FileTreeItemProps {
  // ... 已有 props ...

  /** 当前拖放高亮的目标路径 */
  dragOverPath: string | null;
  /** 是否正在拖拽中 */
  isDragging: boolean;
  /** 更新拖放高亮目标 */
  onDragOverChange: (path: string | null) => void;
  /** 通知拖拽状态变化 */
  onDragStateChange: (dragging: boolean) => void;
  /** 启动悬停自动展开计时器 */
  onStartDragExpandTimer: (dirPath: string) => void;
  /** 清除悬停自动展开计时器 */
  onClearDragExpandTimer: () => void;
  /** 执行文件移动 */
  onMoveFile: (sourcePath: string, targetDir: string) => Promise<void>;
}
```

---

## 6. 视觉反馈样式

### 6.1 新增 CSS 类

```css
/* src/styles/layout/file-tree.css */

/* ===== 拖拽反馈样式 ===== */

/** 被拖动的文件节点 - 半透明 */
.file-tree-node-item.dragging {
  opacity: 0.4;
}

/** 拖放目标文件夹 - 高亮边框 */
.file-tree-node-item.drag-over {
  background-color: var(--lanismd-drag-over-bg, rgba(59, 130, 246, 0.08));
  outline: 2px solid var(--lanismd-accent);
  outline-offset: -2px;
  border-radius: var(--lanismd-radius-sm);
}

/** 空白区域拖放 - 整个内容区高亮 */
.file-tree-content.drag-over-root {
  background-color: var(--lanismd-drag-over-bg, rgba(59, 130, 246, 0.04));
}
```

### 6.2 className 应用逻辑

```tsx
// FileTreeItem 的按钮节点
<button
  className={cn(
    'file-tree-node-item',
    isSelected && !node.isDir && 'selected',
    // 拖拽反馈
    isDragging && !node.isDir && dragSourcePath === node.path && 'dragging',
    node.isDir && dragOverPath === node.path && 'drag-over',
  )}
  // ...
>

// FileTree 内容区
<div
  className={cn(
    'file-tree-content',
    dragOverPath === '__root__' && 'drag-over-root',
  )}
>
```

---

## 7. 事件流时序图

```
用户拖起文件A                    用户拖过文件夹B             用户释放
    │                               │                       │
    ▼                               ▼                       ▼
dragStart                      dragEnter                   drop
  │                               │                       │
  ├─ setData(path)                ├─ 高亮文件夹B            ├─ getData(path)
  ├─ isDragging = true            ├─ 启动展开计时器          ├─ 取消高亮
  ├─ effectAllowed='move'         │                       ├─ fileService.moveFile()
  │                               ▼                       │    ├─ invoke('move_file')
  │                          (500ms 后)                    │    └─ Rust: fs::rename
  │                          自动展开文件夹B                ├─ refreshTree()
  │                               │                       ├─ 更新编辑器路径
  │                               │                       └─ toast（如果失败）
  ▼                               │                       
dragEnd                           │                       
  └─ isDragging = false           │                       
```

---

## 8. 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 拖到同一目录 | Rust 层检测 `source.parent() == target`，返回原路径，前端无感知 |
| 目标存在同名文件 | Rust 返回错误，前端 catch 后 toast 提示 |
| 拖到文件节点上（非文件夹） | 文件节点不绑定 drop 事件，不会触发 |
| 拖到自己身上 | `sourcePath === node.path` 检查，忽略 |
| 拖出文件树区域 | dragEnd 事件恢复状态，无副作用 |
| 正在编辑的文件被移动 | 移动成功后 `updateFilePath(newPath, newName)` 更新编辑器 |
| 拖拽过程中文件夹收起 | dragLeave 清除计时器，不影响 |

---

## 9. 实现计划

### 阶段 1：后端（Rust）
1. `fs_service.rs` 新增 `move_file` 方法
2. `file_commands.rs` 新增 `MoveFileParams` 和 `move_file` 命令
3. `lib.rs` 注册命令

### 阶段 2：前端服务层
4. `services/tauri/index.ts` 新增 `moveFile` 方法

### 阶段 3：前端拖拽交互
5. `FileTree.tsx` 添加拖拽状态管理 + 移动逻辑 + 空白区域 drop
6. `FileTreeItem` 添加拖拽事件处理 + 视觉反馈 className
7. `file-tree.css` 添加拖拽反馈样式

### 阶段 4：测试验证
8. 验证基本拖放流程
9. 验证同名冲突 toast 提示
10. 验证悬停自动展开
11. 验证编辑器路径自动更新
12. 验证空白区域拖放到根目录

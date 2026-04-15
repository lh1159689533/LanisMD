import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  RiFolderOpenLine,
  RiFolderLine,
  RiFileTextLine,
  RiRefreshLine,
  RiArrowRightSLine,
  RiArrowDownSLine,
  RiFolderAddLine,
  RiFileAddLine,
  RiListUnordered,
  RiNodeTree,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiPencilLine,
  RiClipboardLine,
  RiFolderOpenFill,
  RiHistoryLine,
} from 'react-icons/ri';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import { save as tauriSave } from '@tauri-apps/plugin-dialog';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useFileStore } from '@/stores/file-store';
import { useRecentFoldersStore } from '@/stores/recent-folders-store';
import { fileService } from '@/services/tauri';
import { showConfirmDialog } from '@/services/tauri/dialog-service';
import { timeAgo } from '@/utils/time';
import { cn } from '@/utils/cn';
import { ContextMenu } from '@/components/common/ContextMenu';
import type { ContextMenuGroup } from '@/components/common/ContextMenu';
import { RecentFoldersPanel } from './RecentFolders';
import type { FileTreeNode } from '@/types';

import '../../styles/layout/file-tree.css';

// ─── Helpers ──────────────────────────────────────────────

/**
 * Handle unsaved changes before opening a new file.
 * Returns true if we can proceed, false if user cancelled.
 */
async function handleUnsavedChanges(): Promise<boolean> {
  const current = useFileStore.getState().currentFile;
  if (!current?.isDirty) return true;

  const shouldSave = await showConfirmDialog(
    'Unsaved Changes',
    `"${current.fileName}" has unsaved changes. Do you want to save before opening a new file?`,
  );

  if (shouldSave) {
    if (current.filePath) {
      try {
        await fileService.writeFile({
          path: current.filePath,
          content: current.content,
          encoding: current.encoding,
        });
        useFileStore.getState().markSaved();
      } catch (err) {
        console.error('Failed to save before switching file:', err);
      }
    }
  }
  return true;
}

/** Copy text to clipboard */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

// ─── Context menu state type ──────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  /** "file" | "dir" | "blank" */
  targetType: 'file' | 'dir' | 'blank';
  /** Path of the target (file/dir path, or rootPath for blank) */
  targetPath: string;
  /** Name of the target */
  targetName: string;
}

// ─── Inline editing state type ────────────────────────────

interface InlineEditState {
  /** Path of the item being renamed, or parentDir for new entry */
  path: string;
  /** Current input value */
  value: string;
  /** "rename" | "new-file" | "new-folder" */
  mode: 'rename' | 'new-file' | 'new-folder';
  /** Original name (for rename) */
  originalName?: string;
}

// ─── Inline Edit Input Component ──────────────────────────

function InlineEditInput({
  value,
  onConfirm,
  onCancel,
  depth,
  icon,
  confirmOnUnchanged = false,
}: {
  value: string;
  onConfirm: (newValue: string) => void;
  onCancel: () => void;
  depth?: number;
  icon?: React.ReactNode;
  /** 为 true 时，即使输入值与初始值相同也调用 onConfirm（用于新建文件/文件夹场景） */
  confirmOnUnchanged?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Select the name part without extension
    const dotIndex = inputValue.lastIndexOf('.');
    if (dotIndex > 0) {
      input.setSelectionRange(0, dotIndex);
    } else {
      input.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (trimmed && trimmed !== value) {
        onConfirm(trimmed);
      } else if (trimmed && trimmed === value) {
        // 值未变：新建场景仍然需要确认创建，重命名场景则取消
        if (confirmOnUnchanged) {
          onConfirm(trimmed);
        } else {
          onCancel();
        }
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleBlur = () => {
    const trimmed = inputValue.trim();
    if (trimmed && trimmed !== value) {
      onConfirm(trimmed);
    } else if (trimmed && confirmOnUnchanged) {
      // 新建场景：失焦时也应确认创建
      onConfirm(trimmed);
    } else {
      onCancel();
    }
  };

  return (
    <div
      className="file-tree-inline-edit"
      style={{ paddingLeft: depth != null ? `${8 + depth * 16}px` : undefined }}
    >
      {icon && <span className="file-tree-node-icon shrink-0">{icon}</span>}
      <input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="file-tree-inline-input"
        spellCheck={false}
      />
    </div>
  );
}

// ─── Tree Item Component ──────────────────────────────────

function FileTreeItem({
  node,
  depth,
  isLast,
  inlineEdit,
  onContextMenu,
  onStartInlineEdit,
  onFinishInlineEdit,
}: {
  node: FileTreeNode;
  depth: number;
  isLast: boolean;
  inlineEdit: InlineEditState | null;
  onContextMenu: (e: React.MouseEvent, node: FileTreeNode) => void;
  onStartInlineEdit: (edit: InlineEditState) => void;
  onFinishInlineEdit: () => void;
}) {
  const expandedDirs = useFileTreeStore((s) => s.expandedDirs);
  const selectedFile = useFileTreeStore((s) => s.selectedFile);
  const toggleDir = useFileTreeStore((s) => s.toggleDir);
  const selectFile = useFileTreeStore((s) => s.selectFile);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const { openFile } = useFileStore();

  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedFile === node.path;
  const isBeingRenamed = inlineEdit?.mode === 'rename' && inlineEdit.path === node.path;

  // Check if a new entry is being created in THIS directory
  const isNewEntryParent =
    inlineEdit &&
    (inlineEdit.mode === 'new-file' || inlineEdit.mode === 'new-folder') &&
    inlineEdit.path === node.path;

  const handleClick = useCallback(async () => {
    if (node.isDir) {
      toggleDir(node.path);
    } else {
      const canProceed = await handleUnsavedChanges();
      if (!canProceed) return;

      selectFile(node.path);

      try {
        const result = await fileService.readFile({
          path: node.path,
          encoding: 'utf-8',
        });
        openFile(node.path, result.content, result.encoding ?? 'utf-8', node.name);
      } catch (err) {
        console.error('Failed to open file from tree:', err);
      }
    }
  }, [node, toggleDir, selectFile, openFile]);

  const handleRenameConfirm = useCallback(
    async (newName: string) => {
      try {
        useFileTreeStore.getState().notifyUserOp();
        const newPath = await fileService.renameEntry(node.path, newName);
        await refreshTree();
        // If the renamed file was the currently open file, update the editor
        const currentFile = useFileStore.getState().currentFile;
        if (currentFile?.filePath === node.path) {
          useFileStore.getState().updateFilePath(newPath, newName);
        }
      } catch (err) {
        console.error('Failed to rename:', err);
      }
      onFinishInlineEdit();
    },
    [node.path, refreshTree, onFinishInlineEdit],
  );

  const handleNewEntryConfirm = useCallback(
    async (name: string) => {
      if (!inlineEdit) return;
      const isDir = inlineEdit.mode === 'new-folder';
      try {
        useFileTreeStore.getState().notifyUserOp();
        const result = await fileService.createEntry({
          parentDir: node.path,
          baseName: name,
          isDir,
        });

        // Ensure parent is expanded
        const { expandedDirs, toggleDir } = useFileTreeStore.getState();
        if (!expandedDirs.has(node.path)) {
          toggleDir(node.path);
        }

        await refreshTree();

        // If file, auto-open
        if (!isDir) {
          useFileTreeStore.getState().selectFile(result.path);
          openFile(result.path, '', 'utf-8', result.name);
        }
      } catch (err) {
        console.error('Failed to create entry:', err);
      }
      onFinishInlineEdit();
    },
    [inlineEdit, node.path, refreshTree, openFile, onFinishInlineEdit],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, node);
    },
    [node, onContextMenu],
  );

  if (isBeingRenamed) {
    return (
      <div
        className={cn(
          'file-tree-node',
          depth > 0 && 'has-line',
          isLast && 'is-last',
          node.isDir && 'is-dir',
        )}
        style={{ '--depth': depth } as React.CSSProperties}
      >
        <InlineEditInput
          value={node.name}
          onConfirm={handleRenameConfirm}
          onCancel={onFinishInlineEdit}
          depth={depth}
          icon={
            node.isDir ? (
              <RiFolderLine size={14} className="file-tree-node-icon folder" />
            ) : (
              <RiFileTextLine size={14} className="file-tree-node-icon file" />
            )
          }
        />
        {node.isDir && isExpanded && !!node.children?.length && (
          <div
            className="file-tree-node-children"
            style={{ '--depth': depth } as React.CSSProperties}
          >
            {node.children.map((child, index) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                isLast={index === node.children!.length - 1}
                inlineEdit={inlineEdit}
                onContextMenu={onContextMenu}
                onStartInlineEdit={onStartInlineEdit}
                onFinishInlineEdit={onFinishInlineEdit}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn('file-tree-node', depth > 0 && 'has-line', isLast && 'is-last')}
      style={{ '--depth': depth } as React.CSSProperties}
    >
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={cn('file-tree-node-item', isSelected && !node.isDir && 'selected')}
        style={{ paddingLeft: `${8 + depth * 20}px` }}
        title={node.path}
      >
        {node.isDir ? (
          <>
            {/* 只有当目录有子节点时才显示展开图标 */}
            {node.children && node.children.length > 0 ? (
              <span className="file-tree-node-expand">
                {isExpanded ? <RiArrowDownSLine size={14} /> : <RiArrowRightSLine size={14} />}
              </span>
            ) : (
              <span className="file-tree-node-expand" style={{ width: 14 }} />
            )}
            <span className="file-tree-node-icon folder">
              {isExpanded ? <RiFolderOpenLine size={14} /> : <RiFolderLine size={14} />}
            </span>
          </>
        ) : (
          <>
            <span className="file-tree-node-expand" style={{ width: 4 }} />
            <span className="file-tree-node-icon file">
              <RiFileTextLine size={14} />
            </span>
          </>
        )}
        <span className="file-tree-node-name">{node.name}</span>
      </button>

      {/* New entry inline edit at the top of children */}
      {node.isDir && isExpanded && isNewEntryParent && (
        <InlineEditInput
          value={inlineEdit!.value}
          onConfirm={handleNewEntryConfirm}
          onCancel={onFinishInlineEdit}
          depth={depth + 1}
          confirmOnUnchanged
          icon={
            inlineEdit!.mode === 'new-folder' ? (
              <RiFolderLine size={14} className="file-tree-node-icon folder" />
            ) : (
              <RiFileTextLine size={14} className="file-tree-node-icon file" />
            )
          }
        />
      )}

      {node.isDir && isExpanded && !!node.children?.length && (
        <div
          className="file-tree-node-children"
          style={{ '--depth': depth } as React.CSSProperties}
        >
          {node.children.map((child, index) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              isLast={index === node.children!.length - 1}
              inlineEdit={inlineEdit}
              onContextMenu={onContextMenu}
              onStartInlineEdit={onStartInlineEdit}
              onFinishInlineEdit={onFinishInlineEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────

type ViewMode = 'tree' | 'list';

/** Flat file entry used by the list view */
interface FlatFileEntry {
  name: string;
  path: string;
  /** File name without extension */
  stem: string;
  /** File extension including the dot, e.g. ".md" */
  ext: string;
  /** Relative folder path from root */
  relativeDir: string;
  modifiedTime: number | null;
}

/** Recursively collect all non-directory files from the tree */
function flattenFiles(nodes: FileTreeNode[], rootPath: string): FlatFileEntry[] {
  const result: FlatFileEntry[] = [];

  function walk(nodeList: FileTreeNode[]) {
    for (const node of nodeList) {
      if (node.isDir) {
        if (node.children) walk(node.children);
      } else {
        const dirPath = node.path.substring(0, node.path.length - node.name.length - 1);
        const rootName =
          rootPath.split('/').filter(Boolean).pop() ??
          rootPath.split('\\').filter(Boolean).pop() ??
          rootPath;
        let subDir = dirPath.startsWith(rootPath) ? dirPath.slice(rootPath.length) : dirPath;
        if (subDir.startsWith('/') || subDir.startsWith('\\')) {
          subDir = subDir.slice(1);
        }
        const relativeDir = subDir ? `${rootName}/${subDir}` : rootName;

        const dotIndex = node.name.lastIndexOf('.');
        const stem = dotIndex > 0 ? node.name.slice(0, dotIndex) : node.name;
        const ext = dotIndex > 0 ? node.name.slice(dotIndex) : '';

        result.push({
          name: node.name,
          path: node.path,
          stem,
          ext,
          relativeDir: relativeDir || '',
          modifiedTime: node.modifiedTime ?? null,
        });
      }
    }
  }

  walk(nodes);
  return result;
}

// ─── List Item Component ──────────────────────────────────

function FileListItem({
  entry,
  isBeingRenamed,
  onContextMenu,
  onRenameConfirm,
  onRenameCancel,
}: {
  entry: FlatFileEntry;
  isBeingRenamed: boolean;
  onContextMenu: (e: React.MouseEvent, entry: FlatFileEntry) => void;
  onRenameConfirm: (newName: string) => void;
  onRenameCancel: () => void;
}) {
  const selectedFile = useFileTreeStore((s) => s.selectedFile);
  const selectFile = useFileTreeStore((s) => s.selectFile);
  const { openFile } = useFileStore();

  const isSelected = selectedFile === entry.path;

  const handleClick = useCallback(async () => {
    const canProceed = await handleUnsavedChanges();
    if (!canProceed) return;

    selectFile(entry.path);

    try {
      const result = await fileService.readFile({
        path: entry.path,
        encoding: 'utf-8',
      });
      openFile(entry.path, result.content, result.encoding ?? 'utf-8', entry.name);
    } catch (err) {
      console.error('Failed to open file from list:', err);
    }
  }, [entry, selectFile, openFile]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, entry);
    },
    [entry, onContextMenu],
  );

  if (isBeingRenamed) {
    return (
      <div className="file-list-item">
        <div className="file-list-item-meta">
          <span className="file-list-item-folder">{entry.relativeDir}</span>
        </div>
        <InlineEditInput
          value={entry.name}
          onConfirm={onRenameConfirm}
          onCancel={onRenameCancel}
          icon={<RiFileTextLine size={14} className="file-tree-node-icon file" />}
        />
      </div>
    );
  }

  return (
    <button
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      className={cn('file-list-item', isSelected && 'selected')}
      title={entry.path}
    >
      {/* Row 1: folder path + modified time */}
      <div className="file-list-item-meta">
        <span className="file-list-item-folder">{entry.relativeDir}</span>
        <span className="file-list-item-time">{timeAgo(entry.modifiedTime)}</span>
      </div>
      {/* Row 2: file name with .md dimmed */}
      <div className="file-list-item-name">
        <span className="file-list-item-stem">{entry.stem}</span>
        <span className="file-list-item-ext">{entry.ext}</span>
      </div>
    </button>
  );
}

// ─── Main FileTree Component ──────────────────────────────

export function FileTree() {
  const rootPath = useFileTreeStore((s) => s.rootPath);
  const tree = useFileTreeStore((s) => s.tree);
  const isLoading = useFileTreeStore((s) => s.isLoading);
  const openFolder = useFileTreeStore((s) => s.openFolder);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const { openFile } = useFileStore();

  const [showMenu, setShowMenu] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('tree');
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const fileTreeRootRef = useRef<HTMLDivElement>(null);

  // Recent folders panel state
  const [showRecentFolders, setShowRecentFolders] = useState(false);
  const recentFoldersBtnRef = useRef<HTMLButtonElement>(null);
  const addRecentFolder = useRecentFoldersStore((s) => s.addRecentFolder);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  // Inline editing state
  const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);

  // 监听 selectedFile 变化，自动滚动到对应的文件树节点
  const selectedFile = useFileTreeStore((s) => s.selectedFile);
  useEffect(() => {
    if (!selectedFile || !fileTreeRootRef.current) return;
    // 等待 DOM 更新（目录展开后节点才会渲染）
    requestAnimationFrame(() => {
      const contentEl = fileTreeRootRef.current?.querySelector('.file-tree-content');
      if (!contentEl) return;
      // 查找 selected 状态的按钮节点
      const selectedEl = contentEl.querySelector('.file-tree-node-item.selected, .file-list-item.selected');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }, [selectedFile]);

  /** Flat file list sorted by modified time (newest first) for list view */
  const flatFiles = useMemo(() => {
    if (!rootPath) return [];
    const files = flattenFiles(tree, rootPath);
    files.sort((a, b) => {
      const ta = a.modifiedTime ?? 0;
      const tb = b.modifiedTime ?? 0;
      return tb - ta;
    });
    return files;
  }, [tree, rootPath]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // ─── Folder open ──────────────────────────────────────

  const handleOpenFolder = useCallback(async () => {
    const selected = await tauriOpen({
      multiple: false,
      directory: true,
      title: '打开文件夹',
    });

    if (!selected) return;

    const folderPath =
      typeof selected === 'string'
        ? selected
        : selected && typeof selected === 'object' && 'path' in selected
          ? (selected as { path: string }).path
          : null;

    if (folderPath) {
      // Handle unsaved changes before switching folder
      await handleUnsavedBeforeSwitchFolder();
      await openFolder(folderPath);
      addRecentFolder(folderPath);
    }
  }, [openFolder, addRecentFolder]);

  /** Handle unsaved changes before switching folders (same logic as useFile.ts) */
  const handleUnsavedBeforeSwitchFolder = useCallback(async () => {
    const current = useFileStore.getState().currentFile;
    if (!current?.isDirty) return;

    if (current.filePath) {
      // Has a path → silent auto-save
      try {
        await fileService.writeFile({
          path: current.filePath,
          content: current.content,
          encoding: current.encoding,
        });
        useFileStore.getState().markSaved();
      } catch (err) {
        console.error('Failed to auto-save before switching folder:', err);
      }
    } else {
      // Untitled with changes → prompt Save As
      const { save: tauriSaveDialog } = await import('@tauri-apps/plugin-dialog');
      const savePath = await tauriSaveDialog({
        defaultPath: `${current.fileName}.md`,
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      });

      if (savePath) {
        try {
          await fileService.writeFile({
            path: savePath,
            content: current.content,
            encoding: current.encoding,
          });
        } catch (err) {
          console.error('Failed to save untitled file:', err);
        }
      }
    }
  }, []);

  /** Switch to a folder from the recent folders list */
  const handleSwitchToFolder = useCallback(
    async (folderPath: string) => {
      // Skip if it's already the current folder
      if (folderPath === rootPath) return;

      await handleUnsavedBeforeSwitchFolder();
      await openFolder(folderPath);
      addRecentFolder(folderPath);
    },
    [rootPath, openFolder, addRecentFolder, handleUnsavedBeforeSwitchFolder],
  );

  // ─── Context menu actions ─────────────────────────────

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  /** Get the parent dir of a file path */
  const getParentDir = useCallback((filePath: string) => {
    const sep = filePath.includes('/') ? '/' : '\\';
    const parts = filePath.split(sep);
    parts.pop();
    return parts.join(sep);
  }, []);

  // -- New file (tree view: inline edit)
  const handleNewFile = useCallback(
    (parentDir: string) => {
      // Ensure the parent dir is expanded
      const { expandedDirs, toggleDir } = useFileTreeStore.getState();
      if (!expandedDirs.has(parentDir) && parentDir !== rootPath) {
        toggleDir(parentDir);
      }
      setInlineEdit({
        path: parentDir,
        value: '未命名.md',
        mode: 'new-file',
      });
    },
    [rootPath],
  );

  // -- New file (list view: system save dialog)
  const handleNewFileListView = useCallback(async () => {
    if (!rootPath) return;
    try {
      const savePath = await tauriSave({
        title: '新建文件',
        defaultPath: `${rootPath}/未命名.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!savePath) return;

      // Create the empty file
      useFileTreeStore.getState().notifyUserOp();
      await fileService.writeFile({
        path: savePath,
        content: '',
        encoding: 'utf-8',
        createParents: true,
      });

      await refreshTree();

      // Extract name from path
      const fileName = savePath.split('/').pop() ?? savePath.split('\\').pop() ?? '未命名.md';
      useFileTreeStore.getState().selectFile(savePath);
      openFile(savePath, '', 'utf-8', fileName);
    } catch (err) {
      console.error('Failed to create file via save dialog:', err);
    }
  }, [rootPath, refreshTree, openFile]);

  // -- New folder (tree view: inline edit)
  const handleNewFolder = useCallback(
    (parentDir: string) => {
      const { expandedDirs, toggleDir } = useFileTreeStore.getState();
      if (!expandedDirs.has(parentDir) && parentDir !== rootPath) {
        toggleDir(parentDir);
      }
      setInlineEdit({
        path: parentDir,
        value: '未命名文件夹',
        mode: 'new-folder',
      });
    },
    [rootPath],
  );

  // -- Rename (start inline edit)
  const handleStartRename = useCallback((targetPath: string, targetName: string) => {
    setInlineEdit({
      path: targetPath,
      value: targetName,
      mode: 'rename',
      originalName: targetName,
    });
  }, []);

  // -- Rename confirm (for list view items)
  const handleListRenameConfirm = useCallback(
    async (entryPath: string, newName: string) => {
      try {
        useFileTreeStore.getState().notifyUserOp();
        const newPath = await fileService.renameEntry(entryPath, newName);
        await refreshTree();
        const currentFile = useFileStore.getState().currentFile;
        if (currentFile?.filePath === entryPath) {
          useFileStore.getState().updateFilePath(newPath, newName);
        }
      } catch (err) {
        console.error('Failed to rename:', err);
      }
      setInlineEdit(null);
    },
    [refreshTree],
  );

  // -- Duplicate file
  const handleDuplicate = useCallback(
    async (filePath: string) => {
      try {
        useFileTreeStore.getState().notifyUserOp();
        const newPath = await fileService.duplicateFile(filePath);
        await refreshTree();

        // Extract the file name from the new path
        const sep = newPath.includes('/') ? '/' : '\\';
        const newName = newPath.split(sep).pop() ?? newPath;

        // Automatically enter inline rename state for the duplicated file
        setInlineEdit({
          path: newPath,
          value: newName,
          mode: 'rename',
          originalName: newName,
        });
      } catch (err) {
        console.error('Failed to duplicate:', err);
      }
    },
    [refreshTree],
  );

  // -- Move to trash
  const handleMoveToTrash = useCallback(
    async (targetPath: string, targetName: string) => {
      const confirmed = await showConfirmDialog(
        '移至回收站',
        `确定要将"${targetName}"移至回收站吗？`,
      );
      if (!confirmed) return;

      try {
        useFileTreeStore.getState().notifyUserOp();
        await fileService.moveToTrash(targetPath);
        await refreshTree();

        // If the trashed file was currently open, clear the editor
        const currentFile = useFileStore.getState().currentFile;
        if (currentFile?.filePath === targetPath) {
          useFileStore.getState().closeFile();
        }
      } catch (err) {
        console.error('Failed to move to trash:', err);
      }
    },
    [refreshTree],
  );

  // -- Copy file path
  const handleCopyPath = useCallback(async (targetPath: string) => {
    await copyToClipboard(targetPath);
  }, []);

  // -- Reveal in Finder
  const handleRevealInFinder = useCallback(async (targetPath: string) => {
    try {
      await fileService.revealInFinder(targetPath);
    } catch (err) {
      console.error('Failed to reveal in finder:', err);
    }
  }, []);

  // ─── Build context menu groups ────────────────────────

  const buildTreeContextMenuGroups = useCallback(
    (ctx: ContextMenuState): ContextMenuGroup[] => {
      const groups: ContextMenuGroup[] = [];

      if (ctx.targetType === 'dir') {
        // Folder context menu
        groups.push({
          items: [
            {
              label: '新建文件',
              icon: <RiFileAddLine size={14} />,
              onClick: () => handleNewFile(ctx.targetPath),
            },
            {
              label: '新建文件夹',
              icon: <RiFolderAddLine size={14} />,
              onClick: () => handleNewFolder(ctx.targetPath),
            },
          ],
        });
        groups.push({
          items: [
            {
              label: '重命名',
              icon: <RiPencilLine size={14} />,
              onClick: () => handleStartRename(ctx.targetPath, ctx.targetName),
            },
          ],
        });
        groups.push({
          items: [
            {
              label: '移至回收站',
              icon: <RiDeleteBinLine size={14} />,
              onClick: () => handleMoveToTrash(ctx.targetPath, ctx.targetName),
            },
          ],
        });
      } else if (ctx.targetType === 'file') {
        // File context menu
        const parentDir = getParentDir(ctx.targetPath);
        groups.push({
          items: [
            {
              label: '新建文件',
              icon: <RiFileAddLine size={14} />,
              onClick: () => handleNewFile(parentDir),
            },
            {
              label: '新建文件夹',
              icon: <RiFolderAddLine size={14} />,
              onClick: () => handleNewFolder(parentDir),
            },
          ],
        });
        groups.push({
          items: [
            {
              label: '创建副本',
              icon: <RiFileCopyLine size={14} />,
              onClick: () => handleDuplicate(ctx.targetPath),
            },
            {
              label: '重命名',
              icon: <RiPencilLine size={14} />,
              onClick: () => handleStartRename(ctx.targetPath, ctx.targetName),
            },
          ],
        });
        groups.push({
          items: [
            {
              label: '移至回收站',
              icon: <RiDeleteBinLine size={14} />,
              onClick: () => handleMoveToTrash(ctx.targetPath, ctx.targetName),
            },
          ],
        });
      } else {
        // Blank area
        groups.push({
          items: [
            {
              label: '新建文件',
              icon: <RiFileAddLine size={14} />,
              onClick: () => handleNewFile(rootPath!),
            },
            {
              label: '新建文件夹',
              icon: <RiFolderAddLine size={14} />,
              onClick: () => handleNewFolder(rootPath!),
            },
          ],
        });
      }

      // Common last group: copy path + reveal
      groups.push({
        items: [
          {
            label: '复制文件路径',
            icon: <RiClipboardLine size={14} />,
            onClick: () => handleCopyPath(ctx.targetPath),
          },
          {
            label: '打开文件位置',
            icon: <RiFolderOpenFill size={14} />,
            onClick: () => handleRevealInFinder(ctx.targetPath),
          },
        ],
      });

      return groups;
    },
    [
      rootPath,
      handleNewFile,
      handleNewFolder,
      handleStartRename,
      handleDuplicate,
      handleMoveToTrash,
      handleCopyPath,
      handleRevealInFinder,
      getParentDir,
    ],
  );

  const buildListContextMenuGroups = useCallback(
    (ctx: ContextMenuState): ContextMenuGroup[] => {
      const groups: ContextMenuGroup[] = [];

      if (ctx.targetType === 'file') {
        groups.push({
          items: [
            {
              label: '新建文件',
              icon: <RiFileAddLine size={14} />,
              onClick: () => handleNewFileListView(),
            },
          ],
        });
        groups.push({
          items: [
            {
              label: '创建副本',
              icon: <RiFileCopyLine size={14} />,
              onClick: () => handleDuplicate(ctx.targetPath),
            },
            {
              label: '重命名',
              icon: <RiPencilLine size={14} />,
              onClick: () => handleStartRename(ctx.targetPath, ctx.targetName),
            },
          ],
        });
        groups.push({
          items: [
            {
              label: '移至回收站',
              icon: <RiDeleteBinLine size={14} />,
              onClick: () => handleMoveToTrash(ctx.targetPath, ctx.targetName),
            },
          ],
        });
      } else {
        // Blank area
        groups.push({
          items: [
            {
              label: '新建文件',
              icon: <RiFileAddLine size={14} />,
              onClick: () => handleNewFileListView(),
            },
          ],
        });
      }

      // Common last group
      groups.push({
        items: [
          {
            label: '复制文件路径',
            icon: <RiClipboardLine size={14} />,
            onClick: () => handleCopyPath(ctx.targetPath),
          },
          {
            label: '打开文件位置',
            icon: <RiFolderOpenFill size={14} />,
            onClick: () => handleRevealInFinder(ctx.targetPath),
          },
        ],
      });

      return groups;
    },
    [
      handleNewFileListView,
      handleStartRename,
      handleDuplicate,
      handleMoveToTrash,
      handleCopyPath,
      handleRevealInFinder,
    ],
  );

  // ─── Context menu event handlers ──────────────────────

  /** Tree view: right-click on a node */
  const handleTreeNodeContextMenu = useCallback((e: React.MouseEvent, node: FileTreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      targetType: node.isDir ? 'dir' : 'file',
      targetPath: node.path,
      targetName: node.name,
    });
  }, []);

  /** List view: right-click on a file entry */
  const handleListItemContextMenu = useCallback((e: React.MouseEvent, entry: FlatFileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      targetType: 'file',
      targetPath: entry.path,
      targetName: entry.name,
    });
  }, []);

  /** Right-click on blank area */
  const handleBlankContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!rootPath) return;
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        targetType: 'blank',
        targetPath: rootPath,
        targetName: rootPath.split('/').pop() ?? rootPath,
      });
    },
    [rootPath],
  );

  // ─── Inline edit finish ───────────────────────────────

  const handleFinishInlineEdit = useCallback(() => {
    setInlineEdit(null);
  }, []);

  // ─── New entry inline edit from root (for blank-area new file/folder) ──

  const handleNewEntryFromRootConfirm = useCallback(
    async (name: string) => {
      if (!inlineEdit || !rootPath) return;
      const isDir = inlineEdit.mode === 'new-folder';
      try {
        useFileTreeStore.getState().notifyUserOp();
        const result = await fileService.createEntry({
          parentDir: rootPath,
          baseName: name,
          isDir,
        });
        await refreshTree();
        if (!isDir) {
          useFileTreeStore.getState().selectFile(result.path);
          openFile(result.path, '', 'utf-8', result.name);
        }
      } catch (err) {
        console.error('Failed to create entry:', err);
      }
      setInlineEdit(null);
    },
    [inlineEdit, rootPath, refreshTree, openFile],
  );

  // ─── Empty state ──────────────────────────────────────

  if (!rootPath) {
    return (
      <div ref={fileTreeRootRef} className="file-tree-empty">
        <RiFolderAddLine size={32} className="file-tree-empty-icon" />
        <p className="file-tree-empty-text">打开文件夹以浏览 Markdown 文件</p>
        <div className="file-tree-empty-actions">
          <button onClick={handleOpenFolder} className="file-tree-empty-btn">
            <RiFolderOpenLine size={14} />
            打开文件夹
          </button>
          <button
            ref={recentFoldersBtnRef}
            onClick={() => setShowRecentFolders((v) => !v)}
            className="file-tree-empty-btn"
          >
            <RiHistoryLine size={14} />
            最近打开
          </button>
        </div>

        {/* Recent Folders Panel — bottom overlay in empty state */}
        {showRecentFolders && (
          <RecentFoldersPanel
            containerRef={fileTreeRootRef}
            toggleBtnRef={recentFoldersBtnRef}
            onClose={() => setShowRecentFolders(false)}
            onSwitchFolder={handleSwitchToFolder}
          />
        )}
      </div>
    );
  }

  const folderName = rootPath.split('/').pop() ?? rootPath.split('\\').pop() ?? rootPath;

  // Check if the inline edit is for the root path (blank area new entry)
  const isRootNewEntry =
    inlineEdit &&
    (inlineEdit.mode === 'new-file' || inlineEdit.mode === 'new-folder') &&
    inlineEdit.path === rootPath;

  return (
    <div ref={fileTreeRootRef} className="file-tree">
      {/* Header */}
      <div className="file-tree-header">
        <span className="file-tree-header-title" title={rootPath}>
          {folderName}
        </span>
        <div className="file-tree-header-actions">
          <button
            ref={recentFoldersBtnRef}
            onClick={() => setShowRecentFolders((v) => !v)}
            className={cn('file-tree-header-btn', showRecentFolders && 'active')}
            title="最近打开的文件夹"
          >
            <RiHistoryLine size={13} />
          </button>

          <span className="file-tree-header-separator" />

          {/* View mode toggle */}
          <button
            onClick={() => setViewMode('tree')}
            className={cn('file-tree-header-btn', viewMode === 'tree' && 'active')}
            title="树视图"
          >
            <RiNodeTree size={13} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn('file-tree-header-btn', viewMode === 'list' && 'active')}
            title="列表视图"
          >
            <RiListUnordered size={13} />
          </button>

          <span className="file-tree-header-separator" />

          <button
            onClick={handleOpenFolder}
            className="file-tree-header-btn"
            title="打开其他文件夹"
          >
            <RiFolderOpenLine size={13} />
          </button>
          <button onClick={refreshTree} className="file-tree-header-btn" title="刷新">
            <RiRefreshLine size={13} />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="file-tree-content" onContextMenu={handleBlankContextMenu}>
        {tree.length === 0 ? (
          <div className="file-tree-no-files">
            <span className="file-tree-no-files-text">未找到 Markdown 文件</span>
          </div>
        ) : viewMode === 'tree' ? (
          <>
            {/* Root-level new entry inline edit */}
            {isRootNewEntry && (
              <InlineEditInput
                value={inlineEdit!.value}
                onConfirm={handleNewEntryFromRootConfirm}
                onCancel={handleFinishInlineEdit}
                depth={0}
                confirmOnUnchanged
                icon={
                  inlineEdit!.mode === 'new-folder' ? (
                    <RiFolderLine size={14} className="file-tree-node-icon folder" />
                  ) : (
                    <RiFileTextLine size={14} className="file-tree-node-icon file" />
                  )
                }
              />
            )}
            {tree.map((node, index) => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={0}
                isLast={index === tree.length - 1}
                inlineEdit={inlineEdit}
                onContextMenu={handleTreeNodeContextMenu}
                onStartInlineEdit={setInlineEdit}
                onFinishInlineEdit={handleFinishInlineEdit}
              />
            ))}
          </>
        ) : flatFiles.length === 0 ? (
          <div className="file-tree-no-files">
            <span className="file-tree-no-files-text">未找到 Markdown 文件</span>
          </div>
        ) : (
          <div className="file-list">
            {flatFiles.map((entry) => (
              <FileListItem
                key={entry.path}
                entry={entry}
                isBeingRenamed={inlineEdit?.mode === 'rename' && inlineEdit.path === entry.path}
                onContextMenu={handleListItemContextMenu}
                onRenameConfirm={(newName) => handleListRenameConfirm(entry.path, newName)}
                onRenameCancel={handleFinishInlineEdit}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Folders Panel — bottom overlay */}
      {showRecentFolders && (
        <RecentFoldersPanel
          containerRef={fileTreeRootRef}
          toggleBtnRef={recentFoldersBtnRef}
          onClose={() => setShowRecentFolders(false)}
          onSwitchFolder={handleSwitchToFolder}
        />
      )}

      {/* Context Menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          groups={
            viewMode === 'tree'
              ? buildTreeContextMenuGroups(ctxMenu)
              : buildListContextMenuGroups(ctxMenu)
          }
          onClose={closeCtxMenu}
        />
      )}
    </div>
  );
}

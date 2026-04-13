import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RiSearchLine, RiFileTextLine, RiFolderOpenLine, RiFolderLine } from 'react-icons/ri';

import { useUIStore } from '@/stores/ui-store';
import { useFileStore } from '@/stores/file-store';
import { useFileTreeStore } from '@/stores/file-tree-store';
import { useRecentFoldersStore } from '@/stores/recent-folders-store';
import { fileService, configService } from '@/services/tauri';
import { fuzzyMatch, getHighlightSegments } from '@/utils/fuzzy-match';
import { cn } from '@/utils/cn';
import type { FileTreeNode, RecentFile } from '@/types';

import '../../styles/layout/quick-open.css';

/** 扁平化的文件条目，用于列表展示 */
interface FileEntry {
  /** 文件名 */
  name: string;
  /** 完整绝对路径 */
  path: string;
  /** 相对于根文件夹的路径 */
  relativePath: string;
  /** 是否为最近打开的文件 */
  isRecent: boolean;
}

/**
 * 从 FileTreeNode 递归提取所有 .md 文件为扁平列表
 */
function flattenMdFiles(nodes: FileTreeNode[], rootPath: string): FileEntry[] {
  const result: FileEntry[] = [];

  function walk(items: FileTreeNode[]) {
    for (const node of items) {
      if (node.isDir && node.children) {
        walk(node.children);
      } else if (!node.isDir) {
        const relativePath = node.path.startsWith(rootPath)
          ? node.path.slice(rootPath.length).replace(/^[/\\]/, '')
          : node.name;
        result.push({
          name: node.name,
          path: node.path,
          relativePath,
          isRecent: false,
        });
      }
    }
  }

  walk(nodes);
  return result;
}

export function QuickOpen() {
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const closeCommandPalette = useUIStore((s) => s.closeCommandPalette);
  const openFile = useFileStore((s) => s.openFile);
  const rootPath = useFileTreeStore((s) => s.rootPath);
  const tree = useFileTreeStore((s) => s.tree);
  const openFolder = useFileTreeStore((s) => s.openFolder);
  const recentFolders = useRecentFoldersStore((s) => s.recentFolders);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [fullTree, setFullTree] = useState<FileTreeNode[] | null>(null);
  const [isLoadingFullTree, setIsLoadingFullTree] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 面板打开时重置状态 & 获取最近文件
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setActiveIndex(0);
      setFullTree(null);
      setIsLoadingFullTree(false);

      // 获取最近打开的文件
      configService.getRecentFiles(20).then(setRecentFiles).catch(console.error);

      // 自动聚焦输入框
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [commandPaletteOpen]);

  // 输入关键词时，加载完整文件树（递归扫描）
  useEffect(() => {
    if (!query.trim() || !rootPath) {
      return;
    }

    // 如果已经加载过完整树，不再重复加载
    if (fullTree) return;

    setIsLoadingFullTree(true);
    fileService
      .listDirectory(rootPath)
      .then((newTree) => {
        setFullTree(newTree);
        setIsLoadingFullTree(false);
      })
      .catch((err) => {
        console.error('Failed to load full tree for quick open:', err);
        setIsLoadingFullTree(false);
      });
  }, [query, rootPath, fullTree]);

  // 构建文件列表（使用完整树或已加载树）
  const allFiles = useMemo(() => {
    if (!rootPath) return [];

    const sourceTree = fullTree ?? tree;
    return flattenMdFiles(sourceTree, rootPath);
  }, [rootPath, tree, fullTree]);

  // 最近文件的路径集合，用于排序
  const recentFilePathSet = useMemo(() => {
    const map = new Map<string, number>();
    recentFiles.forEach((f, idx) => {
      map.set(f.path, idx);
    });
    return map;
  }, [recentFiles]);

  // 计算显示列表：有关键词则模糊匹配+排序，无关键词则显示最近文件+全部文件
  const displayItems = useMemo(() => {
    if (!rootPath) return [];

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      // 无搜索词：最近打开的文件排前面，然后是其余文件
      const files = [...allFiles];

      // 标记最近文件
      files.forEach((f) => {
        f.isRecent = recentFilePathSet.has(f.path);
      });

      // 按最近打开时间排序：最近文件在前（按 recentFiles 中的原始顺序），其余按文件名
      files.sort((a, b) => {
        const aIdx = recentFilePathSet.get(a.path);
        const bIdx = recentFilePathSet.get(b.path);
        const aIsRecent = aIdx !== undefined;
        const bIsRecent = bIdx !== undefined;

        if (aIsRecent && bIsRecent) return aIdx - bIdx;
        if (aIsRecent) return -1;
        if (bIsRecent) return 1;
        return a.name.localeCompare(b.name);
      });

      return files.slice(0, 50);
    }

    // 有搜索词：模糊匹配文件名和相对路径
    const matched = allFiles
      .map((file) => {
        const nameResult = fuzzyMatch(trimmedQuery, file.name);
        const pathResult = fuzzyMatch(trimmedQuery, file.relativePath);

        // 取最佳匹配结果
        const bestResult = nameResult.score >= pathResult.score ? nameResult : pathResult;

        return {
          file,
          matched: nameResult.matched || pathResult.matched,
          score: bestResult.score,
          nameIndices: nameResult.matched ? nameResult.indices : [],
          pathIndices: pathResult.score > nameResult.score && pathResult.matched ? pathResult.indices : [],
        };
      })
      .filter((r) => r.matched);

    // 按匹配得分排序，同分时最近文件优先
    matched.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aRecent = recentFilePathSet.has(a.file.path) ? 0 : 1;
      const bRecent = recentFilePathSet.has(b.file.path) ? 0 : 1;
      return aRecent - bRecent;
    });

    return matched.slice(0, 50).map((m) => ({
      ...m.file,
      nameIndices: m.nameIndices,
      pathIndices: m.pathIndices,
    }));
  }, [query, allFiles, recentFilePathSet, rootPath]);

  // 重置选中索引
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 在文件树中定位文件（展开父目录 + 选中 + 滚动）
  const revealFile = useFileTreeStore((s) => s.revealFile);

  // 打开选中的文件
  const handleOpenFile = useCallback(
    async (filePath: string) => {
      closeCommandPalette();
      try {
        const result = await fileService.readFile({ path: filePath, encoding: 'utf-8' });
        const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'Unknown';
        openFile(filePath, result.content, result.encoding ?? 'utf-8', fileName);
        // 联动文件树：展开父目录 + 高亮选中
        revealFile(filePath);
        await configService.addRecentFile(filePath);
      } catch (err) {
        console.error('Failed to open file from quick open:', err);
      }
    },
    [closeCommandPalette, openFile, revealFile],
  );

  // 打开选中的文件夹
  const handleOpenFolder = useCallback(
    async (folderPath: string) => {
      closeCommandPalette();
      try {
        await openFolder(folderPath);
      } catch (err) {
        console.error('Failed to open folder from quick open:', err);
      }
    },
    [closeCommandPalette, openFolder],
  );

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isNoFolder = !rootPath;
      const itemCount = isNoFolder ? recentFolders.length : displayItems.length;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % Math.max(1, itemCount));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 + Math.max(1, itemCount)) % Math.max(1, itemCount));
          break;
        case 'Enter':
          e.preventDefault();
          if (isNoFolder) {
            // 在文件夹列表模式下
            const folder = recentFolders[activeIndex];
            if (folder) {
              handleOpenFolder(folder.path);
            }
          } else {
            const item = displayItems[activeIndex];
            if (item) {
              handleOpenFile(item.path);
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          closeCommandPalette();
          break;
      }
    },
    [
      rootPath,
      recentFolders,
      displayItems,
      activeIndex,
      handleOpenFile,
      handleOpenFolder,
      closeCommandPalette,
    ],
  );

  // 确保活动项在可视范围内
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const activeEl = list.querySelector('.lanismd-quick-open-item--active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // 点击遮罩关闭
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        closeCommandPalette();
      }
    },
    [closeCommandPalette],
  );

  if (!commandPaletteOpen) return null;

  // 未打开文件夹时：显示最近文件夹列表
  if (!rootPath) {
    return (
      <div className="lanismd-quick-open-overlay" onClick={handleOverlayClick}>
        <div className="lanismd-quick-open-panel" onKeyDown={handleKeyDown}>
          <div className="lanismd-quick-open-input-wrapper">
            <RiSearchLine className="lanismd-quick-open-input-icon" size={16} />
            <input
              ref={inputRef}
              className="lanismd-quick-open-input"
              placeholder="打开文件夹以开始搜索..."
              readOnly
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className="lanismd-quick-open-list" ref={listRef}>
            {recentFolders.length > 0 ? (
              <>
                <div className="lanismd-quick-open-group-label">最近打开的文件夹</div>
                {recentFolders.map((folder, idx) => (
                  <div
                    key={folder.path}
                    className={cn(
                      'lanismd-quick-open-item lanismd-quick-open-item--folder',
                      idx === activeIndex && 'lanismd-quick-open-item--active',
                    )}
                    onClick={() => handleOpenFolder(folder.path)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <RiFolderOpenLine className="lanismd-quick-open-item-icon" size={16} />
                    <div className="lanismd-quick-open-item-content">
                      <span className="lanismd-quick-open-item-name">{folder.name}</span>
                      <span className="lanismd-quick-open-item-path">{folder.path}</span>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="lanismd-quick-open-empty">
                <RiFolderLine className="lanismd-quick-open-empty-icon" />
                <span>请先打开文件夹</span>
              </div>
            )}
          </div>

          <div className="lanismd-quick-open-footer">
            <span>
              <kbd>↑↓</kbd> 导航
            </span>
            <span>
              <kbd>↵</kbd> 打开
            </span>
            <span>
              <kbd>Esc</kbd> 关闭
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 已打开文件夹：文件搜索模式
  return (
    <div className="lanismd-quick-open-overlay" onClick={handleOverlayClick}>
      <div className="lanismd-quick-open-panel" onKeyDown={handleKeyDown}>
        <div className="lanismd-quick-open-input-wrapper">
          <RiSearchLine className="lanismd-quick-open-input-icon" size={16} />
          <input
            ref={inputRef}
            className="lanismd-quick-open-input"
            placeholder="输入文件名搜索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="lanismd-quick-open-list" ref={listRef}>
          {displayItems.length > 0 ? (
            displayItems.map((item, idx) => {
              const nameSegments =
                'nameIndices' in item && (item as { nameIndices?: number[] }).nameIndices?.length
                  ? getHighlightSegments(item.name, (item as { nameIndices: number[] }).nameIndices)
                  : null;

              return (
                <div
                  key={item.path}
                  className={cn(
                    'lanismd-quick-open-item',
                    idx === activeIndex && 'lanismd-quick-open-item--active',
                  )}
                  onClick={() => handleOpenFile(item.path)}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <RiFileTextLine className="lanismd-quick-open-item-icon" size={16} />
                  <div className="lanismd-quick-open-item-content">
                    <span className="lanismd-quick-open-item-name">
                      {nameSegments
                        ? nameSegments.map((seg, i) =>
                            seg.highlight ? (
                              <span key={i} className="lanismd-quick-open-highlight">
                                {seg.text}
                              </span>
                            ) : (
                              <span key={i}>{seg.text}</span>
                            ),
                          )
                        : item.name}
                    </span>
                    <span className="lanismd-quick-open-item-path">{item.relativePath}</span>
                  </div>
                  {item.isRecent && (
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        'bg-blue-50 text-blue-500',
                        'dark:bg-blue-900/30 dark:text-blue-400',
                      )}
                    >
                      最近
                    </span>
                  )}
                </div>
              );
            })
          ) : query.trim() ? (
            <div className="lanismd-quick-open-empty">
              <RiSearchLine className="lanismd-quick-open-empty-icon" />
              <span>
                {isLoadingFullTree ? '正在扫描文件...' : '未找到匹配的文件'}
              </span>
            </div>
          ) : (
            <div className="lanismd-quick-open-empty">
              <RiFileTextLine className="lanismd-quick-open-empty-icon" />
              <span>输入关键词搜索文件</span>
            </div>
          )}
        </div>

        <div className="lanismd-quick-open-footer">
          <span>
            <kbd>↑↓</kbd> 导航
          </span>
          <span>
            <kbd>↵</kbd> 打开
          </span>
          <span>
            <kbd>Esc</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}

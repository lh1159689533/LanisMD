/**
 * 「打开文件夹」下拉菜单：打开本地文件夹 / 打开远程仓库
 *
 * @changelog
 * | 版本   | 变更说明                 | 关联                               |
 * | v1.0.0 | 初始实现：打开文件夹双入口 | REQ: Git 改造 TECH: 打开远程仓库方案A |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RiFolderOpenLine, RiGitBranchLine } from 'react-icons/ri';
import { useOpenFolder } from '@/hooks/useOpenFolder';
import { cn } from '@/utils/cn';

import '@/styles/git/git-panels.css';

interface OpenFolderMenuProps {
  /** 触发按钮的内容 */
  trigger: ReactNode;
  triggerClassName?: string;
  title?: string;
  /** 菜单对齐方式 */
  align?: 'left' | 'right';
}

export function OpenFolderMenu({
  trigger,
  triggerClassName,
  title,
  align = 'right',
}: OpenFolderMenuProps) {
  const { openLocalFolder, openRemoteFolder } = useOpenFolder();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (fn: () => void | Promise<void>) => {
    setOpen(false);
    void fn();
  };

  return (
    <div ref={rootRef} className="lanismd-open-folder">
      <button
        type="button"
        className={triggerClassName}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open && (
        <div className={cn('lanismd-open-folder-menu', align === 'left' && 'align-left')}>
          <button
            type="button"
            className="lanismd-open-folder-item"
            onClick={() => run(openLocalFolder)}
          >
            <RiFolderOpenLine size={14} />
            <span>打开本地文件夹</span>
          </button>
          <button
            type="button"
            className="lanismd-open-folder-item"
            onClick={() => run(openRemoteFolder)}
          >
            <RiGitBranchLine size={14} />
            <span>打开远程仓库</span>
          </button>
        </div>
      )}
    </div>
  );
}

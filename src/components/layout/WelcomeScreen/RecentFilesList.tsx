import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { configService, fileService } from '@/services/tauri';
import { useFileStore } from '@/stores/file-store';
import type { RecentFile } from '@/types';

/** 最多展示的最近文件条数 */
const MAX_RECENT = 5;

/**
 * 通过 Tauri 服务读取磁盘文件并写入 file-store，用于在欢迎页点击最近文件时打开。
 */
async function openRecentFile(path: string) {
  try {
    const result = await fileService.readFile({ path, encoding: 'utf-8' });
    const fileName = path.split(/[/\\]/).pop() ?? path;
    useFileStore
      .getState()
      .openFile(path, result.content, result.encoding ?? 'utf-8', fileName);
    await configService.addRecentFile(path);
  } catch (err) {
    // 文件可能已被删除或移动；此处仅记录，不阻塞 UI
    console.error('Failed to open recent file:', err);
  }
}

/**
 * Dashboard 右栏：最近文件列表
 */
export function RecentFilesList() {
  const [recent, setRecent] = useState<RecentFile[]>([]);

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
                onClick={() => void openRecentFile(file.path)}
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

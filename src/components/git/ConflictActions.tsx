/**
 * 冲突文件解决操作：保留本地 / 使用远程 / 标记已解决
 *
 * @author hhhuilli
 */

import { useGitStore } from '@/stores/git-store';
import type { ChangedFile } from '@/types/git';

export function ConflictActions({ file }: { file: ChangedFile }) {
  const resolveConflict = useGitStore((s) => s.resolveConflict);
  const busy = useGitStore((s) => s.operation !== null);
  return (
    <span className="lanismd-git-conflict-actions">
      <button type="button" disabled={busy} onClick={() => void resolveConflict(file, 'local')}>
        保留本地
      </button>
      <button type="button" disabled={busy} onClick={() => void resolveConflict(file, 'remote')}>
        使用远程
      </button>
      <button type="button" disabled={busy} onClick={() => void resolveConflict(file, 'mark')}>
        标记已解决
      </button>
    </span>
  );
}

/**
 * 行级变更统计：+新增 -删除；二进制文件显示「二进制」
 *
 * @author hhhuilli
 */

interface ChangeStatsProps {
  additions: number | null;
  deletions: number | null;
  binary?: boolean;
}

export function ChangeStats({ additions, deletions, binary }: ChangeStatsProps) {
  if (binary) return <span className="lanismd-git-stats is-binary">二进制</span>;
  if (additions == null && deletions == null) return null;
  return (
    <span className="lanismd-git-stats">
      {additions ? <span className="is-add">+{additions}</span> : null}
      {deletions ? <span className="is-del">-{deletions}</span> : null}
    </span>
  );
}

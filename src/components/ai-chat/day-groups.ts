/**
 * 按自然日分组（历史侧栏使用）
 *
 * @changelog
 * | 版本   | 变更说明              | 关联           |
 * | v1.0.0 | 初始实现：按天分组 | REQ: AI 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export interface DayGroup<T> {
  /** 分组键：YYYY-MM-DD */
  key: string;
  /** 显示标签：今天 / 昨天 / M月D日 周X / YYYY年M月D日 */
  label: string;
  items: T[];
}

function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function dayLabel(date: Date, now: Date): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((today - target) / 86_400_000);
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  const md = `${date.getMonth() + 1}月${date.getDate()}日`;
  if (date.getFullYear() === now.getFullYear()) return `${md} ${WEEKDAYS[date.getDay()]}`;
  return `${date.getFullYear()}年${md}`;
}

/**
 * 按时间倒序分组（新的在前）。
 *
 * @param getTime - 取条目时间戳（毫秒）
 */
export function groupByDay<T>(items: T[], getTime: (item: T) => number): DayGroup<T>[] {
  const now = new Date();
  const sorted = [...items].sort((a, b) => getTime(b) - getTime(a));
  const groups: DayGroup<T>[] = [];
  for (const item of sorted) {
    const date = new Date(getTime(item));
    const key = dayKey(date);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: dayLabel(date, now), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/** 格式化为 HH:mm */
export function formatClock(ts: number): string {
  const date = new Date(ts);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Convert a timestamp (ms) to a human-readable relative time string in Chinese.
 * e.g. "刚刚", "5分钟前", "3天前", "2个月前"
 */
export function timeAgo(timestamp: number | null | undefined): string {
  if (timestamp == null) return '';

  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) return '刚刚';

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  if (months < 12) return `${months}个月前`;
  return `${years}年前`;
}

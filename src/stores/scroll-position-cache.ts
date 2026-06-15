/**
 * 文件浏览状态缓存（仅当前会话）
 *
 * 记录每个文件在 WYSIWYG 模式下的滚动位置和光标位置，
 * 使用户在文件树中来回切换文件时，能恢复到上次浏览的位置。
 */

/** 缓存的视图状态 */
export interface ViewStateSnapshot {
  /** 滚动容器的 scrollTop */
  scrollTop: number;
  /** ProseMirror 选区锚点位置（anchor） */
  cursorAnchor: number;
  /** ProseMirror 选区头部位置（head） */
  cursorHead: number;
  /** 记录时间戳 */
  timestamp: number;
}

/** 文件路径 → 视图状态 的内存缓存 */
const cache = new Map<string, ViewStateSnapshot>();

/** 最大缓存条目数，防止内存泄漏 */
const MAX_ENTRIES = 100;

/**
 * 保存文件的视图状态
 * @param filePath 文件路径（作为 key）
 * @param snapshot 视图状态快照
 */
export function saveViewState(filePath: string, snapshot: ViewStateSnapshot): void {
  // 淘汰最旧的条目
  if (cache.size >= MAX_ENTRIES && !cache.has(filePath)) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, value] of cache) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(filePath, snapshot);
}

/**
 * 获取文件的视图状态
 * @param filePath 文件路径
 * @returns 缓存的视图状态，如果没有则返回 null
 */
export function getViewState(filePath: string): ViewStateSnapshot | null {
  return cache.get(filePath) ?? null;
}

/**
 * 删除文件的视图状态（文件被关闭/删除时调用）
 * @param filePath 文件路径
 */
export function removeViewState(filePath: string): void {
  cache.delete(filePath);
}

/**
 * 清空所有缓存
 */
export function clearAllViewStates(): void {
  cache.clear();
}

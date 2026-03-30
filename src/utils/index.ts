export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function countWords(text: string): number {
  const cleaned = text.replace(/\s/g, '');
  return cleaned.length;
}

export function countChars(text: string): number {
  return text.length;
}

export function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length;
}

export function getReadingTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / 300));
}

export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  return debounced as T;
}

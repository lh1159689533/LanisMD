import { useCallback, useRef } from 'react';

export function useDebounce<T extends (...args: unknown[]) => void>(callback: T, delay: number): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => callback(...args), delay);
    },
    [callback, delay],
  ) as T;

  return debouncedFn;
}

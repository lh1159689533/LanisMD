/**
 * Platform detection utilities
 */

/**
 * Check if the app is running in Tauri environment
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Check if the app is running in browser environment (not Tauri)
 */
export function isBrowser(): boolean {
  return !isTauri();
}

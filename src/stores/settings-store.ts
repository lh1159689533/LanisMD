import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode, AppConfig } from '@/types';

const DEFAULT_CONFIG: AppConfig = {
  theme: 'system',
  language: 'system',
  editor: {
    fontSize: 16,
    fontFamily: 'system',
    maxWidth: 800,
    lineHeight: 1.75,
    wordWrap: 'soft',
    showLineNumbers: true,
    autoSaveDelay: 1000,
    tabSize: 4,
    bracketMatching: true,
    defaultMode: 'wysiwyg',
    defaultTypewriterMode: false,
    defaultFocusMode: false,
    codeBlock: {
      showLineNumbers: true,
    },
  },
  recentFiles: { maxCount: 20 },
  recentFolders: { closeOnClickOutside: true },
  restoreSession: false,
  sidebar: { position: 'left', width: 280 },
  image: {
    insertAction: 'copy-to-assets',
    assetsFolderName: 'assets',
  },
};

interface SettingsState {
  config: AppConfig;
  setConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  setNestedConfig: (path: string, value: unknown) => void;
  resetToDefaults: () => void;
}

/**
 * 深度合并工具：将 source 中缺失的字段用 defaults 填充。
 * 仅处理普通对象，数组和其他类型直接取 source 值。
 */
function deepMergeDefaults<T extends Record<string, unknown>>(
  defaults: T,
  source: Record<string, unknown>,
): T {
  const result = { ...defaults };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const defVal = (defaults as Record<string, unknown>)[key];
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      defVal !== null &&
      typeof defVal === 'object' &&
      !Array.isArray(defVal)
    ) {
      // 递归合并嵌套对象
      (result as Record<string, unknown>)[key] = deepMergeDefaults(
        defVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      // source 中存在的字段优先使用 source 的值
      (result as Record<string, unknown>)[key] = srcVal;
    }
  }
  return result;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,

      setConfig: (key, value) =>
        set((state) => ({
          config: { ...state.config, [key]: value },
        })),

      setNestedConfig: (path, value) =>
        set((state) => {
          const newConfig = JSON.parse(JSON.stringify(state.config));
          const keys = path.split('.');
          let current: Record<string, unknown> = newConfig;
          for (let i = 0; i < keys.length - 1; i++) {
            if (current[keys[i]] === undefined) {
              current[keys[i]] = {};
            }
            current = current[keys[i]] as Record<string, unknown>;
          }
          current[keys[keys.length - 1]] = value;
          return { config: newConfig };
        }),

      resetToDefaults: () => set({ config: DEFAULT_CONFIG }),
    }),
    {
      name: 'settings-store',
      partialize: (state) => ({ config: state.config }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { config?: Record<string, unknown> };
        if (!persisted?.config) return currentState;
        return {
          ...currentState,
          config: deepMergeDefaults(
            DEFAULT_CONFIG as unknown as Record<string, unknown>,
            persisted.config,
          ) as AppConfig,
        };
      },
    },
  ),
);

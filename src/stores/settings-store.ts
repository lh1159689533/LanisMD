import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeMode, AppConfig } from "@/types";

const DEFAULT_CONFIG: AppConfig = {
  theme: "system",
  language: "system",
  editor: {
    fontSize: 16,
    fontFamily: "system",
    maxWidth: 800,
    lineHeight: 1.75,
    wordWrap: "soft",
    showLineNumbers: true,
  },
  recentFiles: { maxCount: 20 },
  recentFolders: { closeOnClickOutside: true },
  restoreSession: false,
  sidebar: { position: "left", width: 280 },
  image: {
    insertAction: "copy-to-assets",
    assetsFolderName: "assets",
  },
};

interface SettingsState {
  config: AppConfig;
  setConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  setNestedConfig: (path: string, value: unknown) => void;
  resetToDefaults: () => void;
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
          const keys = path.split(".");
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
      name: "settings-store",
      partialize: (state) => ({ config: state.config }),
    }
  )
);

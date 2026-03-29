import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";

export function useTheme() {
  const { config } = useSettingsStore();

  useEffect(() => {
    const applyTheme = (theme: "light" | "dark") => {
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };

    if (config.theme === "system") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      applyTheme(isDark ? "dark" : "light");

      const handler = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? "dark" : "light");
      };
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      applyTheme(config.theme);
    }
  }, [config.theme]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--editor-max-width",
      `${config.editor.maxWidth}px`
    );
  }, [config.editor.maxWidth]);
}

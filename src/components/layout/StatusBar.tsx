import { RiFileTextLine, RiSunLine, RiMoonLine } from "react-icons/ri";
import { useEditorStore } from "@/stores/editor-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useFileStore } from "@/stores/file-store";
import type { ThemeMode } from "@/types";

export function StatusBar() {
  const { wordCount, charCount, lineCount, cursorLine, cursorColumn } =
    useEditorStore();
  const { config, setConfig } = useSettingsStore();
  const currentFile = useFileStore((s) => s.currentFile);

  const toggleTheme = () => {
    const next: ThemeMode =
      config.theme === "light" ? "dark" : config.theme === "dark" ? "system" : "light";
    setConfig("theme", next);
  };

  const themeIcon =
    config.theme === "dark" ? (
      <RiMoonLine size={13} />
    ) : config.theme === "light" ? (
      <RiSunLine size={13} />
    ) : (
      <span className="text-[10px]">系统</span>
    );

  return (
    <div className="flex items-center justify-between h-6 px-3 text-[11px] text-[var(--sidebar-text)] bg-[var(--titlebar-bg)] border-t border-[var(--editor-border)] shrink-0 select-none">
      <div className="flex items-center gap-3">
        {currentFile && <>
          <span>
            行 {cursorLine}, 列 {cursorColumn}
          </span>
          <span>{lineCount} 行</span>
          <span>{charCount} 字符</span>
          <span>{wordCount} 字</span></>}
      </div>
      <div className="flex items-center gap-3">
        {currentFile && (
          <span className="flex items-center gap-1">
            <RiFileTextLine size={12} />
            {currentFile.encoding.toUpperCase()}
          </span>
        )}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1 hover:text-[var(--accent)] transition-colors"
          title={`Theme: ${config.theme}`}
        >
          {themeIcon}
        </button>
      </div>
    </div>
  );
}

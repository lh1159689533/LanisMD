import { RiCloseLine, RiSunLine, RiMoonLine } from "react-icons/ri";
import { useUIStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ThemeMode } from "@/types";
import type { AppConfig } from "@/types";

const SECTIONS = [
  { id: "general", label: "通用" },
  { id: "appearance", label: "外观" },
  { id: "editor", label: "编辑器" },
  { id: "shortcuts", label: "快捷键" },
];

export function SettingsDialog() {
  const { closeSettings, settingsActiveSection } = useUIStore();
  const { config, setConfig, setNestedConfig } = useSettingsStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="flex w-[600px] max-h-[500px] bg-white dark:bg-[#1f2335] rounded-lg shadow-2xl overflow-hidden">
        {/* Navigation */}
        <div className="w-40 bg-slate-50 dark:bg-[#1a1b26] p-3 border-r border-[var(--editor-border)]">
          <h2 className="text-sm font-semibold mb-3 px-2">设置</h2>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => useUIStore.setState({ settingsActiveSection: section.id })}
                className={`text-left px-2 py-1.5 text-xs rounded-md transition-colors ${
                  settingsActiveSection === section.id
                    ? "bg-[var(--accent)] text-white"
                    : "hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">
              {SECTIONS.find((s) => s.id === settingsActiveSection)?.label}
            </h3>
            <button
              onClick={closeSettings}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
            >
              <RiCloseLine size={16} />
            </button>
          </div>

          {settingsActiveSection === "general" && (
            <div className="space-y-4 text-xs">
              <div className="text-[var(--sidebar-text)]">
                <p>自动保存始终开启。停止编辑 1 秒后将自动保存更改。</p>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-[var(--sidebar-text)]">
                  点击外部区域关闭"最近文件夹"面板
                </label>
                <button
                  onClick={() =>
                    setNestedConfig(
                      "recentFolders.closeOnClickOutside",
                      !config.recentFolders?.closeOnClickOutside
                    )
                  }
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    config.recentFolders?.closeOnClickOutside !== false
                      ? "bg-[var(--accent)]"
                      : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      config.recentFolders?.closeOnClickOutside !== false
                        ? "translate-x-4"
                        : ""
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {settingsActiveSection === "appearance" && (
            <div className="space-y-4 text-xs">
              <label className="block">主题</label>
              <div className="flex gap-2">
                {(["system", "light", "dark"] as ThemeMode[]).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setConfig("theme", theme)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition-colors ${
                      config.theme === theme
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--editor-border)] hover:border-[var(--accent)]/50"
                    }`}
                  >
                    {theme === "light" && <RiSunLine size={13} />}
                    {theme === "dark" && <RiMoonLine size={13} />}
                    <span>{theme === "system" ? "跟随系统" : theme === "light" ? "浅色" : "深色"}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {settingsActiveSection === "editor" && (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <label>字体大小</label>
                <span>{config.editor.fontSize}px</span>
              </div>
              <div className="flex items-center justify-between">
                <label>最大宽度</label>
                <span>{config.editor.maxWidth}px</span>
              </div>
              <div className="flex items-center justify-between">
                <label>行高</label>
                <span>{config.editor.lineHeight}</span>
              </div>
            </div>
          )}

          {settingsActiveSection === "shortcuts" && (
            <div className="text-xs text-[var(--sidebar-text)]">
              <p>快捷键设置将在后续版本中提供。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

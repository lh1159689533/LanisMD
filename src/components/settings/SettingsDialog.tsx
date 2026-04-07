import { RiCloseLine, RiSunLine, RiMoonLine } from 'react-icons/ri';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/utils/cn';
import type { ThemeMode } from '@/types';

const SECTIONS = [
  { id: 'general', label: '通用' },
  { id: 'appearance', label: '外观' },
  { id: 'editor', label: '编辑器' },
  { id: 'shortcuts', label: '快捷键' },
];

export function SettingsDialog() {
  const { closeSettings, settingsActiveSection } = useUIStore();
  const { config, setConfig, setNestedConfig } = useSettingsStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className={cn(
          'flex h-[80%] max-h-[500px] min-h-[200px] w-[60%] min-w-[300px]',
          'overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-[#1f2335]',
        )}
      >
        {/* Navigation */}
        <div className="w-40 border-r border-[var(--lanismd-editor-border)] bg-slate-50 p-3 dark:bg-[#1a1b26]">
          <h2 className="mb-3 px-2 text-sm font-semibold">设置</h2>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => useUIStore.setState({ settingsActiveSection: section.id })}
                className={cn(
                  'rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  settingsActiveSection === section.id
                    ? 'bg-[var(--lanismd-accent)] text-white'
                    : 'hover:bg-black/5 dark:hover:bg-white/5',
                )}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {SECTIONS.find((s) => s.id === settingsActiveSection)?.label}
            </h3>
            <button
              onClick={closeSettings}
              className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              <RiCloseLine size={16} />
            </button>
          </div>

          {settingsActiveSection === 'general' && (
            <div className="space-y-4 text-xs">
              <div className="text-[var(--lanismd-sidebar-text)]">
                <p>自动保存始终开启。停止编辑 1 秒后将自动保存更改。</p>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-[var(--lanismd-sidebar-text)]">
                  点击外部区域关闭"最近文件夹"面板
                </label>
                <button
                  onClick={() =>
                    setNestedConfig(
                      'recentFolders.closeOnClickOutside',
                      !config.recentFolders?.closeOnClickOutside,
                    )
                  }
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    config.recentFolders?.closeOnClickOutside !== false
                      ? 'bg-[var(--lanismd-accent)]'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={cn(
                      'absolute left-0.5 top-0.5 h-4 w-4',
                      'rounded-full bg-white shadow transition-transform',
                      config.recentFolders?.closeOnClickOutside !== false ? 'translate-x-4' : '',
                    )}
                  />
                </button>
              </div>
            </div>
          )}

          {settingsActiveSection === 'appearance' && (
            <div className="space-y-4 text-xs">
              <label className="block">主题</label>
              <div className="flex gap-2">
                {(['system', 'light', 'dark'] as ThemeMode[]).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setConfig('theme', theme)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 transition-colors ${
                      config.theme === theme
                        ? 'bg-[var(--lanismd-accent)]/10 border-[var(--lanismd-accent)] text-[var(--lanismd-accent)]'
                        : 'hover:border-[var(--lanismd-accent)]/50 border-[var(--lanismd-editor-border)]'
                    }`}
                  >
                    {theme === 'light' && <RiSunLine size={13} />}
                    {theme === 'dark' && <RiMoonLine size={13} />}
                    <span>
                      {theme === 'system' ? '跟随系统' : theme === 'light' ? '浅色' : '深色'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {settingsActiveSection === 'editor' && (
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

              {/* Code Block Settings */}
              <div className="mt-2 border-t border-[var(--lanismd-editor-border)] pt-3">
                <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--lanismd-sidebar-text)]">
                  代码块
                </label>
                <div className="flex items-center justify-between">
                  <label className="text-[var(--lanismd-sidebar-text)]">显示行号</label>
                  <button
                    onClick={() =>
                      setNestedConfig(
                        'editor.codeBlock.showLineNumbers',
                        !config.editor.codeBlock?.showLineNumbers,
                      )
                    }
                    className={`relative h-5 w-9 rounded-full transition-colors ${
                      config.editor.codeBlock?.showLineNumbers !== false
                        ? 'bg-[var(--lanismd-accent)]'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={cn(
                        'absolute left-0.5 top-0.5 h-4 w-4',
                        'rounded-full bg-white shadow transition-transform',
                        config.editor.codeBlock?.showLineNumbers !== false ? 'translate-x-4' : '',
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {settingsActiveSection === 'shortcuts' && (
            <div className="text-xs text-[var(--lanismd-sidebar-text)]">
              <p>快捷键设置将在后续版本中提供。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

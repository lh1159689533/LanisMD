import { RiCloseLine, RiSunLine, RiMoonLine, RiComputerLine } from 'react-icons/ri';
import { TbLeaf, TbSnowflake } from 'react-icons/tb';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/utils/cn';
import { THEME_LIST } from '@/types/config';
import type { ThemeMode } from '@/types';

import '../../styles/settings.css';

// 主题图标映射
const THEME_ICONS: Record<ThemeMode, React.ReactNode> = {
  system: <RiComputerLine size={13} />,
  light: <RiSunLine size={13} />,
  dark: <RiMoonLine size={13} />,
  sepia: <TbLeaf size={13} />,
  nord: <TbSnowflake size={13} />,
};

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
    <div className="settings-dialog-overlay">
      <div className="settings-dialog">
        {/* Navigation */}
        <div className="settings-dialog-nav">
          <h2 className="settings-dialog-nav-title">设置</h2>
          <nav className="settings-dialog-nav-list">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => useUIStore.setState({ settingsActiveSection: section.id })}
                className={cn(
                  'settings-dialog-nav-item',
                  settingsActiveSection === section.id && 'active',
                )}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="settings-dialog-content">
          <div className="settings-dialog-header">
            <h3 className="settings-dialog-title">
              {SECTIONS.find((s) => s.id === settingsActiveSection)?.label}
            </h3>
            <button onClick={closeSettings} className="settings-dialog-close">
              <RiCloseLine size={16} />
            </button>
          </div>

          {settingsActiveSection === 'general' && (
            <div className="settings-section">
              <div className="settings-item-description">
                <p>自动保存始终开启。停止编辑 1 秒后将自动保存更改。</p>
              </div>
              <div className="settings-item">
                <label className="settings-item-label">点击外部区域关闭"最近文件夹"面板</label>
                <button
                  onClick={() =>
                    setNestedConfig(
                      'recentFolders.closeOnClickOutside',
                      !config.recentFolders?.closeOnClickOutside,
                    )
                  }
                  className={cn(
                    'settings-toggle',
                    config.recentFolders?.closeOnClickOutside !== false && 'checked',
                  )}
                >
                  <span className="settings-toggle-thumb" />
                </button>
              </div>
            </div>
          )}

          {settingsActiveSection === 'appearance' && (
            <div className="settings-section">
              <label className="settings-item-label">主题</label>
              <div className="settings-theme-list">
                {THEME_LIST.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setConfig('theme', theme.id)}
                    title={theme.description}
                    className={cn('settings-theme-item', config.theme === theme.id && 'selected')}
                  >
                    <span className="settings-theme-icon">{THEME_ICONS[theme.id]}</span>
                    <span>{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {settingsActiveSection === 'editor' && (
            <div className="settings-section">
              <div className="settings-item">
                <label className="settings-item-label">字体大小</label>
                <span className="settings-item-value">{config.editor.fontSize}px</span>
              </div>
              <div className="settings-item">
                <label className="settings-item-label">最大宽度</label>
                <span className="settings-item-value">{config.editor.maxWidth}px</span>
              </div>
              <div className="settings-item">
                <label className="settings-item-label">行高</label>
                <span className="settings-item-value">{config.editor.lineHeight}</span>
              </div>

              {/* Code Block Settings */}
              <div className="settings-section-title">代码块</div>
              <div className="settings-item">
                <label className="settings-item-label">显示行号</label>
                <button
                  onClick={() =>
                    setNestedConfig(
                      'editor.codeBlock.showLineNumbers',
                      !config.editor.codeBlock?.showLineNumbers,
                    )
                  }
                  className={cn(
                    'settings-toggle',
                    config.editor.codeBlock?.showLineNumbers !== false && 'checked',
                  )}
                >
                  <span className="settings-toggle-thumb" />
                </button>
              </div>
            </div>
          )}

          {settingsActiveSection === 'shortcuts' && (
            <div className="settings-shortcuts-hint">
              <p>快捷键设置将在后续版本中提供。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

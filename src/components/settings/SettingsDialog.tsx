import { useState, useEffect } from 'react';
import {
  RiCloseLine,
  RiSunLine,
  RiMoonLine,
  RiComputerLine,
  RiFolderOpenLine,
  RiPaletteLine,
} from 'react-icons/ri';
import { TbLeaf, TbSnowflake } from 'react-icons/tb';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { themeLoader, type ThemeMetadata } from '@/services';
import { cn } from '@/utils/cn';
import { BUILTIN_THEME_LIST, isCustomTheme, type BuiltinTheme } from '@/types/config';
import type { ThemeMode } from '@/types';

import '../../styles/settings.css';

// 内置主题图标映射
const BUILTIN_THEME_ICONS: Record<BuiltinTheme | 'system', React.ReactNode> = {
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

  // 用户自定义主题列表
  const [userThemes, setUserThemes] = useState<ThemeMetadata[]>([]);

  // 加载用户主题列表
  useEffect(() => {
    themeLoader.listUserThemes().then(setUserThemes);
  }, []);

  // 判断当前是否选中某个主题
  const isThemeSelected = (themeId: ThemeMode) => config.theme === themeId;
  const isCustomThemeSelected = (themeId: string) =>
    isCustomTheme(config.theme) && config.theme === `custom:${themeId}`;

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
              {/* 内置主题 */}
              <label className="settings-item-label">内置主题</label>
              <div className="settings-theme-list">
                {BUILTIN_THEME_LIST.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setConfig('theme', theme.id)}
                    title={theme.description}
                    className={cn('settings-theme-item', isThemeSelected(theme.id) && 'selected')}
                  >
                    <span className="settings-theme-icon">
                      {BUILTIN_THEME_ICONS[theme.id as BuiltinTheme | 'system']}
                    </span>
                    <span>{theme.name}</span>
                  </button>
                ))}
              </div>

              {/* 用户自定义主题 */}
              {userThemes.length > 0 && (
                <>
                  <label className="settings-item-label" style={{ marginTop: '16px' }}>
                    自定义主题
                  </label>
                  <div className="settings-theme-list">
                    {userThemes.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => setConfig('theme', `custom:${theme.id}`)}
                        title={`用户主题: ${theme.name}`}
                        className={cn(
                          'settings-theme-item',
                          isCustomThemeSelected(theme.id) && 'selected',
                        )}
                      >
                        <span className="settings-theme-icon">
                          <RiPaletteLine size={13} />
                        </span>
                        <span>{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* 自定义 CSS 区域 */}
              <div className="settings-section-title">自定义样式</div>
              <div className="settings-item-description">
                <p>
                  创建主题：在主题目录放置 <code>my-theme.css</code> 单文件，或创建{' '}
                  <code>my-theme/my-theme.css</code> 目录形式（支持自定义字体）。
                </p>
                <p style={{ marginTop: '8px' }}>
                  覆盖样式：创建 <code>base.user.css</code>（全局）或{' '}
                  <code>light.user.css</code> 等（主题专属）。
                </p>
              </div>
              <div className="settings-item">
                <label className="settings-item-label">主题目录</label>
                <button
                  onClick={async () => {
                    await themeLoader.openUserThemesDir();
                    // 刷新主题列表
                    const themes = await themeLoader.listUserThemes();
                    setUserThemes(themes);
                  }}
                  className="settings-button"
                >
                  <RiFolderOpenLine size={14} />
                  <span>打开目录</span>
                </button>
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

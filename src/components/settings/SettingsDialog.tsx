import { useState, useEffect, useMemo } from 'react';
import {
  RiCloseLine,
  RiSunLine,
  RiMoonLine,
  RiComputerLine,
  RiFolderOpenLine,
  RiPaletteLine,
} from 'react-icons/ri';
import { TbLeaf, TbSnowflake, TbFlower } from 'react-icons/tb';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { themeLoader, type ThemeMetadata } from '@/services';
import { cn } from '@/utils/cn';
import { BUILTIN_THEME_LIST, isCustomTheme, type BuiltinTheme } from '@/types/config';
import type { ThemeMode } from '@/types';
import {
  SettingsSlider,
  SettingsSelect,
  SettingsTextInput,
  SettingsNumberInput,
  SettingsSegmentedControl,
} from './SettingsControls';

import '../../styles/settings.css';

// ---------------------------------------------------------------------------
// 快捷键数据定义
// ---------------------------------------------------------------------------

interface ShortcutItem {
  /** 功能名称 */
  label: string;
  /** macOS 快捷键 */
  mac: string;
  /** Windows/Linux 快捷键 */
  win: string;
}

interface ShortcutGroup {
  /** 分组标题 */
  title: string;
  /** 该组的快捷键列表 */
  items: ShortcutItem[];
}

/** 完整的快捷键参考数据 */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: '段落格式',
    items: [
      { label: '标题 1', mac: 'Cmd+1', win: 'Ctrl+1' },
      { label: '标题 2', mac: 'Cmd+2', win: 'Ctrl+2' },
      { label: '标题 3', mac: 'Cmd+3', win: 'Ctrl+3' },
      { label: '标题 4', mac: 'Cmd+4', win: 'Ctrl+4' },
      { label: '标题 5', mac: 'Cmd+5', win: 'Ctrl+5' },
      { label: '标题 6', mac: 'Cmd+6', win: 'Ctrl+6' },
      { label: '段落（取消标题）', mac: 'Cmd+0', win: 'Ctrl+0' },
      { label: '增加标题级别', mac: 'Cmd+=', win: 'Ctrl+=' },
      { label: '减小标题级别', mac: 'Cmd+-', win: 'Ctrl+-' },
      { label: '引用', mac: 'Cmd+Option+Q', win: 'Ctrl+Shift+Q' },
      { label: '有序列表', mac: 'Cmd+Option+O', win: 'Ctrl+Shift+[' },
      { label: '无序列表', mac: 'Cmd+Option+U', win: 'Ctrl+Shift+]' },
      { label: '表格', mac: 'Cmd+Option+T', win: 'Ctrl+T' },
      { label: '代码块', mac: 'Cmd+Option+C', win: 'Ctrl+Shift+K' },
      { label: '代码块（备选）', mac: 'Cmd+Shift+`', win: 'Ctrl+Shift+`' },
      { label: '数学公式块', mac: 'Cmd+Option+B', win: 'Ctrl+Shift+M' },
    ],
  },
  {
    title: '文本格式',
    items: [
      { label: '加粗', mac: 'Cmd+B', win: 'Ctrl+B' },
      { label: '斜体', mac: 'Cmd+I', win: 'Ctrl+I' },
      { label: '下划线', mac: 'Cmd+U', win: 'Ctrl+U' },
      { label: '删除线', mac: 'Cmd+Shift+X', win: 'Alt+Shift+5' },
      { label: '行内代码', mac: 'Cmd+E', win: 'Ctrl+E' },
      { label: '高亮', mac: 'Cmd+Option+H', win: 'Ctrl+Shift+H' },
      { label: '超链接', mac: 'Cmd+K', win: 'Ctrl+K' },
      { label: '图片', mac: 'Cmd+Option+I', win: 'Ctrl+Shift+I' },
      { label: '清除格式', mac: 'Cmd+\\', win: 'Ctrl+\\' },
    ],
  },
  {
    title: '通用',
    items: [
      { label: '撤销', mac: 'Cmd+Z', win: 'Ctrl+Z' },
      { label: '重做', mac: 'Cmd+Shift+Z', win: 'Ctrl+Shift+Z' },
      { label: '增加缩进', mac: 'Tab', win: 'Tab' },
      { label: '减少缩进', mac: 'Shift+Tab', win: 'Shift+Tab' },
    ],
  },
];

// 内置主题图标映射
const BUILTIN_THEME_ICONS: Record<BuiltinTheme | 'system', React.ReactNode> = {
  system: <RiComputerLine size={13} />,
  light: <RiSunLine size={13} />,
  dark: <RiMoonLine size={13} />,
  sepia: <TbLeaf size={13} />,
  nord: <TbSnowflake size={13} />,
  // Bloom 系列 - 浅色
  'bloom-petal': <TbFlower size={13} />,
  'bloom-spring': <TbFlower size={13} />,
  'bloom-amber': <TbFlower size={13} />,
  'bloom-ink': <TbFlower size={13} />,
  'bloom-mist': <TbFlower size={13} />,
  'bloom-ripple': <TbFlower size={13} />,
  'bloom-stone': <TbFlower size={13} />,
  'bloom-verdant': <TbFlower size={13} />,
  // Bloom 系列 - 深色
  'bloom-petal-dark': <TbFlower size={13} />,
  'bloom-spring-dark': <TbFlower size={13} />,
  'bloom-amber-dark': <TbFlower size={13} />,
  'bloom-ink-dark': <TbFlower size={13} />,
  'bloom-mist-dark': <TbFlower size={13} />,
  'bloom-ripple-dark': <TbFlower size={13} />,
  'bloom-stone-dark': <TbFlower size={13} />,
  'bloom-verdant-dark': <TbFlower size={13} />,
};

const SECTIONS = [
  { id: 'general', label: '通用' },
  { id: 'appearance', label: '外观' },
  { id: 'editor', label: '编辑器' },
  { id: 'image', label: '图片' },
  { id: 'shortcuts', label: '快捷键' },
];

/** 当前平台是否为 macOS */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/**
 * 渲染快捷键组合，将 "Cmd+Shift+X" 拆分为多个 <kbd> 标签
 */
function ShortcutKeys({ shortcut }: { shortcut: string }) {
  const parts = useMemo(() => shortcut.split('+'), [shortcut]);
  return (
    <span className="settings-shortcut-keys">
      {parts.map((part, index) => (
        <span key={index}>
          <kbd className="settings-shortcut-kbd">{part}</kbd>
          {index < parts.length - 1 && <span className="settings-shortcut-plus">+</span>}
        </span>
      ))}
    </span>
  );
}

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

          <div className="settings-dialog-body">
          {settingsActiveSection === 'general' && (
            <div className="settings-section">
              {/* G - 自动保存延迟 */}
              <div className="settings-item">
                <label className="settings-item-label">自动保存延迟</label>
                <SettingsSlider
                  value={config.editor.autoSaveDelay}
                  min={500}
                  max={5000}
                  step={500}
                  suffix="ms"
                  onChange={(v) => setNestedConfig('editor.autoSaveDelay', v)}
                />
              </div>
              <div className="settings-item-hint">
                <p>停止编辑后等待指定时间自动保存更改。</p>
              </div>

              {/* G1 - 恢复上次会话 */}
              <div className="settings-item">
                <label className="settings-item-label">启动时恢复上次会话</label>
                <button
                  onClick={() => setConfig('restoreSession', !config.restoreSession)}
                  className={cn(
                    'settings-toggle',
                    config.restoreSession && 'checked',
                  )}
                >
                  <span className="settings-toggle-thumb" />
                </button>
              </div>

              {/* G5 - 最近文件数量上限 */}
              <div className="settings-item">
                <label className="settings-item-label">最近文件数量上限</label>
                <SettingsNumberInput
                  value={config.recentFiles.maxCount}
                  min={5}
                  max={50}
                  step={5}
                  onChange={(v) => setNestedConfig('recentFiles.maxCount', v)}
                />
              </div>

              {/* G8 - 面板行为 */}
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

              {/* A3 - 侧边栏位置 */}
              <div className="settings-section-title">布局</div>
              <div className="settings-item">
                <label className="settings-item-label">侧边栏位置</label>
                <SettingsSegmentedControl
                  value={config.sidebar.position}
                  options={[
                    { value: 'left', label: '左侧' },
                    { value: 'right', label: '右侧' },
                  ]}
                  onChange={(v) => setNestedConfig('sidebar.position', v)}
                />
              </div>
            </div>
          )}

          {settingsActiveSection === 'editor' && (
            <div className="settings-section">
              {/* E1 - 编辑器字体大小 */}
              <div className="settings-item">
                <label className="settings-item-label">字体大小</label>
                <SettingsSlider
                  value={config.editor.fontSize}
                  min={12}
                  max={24}
                  step={1}
                  suffix="px"
                  onChange={(v) => setNestedConfig('editor.fontSize', v)}
                />
              </div>

              {/* E2 - 编辑器字体 */}
              <div className="settings-item">
                <label className="settings-item-label">字体</label>
                <SettingsSelect
                  value={config.editor.fontFamily}
                  options={[
                    { value: 'system', label: '系统默认' },
                    { value: 'serif', label: '衬线体 (Serif)' },
                    { value: 'sans-serif', label: '无衬线体 (Sans-serif)' },
                    { value: 'monospace', label: '等宽字体 (Monospace)' },
                  ]}
                  onChange={(v) => setNestedConfig('editor.fontFamily', v)}
                />
              </div>

              {/* E3 - 编辑器最大宽度 */}
              <div className="settings-item">
                <label className="settings-item-label">最大宽度</label>
                <SettingsSlider
                  value={config.editor.maxWidth}
                  min={600}
                  max={1200}
                  step={50}
                  suffix="px"
                  onChange={(v) => setNestedConfig('editor.maxWidth', v)}
                />
              </div>

              {/* E4 - 编辑器行高 */}
              <div className="settings-item">
                <label className="settings-item-label">行高</label>
                <SettingsSlider
                  value={config.editor.lineHeight}
                  min={1.2}
                  max={2.5}
                  step={0.05}
                  formatValue={(v) => v.toFixed(2)}
                  onChange={(v) => setNestedConfig('editor.lineHeight', v)}
                />
              </div>

              {/* E5 - 自动换行模式 */}
              <div className="settings-item">
                <label className="settings-item-label">自动换行</label>
                <SettingsSelect
                  value={config.editor.wordWrap}
                  options={[
                    { value: 'soft', label: '软换行' },
                    { value: 'hard', label: '硬换行' },
                    { value: 'off', label: '关闭' },
                  ]}
                  onChange={(v) => setNestedConfig('editor.wordWrap', v)}
                />
              </div>

              {/* P1-12 - Tab 缩进宽度 */}
              <div className="settings-item">
                <label className="settings-item-label">Tab 缩进宽度</label>
                <SettingsSegmentedControl
                  value={String(config.editor.tabSize)}
                  options={[
                    { value: '2', label: '2' },
                    { value: '4', label: '4' },
                    { value: '8', label: '8' },
                  ]}
                  onChange={(v) => setNestedConfig('editor.tabSize', Number(v))}
                />
              </div>

              {/* P1-14 - 默认编辑模式 */}
              <div className="settings-item">
                <label className="settings-item-label">默认编辑模式</label>
                <SettingsSelect
                  value={config.editor.defaultMode}
                  options={[
                    { value: 'wysiwyg', label: '所见即所得' },
                    { value: 'source', label: '源码模式' },
                  ]}
                  onChange={(v) => setNestedConfig('editor.defaultMode', v)}
                />
              </div>

              {/* P1-15 - 默认打字机模式 */}
              <div className="settings-item">
                <label className="settings-item-label">默认开启打字机模式</label>
                <button
                  onClick={() =>
                    setNestedConfig(
                      'editor.defaultTypewriterMode',
                      !config.editor.defaultTypewriterMode,
                    )
                  }
                  className={cn(
                    'settings-toggle',
                    config.editor.defaultTypewriterMode && 'checked',
                  )}
                >
                  <span className="settings-toggle-thumb" />
                </button>
              </div>

              {/* P1-16 - 默认专注模式 */}
              <div className="settings-item">
                <label className="settings-item-label">默认开启专注模式</label>
                <button
                  onClick={() =>
                    setNestedConfig(
                      'editor.defaultFocusMode',
                      !config.editor.defaultFocusMode,
                    )
                  }
                  className={cn(
                    'settings-toggle',
                    config.editor.defaultFocusMode && 'checked',
                  )}
                >
                  <span className="settings-toggle-thumb" />
                </button>
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

              {/* P1-13 - 括号匹配 */}
              <div className="settings-item">
                <label className="settings-item-label">括号匹配</label>
                <button
                  onClick={() =>
                    setNestedConfig(
                      'editor.bracketMatching',
                      !config.editor.bracketMatching,
                    )
                  }
                  className={cn(
                    'settings-toggle',
                    config.editor.bracketMatching !== false && 'checked',
                  )}
                >
                  <span className="settings-toggle-thumb" />
                </button>
              </div>
            </div>
          )}

          {settingsActiveSection === 'image' && (
            <div className="settings-section">
              {/* I1 - 图片插入行为 */}
              <div className="settings-item">
                <label className="settings-item-label">插入图片时</label>
                <SettingsSelect
                  value={config.image.insertAction}
                  options={[
                    { value: 'copy-to-assets', label: '复制到资源目录' },
                    { value: 'relative-path', label: '使用相对路径' },
                    { value: 'absolute-path', label: '使用绝对路径' },
                  ]}
                  onChange={(v) => setNestedConfig('image.insertAction', v)}
                />
              </div>

              {/* I2 - 图片资源目录名 */}
              <div className="settings-item">
                <label className="settings-item-label">资源目录名称</label>
                <SettingsTextInput
                  value={config.image.assetsFolderName}
                  placeholder="assets"
                  onChange={(v) => setNestedConfig('image.assetsFolderName', v)}
                />
              </div>
              <div className="settings-item-hint">
                <p>插入图片选择"复制到资源目录"时，图片将被复制到当前文件同级的此目录中。</p>
              </div>
            </div>
          )}

          {settingsActiveSection === 'shortcuts' && (
            <div className="settings-section settings-shortcuts">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title} className="settings-shortcut-group">
                  <div className="settings-section-title">{group.title}</div>
                  <div className="settings-shortcut-list">
                    {group.items.map((item) => (
                      <div key={item.label} className="settings-shortcut-row">
                        <span className="settings-shortcut-label">{item.label}</span>
                        <ShortcutKeys shortcut={isMac ? item.mac : item.win} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

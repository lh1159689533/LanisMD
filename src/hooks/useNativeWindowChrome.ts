/**
 * 原生窗口外观同步（Windows 系统标题栏 + 菜单栏）
 *
 * Windows 主窗口使用系统标题栏后，自绘标题栏不再显示，需要：
 * 1. 把当前文件名与未保存标记同步到原生窗口标题；
 * 2. 把应用主题的深浅色同步到窗口主题，使系统标题栏与菜单栏跟随深浅色切换。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                          |
 * | v1.0.0 | 初始实现：同步原生窗口标题与深浅色主题     | REQ: 系统集成-Windows 菜单 TECH: Window.setTheme |
 * /@changelog
 *
 * @author hhhuilli
 */
import { useEffect } from 'react';
import { getCurrentWindow, type Theme } from '@tauri-apps/api/window';
import { useFileStore } from '@/stores/file-store';

const APP_NAME = 'LanisMD';

/** 背景亮度低于该阈值视为深色主题 */
const DARK_LUMINANCE_THRESHOLD = 0.5;

/** 把 CSS 变量解析为计算后的颜色字符串（rgb/rgba） */
function resolveCssColor(variable: string): string {
  const probe = document.createElement('div');
  probe.style.display = 'none';
  probe.style.backgroundColor = `var(${variable})`;
  document.body.appendChild(probe);
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return color;
}

/** 计算 rgb/rgba 颜色的相对亮度（0~1），无法解析时返回 null */
function relativeLuminance(color: string): number | null {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const [r, g, b, a] = match[1].split(/[\s,/]+/).map(Number);
  if ([r, g, b].some(Number.isNaN) || a === 0) return null;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * 判断当前应用主题的深浅色。
 * 内置深色主题带 `dark` class；自定义主题没有该标识，按标题栏背景色亮度判断
 */
function detectAppTheme(): Theme {
  const root = document.documentElement;
  if (root.classList.contains('dark')) return 'dark';
  if (!root.classList.contains('theme-custom')) return 'light';
  const luminance = relativeLuminance(resolveCssColor('--lanismd-titlebar-bg'));
  return luminance !== null && luminance < DARK_LUMINANCE_THRESHOLD ? 'dark' : 'light';
}

/** 生成原生窗口标题：未保存时前置圆点标记，与 Windows 编辑器的常见做法一致 */
function buildWindowTitle(fileName: string | undefined, isDirty: boolean): string {
  if (!fileName) return APP_NAME;
  return `${isDirty ? '\u25CF ' : ''}${fileName} - ${APP_NAME}`;
}

/**
 * 同步原生窗口标题与主题
 * @param enabled 仅在使用系统标题栏的平台（Windows）启用
 */
export function useNativeWindowChrome(enabled: boolean): void {
  const fileName = useFileStore((s) => s.currentFile?.fileName);
  const isDirty = useFileStore((s) => s.currentFile?.isDirty ?? false);

  useEffect(() => {
    if (!enabled) return;
    getCurrentWindow()
      .setTitle(buildWindowTitle(fileName, isDirty))
      .catch((err) => console.error('[useNativeWindowChrome] 设置窗口标题失败:', err));
  }, [enabled, fileName, isDirty]);

  useEffect(() => {
    if (!enabled) return;

    let lastTheme: Theme | null = null;
    const syncTheme = () => {
      const theme = detectAppTheme();
      if (theme === lastTheme) return;
      lastTheme = theme;
      getCurrentWindow()
        .setTheme(theme)
        .catch((err) => console.error('[useNativeWindowChrome] 设置窗口主题失败:', err));
    };

    syncTheme();
    // 主题切换体现为根节点 class 变化，监听它即可覆盖内置与自定义主题
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [enabled]);
}

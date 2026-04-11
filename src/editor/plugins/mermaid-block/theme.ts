/**
 * Mermaid Block - 主题管理
 *
 * 使用 MutationObserver 监听 document.documentElement 的 class 属性变化，
 * 检测 .dark 类的存在/移除，自动切换 Mermaid 主题配置。
 */

import type { ThemeChangeCallback } from './types';
import { initMermaid, clearRenderCache } from './renderer';

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

/** 已注册的主题变化回调（NodeView 重新渲染用） */
const callbacks: Set<ThemeChangeCallback> = new Set();

/** MutationObserver 实例 */
let observer: MutationObserver | null = null;

/** 当前暗色模式状态 */
let isDark = false;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 检测当前是否为暗色模式 */
function detectDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 获取当前是否为暗色模式
 */
export function isDarkMode(): boolean {
  return isDark;
}

/**
 * 注册主题变化回调
 * @returns 取消注册的函数
 */
export function onThemeChange(callback: ThemeChangeCallback): () => void {
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
  };
}

/**
 * 启动主题监听
 * 应在插件初始化时调用一次
 */
export function startThemeObserver(): void {
  if (observer) return;

  // 初始检测
  isDark = detectDarkMode();
  initMermaid(isDark);

  // 监听 class 属性变化
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'class'
      ) {
        const newIsDark = detectDarkMode();
        if (newIsDark !== isDark) {
          isDark = newIsDark;
          // 重新初始化 Mermaid 主题
          initMermaid(isDark);
          // 清除缓存（主题变了，缓存的 SVG 颜色不对）
          clearRenderCache();
          // 通知所有 NodeView 重新渲染
          callbacks.forEach((cb) => cb(isDark));
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}

/**
 * 停止主题监听
 * 应在插件销毁时调用
 */
export function stopThemeObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  callbacks.clear();
}

/**
 * Mermaid Block - 渲染引擎
 *
 * 负责 Mermaid 图表的渲染，包含：
 * - 初始化和主题配置
 * - 异步渲染和错误处理
 * - LRU 缓存机制（最多 100 条）
 */

import mermaid from 'mermaid';
import type { MermaidRenderResult } from './types';
import { CACHE_MAX_SIZE } from './types';

// ---------------------------------------------------------------------------
// 缓存
// ---------------------------------------------------------------------------

/** LRU 缓存：code -> svg */
const renderCache = new Map<string, string>();

/** 简单的 hash 函数，用于缓存键 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return String(hash);
}

/** 清除渲染缓存 */
export function clearRenderCache(): void {
  renderCache.clear();
}

// ---------------------------------------------------------------------------
// 渲染 ID 计数器
// ---------------------------------------------------------------------------

let renderIdCounter = 0;

/**
 * 清理 Mermaid 渲染时残留的临时 DOM 节点
 *
 * mermaid.render() 会在 document.body 中创建 <div id="d{id}"> 作为临时容器，
 * 渲染完成或失败后可能不会自动移除，导致"幽灵元素"残留在页面上。
 */
function cleanupMermaidTempNode(id: string): void {
  // Mermaid 内部会在 id 前加 'd' 前缀
  const tempNode = document.getElementById(`d${id}`);
  if (tempNode) {
    tempNode.remove();
  }
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

/** 当前是否为暗色主题 */
let currentIsDark = false;

/**
 * 初始化 Mermaid 配置
 * @param isDark 是否为暗色主题
 */
export function initMermaid(isDark: boolean): void {
  currentIsDark = isDark;

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark ? 'dark' : 'default',
    securityLevel: 'loose',
    fontFamily: 'var(--lanismd-font-sans)',
    themeVariables: isDark
      ? {
          // 暗色主题变量
          primaryColor: '#4f6d7a',
          primaryTextColor: '#e2e8f0',
          primaryBorderColor: '#4a5568',
          lineColor: '#718096',
          secondaryColor: '#2d3748',
          tertiaryColor: '#1a202c',
          background: '#1a202c',
          mainBkg: '#2d3748',
          nodeBorder: '#4a5568',
          clusterBkg: '#2d3748',
          clusterBorder: '#4a5568',
          titleColor: '#e2e8f0',
          edgeLabelBackground: '#2d3748',
        }
      : {
          // 亮色主题变量
          primaryColor: '#e2e8f0',
          primaryTextColor: '#1e293b',
          primaryBorderColor: '#cbd5e1',
          lineColor: '#64748b',
          secondaryColor: '#f1f5f9',
          tertiaryColor: '#f8fafc',
          background: '#ffffff',
          mainBkg: '#f1f5f9',
          nodeBorder: '#cbd5e1',
          clusterBkg: '#f8fafc',
          clusterBorder: '#e2e8f0',
          titleColor: '#0f172a',
          edgeLabelBackground: '#ffffff',
        },
  });
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

/**
 * 渲染 Mermaid 代码为 SVG
 * @param code Mermaid 源码
 * @returns 渲染结果
 */
export async function renderMermaid(code: string): Promise<MermaidRenderResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { success: false, error: '代码为空' };
  }

  // 检查缓存（加入主题标识避免缓存跨主题混淆）
  const cacheKey = hashCode(`${currentIsDark ? 'd' : 'l'}:${trimmed}`);
  const cached = renderCache.get(cacheKey);
  if (cached) {
    // LRU：命中时删除再重新插入，保持最近使用的在末尾
    renderCache.delete(cacheKey);
    renderCache.set(cacheKey, cached);
    return { success: true, svg: cached };
  }

  const id = `mermaid-render-${++renderIdCounter}`;

  try {
    const { svg } = await mermaid.render(id, trimmed);

    // 清理 Mermaid 残留的临时渲染容器
    cleanupMermaidTempNode(id);

    // 写入缓存
    renderCache.set(cacheKey, svg);

    // 淘汰超出上限的旧条目
    if (renderCache.size > CACHE_MAX_SIZE) {
      const firstKey = renderCache.keys().next().value;
      if (firstKey !== undefined) {
        renderCache.delete(firstKey);
      }
    }

    return { success: true, svg };
  } catch (err) {
    // 渲染失败时也要清理临时容器，否则会残留在 DOM 中
    cleanupMermaidTempNode(id);

    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

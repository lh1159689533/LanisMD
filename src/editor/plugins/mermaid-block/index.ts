/**
 * Mermaid Block Plugin
 *
 * 为 Milkdown 编辑器添加 Mermaid 图表支持：
 * - 拦截 language="mermaid" 的代码块
 * - 使用自定义 NodeView 渲染图表
 * - 支持编辑/预览切换（Typora 风格，边写边看）
 * - 支持主题跟随
 * - 支持导出 PNG/SVG
 *
 * 实现原理：
 * 使用 Milkdown 的 $view API 注册 code_block 的 NodeView 工厂函数，
 * 覆盖 codeBlockView（@milkdown/components 的默认代码块视图）。
 * 当 language="mermaid" 时使用自定义 MermaidNodeView 渲染图表，
 * 其他语言委托给原始的 codeBlockView 工厂函数（CodeMirror 代码块）。
 *
 * 注册顺序要求：
 * 在 editor-setup.ts 中，mermaidBlockPlugin 必须在 codeBlockComponent 之后注册，
 * 这样 codeBlockView.view 在我们的 $view 回调执行时已经被设置。
 *
 * 使用方式：
 *   .use(codeBlockComponent)    // 先注册（设置 codeBlockView.view）
 *   .use(mermaidBlockPlugin)    // 后注册（覆盖 code_block 的 nodeView）
 */

import { $view } from '@milkdown/kit/utils';
import { codeBlockSchema } from '@milkdown/kit/preset/commonmark';
import { codeBlockView } from '@milkdown/kit/component/code-block';
import { MermaidNodeView } from './node-view';
import { startThemeObserver, stopThemeObserver } from './theme';

// ---------------------------------------------------------------------------
// 自动编辑标记：用于标记新创建的 Mermaid 块需要直接进入编辑模式
// ---------------------------------------------------------------------------

/** 标记下一个创建的 Mermaid NodeView 需要自动进入编辑模式 */
let pendingAutoEdit = false;

/**
 * 设置下一个 Mermaid 块自动进入编辑模式
 * 在 slash-menu 等创建逻辑中调用
 */
export function setMermaidAutoEdit(): void {
  pendingAutoEdit = true;
}

/**
 * 消费 autoEdit 标记（内部使用）
 * 返回当前值并重置为 false
 */
function consumeAutoEdit(): boolean {
  const val = pendingAutoEdit;
  pendingAutoEdit = false;
  return val;
}

// ---------------------------------------------------------------------------
// 标记：主题观察器是否已启动
// ---------------------------------------------------------------------------

let themeObserverStarted = false;

// ---------------------------------------------------------------------------
// 合并的 code_block NodeView
// ---------------------------------------------------------------------------

/**
 * Mermaid Block NodeView 插件
 *
 * 替代 codeBlockView 对 code_block 节点的 NodeView 注册。
 * 利用后注册覆盖前注册的机制，将 code_block 的渲染分流：
 * - language === "mermaid" → MermaidNodeView（自定义图表渲染）
 * - 其他语言 → 委托给 codeBlockView 的原始工厂函数（CodeMirror 代码块）
 */
export const mermaidBlockPlugin = $view(codeBlockSchema.node, () => {
  // 确保主题观察器只启动一次
  if (!themeObserverStarted) {
    startThemeObserver();
    themeObserverStarted = true;
  }

  // 获取 codeBlockView 在初始化时设置的原始 NodeView 工厂函数
  // codeBlockView.view 是 NodeViewConstructor 类型
  // 由于注册顺序保证，此时 codeBlockView.view 已经被赋值
  const originalFactory = codeBlockView.view;

  return (node, view, getPos, decorations, innerDecorations) => {
    // 仅处理 language="mermaid" 的代码块
    if (node.attrs.language === 'mermaid') {
      const autoEdit = consumeAutoEdit();
      return new MermaidNodeView(node, view, getPos, autoEdit);
    }

    // 其他语言：委托给原始的 CodeMirror 代码块工厂
    return originalFactory(node, view, getPos, decorations, innerDecorations);
  };
});

// ---------------------------------------------------------------------------
// 清理（可选：停止主题观察器）
// ---------------------------------------------------------------------------

/**
 * 停止主题观察器
 * 在编辑器销毁时应调用此函数
 */
export function cleanupMermaidPlugin(): void {
  stopThemeObserver();
  themeObserverStarted = false;
}

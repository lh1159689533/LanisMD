/**
 * 画板全屏窗口根组件
 *
 * 独立 Tauri 窗口（label 形如 `board-fullscreen-*`）的入口视图，
 * 由 App.tsx 依据 pathname 分发。组件本身只负责提供宿主容器与主题同步，
 * 画板挂载与跨窗口通信全部交给 `mountBoardFullscreen`。
 *
 * @changelog
 * | 版本   | 变更说明                   | 关联                                                   |
 * | v1.0.0 | 初始实现：全屏画板窗口根组件 | REQ: 20261026-board-fullscreen TECH: 画板全屏窗口方案 §四 |
 * | v1.1.0 | 补充引入画布工具栏样式        | REQ: 20261026-board-fullscreen-maximize |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useRef } from 'react';

import { mountBoardFullscreen } from '@/editor/plugins/board-block/fullscreen/mount';
import { usePreviewTheme } from '@/hooks/usePreviewTheme';

// 全屏窗口不渲染 EditorCore，而画板样式随 styles/editor/index.css 由 EditorCore 引入，
// 故此处按需单独引入画板相关样式（Vite 对同一 CSS 模块只注入一次，不会与主窗口重复）
import '@/styles/editor/board-block.css';
import '@/styles/editor/board-style-toolbar.css';
import '@/styles/editor/board-canvas-toolbar.css';
import '@/styles/editor/board-draw-toolbar.css';
import '@/styles/editor/board-block-fullscreen.css';

export function BoardFullscreen() {
  // 复用预览窗口的主题同步逻辑：初始读 URL 参数，之后跟随主应用广播
  usePreviewTheme();

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 注意：这里不能用 ref 守卫去「只挂载一次」。StrictMode 下 effect 会走
    // mount -> cleanup -> remount，守卫会让重挂时跳过创建，而此前唯一的会话
    // 已被 cleanup 销毁，最终没有任何活动会话去发起握手。
    // 正确做法是让挂载本身幂等可重入：每次 effect 建新会话，cleanup 完整销毁。
    return mountBoardFullscreen(container);
  }, []);

  return <div ref={containerRef} />;
}

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Editor } from '@milkdown/kit/core';
import { editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import {
  createEditor,
  setupEditorListeners,
  switchDocument,
  type EditorListener,
} from '../editor-setup';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { getViewState, saveViewState } from '@/stores/scroll-position-cache';
import { registerContextMenu } from '../plugins/ai-edit';

/**
 * 向上查找真正的滚动容器（overflow: auto/scroll 且有可滚动内容）
 */
function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  while (el) {
    const { overflow, overflowY } = getComputedStyle(el);
    const hasOverflowStyle =
      overflow === 'auto' ||
      overflow === 'scroll' ||
      overflowY === 'auto' ||
      overflowY === 'scroll';
    if (hasOverflowStyle && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

export function useEditor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const currentFile = useFileStore((s) => s.currentFile);
  const currentFileId = currentFile?.id ?? null;
  const updateStats = useEditorStore((s) => s.updateStats);

  // 监听编辑模式变化
  const mode = useEditorStore((s) => s.mode);
  // 监听沉浸式阅读状态
  const immersiveReading = useUIStore((s) => s.immersiveReading);

  // 使用 Ref 持有当前文件 ID，避免 listener 闭包过时问题
  const currentFileRef = useRef<string | null>(null);
  currentFileRef.current = currentFileId;

  // 标记编辑器首次创建时已加载的文件 ID，防止 Effect 2 重复 switchDocument
  const readyFileIdRef = useRef<string | null>(null);

  // 标记是否正在执行 switchDocument，防止 listener 误触发保存
  const switchingRef = useRef(false);

  // 用于销毁右键菜单
  const destroyContextMenuRef = useRef<(() => void) | null>(null);

  // -----------------------------------------------------------------------
  // 恢复目标文件的光标/滚动位置
  // -----------------------------------------------------------------------
  const restoreViewState = useCallback((editor: Editor, filePath: string | null) => {
    if (!filePath) return;

    try {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const cached = getViewState(filePath);

        requestAnimationFrame(() => {
          const scrollContainer = findScrollContainer(view.dom.parentElement);

          if (cached) {
            try {
              const docSize = view.state.doc.content.size;
              const anchor = Math.min(cached.cursorAnchor, docSize);
              const head = Math.min(cached.cursorHead, docSize);
              const selection = TextSelection.create(view.state.doc, anchor, head);
              view.dispatch(view.state.tr.setSelection(selection));
            } catch {
              // 位置无效时忽略（文件内容可能已变化）
            }
            if (scrollContainer) scrollContainer.scrollTop = cached.scrollTop;
          } else {
            // 没有缓存时重置到顶部
            if (scrollContainer) scrollContainer.scrollTop = 0;
          }
        });
      });
    } catch {
      // 编辑器可能已销毁
    }
  }, []);

  // =======================================================================
  // Effect 1：编辑器实例生命周期（仅在 mode 变化或组件卸载时销毁/重建）
  // =======================================================================
  useEffect(() => {
    const root = rootRef.current;
    // 源码模式下不创建 Milkdown 编辑器
    if (!root || mode === 'source') return;

    // 获取当前文件内容用于首次创建
    const file = useFileStore.getState().currentFile;
    const content = file?.content ?? '';

    let cancelled = false;

    // 先清理旧实例（从 source 模式切回时可能存在残留）
    if (editorRef.current) {
      editorRef.current.destroy();
      editorRef.current = null;
    }
    useEditorStore.getState().setWysiwygView(null);

    const editorInstance = createEditor(root, content);

    editorInstance
      .create()
      .then((editor) => {
        if (cancelled) {
          editor.destroy();
          return;
        }
        editorRef.current = editor;

        // 注册 listener —— 使用 currentFileRef 避免闭包问题
        const listeners: EditorListener = {
          onMarkdownUpdated: (markdown, prevMarkdown) => {
            if (cancelled) return;
            // switchDocument 触发的空事务会回调这里，需要跳过
            if (switchingRef.current) return;
            // 内容相同时跳过（防止 updateState 后的空 dispatch 误触发保存）
            if (markdown === prevMarkdown) return;

            updateStats(markdown);
            const state = useFileStore.getState();
            if (state.currentFile?.id === currentFileRef.current) {
              state.updateContent(markdown);
            }
          },
        };
        setupEditorListeners(editor, listeners);
        updateStats(content);

        // 注册 EditorView 到全局 store，并设置初始状态
        try {
          editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            useEditorStore.getState().setWysiwygView(view);

            // 根据沉浸式阅读状态设置只读
            const immersive = useUIStore.getState().immersiveReading;
            view.setProps({ editable: () => !immersive });

            // 注册自定义右键菜单
            destroyContextMenuRef.current = registerContextMenu(view);

            // 恢复光标/滚动位置
            if (file?.filePath) {
              const cached = getViewState(file.filePath);
              requestAnimationFrame(() => {
                if (cancelled) return;
                const scrollContainer = findScrollContainer(view.dom.parentElement);

                if (cached) {
                  try {
                    const docSize = view.state.doc.content.size;
                    const anchor = Math.min(cached.cursorAnchor, docSize);
                    const head = Math.min(cached.cursorHead, docSize);
                    const selection = TextSelection.create(view.state.doc, anchor, head);
                    view.dispatch(view.state.tr.setSelection(selection));
                  } catch {
                    // 位置无效时忽略
                  }
                  if (scrollContainer) scrollContainer.scrollTop = cached.scrollTop;
                } else {
                  if (scrollContainer) scrollContainer.scrollTop = 0;
                }
              });
            }
          });
        } catch {
          // 编辑器可能还没完全初始化
        }

        // 标记就绪
        readyFileIdRef.current = file?.id ?? null;
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('Failed to create Milkdown editor:', err);
        }
      });

    return () => {
      cancelled = true;
      if (destroyContextMenuRef.current) {
        destroyContextMenuRef.current();
        destroyContextMenuRef.current = null;
      }
      useEditorStore.getState().setWysiwygView(null);
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
      readyFileIdRef.current = null;
    };
    // 仅在 mode 变化时重建编辑器（不再依赖 currentFileId）
  }, [mode, updateStats]);

  // =======================================================================
  // Effect 2：文件切换时通过 switchDocument 替换内容（不重建编辑器）
  // =======================================================================
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !currentFileId || mode === 'source') return;

    // 如果是首次创建时加载的文件（readyFileIdRef 已匹配），跳过
    if (readyFileIdRef.current === currentFileId) return;

    const file = useFileStore.getState().currentFile;
    if (!file) return;

    // 1. 标记正在切换，防止 listener 误触发
    switchingRef.current = true;

    // 2. 切换文档内容
    switchDocument(editor, file.content);

    // 3. 恢复目标文件的光标/滚动位置
    restoreViewState(editor, file.filePath);

    // 4. 更新统计信息
    updateStats(file.content);

    // 5. 标记就绪，解除切换锁定
    readyFileIdRef.current = currentFileId;
    // 使用 setTimeout 确保在空 dispatch 回调完成后再解锁
    setTimeout(() => {
      switchingRef.current = false;
    }, 0);
  }, [currentFileId, mode, restoreViewState, updateStats]);

  // =======================================================================
  // Effect 3：沉浸式阅读状态变化 → 动态切换编辑器只读
  // =======================================================================
  useEffect(() => {
    const view = useEditorStore.getState().wysiwygView;
    if (!view) return;
    view.setProps({ editable: () => !immersiveReading });
    // 强制刷新：editable 变化不会自动触发视图更新
    view.dispatch(view.state.tr);
  }, [immersiveReading]);

  return { rootRef, editorRef };
}

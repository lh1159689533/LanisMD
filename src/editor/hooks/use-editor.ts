import { useEffect, useRef } from 'react';
import type { Editor } from '@milkdown/kit/core';
import { editorViewCtx } from '@milkdown/kit/core';
import { createEditor, setupEditorListeners, type EditorListener } from '../editor-setup';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { registerContextMenu } from '../plugins/ai-edit';

export function useEditor() {
  const rootRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const currentFile = useFileStore((s) => s.currentFile);
  const currentFileId = currentFile?.id ?? null;
  const updateStats = useEditorStore((s) => s.updateStats);

  // 监听编辑模式变化，用于在切换回 wysiwyg 时重新创建编辑器
  const mode = useEditorStore((s) => s.mode);
  // 监听沉浸式阅读状态：开启时编辑器变只读
  const immersiveReading = useUIStore((s) => s.immersiveReading);

  useEffect(() => {
    const root = rootRef.current;
    // 源码模式下不创建 Milkdown 编辑器
    if (!root || !currentFileId || mode === 'source') return;

    // 重新获取最新的文件内容（可能在源码模式下被修改）
    const file = useFileStore.getState().currentFile;
    if (!file) return;

    // 用于标记当前 effect 是否已被清理（处理 StrictMode 双重执行）
    let cancelled = false;
    /** 右键菜单销毁函数 */
    let destroyContextMenu: (() => void) | null = null;

    // 先清理旧实例
    if (editorRef.current) {
      editorRef.current.destroy();
      editorRef.current = null;
    }
    // 清理旧的 ProseMirror EditorView 引用
    useEditorStore.getState().setWysiwygView(null);

    const listeners: EditorListener = {
      onMarkdownUpdated: (markdown) => {
        if (cancelled) return;
        updateStats(markdown);
        const state = useFileStore.getState();
        if (state.currentFile?.id === file.id) {
          state.updateContent(markdown);
        }
      },
    };

    // 使用最新的文件内容创建编辑器
    const editorInstance = createEditor(root, file.content);

    editorInstance
      .create()
      .then((editor) => {
        if (cancelled) {
          // effect 已被清理，销毁这个迟到的编辑器实例
          editor.destroy();
          return;
        }
        editorRef.current = editor;
        setupEditorListeners(editor, listeners);
        updateStats(file.content);

        // 注册 ProseMirror EditorView 到 store，供全局搜索跳转等功能使用
        try {
          editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            useEditorStore.getState().setWysiwygView(view);
            // 根据当前沉浸式阅读状态设置初始 editable
            // 注：这里读取最新状态而非闭包值，避免 effect 重建带来的不一致
            const immersive = useUIStore.getState().immersiveReading;
            view.setProps({ editable: () => !immersive });
            // 注册自定义右键菜单
            destroyContextMenu = registerContextMenu(view);
          });
        } catch {
          // 编辑器可能还没完全初始化
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('Failed to create Milkdown editor:', err);
        }
      });

    return () => {
      cancelled = true;
      if (destroyContextMenu) destroyContextMenu();
      useEditorStore.getState().setWysiwygView(null);
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
    // 文件 ID 或编辑模式变化时重新创建编辑器
  }, [currentFileId, mode, updateStats]);

  // 沉浸式阅读状态变化时，动态切换编辑器只读状态
  // 不重建编辑器，仅通过 ProseMirror 的 setProps 切换 editable
  useEffect(() => {
    const view = useEditorStore.getState().wysiwygView;
    if (!view) return;
    view.setProps({ editable: () => !immersiveReading });
    // 强制刷新一次：editable 变化不会自动触发视图更新，
    // 这里通过空事务让 ProseMirror 重新评估 contentEditable 等 DOM 属性
    view.dispatch(view.state.tr);
  }, [immersiveReading]);

  return { rootRef, editorRef };
}

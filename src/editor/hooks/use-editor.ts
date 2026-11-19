import { useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@milkdown/kit/core';
import { editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import {
  createEditor,
  serializeDoc,
  setupEditorListeners,
  switchDocument,
  type EditorListener,
} from '../editor-setup';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useUIStore } from '@/stores/ui-store';
import { getViewState } from '@/stores/scroll-position-cache';
import { registerContextMenu } from '../plugins/ai-edit';

/**
 * 超过该字符数的文档在切换时先让出一帧：
 * 先把“加载中”状态和文件树/标题栏的变化绘制出来，再执行耗时的同步解析与渲染，
 * 避免用户点击后界面长时间停留在旧文件上毫无反馈。小文档直接同步切换，避免闪烁。
 */
const DEFERRED_SWITCH_THRESHOLD = 30_000;

/** 等待浏览器完成一次绘制后再执行回调，返回取消函数 */
function runAfterPaint(callback: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const raf = requestAnimationFrame(() => {
    // rAF 回调在绘制前执行，再排一个宏任务即可落在本帧绘制之后
    timer = setTimeout(callback, 0);
  });
  return () => {
    cancelAnimationFrame(raf);
    if (timer !== null) clearTimeout(timer);
  };
}

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

  // 切换前旧文件的文档对象：listener 的防抖回调（200ms）可能在切换后才触发，
  // 若本次回调序列化的仍是旧文档，必须丢弃，否则旧文件内容会被写进新文件
  const staleDocRef = useRef<ProseNode | null>(null);
  // 当前这次防抖回调是否来自旧文档（由 onDocUpdated 在同一回调中先行标记）
  const staleEmitRef = useRef(false);
  // 切换时跳过了 listener 的基线序列化，这里保存新文档，首次回调时再惰性序列化做比较
  const baselineDocRef = useRef<ProseNode | null>(null);

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

    // 新实例的 listener 会正常初始化基线，清空上一实例遗留的切换状态
    staleDocRef.current = null;
    staleEmitRef.current = false;
    baselineDocRef.current = null;

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
          onDocUpdated: (doc) => {
            staleEmitRef.current = doc === staleDocRef.current;
          },
          onMarkdownUpdated: (markdown, prevMarkdown) => {
            if (cancelled) return;
            // switchDocument 触发的空事务会回调这里，需要跳过
            if (switchingRef.current) return;
            // 旧文件遗留的防抖回调：丢弃
            if (staleEmitRef.current) {
              staleEmitRef.current = false;
              return;
            }
            // 已出现新文档的回调，之后不可能再有旧文档的回调
            staleDocRef.current = null;
            // 切换后的首次回调：与新文档的序列化结果比较（替代 listener 内部的 prevMarkdown）
            const baselineDoc = baselineDocRef.current;
            if (baselineDoc) {
              baselineDocRef.current = null;
              if (markdown === serializeDoc(editor, baselineDoc)) return;
            }
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

    const root = rootRef.current;
    let unlockTimer: ReturnType<typeof setTimeout> | null = null;

    // 1. 标记正在切换，防止 listener 误触发（延迟切换期间同样需要锁定）
    switchingRef.current = true;

    const doSwitch = () => {
      root?.removeAttribute('data-switching');

      // 2. 切换文档内容
      const result = switchDocument(editor, file.content);
      staleDocRef.current = result.previousDoc;
      staleEmitRef.current = false;
      baselineDocRef.current = result.listenerInitSkipped ? result.nextDoc : null;

      // 3. 恢复目标文件的光标/滚动位置
      restoreViewState(editor, file.filePath);

      // 4. 更新统计信息
      updateStats(file.content);

      // 5. 标记就绪，解除切换锁定
      readyFileIdRef.current = currentFileId;
      // 使用 setTimeout 确保在空 dispatch 回调完成后再解锁
      unlockTimer = setTimeout(() => {
        switchingRef.current = false;
      }, 0);
    };

    // 小文档同步切换；大文档先绘制“加载中”状态再切换
    if (file.content.length < DEFERRED_SWITCH_THRESHOLD) {
      doSwitch();
      return;
    }

    // 骨架屏位于文档顶部，滚回顶部使其可见（旧文件的滚动位置已在 openFile 中保存）
    const scrollContainer = findScrollContainer(root);
    if (scrollContainer) scrollContainer.scrollTop = 0;
    root?.setAttribute('data-switching', 'true');
    const cancelPending = runAfterPaint(doSwitch);
    return () => {
      // 切换尚未执行就被新的切换或卸载打断：取消并复原状态
      cancelPending();
      if (unlockTimer !== null) clearTimeout(unlockTimer);
      root?.removeAttribute('data-switching');
      // 若紧接着有新的切换，新一轮 Effect 会重新加锁
      switchingRef.current = false;
    };
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

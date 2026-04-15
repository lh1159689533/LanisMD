import { useRef, useEffect, useCallback } from 'react';
import { editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import { useEditor } from '../hooks/use-editor';
import { useSettingsStore } from '@/stores/settings-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSearchStore } from '@/stores/search-store';
import { SearchReplace } from '@/components/editor/SearchReplace';
import { SourceEditor } from './SourceEditor';
import { searchHighlightPluginKey } from '../plugins/search-highlight';
import '@/styles/editor/index.css';

/**
 * 获取 Milkdown 编辑器内部的 ProseMirror EditorView
 */
function getMilkdownView(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorRef: React.RefObject<any>,
): import('@milkdown/kit/prose/view').EditorView | null {
  const editor = editorRef.current;
  if (!editor) return null;

  let view: import('@milkdown/kit/prose/view').EditorView | null = null;
  try {
    editor.action((ctx: import('@milkdown/kit/ctx').Ctx) => {
      view = ctx.get(editorViewCtx);
    });
  } catch {
    // 编辑器可能还没初始化完成
  }
  return view;
}

/**
 * 向上查找真正的滚动容器（overflow: auto/scroll）
 */
function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  while (el) {
    const { overflow, overflowY } = getComputedStyle(el);
    if (overflow === 'auto' || overflow === 'scroll' ||
        overflowY === 'auto' || overflowY === 'scroll') {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

export function EditorCore() {
  const { rootRef, editorRef } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取当前编辑模式
  const mode = useEditorStore((s) => s.mode);
  const searchIsOpen = useSearchStore((s) => s.isOpen);
  const highlightOnly = useSearchStore((s) => s.highlightOnly);

  // 监听代码块设置变化
  const showLineNumbers = useSettingsStore(
    (s) => s.config.editor.codeBlock?.showLineNumbers !== false,
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const resizeObserver = new ResizeObserver(() => {
      // Handle container resize if needed
    });

    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  // -------------------------------------------------------------------
  // 搜索相关：监听 store 变化触发 ProseMirror 插件更新
  // -------------------------------------------------------------------

  const searchText = useSearchStore((s) => s.searchText);
  const caseSensitive = useSearchStore((s) => s.caseSensitive);
  const wholeWord = useSearchStore((s) => s.wholeWord);
  const useRegex = useSearchStore((s) => s.useRegex);
  const currentIndex = useSearchStore((s) => s.currentIndex);

  // 当搜索参数变化时，触发 ProseMirror 重新计算装饰
  useEffect(() => {
    if (mode === 'source') return;
    const view = getMilkdownView(editorRef);
    if (!view) return;

    // 通过空事务触发插件的 apply 方法重新读取 store 状态
    const tr = view.state.tr.setMeta(searchHighlightPluginKey, { trigger: true });
    view.dispatch(tr);
  }, [searchText, caseSensitive, wholeWord, useRegex, currentIndex, mode, editorRef]);

  // 搜索面板关闭且非仅高亮模式时清除高亮
  useEffect(() => {
    if (!searchIsOpen && !highlightOnly && mode !== 'source') {
      const view = getMilkdownView(editorRef);
      if (!view) return;
      const tr = view.state.tr.setMeta(searchHighlightPluginKey, { trigger: true });
      view.dispatch(tr);
    }
  }, [searchIsOpen, highlightOnly, mode, editorRef]);

  // -------------------------------------------------------------------
  // 搜索回调：滚动到匹配位置
  // -------------------------------------------------------------------

  const handleScrollToMatch = useCallback(
    (from: number, to: number) => {
      if (mode === 'source') {
        // 源码模式：CodeMirror 跳转
        const sourceView = useEditorStore.getState().sourceView;
        if (!sourceView) return;
        sourceView.dispatch({
          selection: { anchor: from, head: to },
          scrollIntoView: true,
        });
        // 源码模式下也需要滚动外层容器
        requestAnimationFrame(() => {
          const cmDom = sourceView.dom;
          const scrollContainer = findScrollContainer(cmDom.parentElement);
          if (!scrollContainer) return;
          const coords = sourceView.coordsAtPos(from);
          if (!coords) return;
          const containerRect = scrollContainer.getBoundingClientRect();
          const offset = coords.top - containerRect.top;
          // 如果匹配项不在可视区域内，滚动到居中位置
          if (offset < 0 || offset > containerRect.height - 40) {
            scrollContainer.scrollBy({
              top: offset - containerRect.height / 3,
              behavior: 'smooth',
            });
          }
        });
        return;
      }

      // WYSIWYG 模式：ProseMirror 跳转
      const view = getMilkdownView(editorRef);
      if (!view) return;

      try {
        // 设置选区到匹配位置
        const tr = view.state.tr.setSelection(
          TextSelection.create(view.state.doc, from, to),
        );
        view.dispatch(tr);

        // 手动滚动外层 .editor-content 容器到匹配位置
        requestAnimationFrame(() => {
          const scrollContainer = findScrollContainer(view.dom.parentElement);
          if (!scrollContainer) return;
          const coords = view.coordsAtPos(from);
          if (!coords) return;
          const containerRect = scrollContainer.getBoundingClientRect();
          const offset = coords.top - containerRect.top;
          // 如果匹配项不在可视区域内，滚动让其居中偏上
          if (offset < 60 || offset > containerRect.height - 60) {
            scrollContainer.scrollBy({
              top: offset - containerRect.height / 3,
              behavior: 'smooth',
            });
          }
        });
      } catch (e) {
        console.warn('Failed to scroll to search match:', e);
      }
    },
    [mode, editorRef],
  );

  // -------------------------------------------------------------------
  // 替换回调
  // -------------------------------------------------------------------

  const handleReplace = useCallback(
    (from: number, to: number, replaceText: string) => {
      if (mode === 'source') {
        const sourceView = useEditorStore.getState().sourceView;
        if (!sourceView) return;
        sourceView.dispatch({
          changes: { from, to, insert: replaceText },
        });
        return;
      }

      const view = getMilkdownView(editorRef);
      if (!view) return;

      try {
        let tr;
        if (replaceText) {
          tr = view.state.tr.insertText(replaceText, from, to);
        } else {
          tr = view.state.tr.delete(from, to);
        }
        view.dispatch(tr);

        // 触发重新搜索
        setTimeout(() => {
          const newView = getMilkdownView(editorRef);
          if (newView) {
            const refreshTr = newView.state.tr.setMeta(searchHighlightPluginKey, { trigger: true });
            newView.dispatch(refreshTr);
          }
        }, 0);
      } catch (e) {
        console.warn('Failed to replace search match:', e);
      }
    },
    [mode, editorRef],
  );

  const handleReplaceAll = useCallback(
    (replaceText: string) => {
      if (mode === 'source') {
        const sourceView = useEditorStore.getState().sourceView;
        if (!sourceView) return;

        const store = useSearchStore.getState();
        // 从后往前替换，避免位置偏移
        const sortedMatches = [...store.matches].sort((a, b) => b.from - a.from);
        const changes = sortedMatches.map((m) => ({
          from: m.from,
          to: m.to,
          insert: replaceText,
        }));
        sourceView.dispatch({ changes });
        return;
      }

      const view = getMilkdownView(editorRef);
      if (!view) return;

      try {
        const store = useSearchStore.getState();
        // 从后往前替换，避免位置偏移
        const sortedMatches = [...store.matches].sort((a, b) => b.from - a.from);
        let tr = view.state.tr;
        for (const match of sortedMatches) {
          if (replaceText) {
            tr = tr.replaceWith(match.from, match.to, view.state.schema.text(replaceText));
          } else {
            tr = tr.delete(match.from, match.to);
          }
        }
        view.dispatch(tr);

        // 触发重新搜索
        setTimeout(() => {
          const newView = getMilkdownView(editorRef);
          if (newView) {
            const refreshTr = newView.state.tr.setMeta(searchHighlightPluginKey, { trigger: true });
            newView.dispatch(refreshTr);
          }
        }, 0);
      } catch (e) {
        console.warn('Failed to replace all search matches:', e);
      }
    },
    [mode, editorRef],
  );

  // 搜索面板（将在 .editor-content 的相对定位下渲染）
  const searchPanel = searchIsOpen ? (
    <SearchReplace
      onScrollToMatch={handleScrollToMatch}
      onReplace={handleReplace}
      onReplaceAll={handleReplaceAll}
    />
  ) : null;

  // 源码模式：显示 CodeMirror 编辑器
  if (mode === 'source') {
    return (
      <>
        {searchPanel}
        <div
          ref={containerRef}
          className="editor-wrapper relative mx-auto py-6 pl-8 pr-8 outline-none"
          style={{ maxWidth: 'var(--lanismd-editor-max-width, 800px)' }}
        >
          <SourceEditor />
        </div>
      </>
    );
  }

  // WYSIWYG 模式：显示 Milkdown 编辑器
  return (
    <>
      {searchPanel}
      <div
        ref={containerRef}
        className="editor-wrapper relative mx-auto py-6 pl-8 pr-8 outline-none"
        style={{ maxWidth: 'var(--lanismd-editor-max-width, 800px)' }}
      >
        <div
          ref={rootRef}
          className="milkdown-editor-root"
          data-show-line-numbers={showLineNumbers}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
    </>
  );
}

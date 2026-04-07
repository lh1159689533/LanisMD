import { useRef, useEffect } from 'react';
import { useEditor } from '../hooks/use-editor';
import { useSettingsStore } from '@/stores/settings-store';
import { useEditorStore } from '@/stores/editor-store';
import { SourceEditor } from './SourceEditor';
import '@/styles/editor.css';

export function EditorCore() {
  const { rootRef } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 获取当前编辑模式
  const mode = useEditorStore((s) => s.mode);
  
  // 监听代码块设置变化
  const showLineNumbers = useSettingsStore(
    (s) => s.config.editor.codeBlock?.showLineNumbers !== false
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

  // 源码模式：显示 CodeMirror 编辑器
  if (mode === 'source') {
    return (
      <div
        ref={containerRef}
        className="editor-wrapper relative mx-auto pl-16 pr-8 py-6 outline-none"
        style={{ maxWidth: 'var(--editor-max-width, 800px)' }}
      >
        <SourceEditor />
      </div>
    );
  }

  // WYSIWYG 模式：显示 Milkdown 编辑器
  return (
    <div
      ref={containerRef}
      className="editor-wrapper relative mx-auto pl-16 pr-8 py-6 outline-none"
      style={{ maxWidth: 'var(--editor-max-width, 800px)' }}
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
  );
}

import { useRef, useEffect } from 'react';
import { useEditor } from '../hooks/use-editor';
import { useSettingsStore } from '@/stores/settings-store';
import '@/styles/editor.css';

export function EditorCore() {
  const { rootRef } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);
  
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

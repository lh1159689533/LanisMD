import { useEditor } from '../hooks/use-editor';
import '@/styles/editor.css';

export function EditorCore() {
  const { rootRef } = useEditor();

  return (
    <div
      className="editor-wrapper relative mx-auto px-8 py-6 outline-none"
      style={{ maxWidth: 'var(--editor-max-width, 800px)' }}
    >
      <div
        ref={rootRef}
        className="milkdown-editor-root"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
    </div>
  );
}

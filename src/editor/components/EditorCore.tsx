import { useRef, useEffect } from "react";
import { useEditor } from "../hooks/use-editor";
import "@/styles/editor.css";

export function EditorCore() {
  const { rootRef } = useEditor();
  const containerRef = useRef<HTMLDivElement>(null);

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
      className="editor-wrapper mx-auto px-8 py-6 outline-none"
      style={{ maxWidth: "var(--editor-max-width, 800px)" }}
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

import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import { EditorCore } from "@/editor/components/EditorCore";
import { useFileStore } from "@/stores/file-store";

export function MainLayout() {
  const currentFile = useFileStore((s) => s.currentFile);

  return (
    <div className="flex flex-1 min-h-0">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex-1 min-h-0 overflow-auto bg-[var(--editor-bg)]">
          {currentFile ? (
            <EditorCore />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-[var(--sidebar-text)] opacity-40 select-none">
              没有打开的文件
            </div>
          )}
        </div>
        <StatusBar />
      </div>
    </div>
  );
}

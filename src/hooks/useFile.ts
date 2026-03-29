import { useCallback } from "react";
import { open as tauriOpen, save as tauriSave } from "@tauri-apps/plugin-dialog";
import { useFileStore } from "@/stores/file-store";
import { fileService, configService } from "@/services/tauri";

export function useFile() {
  const { openFile, createUntitledFile, getCurrentFile } = useFileStore();

  /**
   * Open a file from disk (single file mode).
   * - If current file has a path and is dirty → auto-save first, then switch
   * - If current file is Untitled and dirty → prompt "Save As" before switching
   */
  const openFileFromDisk = useCallback(async () => {
    const current = getCurrentFile();

    // Handle unsaved changes before opening a new file
    if (current?.isDirty) {
      if (current.filePath) {
        // Has a path → silent auto-save
        try {
          await fileService.writeFile({
            path: current.filePath,
            content: current.content,
            encoding: current.encoding,
          });
          useFileStore.getState().markSaved();
        } catch (err) {
          console.error("Failed to auto-save before opening:", err);
        }
      } else {
        // Untitled with changes → prompt Save As
        const savePath = await tauriSave({
          defaultPath: `${current.fileName}.md`,
          filters: [
            { name: "Markdown", extensions: ["md", "markdown"] },
          ],
        });

        if (savePath) {
          try {
            await fileService.writeFile({
              path: savePath,
              content: current.content,
              encoding: current.encoding,
            });
          } catch (err) {
            console.error("Failed to save untitled file:", err);
          }
        }
        // If user cancels Save As, we still proceed to open the new file
      }
    }

    // Now open the file dialog (single file only)
    const selected = await tauriOpen({
      multiple: false,
      filters: [
        {
          name: "Markdown",
          extensions: ["md", "markdown", "mdx", "txt"],
        },
        {
          name: "所有文件",
          extensions: ["*"],
        },
      ],
    });

    if (!selected) return;

    // Extract path from selection
    let filePath: string | null = null;
    if (typeof selected === "string") {
      filePath = selected;
    } else if (selected && typeof selected === "object" && "path" in selected) {
      filePath = (selected as { path: string }).path;
    }

    if (!filePath) return;

    try {
      const result = await fileService.readFile({ path: filePath, encoding: "utf-8" });
      const fileName = filePath.split("/").pop() ?? filePath.split("\\").pop() ?? "Unknown";
      openFile(filePath, result.content, result.encoding ?? "utf-8", fileName);
      await configService.addRecentFile(filePath);
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  }, [openFile, getCurrentFile]);

  const newFile = useCallback(async () => {
    const current = getCurrentFile();

    // Handle unsaved changes before creating new file
    if (current?.isDirty) {
      if (current.filePath) {
        // Has a path → silent auto-save
        try {
          await fileService.writeFile({
            path: current.filePath,
            content: current.content,
            encoding: current.encoding,
          });
          useFileStore.getState().markSaved();
        } catch (err) {
          console.error("Failed to auto-save before new file:", err);
        }
      } else if (current.content !== "") {
        // Untitled with content → prompt Save As
        const savePath = await tauriSave({
          defaultPath: `${current.fileName}.md`,
          filters: [
            { name: "Markdown", extensions: ["md", "markdown"] },
          ],
        });

        if (savePath) {
          try {
            await fileService.writeFile({
              path: savePath,
              content: current.content,
              encoding: current.encoding,
            });
          } catch (err) {
            console.error("Failed to save untitled file:", err);
          }
        }
      }
    }

    createUntitledFile();
  }, [createUntitledFile, getCurrentFile]);

  return { openFileFromDisk, newFile };
}

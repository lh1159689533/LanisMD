import { invoke } from '@tauri-apps/api/core';
import { ask as tauriAsk, message as tauriMessage } from '@tauri-apps/plugin-dialog';

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogParams {
  title?: string;
  filters?: DialogFilter[];
  multiple?: boolean;
  directory?: boolean;
}

export interface OpenDialogResult {
  paths: string[];
}

export async function openFileDialog(params?: OpenDialogParams): Promise<OpenDialogResult | null> {
  const defaultFilters: DialogFilter[] = [
    { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
  ];

  try {
    const result = await invoke<string[] | null>('plugin:dialog|open', {
      options: {
        title: params?.title ?? '打开文件',
        filters: params?.filters ?? defaultFilters,
        multiple: params?.multiple ?? true,
        directory: params?.directory ?? false,
      },
    });

    if (!result) return null;
    return { paths: result };
  } catch {
    return null;
  }
}

export async function saveFileDialog(defaultName?: string): Promise<string | null> {
  try {
    const result = await invoke<string | null>('plugin:dialog|save', {
      options: {
        title: 'Save File',
        defaultPath: defaultName ?? 'untitled.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      },
    });
    return result;
  } catch {
    return null;
  }
}

export async function showMessage(title: string, message: string): Promise<void> {
  try {
    await tauriMessage(message, { title, kind: 'info' });
  } catch (err) {
    console.error('Failed to show message dialog:', err);
  }
}

/**
 * 显示「是 / 否」确认对话框，用户点击「是」时返回 true。
 *
 * 必须走 @tauri-apps/plugin-dialog 的 ask()：Rust 端插件已移除独立的 `ask`
 * 命令（仅保留 open / save / message），直接 invoke('plugin:dialog|ask') 会被拒绝，
 * 若再被 catch 吞掉返回 false，就会表现为对话框不弹出、操作静默取消。
 */
export async function showConfirmDialog(title: string, message: string): Promise<boolean> {
  try {
    return await tauriAsk(message, {
      title,
      kind: 'warning',
      okLabel: '是',
      cancelLabel: '否',
    });
  } catch (err) {
    console.error('Failed to show confirm dialog:', err);
    return false;
  }
}

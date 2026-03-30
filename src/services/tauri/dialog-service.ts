import { invoke } from '@tauri-apps/api/core';

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
    await invoke('plugin:dialog|message', {
      message,
      title,
      kind: 'info',
    });
  } catch {
    // fallback: alert
  }
}

export async function showConfirmDialog(title: string, message: string): Promise<boolean> {
  try {
    const answer = await invoke<boolean>('plugin:dialog|ask', {
      message,
      title,
      kind: 'info',
      yesButtonLabel: '是',
      noButtonLabel: '否',
    });
    return answer;
  } catch {
    return false;
  }
}

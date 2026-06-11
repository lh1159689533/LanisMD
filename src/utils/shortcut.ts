/**
 * 快捷键展示工具
 *
 * 用途：为带 title 的 icon button 提供"名称 (快捷键)"格式拼接，
 * 平台差异：Mac 使用符号 ⌘⇧⌥⌃，其他平台使用文字 Ctrl+Shift+Alt+...
 *
 * 注意：本文件仅负责"展示"，实际按键绑定仍由 src/hooks/useShortcuts.ts
 * 与 src/editor/plugins/editor-keymap.ts 维护。
 * 修改快捷键时，需同步更新对应的绑定文件与本文件的 SHORTCUTS 常量。
 */

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

/** 快捷键描述：使用平台无关键名，渲染时按平台转换 */
export interface ShortcutDescriptor {
  /** 是否需要 Mod 键（Mac=Cmd / 其他=Ctrl） */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** 主键，如 'L'、',' 等。展示时保持原样 */
  key: string;
}

/**
 * 平台分支快捷键：Mac 与其他平台键位不同的场景
 * 例如：删除线在 Mac 是 ⌘⇧X，在 Win/Linux 是 Alt+Shift+5
 */
export interface PlatformShortcut {
  mac: ShortcutDescriptor;
  default: ShortcutDescriptor;
}

/** 任意可被解析为最终描述符的输入 */
export type ShortcutLike = ShortcutDescriptor | PlatformShortcut;

function isPlatformShortcut(s: ShortcutLike): s is PlatformShortcut {
  return (
    typeof s === 'object' &&
    s !== null &&
    'mac' in s &&
    'default' in s &&
    typeof (s as PlatformShortcut).mac === 'object'
  );
}

/** 按当前平台从 ShortcutLike 取实际描述符 */
function resolveDescriptor(s: ShortcutLike): ShortcutDescriptor {
  if (isPlatformShortcut(s)) {
    return isMac ? s.mac : s.default;
  }
  return s;
}

/**
 * 将快捷键描述渲染为可见文本
 * - Mac: ⌃ ⌥ ⇧ ⌘ + 主键，例如 ⌘⇧L
 * - 其他: Ctrl+Shift+L
 */
export function formatShortcut(s: ShortcutLike): string {
  const d = resolveDescriptor(s);
  if (isMac) {
    const parts: string[] = [];
    // Mac 习惯顺序：Ctrl ⌃ -> Alt ⌥ -> Shift ⇧ -> Cmd ⌘
    if (d.alt) parts.push('⌥');
    if (d.shift) parts.push('⇧');
    if (d.mod) parts.push('⌘');
    parts.push(d.key.toUpperCase());
    return parts.join('');
  }
  const parts: string[] = [];
  if (d.mod) parts.push('Ctrl');
  if (d.shift) parts.push('Shift');
  if (d.alt) parts.push('Alt');
  parts.push(d.key.length === 1 ? d.key.toUpperCase() : d.key);
  return parts.join('+');
}

/**
 * 项目内集中维护的快捷键映射（仅用于 tooltip 展示）。
 * 与 useShortcuts.ts 及 editor-keymap.ts 中的按键绑定保持一致。
 */
export const SHORTCUTS = {
  // 应用级（与 useShortcuts.ts 对应）
  newFile: { mod: true, key: 'N' },
  openFile: { mod: true, key: 'O' },
  saveFile: { mod: true, key: 'S' },
  toggleSidebar: { mod: true, shift: true, key: 'B' },
  toggleOutline: { mod: true, shift: true, key: 'L' },
  openSettings: { mod: true, key: ',' },
  toggleSearch: { mod: true, key: 'F' },
  toggleGlobalSearch: { mod: true, shift: true, key: 'F' },
  quickOpen: { mod: true, key: 'P' },
  toggleTypewriterMode: { mod: true, shift: true, key: '9' },

  // 编辑器内 mark/格式（与 editor-keymap.ts 对应）
  // 加粗、斜体、行内代码：Milkdown commonmark 默认绑定
  bold: { mod: true, key: 'B' },
  italic: { mod: true, key: 'I' },
  inlineCode: { mod: true, key: 'E' },
  underline: { mod: true, key: 'U' },
  // 删除线：Mac 与 Win/Linux 不同
  strikethrough: {
    mac: { mod: true, shift: true, key: 'X' },
    default: { alt: true, shift: true, key: '5' },
  },
  // 高亮：Mac 与 Win/Linux 不同
  highlight: {
    mac: { mod: true, alt: true, key: 'H' },
    default: { mod: true, shift: true, key: 'H' },
  },
  superscript: { mod: true, shift: true, key: '.' },
  subscript: { mod: true, shift: true, key: ',' },
  link: { mod: true, key: 'K' },
  // 图片：Mac 与 Win/Linux 不同
  image: {
    mac: { mod: true, alt: true, key: 'I' },
    default: { mod: true, shift: true, key: 'I' },
  },
  clearFormat: { mod: true, key: '\\' },
} as const satisfies Record<string, ShortcutLike>;

export type ShortcutName = keyof typeof SHORTCUTS;

/**
 * 拼接 title 与快捷键展示。
 *
 * @param title 原始名称，如 "大纲"
 * @param shortcut 可为预定义键名、ShortcutLike 或裸字符串（如 "Enter"、"Shift+Enter"）
 * @returns "大纲 (⌘⇧L)" / "大纲 (Ctrl+Shift+L)"；shortcut 为空时仅返回 title
 */
export function withShortcut(
  title: string,
  shortcut?: ShortcutName | ShortcutLike | string | null,
): string {
  if (!shortcut) return title;
  let text: string;
  if (typeof shortcut === 'string') {
    text = shortcut in SHORTCUTS ? formatShortcut(SHORTCUTS[shortcut as ShortcutName]) : shortcut;
  } else {
    text = formatShortcut(shortcut);
  }
  return `${title} (${text})`;
}

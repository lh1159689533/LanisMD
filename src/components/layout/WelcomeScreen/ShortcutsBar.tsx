interface ShortcutEntry {
  keys: string;
  label: string;
}

/**
 * Dashboard 底部快捷键速查条
 */
export function ShortcutsBar() {
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  const entries: ShortcutEntry[] = [
    { keys: `${mod}N`, label: '新建' },
    { keys: `${mod}O`, label: '打开' },
    { keys: `${mod}S`, label: '保存' },
    { keys: `${mod}B`, label: '侧栏' },
    { keys: `${mod},`, label: '设置' },
  ];

  return (
    <div className="lanismd-welcome-shortcuts">
      {entries.map((entry) => (
        <span key={entry.label} className="lanismd-welcome-shortcut">
          <kbd>{entry.keys}</kbd>
          <span className="lanismd-welcome-shortcut-label">{entry.label}</span>
        </span>
      ))}
    </div>
  );
}

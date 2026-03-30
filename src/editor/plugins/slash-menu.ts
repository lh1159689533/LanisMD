/**
 * Slash Command Menu Plugin
 *
 * 输入 `/` 触发命令菜单，支持：
 * - 标题 1-3、无序列表、有序列表、任务列表、代码块、引用、分割线
 * - 键盘导航（↑↓ 选择，Enter 执行，Esc 关闭）
 * - 输入过滤（输入 /h 只显示标题相关项）
 */

import { SlashProvider, slashFactory } from '@milkdown/plugin-slash';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';

// ---------------------------------------------------------------------------
// Slash command definitions
// ---------------------------------------------------------------------------

export interface SlashCommand {
  /** Display label */
  label: string;
  /** SVG icon markup */
  icon: string;
  /** Keyboard shortcut hint (display only) */
  shortcut?: string;
  /** Keywords for search filtering */
  keywords: string[];
  /** Execute: receives the ProseMirror view */
  execute: (view: EditorView) => void;
}

/**
 * Remove the slash trigger text (everything from the last `/` to cursor).
 */
function removeSlashTrigger(view: EditorView) {
  const { state } = view;
  const { $from } = state.selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
  const lastSlash = textBefore.lastIndexOf('/');
  if (lastSlash === -1) return;
  const from = $from.start() + lastSlash;
  const to = $from.pos;
  view.dispatch(state.tr.delete(from, to));
}

/**
 * Helper: wrap the current block into a specific node type via command.
 */
function wrapBlock(view: EditorView, nodeType: string, attrs?: Record<string, unknown>) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const type = schema.nodes[nodeType];
  if (!type) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  // If current block is an empty paragraph, replace it
  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const tr = state.tr.setBlockType($from.before(), $from.after(), type, attrs);
    dispatch(tr);
  } else {
    // Otherwise try setBlockType on selection
    const tr = state.tr.setBlockType($from.pos, $from.pos, type, attrs);
    dispatch(tr);
  }
  view.focus();
}

function insertHr(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const hrType = schema.nodes.hr || schema.nodes.horizontal_rule;
  if (!hrType) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  // If paragraph is empty, replace; otherwise insert after
  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const tr = state.tr.replaceWith($from.before(), $from.after(), hrType.create());
    // Add a new paragraph after hr
    const paragraphType = schema.nodes.paragraph;
    if (paragraphType) {
      tr.insert(tr.mapping.map($from.after()), paragraphType.create());
    }
    dispatch(tr.scrollIntoView());
  } else {
    const tr = state.tr.insert($from.after(), hrType.create());
    dispatch(tr.scrollIntoView());
  }
  view.focus();
}

function wrapInList(view: EditorView, listType: string) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const list = schema.nodes[listType];
  const listItem = schema.nodes.list_item;
  const paragraph = schema.nodes.paragraph;
  if (!list || !listItem || !paragraph) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  if (parent.type === paragraph && parent.content.size === 0) {
    const tr = state.tr.replaceWith(
      $from.before(),
      $from.after(),
      list.create(null, listItem.create(null, paragraph.create())),
    );
    // Place cursor inside the list item paragraph
    dispatch(tr.scrollIntoView());
    // Focus and move cursor
    setTimeout(() => {
      const newState = view.state;
      const pos = newState.selection.$from.pos;
      view.dispatch(
        newState.tr.setSelection(
          // @ts-expect-error -- TextSelection exists on state
          newState.selection.constructor.near(newState.doc.resolve(pos)),
        ),
      );
      view.focus();
    }, 0);
  } else {
    // Wrap current block in list
    const tr = state.tr.replaceWith(
      $from.before(),
      $from.after(),
      list.create(null, listItem.create(null, parent.copy(parent.content))),
    );
    dispatch(tr.scrollIntoView());
    view.focus();
  }
}

function insertTaskList(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  // GFM task list: bullet_list > list_item (with checked attr)
  const bulletList = schema.nodes.bullet_list;
  const listItem = schema.nodes.list_item;
  const paragraph = schema.nodes.paragraph;
  if (!bulletList || !listItem || !paragraph) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  if (parent.type === paragraph && parent.content.size === 0) {
    const tr = state.tr.replaceWith(
      $from.before(),
      $from.after(),
      bulletList.create(null, listItem.create({ checked: false }, paragraph.create())),
    );
    dispatch(tr.scrollIntoView());
    setTimeout(() => view.focus(), 0);
  }
}

function insertCodeBlock(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const codeBlock = schema.nodes.code_block;
  if (!codeBlock) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const tr = state.tr.setBlockType($from.before(), $from.after(), codeBlock);
    dispatch(tr.scrollIntoView());
  } else {
    const tr = state.tr.replaceSelectionWith(codeBlock.create());
    dispatch(tr.scrollIntoView());
  }
  view.focus();
}

// ---------------------------------------------------------------------------
// Icons (inline SVG)
// ---------------------------------------------------------------------------

const icons = {
  h1: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17 12l3-2v8"/></svg>',
  h2: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/></svg>',
  h3: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/><path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/></svg>',
  bulletList:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>',
  orderedList:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>',
  taskList:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3.5 8 2 2L8 6.5"/><line x1="13" y1="8" x2="21" y2="8"/><rect x="3" y="14" width="6" height="6" rx="1"/><line x1="13" y1="17" x2="21" y2="17"/></svg>',
  codeBlock:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  blockquote:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3"/></svg>',
  divider:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="12" x2="22" y2="12"/></svg>',
};

// ---------------------------------------------------------------------------
// Command list
// ---------------------------------------------------------------------------

export const slashCommands: SlashCommand[] = [
  {
    label: '标题 1',
    icon: icons.h1,
    shortcut: '#',
    keywords: ['heading', 'h1', '标题', 'title', 'bt'],
    execute: (view) => wrapBlock(view, 'heading', { level: 1 }),
  },
  {
    label: '标题 2',
    icon: icons.h2,
    shortcut: '##',
    keywords: ['heading', 'h2', '标题', 'title', 'bt'],
    execute: (view) => wrapBlock(view, 'heading', { level: 2 }),
  },
  {
    label: '标题 3',
    icon: icons.h3,
    shortcut: '###',
    keywords: ['heading', 'h3', '标题', 'title', 'bt'],
    execute: (view) => wrapBlock(view, 'heading', { level: 3 }),
  },
  {
    label: '无序列表',
    icon: icons.bulletList,
    shortcut: '-',
    keywords: ['bullet', 'list', 'unordered', '无序', '列表', 'lb'],
    execute: (view) => wrapInList(view, 'bullet_list'),
  },
  {
    label: '有序列表',
    icon: icons.orderedList,
    shortcut: '1.',
    keywords: ['ordered', 'list', 'number', '有序', '列表', 'lb'],
    execute: (view) => wrapInList(view, 'ordered_list'),
  },
  {
    label: '任务列表',
    icon: icons.taskList,
    keywords: ['task', 'todo', 'checkbox', '任务', '待办', 'rw'],
    execute: (view) => insertTaskList(view),
  },
  {
    label: '代码块',
    icon: icons.codeBlock,
    shortcut: '```',
    keywords: ['code', 'block', '代码', 'dm'],
    execute: (view) => insertCodeBlock(view),
  },
  {
    label: '引用',
    icon: icons.blockquote,
    shortcut: '>',
    keywords: ['quote', 'blockquote', '引用', 'yy'],
    execute: (view) => wrapBlock(view, 'blockquote'),
  },
  {
    label: '分割线',
    icon: icons.divider,
    shortcut: '---',
    keywords: ['divider', 'hr', 'horizontal', '分割', '分隔', 'fgx'],
    execute: (view) => insertHr(view),
  },
];

// ---------------------------------------------------------------------------
// Slash Menu DOM builder
// ---------------------------------------------------------------------------

class SlashMenuView {
  private container: HTMLElement;
  private items: HTMLElement[] = [];
  private activeIndex = 0;
  private filteredCommands: SlashCommand[] = [...slashCommands];
  private view: EditorView | null = null;
  private provider: SlashProvider | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'milkdown-slash';
    // SlashProvider 通过 data-show 属性控制显示/隐藏
    this.container.dataset.show = 'false';

    this.renderItems();
  }

  get element() {
    return this.container;
  }

  private renderItems() {
    this.container.innerHTML = '';
    this.items = [];
    this.filteredCommands.forEach((cmd, index) => {
      const item = document.createElement('div');
      item.className = 'milkdown-slash-item';
      item.dataset.index = String(index);

      const iconSpan = document.createElement('span');
      iconSpan.className = 'milkdown-slash-icon';
      iconSpan.innerHTML = cmd.icon;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'milkdown-slash-label';
      labelSpan.textContent = cmd.label;

      item.appendChild(iconSpan);
      item.appendChild(labelSpan);

      if (cmd.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'milkdown-slash-shortcut';
        shortcutSpan.textContent = cmd.shortcut;
        item.appendChild(shortcutSpan);
      }

      item.addEventListener('mouseenter', () => {
        this.setActive(index);
      });

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.executeItem(index);
      });

      this.container.appendChild(item);
      this.items.push(item);
    });

    this.setActive(0);
  }

  private setActive(index: number) {
    if (this.filteredCommands.length === 0) return;
    this.activeIndex = Math.max(0, Math.min(index, this.filteredCommands.length - 1));
    this.items.forEach((item, i) => {
      item.dataset.active = String(i === this.activeIndex);
    });

    // Scroll active item into view
    const activeItem = this.items[this.activeIndex];
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  private executeItem(index: number) {
    const cmd = this.filteredCommands[index];
    if (!cmd || !this.view) return;
    cmd.execute(this.view);
    this.provider?.hide();
  }

  /** Filter commands based on search query (text after `/`) */
  filter(query: string) {
    const q = query.toLowerCase().trim();
    if (!q) {
      this.filteredCommands = [...slashCommands];
    } else {
      this.filteredCommands = slashCommands.filter(
        (cmd) => cmd.label.toLowerCase().includes(q) || cmd.keywords.some((k) => k.includes(q)),
      );
    }
    this.renderItems();

    // Show "no results" if empty
    if (this.filteredCommands.length === 0) {
      this.container.innerHTML = '<div class="milkdown-slash-empty">没有匹配的命令</div>';
    }
  }

  /** Handle keyboard navigation. Returns true if the event was handled. */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (this.filteredCommands.length === 0) {
      if (event.key === 'Escape') {
        this.provider?.hide();
        return true;
      }
      return false;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.setActive(
          this.activeIndex >= this.filteredCommands.length - 1 ? 0 : this.activeIndex + 1,
        );
        return true;
      case 'ArrowUp':
        event.preventDefault();
        this.setActive(
          this.activeIndex <= 0 ? this.filteredCommands.length - 1 : this.activeIndex - 1,
        );
        return true;
      case 'Enter':
        event.preventDefault();
        this.executeItem(this.activeIndex);
        return true;
      case 'Escape':
        this.provider?.hide();
        return true;
      default:
        return false;
    }
  }

  setView(view: EditorView) {
    this.view = view;
  }

  setProvider(provider: SlashProvider) {
    this.provider = provider;
  }
}

// ---------------------------------------------------------------------------
// Factory & exports
// ---------------------------------------------------------------------------

export const slash = slashFactory('slash');

export function configureSlash(ctx: Ctx) {
  const menuView = new SlashMenuView();

  ctx.set(slash.key, {
    view: (view: EditorView) => {
      menuView.setView(view);

      const provider = new SlashProvider({
        content: menuView.element,
        debounce: 50,
        shouldShow(view: EditorView) {
          const { state } = view;
          const { $from } = state.selection;
          // Only show for empty selections (cursor)
          if (state.selection.from !== state.selection.to) return false;

          const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
          const lastSlash = textBefore.lastIndexOf('/');
          if (lastSlash === -1) return false;

          // The slash should be at beginning of block or preceded by space
          if (lastSlash > 0 && textBefore[lastSlash - 1] !== ' ') return false;

          // Filter based on text after slash
          const query = textBefore.slice(lastSlash + 1);
          menuView.filter(query);

          return true;
        },
      });

      menuView.setProvider(provider);

      return {
        update: (view: EditorView, prevState: EditorView['state']) => {
          menuView.setView(view);
          provider.update(view, prevState);
        },
        destroy: () => {
          provider.destroy();
          menuView.element.remove();
        },
      };
    },
    props: {
      handleKeyDown: (_view: EditorView, event: KeyboardEvent) => {
        // Only intercept if menu is visible (SlashProvider uses data-show attribute)
        if (menuView.element.dataset.show !== 'true') return false;
        return menuView.handleKeyDown(event);
      },
    },
  });
}

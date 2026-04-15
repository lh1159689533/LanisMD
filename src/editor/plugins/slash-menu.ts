/**
 * Slash Command Menu Plugin
 *
 * 输入 `/` 触发命令菜单，支持：
 * - 标题 1-3、无序列表、有序列表、任务列表、代码块、引用、分割线、数学公式
 * - 键盘导航（↑↓ 选择，Enter 执行，Esc 关闭）
 * - 输入过滤（输入 /h 只显示标题相关项）
 */

import { SlashProvider, slashFactory } from '@milkdown/plugin-slash';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { openImageDialog } from './image-block';
import { createLinkDialog } from './tooltip-toolbar';
import { setMermaidAutoEdit } from './mermaid-block';
import type { GfmAlertType } from './gfm-alert/types';

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
  /** 子命令列表（用于二级菜单） */
  children?: SlashCommand[];
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

  // blockquote is a wrapping node, not a block-type conversion
  if (nodeType === 'blockquote') {
    const paragraph = schema.nodes.paragraph;
    if (!paragraph) return;

    if (parent.type === paragraph && parent.content.size === 0) {
      // Replace empty paragraph with blockquote > paragraph
      const from = $from.before();
      const to = $from.after();
      const tr = state.tr.replaceWith(from, to, type.create(null, paragraph.create()));
      // Place cursor inside the paragraph within blockquote
      const cursorPos = from + 2; // blockquote(+1) > paragraph(+1)
      tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
      dispatch(tr.scrollIntoView());
    }
    view.focus();
    return;
  }

  // If current block is an empty paragraph, replace it
  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const tr = state.tr.setBlockType($from.before(), $from.after(), type, attrs);
    // Set cursor inside the new block
    const cursorPos = $from.before() + 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
  } else {
    // Otherwise try setBlockType on selection
    const tr = state.tr.setBlockType($from.pos, $from.pos, type, attrs);
    dispatch(tr.scrollIntoView());
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
  const paragraphType = schema.nodes.paragraph;

  // 如果段落为空则替换；否则在后面插入
  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(from, to, hrType.create());
    // Add a new paragraph after hr and place cursor in it
    if (paragraphType) {
      const insertPos = tr.mapping.map(to);
      tr.insert(insertPos, paragraphType.create());
      // Cursor inside the new paragraph: insertPos(paragraph start) + 1
      tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
    }
    dispatch(tr.scrollIntoView());
  } else {
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, hrType.create());
    if (paragraphType) {
      const paraPos = tr.mapping.map(insertPos) + 1; // after hr node
      tr.insert(paraPos, paragraphType.create());
      tr.setSelection(TextSelection.near(tr.doc.resolve(paraPos + 1)));
    }
    dispatch(tr.scrollIntoView());
  }
  view.focus();
}

function insertTable(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const tableType = schema.nodes.table;
  const tableRowType = schema.nodes.table_row;
  const tableHeaderRowType = schema.nodes.table_header_row; // 表头行类型
  const tableHeaderType = schema.nodes.table_header;
  const tableCellType = schema.nodes.table_cell;
  const paragraphType = schema.nodes.paragraph;

  if (!tableType || !tableRowType || !tableCellType || !paragraphType) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  // Create a 3x3 table with header row
  const headerCellType = tableHeaderType || tableCellType;
  const headerCells = [
    headerCellType.create(null, paragraphType.create()),
    headerCellType.create(null, paragraphType.create()),
    headerCellType.create(null, paragraphType.create()),
  ];
  // 使用 table_header_row 作为表头行类型，如果不存在则回退到 table_row
  const headerRowType = tableHeaderRowType || tableRowType;
  const headerRow = headerRowType.create(null, headerCells);

  const bodyRows = [];
  for (let i = 0; i < 2; i++) {
    const cells = [
      tableCellType.create(null, paragraphType.create()),
      tableCellType.create(null, paragraphType.create()),
      tableCellType.create(null, paragraphType.create()),
    ];
    bodyRows.push(tableRowType.create(null, cells));
  }

  const table = tableType.create(null, [headerRow, ...bodyRows]);

  if (parent.type === paragraphType && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(from, to, table);
    // Place cursor in the first header cell
    // table(+1) > row(+1) > cell(+1) > paragraph(+1) = +4
    const cursorPos = from + 4;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
  } else {
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, table);
    // Place cursor in the first header cell
    const cursorPos = insertPos + 4;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
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
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(
      from,
      to,
      list.create(null, listItem.create(null, paragraph.create())),
    );
    // Place cursor inside: list(+1) > list_item(+1) > paragraph(+1)
    const cursorPos = from + 3;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
    view.focus();
  } else {
    // Wrap current block in list
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(
      from,
      to,
      list.create(null, listItem.create(null, parent.copy(parent.content))),
    );
    // Place cursor inside the wrapped content
    const cursorPos = from + 3;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
    view.focus();
  }
}

function insertTaskList(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const bulletList = schema.nodes.bullet_list;
  const listItem = schema.nodes.list_item;
  const paragraph = schema.nodes.paragraph;
  if (!bulletList || !listItem || !paragraph) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  if (parent.type === paragraph && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    // Create a task list item with checked=false, listType=bullet, label=•
    const taskListItem = listItem.create(
      { checked: false, listType: 'bullet', label: '•', spread: 'true' },
      paragraph.create(),
    );
    const tr = state.tr.replaceWith(from, to, bulletList.create(null, taskListItem));
    // Place cursor inside: bullet_list(+1) > list_item(+1) > paragraph(+1)
    const cursorPos = from + 3;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
    view.focus();
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

/**
 * 插入一个 language="mermaid" 的空代码块，并自动进入编辑模式。
 */
function insertMermaidBlock(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const codeBlock = schema.nodes.code_block;
  if (!codeBlock) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  const mermaidBlock = codeBlock.create({ language: 'mermaid' });

  // 标记下一个 Mermaid NodeView 自动进入编辑模式
  setMermaidAutoEdit();

  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(from, to, mermaidBlock);
    // 光标定位到代码块内部
    const cursorPos = from + 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
  } else {
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, mermaidBlock);
    const cursorPos = insertPos + 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
  }
  view.focus();
}

/**
 * 插入一个空的 math_block 节点，并将光标定位到块内部。
 */
function insertMathBlock(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const mathBlock = schema.nodes.math_block;
  if (!mathBlock) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  // 带 autoEdit 标记，NodeView 创建后自动进入编辑模式
  const mathNode = mathBlock.create({ autoEdit: true });

  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(from, to, mathNode);
    // 光标定位到 math_block 内部
    const cursorPos = from + 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
  } else {
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, mathNode);
    const cursorPos = insertPos + 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
  }
  view.focus();
}

/**
 * 插入一个带有指定 alertType 的 blockquote（GFM Alert）。
 */
function insertGfmAlert(view: EditorView, alertType: GfmAlertType) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const blockquoteType = schema.nodes.blockquote;
  const paragraph = schema.nodes.paragraph;
  if (!blockquoteType || !paragraph) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  if (parent.type === paragraph && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(
      from,
      to,
      blockquoteType.create({ alertType }, paragraph.create()),
    );
    // 光标定位到 blockquote 内的段落: blockquote(+1) > paragraph(+1)
    const cursorPos = from + 2;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
  }
  view.focus();
}

/**
 * 打开链接对话框，插入一个超链接。
 */
function insertLink(view: EditorView) {
  removeSlashTrigger(view);

  const { state } = view;
  const schema = state.schema;
  const linkType = schema.marks.link;
  if (!linkType) return;

  const overlay = createLinkDialog(view, '', '', (text, href) => {
    const { state: currentState, dispatch } = view;
    const { from } = currentState.selection;
    const linkMark = linkType.create({ href });
    const textNode = schema.text(text, [linkMark]);
    const tr = currentState.tr.insert(from, textNode);
    dispatch(tr.scrollIntoView());
    view.focus();
  });

  document.body.appendChild(overlay);
  // 聚焦到文本输入框
  requestAnimationFrame(() => {
    const textInput = overlay.querySelector('[data-field="text"]') as HTMLInputElement | null;
    textInput?.focus();
  });
}

/**
 * Insert an empty image-block node (shows the upload bar).
 * If image-block is not available, fallback to opening the image dialog.
 */
function insertImage(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;

  // Try the image-block node type from @milkdown/components/image-block
  const imageBlockType = schema.nodes['image-block'] || schema.nodes.image_block;

  if (imageBlockType) {
    const { $from } = state.selection;
    const parent = $from.parent;

    // Create an empty image-block (will show the upload bar)
    const imageBlock = imageBlockType.create({ src: '', caption: '', ratio: 1 });

    if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
      const from = $from.before();
      const to = $from.after();
      const tr = state.tr.replaceWith(from, to, imageBlock);
      dispatch(tr.scrollIntoView());
    } else {
      const insertPos = $from.after();
      const tr = state.tr.insert(insertPos, imageBlock);
      dispatch(tr.scrollIntoView());
    }
    view.focus();
  } else {
    // Fallback: open image dialog
    openImageDialog().then((result) => {
      if (!result) return;
      const imageType = schema.nodes.image;
      if (!imageType) return;

      const { from, to } = state.selection;
      const tr = state.tr.replaceWith(
        from,
        to,
        imageType.create({ src: result.src, alt: result.alt }),
      );
      dispatch(tr.scrollIntoView());
      view.focus();
    });
  }
}

// ---------------------------------------------------------------------------
// Icons (inline SVG)
// ---------------------------------------------------------------------------

const icons = {
  h1: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17 12l3-2v8"/></svg>',
  h2: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/></svg>',
  h3: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/><path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/></svg>',
  h4: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17 10v4h4"/><path d="M21 10v8"/></svg>',
  h5: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M21 10h-4v4"/><path d="M17 14h2.5a2.5 2.5 0 0 1 0 5H18a2 2 0 0 1-2-2"/></svg>',
  h6: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><circle cx="19" cy="16" r="2"/><path d="M21 10c-1-1-3-.5-4 1.5L17 16"/></svg>',
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
  image:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  table:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
  mermaid:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="7" height="5" rx="1"/><rect x="15" y="2" width="7" height="5" rx="1"/><rect x="8.5" y="17" width="7" height="5" rx="1"/><line x1="5.5" y1="7" x2="5.5" y2="11"/><line x1="18.5" y1="7" x2="18.5" y2="11"/><line x1="5.5" y1="11" x2="18.5" y2="11"/><line x1="12" y1="11" x2="12" y2="17"/></svg>',
  alert:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  alertNote:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  alertTip:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
  alertImportant:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="8" x2="12" y2="11"/><line x1="12" y1="14" x2="12.01" y2="14"/></svg>',
  alertWarning:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  alertCaution:
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  math: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20L20 4"/><path d="M4 4l4 16"/><path d="M16 4l4 16"/><path d="M2 12h6"/><path d="M16 12h6"/></svg>',
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
    label: '标题 4',
    icon: icons.h4,
    shortcut: '####',
    keywords: ['heading', 'h4', '标题', 'title', 'bt'],
    execute: (view) => wrapBlock(view, 'heading', { level: 4 }),
  },
  {
    label: '标题 5',
    icon: icons.h5,
    shortcut: '#####',
    keywords: ['heading', 'h5', '标题', 'title', 'bt'],
    execute: (view) => wrapBlock(view, 'heading', { level: 5 }),
  },
  {
    label: '标题 6',
    icon: icons.h6,
    shortcut: '######',
    keywords: ['heading', 'h6', '标题', 'title', 'bt'],
    execute: (view) => wrapBlock(view, 'heading', { level: 6 }),
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
  {
    label: '图片',
    icon: icons.image,
    keywords: ['image', 'img', 'picture', 'photo', '图片', '图像', 'tp'],
    execute: (view) => insertImage(view),
  },
  {
    label: '表格',
    icon: icons.table,
    keywords: ['table', 'grid', '表格', 'bg'],
    execute: (view) => insertTable(view),
  },
  {
    label: '图表',
    icon: icons.mermaid,
    keywords: [
      'mermaid',
      'diagram',
      'chart',
      'graph',
      'flowchart',
      '图表',
      '流程图',
      '序列图',
      '甘特图',
      'tb',
    ],
    execute: (view) => insertMermaidBlock(view),
  },
  {
    label: '数学公式',
    icon: icons.math,
    shortcut: '$$',
    keywords: ['math', 'formula', 'equation', 'latex', 'katex', '数学', '公式', '方程', 'sx', 'gs'],
    execute: (view) => insertMathBlock(view),
  },
  {
    label: '提示块',
    icon: icons.alert,
    keywords: ['alert', 'callout', 'admonition', '提示', '警告', '注意', 'tsk'],
    execute: () => {}, // 有子菜单时不直接执行
    children: [
      {
        label: 'Note',
        icon: icons.alertNote,
        keywords: ['note', '备注', '信息'],
        execute: (view) => insertGfmAlert(view, 'note'),
      },
      {
        label: 'Tip',
        icon: icons.alertTip,
        keywords: ['tip', '建议', '提示'],
        execute: (view) => insertGfmAlert(view, 'tip'),
      },
      {
        label: 'Important',
        icon: icons.alertImportant,
        keywords: ['important', '重要'],
        execute: (view) => insertGfmAlert(view, 'important'),
      },
      {
        label: 'Warning',
        icon: icons.alertWarning,
        keywords: ['warning', '警告'],
        execute: (view) => insertGfmAlert(view, 'warning'),
      },
      {
        label: 'Caution',
        icon: icons.alertCaution,
        keywords: ['caution', '危险', '注意'],
        execute: (view) => insertGfmAlert(view, 'caution'),
      },
    ],
  },
  {
    label: '链接',
    icon: icons.link,
    keywords: ['link', 'url', 'href', '链接', '超链接', 'lj'],
    execute: (view) => insertLink(view),
  },
];

// ---------------------------------------------------------------------------
// Slash Menu DOM builder
// ---------------------------------------------------------------------------

class SlashMenuView {
  private container: HTMLElement;
  /** 内层滚动容器，菜单项挂载在这里 */
  private listContainer: HTMLElement;
  private items: HTMLElement[] = [];
  private activeIndex = 0;
  private filteredCommands: SlashCommand[] = [...slashCommands];
  private view: EditorView | null = null;
  private provider: SlashProvider | null = null;

  /** 当前展开的子菜单容器 */
  private submenu: HTMLElement | null = null;
  /** 子菜单对应的父级索引 */
  private submenuParentIndex = -1;
  /** 子菜单中高亮的索引，-1 表示未进入子菜单 */
  private submenuActiveIndex = -1;
  /** 子菜单项 DOM 列表 */
  private submenuItems: HTMLElement[] = [];
  /** 是否正在子菜单中导航 */
  private inSubmenu = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'milkdown-slash';
    // SlashProvider 通过 data-show 属性控制显示/隐藏
    this.container.dataset.show = 'false';

    // 内层滚动容器
    this.listContainer = document.createElement('div');
    this.listContainer.className = 'milkdown-slash-list';
    this.container.appendChild(this.listContainer);

    this.renderItems();
  }

  get element() {
    return this.container;
  }

  private renderItems() {
    this.listContainer.innerHTML = '';
    this.items = [];
    this.hideSubmenu();

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

      // 有子菜单时显示展开箭头
      if (cmd.children && cmd.children.length > 0) {
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'milkdown-slash-arrow';
        arrowSpan.innerHTML =
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
        item.appendChild(arrowSpan);
      } else if (cmd.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'milkdown-slash-shortcut';
        shortcutSpan.textContent = cmd.shortcut;
        item.appendChild(shortcutSpan);
      }

      item.addEventListener('mouseenter', () => {
        this.setActive(index);
        // 如果有子菜单则展开
        if (cmd.children && cmd.children.length > 0) {
          this.showSubmenu(index, item);
        } else {
          this.hideSubmenu();
        }
      });

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 有子菜单的项不直接执行
        if (cmd.children && cmd.children.length > 0) return;
        this.executeItem(index);
      });

      this.listContainer.appendChild(item);
      this.items.push(item);
    });

    this.setActive(0);
  }

  /** 展示右侧子菜单 */
  private showSubmenu(parentIndex: number, anchorEl: HTMLElement) {
    // 如果已经是同一个子菜单，不重复创建
    if (this.submenuParentIndex === parentIndex && this.submenu) return;

    this.hideSubmenu();

    const cmd = this.filteredCommands[parentIndex];
    if (!cmd?.children || cmd.children.length === 0) return;

    this.submenuParentIndex = parentIndex;
    this.submenuActiveIndex = -1;
    this.submenuItems = [];
    this.inSubmenu = false;

    const submenu = document.createElement('div');
    submenu.className = 'milkdown-slash-submenu';

    cmd.children.forEach((child, childIndex) => {
      const item = document.createElement('div');
      item.className = 'milkdown-slash-item';
      item.dataset.subindex = String(childIndex);

      const iconSpan = document.createElement('span');
      iconSpan.className = 'milkdown-slash-icon';
      iconSpan.innerHTML = child.icon;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'milkdown-slash-label';
      labelSpan.textContent = child.label;

      item.appendChild(iconSpan);
      item.appendChild(labelSpan);

      item.addEventListener('mouseenter', () => {
        this.setSubmenuActive(childIndex);
        this.inSubmenu = true;
      });

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.executeSubmenuItem(childIndex);
      });

      submenu.appendChild(item);
      this.submenuItems.push(item);
    });

    // 鼠标离开子菜单时退出子菜单状态
    submenu.addEventListener('mouseleave', () => {
      this.inSubmenu = false;
      this.submenuActiveIndex = -1;
      this.submenuItems.forEach((el) => {
        el.dataset.active = 'false';
      });
    });

    // 定位子菜单：在锚元素右侧，挂载到外层 container（不受 overflow 裁剪）
    this.container.appendChild(submenu);

    // 用 requestAnimationFrame 确保 DOM 已渲染，才能正确获取尺寸
    requestAnimationFrame(() => {
      const listRect = this.listContainer.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      const anchorRect = anchorEl.getBoundingClientRect();
      const submenuRect = submenu.getBoundingClientRect();

      // 子菜单默认在 listContainer 右侧展开
      let left = listRect.width - 4; // 稍微重叠一点
      let top = anchorRect.top - containerRect.top;

      // 如果右侧空间不够，改为左侧展开
      const viewportWidth = window.innerWidth;
      if (listRect.right + submenuRect.width > viewportWidth) {
        left = -submenuRect.width + 4;
      }

      // 如果底部溢出，向上调整
      const viewportHeight = window.innerHeight;
      if (containerRect.top + top + submenuRect.height > viewportHeight) {
        top = Math.max(0, viewportHeight - containerRect.top - submenuRect.height - 8);
      }

      submenu.style.left = `${left}px`;
      submenu.style.top = `${top}px`;
    });

    this.submenu = submenu;
  }

  /** 隐藏子菜单 */
  private hideSubmenu() {
    if (this.submenu) {
      this.submenu.remove();
      this.submenu = null;
    }
    this.submenuParentIndex = -1;
    this.submenuActiveIndex = -1;
    this.submenuItems = [];
    this.inSubmenu = false;
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

  private setSubmenuActive(index: number) {
    if (this.submenuItems.length === 0) return;
    this.submenuActiveIndex = Math.max(0, Math.min(index, this.submenuItems.length - 1));
    this.submenuItems.forEach((item, i) => {
      item.dataset.active = String(i === this.submenuActiveIndex);
    });
  }

  private executeItem(index: number) {
    const cmd = this.filteredCommands[index];
    if (!cmd || !this.view) return;
    cmd.execute(this.view);
    this.hideSubmenu();
    this.provider?.hide();
  }

  private executeSubmenuItem(childIndex: number) {
    const parent = this.filteredCommands[this.submenuParentIndex];
    if (!parent?.children || !this.view) return;
    const child = parent.children[childIndex];
    if (!child) return;
    child.execute(this.view);
    this.hideSubmenu();
    this.provider?.hide();
  }

  /** Filter commands based on search query (text after `/`) */
  filter(query: string) {
    const q = query.toLowerCase().trim();
    if (!q) {
      this.filteredCommands = [...slashCommands];
    } else {
      // 搜索时同时匹配主命令和子命令的关键词
      this.filteredCommands = slashCommands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(q) ||
          cmd.keywords.some((k) => k.includes(q)) ||
          (cmd.children &&
            cmd.children.some(
              (child) =>
                child.label.toLowerCase().includes(q) || child.keywords.some((k) => k.includes(q)),
            )),
      );
    }
    this.renderItems();

    // Show "no results" if empty
    if (this.filteredCommands.length === 0) {
      this.listContainer.innerHTML = '<div class="milkdown-slash-empty">没有匹配的命令</div>';
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

    // 如果在子菜单中导航
    if (this.inSubmenu && this.submenuItems.length > 0) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          this.setSubmenuActive(
            this.submenuActiveIndex >= this.submenuItems.length - 1
              ? 0
              : this.submenuActiveIndex + 1,
          );
          return true;
        case 'ArrowUp':
          event.preventDefault();
          this.setSubmenuActive(
            this.submenuActiveIndex <= 0
              ? this.submenuItems.length - 1
              : this.submenuActiveIndex - 1,
          );
          return true;
        case 'Enter':
          event.preventDefault();
          if (this.submenuActiveIndex >= 0) {
            this.executeSubmenuItem(this.submenuActiveIndex);
          }
          return true;
        case 'ArrowLeft':
        case 'Escape':
          event.preventDefault();
          // 退出子菜单，回到主菜单
          this.inSubmenu = false;
          this.submenuActiveIndex = -1;
          this.submenuItems.forEach((el) => {
            el.dataset.active = 'false';
          });
          return true;
        default:
          return false;
      }
    }

    // 主菜单导航
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.setActive(
          this.activeIndex >= this.filteredCommands.length - 1 ? 0 : this.activeIndex + 1,
        );
        // 切换主菜单项时，如果新项有子菜单则展开，否则关闭
        this.updateSubmenuForActiveItem();
        return true;
      case 'ArrowUp':
        event.preventDefault();
        this.setActive(
          this.activeIndex <= 0 ? this.filteredCommands.length - 1 : this.activeIndex - 1,
        );
        this.updateSubmenuForActiveItem();
        return true;
      case 'ArrowRight': {
        // 如果当前项有子菜单，进入子菜单
        const activeCmd = this.filteredCommands[this.activeIndex];
        if (activeCmd?.children && activeCmd.children.length > 0) {
          event.preventDefault();
          const activeItem = this.items[this.activeIndex];
          if (activeItem) {
            this.showSubmenu(this.activeIndex, activeItem);
          }
          this.inSubmenu = true;
          this.setSubmenuActive(0);
          return true;
        }
        return false;
      }
      case 'Enter':
        event.preventDefault();
        {
          const cmd = this.filteredCommands[this.activeIndex];
          if (cmd?.children && cmd.children.length > 0) {
            // 有子菜单的项，Enter 进入子菜单
            const activeItem = this.items[this.activeIndex];
            if (activeItem) {
              this.showSubmenu(this.activeIndex, activeItem);
            }
            this.inSubmenu = true;
            this.setSubmenuActive(0);
          } else {
            this.executeItem(this.activeIndex);
          }
        }
        return true;
      case 'Escape':
        this.hideSubmenu();
        this.provider?.hide();
        return true;
      default:
        return false;
    }
  }

  /** 根据当前高亮的主菜单项更新子菜单显示状态 */
  private updateSubmenuForActiveItem() {
    const cmd = this.filteredCommands[this.activeIndex];
    if (cmd?.children && cmd.children.length > 0) {
      const activeItem = this.items[this.activeIndex];
      if (activeItem) {
        this.showSubmenu(this.activeIndex, activeItem);
      }
    } else {
      this.hideSubmenu();
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

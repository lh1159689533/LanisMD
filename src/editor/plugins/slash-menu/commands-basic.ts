/**
 * Slash menu 的内置基础指令
 *
 * 包含标题、列表、代码块、数学公式、图片、表格、图表等原有功能。
 * AI 相关指令位于 `commands-ai.ts`。
 */

import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';

import { openImageDialog } from '../image-block';
import { createLinkDialog } from '../tooltip-toolbar';
import { setMermaidAutoEdit } from '../mermaid-block';
import type { GfmAlertType } from '../gfm-alert/types';

import { icons } from './icons';
import type { SlashCommand } from './types';

// ---------------------------------------------------------------------------
// 触发文本处理
// ---------------------------------------------------------------------------

/**
 * 删除光标前最后一个 `/` 到光标之间的所有字符（即斜杠触发文本）
 */
export function removeSlashTrigger(view: EditorView) {
  const { state } = view;
  const { $from } = state.selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
  const lastSlash = textBefore.lastIndexOf('/');
  if (lastSlash === -1) return;
  const from = $from.start() + lastSlash;
  const to = $from.pos;
  view.dispatch(state.tr.delete(from, to));
}

// ---------------------------------------------------------------------------
// Block helpers
// ---------------------------------------------------------------------------

function wrapBlock(view: EditorView, nodeType: string, attrs?: Record<string, unknown>) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const type = schema.nodes[nodeType];
  if (!type) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  // blockquote 是 wrapping node，需要特殊处理
  if (nodeType === 'blockquote') {
    const paragraph = schema.nodes.paragraph;
    if (!paragraph) return;

    if (parent.type === paragraph && parent.content.size === 0) {
      const from = $from.before();
      const to = $from.after();
      const tr = state.tr.replaceWith(from, to, type.create(null, paragraph.create()));
      // blockquote(+1) > paragraph(+1)
      const cursorPos = from + 2;
      tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
      dispatch(tr.scrollIntoView());
    }
    view.focus();
    return;
  }

  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const tr = state.tr.setBlockType($from.before(), $from.after(), type, attrs);
    const cursorPos = $from.before() + 1;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
  } else {
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

  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(from, to, hrType.create());
    if (paragraphType) {
      const insertPos = tr.mapping.map(to);
      tr.insert(insertPos, paragraphType.create());
      tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
    }
    dispatch(tr.scrollIntoView());
  } else {
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, hrType.create());
    if (paragraphType) {
      const paraPos = tr.mapping.map(insertPos) + 1;
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
  const tableHeaderRowType = schema.nodes.table_header_row;
  const tableHeaderType = schema.nodes.table_header;
  const tableCellType = schema.nodes.table_cell;
  const paragraphType = schema.nodes.paragraph;

  if (!tableType || !tableRowType || !tableCellType || !paragraphType) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  const headerCellType = tableHeaderType || tableCellType;
  const headerCells = [
    headerCellType.create(null, paragraphType.create()),
    headerCellType.create(null, paragraphType.create()),
    headerCellType.create(null, paragraphType.create()),
  ];
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
    // table(+1) > row(+1) > cell(+1) > paragraph(+1)
    const cursorPos = from + 4;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
  } else {
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, table);
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
    const cursorPos = from + 3;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
    view.focus();
  } else {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(
      from,
      to,
      list.create(null, listItem.create(null, parent.copy(parent.content))),
    );
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
    const taskListItem = listItem.create(
      { checked: false, listType: 'bullet', label: '•', spread: 'true' },
      paragraph.create(),
    );
    const tr = state.tr.replaceWith(from, to, bulletList.create(null, taskListItem));
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
 * 插入一个 language="mermaid" 的空代码块，并自动进入编辑模式
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
  setMermaidAutoEdit();

  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(from, to, mermaidBlock);
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
 * 插入一个空的 math_block 节点并自动进入编辑模式
 */
function insertMathBlock(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const mathBlock = schema.nodes.math_block;
  if (!mathBlock) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  const mathNode = mathBlock.create({ autoEdit: true });

  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(from, to, mathNode);
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

function insertTocBlock(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const tocBlock = schema.nodes.toc_block;
  if (!tocBlock) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  const tocNode = tocBlock.create();

  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(from, to, tocNode);
    dispatch(tr.scrollIntoView());
  } else {
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, tocNode);
    dispatch(tr.scrollIntoView());
  }
  view.focus();
}

/**
 * 插入带 alertType 的 blockquote（GFM Alert）
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
    // blockquote(+1) > paragraph(+1)
    const cursorPos = from + 2;
    tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
    dispatch(tr.scrollIntoView());
  }
  view.focus();
}

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
  requestAnimationFrame(() => {
    const textInput = overlay.querySelector('[data-field="text"]') as HTMLInputElement | null;
    textInput?.focus();
  });
}

function insertImage(view: EditorView) {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;

  const imageBlockType = schema.nodes['image-block'] || schema.nodes.image_block;

  if (imageBlockType) {
    const { $from } = state.selection;
    const parent = $from.parent;

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
    // 回退：打开图片选择对话框
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
// 基础指令清单（AI 指令见 commands-ai.ts）
// ---------------------------------------------------------------------------

export const basicSlashCommands: SlashCommand[] = [
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
    label: '数学公式',
    icon: icons.math,
    shortcut: '$$',
    keywords: ['math', 'formula', 'equation', 'latex', 'katex', '数学', '公式', '方程', 'sx', 'gs'],
    execute: (view) => insertMathBlock(view),
  },
  {
    label: '链接',
    icon: icons.link,
    keywords: ['link', 'url', 'href', '链接', '超链接', 'lj'],
    execute: (view) => insertLink(view),
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
    label: '目录',
    icon: icons.toc,
    keywords: ['toc', 'table of contents', '目录', '导航', 'ml'],
    execute: (view) => insertTocBlock(view),
  },
  {
    label: '提示块',
    icon: icons.alert,
    keywords: ['alert', 'callout', 'admonition', '提示', '警告', '注意', 'tsk'],
    execute: () => {},
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
];

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
import { insertFileBlock } from '../file-block';
import { createDefaultMindmap, encode, DEFAULT_HEIGHT, SCHEMA_VERSION } from '../board-block';
import type { BoardMode } from '../board-block';
import type { GfmAlertType } from '../gfm-alert/types';

import { icons, getIcon } from './icons';
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

/**
 * 按指定行列插入表格。
 *
 * @param rows 总行数（含表头行），例如 rows=4 表示 1 个表头行 + 3 个数据行
 * @param cols 列数
 *
 * 遵循 GFM 规范：表格第一行必须是表头行，因此实际数据行数为 `rows - 1`。
 */
export function insertTableWithSize(view: EditorView, rows: number, cols: number) {
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

  // 至少 1 行（表头）1 列
  const totalRows = Math.max(1, Math.floor(rows));
  const totalCols = Math.max(1, Math.floor(cols));

  const { $from } = state.selection;
  const parent = $from.parent;

  const headerCellType = tableHeaderType || tableCellType;
  const headerCells = [];
  for (let c = 0; c < totalCols; c++) {
    headerCells.push(headerCellType.create(null, paragraphType.create()));
  }
  const headerRowType = tableHeaderRowType || tableRowType;
  const headerRow = headerRowType.create(null, headerCells);

  const bodyRows = [];
  for (let r = 0; r < totalRows - 1; r++) {
    const cells = [];
    for (let c = 0; c < totalCols; c++) {
      cells.push(tableCellType.create(null, paragraphType.create()));
    }
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

/** 默认表格：3 行（含表头）x 3 列 */
function insertTable(view: EditorView) {
  insertTableWithSize(view, 3, 3);
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
 * 插入一个画板块并自动进入编辑态。
 *
 * 两种形态共用本函数，区别仅在初始元素与写入的 `mode`：
 * - 导图：预置一份含中心主题的默认思维导图（`mode` 省略，解码侧回落 'mindmap'）
 * - 白板：空画布，不预置任何元素（`mode` 必须显式写 'board'，否则重开会被
 *   解码成导图块，且空 children 会被兜底成一个思维导图根节点）
 *
 * `autoEdit` 让 NodeView 挂载后立即进入可编辑状态。
 *
 * @param view 编辑器视图
 * @param mode 画板形态，默认导图
 */
function insertBoardBlock(view: EditorView, mode: BoardMode = 'mindmap'): void {
  removeSlashTrigger(view);

  const { state, dispatch } = view;
  const schema = state.schema;
  const boardBlock = schema.nodes.board_block;
  if (!boardBlock) return;

  const { $from } = state.selection;
  const parent = $from.parent;

  const data =
    mode === 'board' ? encode([], { mode: 'board' }) : encode(createDefaultMindmap());

  const boardNode = boardBlock.create({
    data,
    version: SCHEMA_VERSION,
    height: DEFAULT_HEIGHT,
    autoEdit: true,
  });

  if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
    const from = $from.before();
    const to = $from.after();
    const tr = state.tr.replaceWith(from, to, boardNode);
    dispatch(tr.scrollIntoView());
  } else {
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, boardNode);
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

/**
 * 获取基础指令清单（每次调用时重新获取当前主题对应的图标）
 */
export function getBasicSlashCommands(): SlashCommand[] {
  return [
  {
    id: 'heading1',
    label: '标题1',
    description: '',
    icon: getIcon('h1'),
    shortcut: '#',
    markdown: '#',
    keywords: ['heading', 'h1', '标题', 'title', 'bt'],
    isQuickAccess: true,
    execute: (view) => wrapBlock(view, 'heading', { level: 1 }),
  },
  {
    id: 'heading2',
    label: '标题2',
    description: '',
    icon: getIcon('h2'),
    shortcut: '##',
    markdown: '##',
    keywords: ['heading', 'h2', '标题', 'title', 'bt'],
    isQuickAccess: true,
    execute: (view) => wrapBlock(view, 'heading', { level: 2 }),
  },
  {
    id: 'heading3',
    label: '标题3',
    description: '',
    icon: getIcon('h3'),
    shortcut: '###',
    markdown: '###',
    keywords: ['heading', 'h3', '标题', 'title', 'bt'],
    isQuickAccess: true,
    execute: (view) => wrapBlock(view, 'heading', { level: 3 }),
  },
  {
    id: 'heading4',
    label: '标题4',
    description: '',
    icon: getIcon('h4'),
    shortcut: '####',
    markdown: '####',
    keywords: ['heading', 'h4', '标题', 'title', 'bt'],
    isQuickAccess: true,
    execute: (view) => wrapBlock(view, 'heading', { level: 4 }),
  },
  {
    id: 'heading5',
    label: '标题5',
    description: '',
    icon: getIcon('h5'),
    shortcut: '#####',
    markdown: '#####',
    keywords: ['heading', 'h5', '标题', 'title', 'bt'],
    isQuickAccess: true,
    execute: (view) => wrapBlock(view, 'heading', { level: 5 }),
  },
  {
    id: 'heading6',
    label: '标题6',
    description: '',
    icon: getIcon('h6'),
    shortcut: '######',
    markdown: '######',
    keywords: ['heading', 'h6', '标题', 'title', 'bt'],
    isQuickAccess: true,
    execute: (view) => wrapBlock(view, 'heading', { level: 6 }),
  },
  {
    id: 'bullet-list',
    label: '无序列表',
    description: '',
    icon: getIcon('bulletList'),
    shortcut: '-',
    markdown: '-',
    keywords: ['bullet', 'list', 'unordered', '无序', '列表', 'lb'],
    isQuickAccess: true,
    execute: (view) => wrapInList(view, 'bullet_list'),
  },
  {
    id: 'ordered-list',
    label: '有序列表',
    description: '',
    icon: getIcon('orderedList'),
    shortcut: '1.',
    markdown: '1.',
    keywords: ['ordered', 'list', 'number', '有序', '列表', 'lb'],
    isQuickAccess: true,
    execute: (view) => wrapInList(view, 'ordered_list'),
  },
  {
    id: 'task-list',
    label: '任务列表',
    description: '',
    icon: getIcon('taskList'),
    markdown: '- [ ]',
    keywords: ['task', 'todo', 'checkbox', '任务', '待办', 'rw'],
    isQuickAccess: true,
    execute: (view) => insertTaskList(view),
  },
  {
    id: 'link',
    label: '链接',
    description: '可自定义链接标题',
    icon: getIcon('link'),
    keywords: ['link', 'url', 'href', '链接', '超链接', 'lj'],
    isQuickAccess: true,
    execute: (view) => insertLink(view),
  },
  {
    id: 'code-block',
    label: '代码块',
    description: '支持多种语言和主题切换',
    icon: getIcon('codeBlock'),
    shortcut: '```',
    markdown: '```',
    keywords: ['code', 'block', '代码', 'dm', 'dmk'],
    isQuickAccess: true,
    execute: (view) => insertCodeBlock(view),
  },
  {
    id: 'image',
    label: '图片',
    description: '',
    icon: getIcon('image'),
    keywords: ['image', 'img', 'picture', 'photo', '图片', '图像', 'tp'],
    isQuickAccess: true,
    execute: (view) => insertImage(view),
  },
  {
    id: 'math',
    label: '公式',
    description: '支持 Latex 语法',
    icon: getIcon('math'),
    shortcut: '$$',
    markdown: '$$',
    keywords: ['math', 'formula', 'equation', 'latex', 'katex', '数学', '公式', '方程', 'sx', 'gs'],
    execute: (view) => insertMathBlock(view),
  },
  {
    id: 'blockquote',
    label: '引用',
    description: '插入引用格式',
    icon: getIcon('blockquote'),
    shortcut: '>',
    markdown: '>',
    keywords: ['quote', 'blockquote', '引用', 'yy'],
    execute: (view) => wrapBlock(view, 'blockquote'),
  },
  {
    id: 'divider',
    label: '分割线',
    description: '插入分割线',
    icon: getIcon('divider'),
    shortcut: '---',
    markdown: '---',
    keywords: ['divider', 'hr', 'horizontal', '分割', '分隔', 'fgx'],
    execute: (view) => insertHr(view),
  },
  {
    id: 'table',
    label: '表格',
    description: '',
    icon: getIcon('table'),
    keywords: ['table', 'grid', '表格', 'bg'],
    tableGrid: true,
    execute: (view) => insertTable(view),
  },
  {
    id: 'mermaid',
    label: '文本绘图',
    description: '支持Mermaid',
    icon: getIcon('mermaid'),
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
      '文本绘图',
      'tb',
      'wbht',
    ],
    execute: (view) => insertMermaidBlock(view),
  },
  {
    id: 'toc',
    label: '目录',
    description: '',
    icon: getIcon('toc'),
    keywords: ['toc', 'table of contents', '目录', '导航', 'ml'],
    execute: (view) => insertTocBlock(view),
  },
  {
    id: 'board',
    label: '思维导图',
    description: '插入可编辑的思维导图画板',
    icon: getIcon('board'),
    keywords: ['board', 'mindmap', 'mind', '思维导图', '导图', '脑图', '画板', 'swdt', 'hb'],
    execute: (view) => insertBoardBlock(view, 'mindmap'),
  },
  {
    id: 'whiteboard',
    label: '白板',
    description: '插入可绘制图形与流程图的白板',
    // 与「思维导图」刻意共享 board / 画板 两个泛化关键词：两者都是「画板」的一种，
    // 输入泛化词时同时列出两条由用户看图标与标题选择；专属词
    //（导图 / swdt vs 白板 / bb）仍可精准命中单条。
    icon: getIcon('whiteboard'),
    keywords: [
      'board',
      'whiteboard',
      'draw',
      '白板',
      '画板',
      '绘图',
      '图形',
      '流程图',
      'bb',
      'hb',
      'lct',
    ],
    execute: (view) => insertBoardBlock(view, 'board'),
  },
  {
    id: 'file',
    label: '附件',
    description: '插入本地文件，支持pdf、ppt等多种格式内置预览',
    icon: getIcon('file'),
    keywords: ['file', 'attachment', '附件', '文件', 'fj', 'wj'],
    execute: (view) => insertFileBlock(view),
  },
  {
    id: 'alert',
    label: '提示块',
    description: '',
    icon: getIcon('alert'),
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
}

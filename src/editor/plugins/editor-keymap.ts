/**
 * Editor Keymap Plugin
 *
 * 统一注册编辑器快捷键，覆盖 P0 功能：
 *
 * 段落格式：
 * - Cmd/Ctrl+1~6: 标题 1-6
 * - Cmd/Ctrl+0: 段落（取消标题）
 * - Cmd/Ctrl+=: 增加标题级别
 * - Cmd/Ctrl+-: 减小标题级别
 * - Cmd+Option+T / Ctrl+T: 表格
 * - Cmd+Option+C / Ctrl+Shift+K: 代码块
 * - Cmd+Shift+` / Ctrl+Shift+`: 代码块（备选）
 * - Cmd+Option+B / Ctrl+Shift+M: 数学公式块
 * - Cmd+Option+Q / Ctrl+Shift+Q: 引用
 * - Cmd+Option+O / Ctrl+Shift+[: 有序列表
 * - Cmd+Option+U / Ctrl+Shift+]: 无序列表
 *
 * Format：
 * - Cmd/Ctrl+U: 下划线
 * - Cmd+Shift+X / Alt+Shift+5: 删除线
 * - Cmd/Ctrl+K: 超链接
 * - Cmd+Option+I / Ctrl+Shift+I: 图片
 * - Cmd+Option+H / Ctrl+Shift+H: 高亮
 * - Cmd/Ctrl+\: 清除格式
 */

import { $prose } from '@milkdown/kit/utils';
import { keymap } from '@milkdown/kit/prose/keymap';
import { toggleMark } from '@milkdown/kit/prose/commands';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { Command } from '@milkdown/kit/prose/state';
import { createLinkDialog } from './tooltip-toolbar';
import { openImageDialog } from './image-block';
import { setMermaidAutoEdit } from './mermaid-block';

// ---------------------------------------------------------------------------
// 辅助函数：段落格式操作
// ---------------------------------------------------------------------------

/**
 * 将当前块转换为指定级别的标题
 * 如果已经是该级别标题则转回段落
 */
function setHeading(level: number): Command {
  return (state, dispatch) => {
    const { schema, selection } = state;
    const headingType = schema.nodes.heading;
    const paragraphType = schema.nodes.paragraph;
    if (!headingType || !paragraphType) return false;

    const { $from } = selection;
    const parent = $from.parent;

    // 如果当前已经是该级别标题，转回段落
    if (parent.type === headingType && parent.attrs.level === level) {
      if (dispatch) {
        const tr = state.tr.setBlockType($from.before(), $from.after(), paragraphType);
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    // 转换为标题（需要检查当前块是否允许转换）
    if (parent.type === paragraphType || parent.type === headingType) {
      if (dispatch) {
        const tr = state.tr.setBlockType($from.before(), $from.after(), headingType, { level });
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    return false;
  };
}

/**
 * 将当前块转回段落
 */
function setParagraph(): Command {
  return (state, dispatch) => {
    const { schema, selection } = state;
    const paragraphType = schema.nodes.paragraph;
    if (!paragraphType) return false;

    const { $from } = selection;
    const parent = $from.parent;

    // 仅在标题时生效
    if (parent.type === schema.nodes.heading) {
      if (dispatch) {
        const tr = state.tr.setBlockType($from.before(), $from.after(), paragraphType);
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    return false;
  };
}

/**
 * 增加标题级别（H2 -> H1，段落 -> H6，H1 不变）
 */
function increaseHeadingLevel(): Command {
  return (state, dispatch) => {
    const { schema, selection } = state;
    const headingType = schema.nodes.heading;
    const paragraphType = schema.nodes.paragraph;
    if (!headingType) return false;

    const { $from } = selection;
    const parent = $from.parent;

    if (parent.type === headingType) {
      const currentLevel = parent.attrs.level as number;
      if (currentLevel <= 1) return true; // H1 不能再升
      if (dispatch) {
        const tr = state.tr.setBlockType($from.before(), $from.after(), headingType, {
          level: currentLevel - 1,
        });
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    // 段落 -> H6
    if (parent.type === paragraphType) {
      if (dispatch) {
        const tr = state.tr.setBlockType($from.before(), $from.after(), headingType, { level: 6 });
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    return false;
  };
}

/**
 * 减小标题级别（H1 -> H2，H6 -> 段落）
 */
function decreaseHeadingLevel(): Command {
  return (state, dispatch) => {
    const { schema, selection } = state;
    const headingType = schema.nodes.heading;
    const paragraphType = schema.nodes.paragraph;
    if (!headingType || !paragraphType) return false;

    const { $from } = selection;
    const parent = $from.parent;

    if (parent.type === headingType) {
      const currentLevel = parent.attrs.level as number;
      if (currentLevel >= 6) {
        // H6 -> 段落
        if (dispatch) {
          const tr = state.tr.setBlockType($from.before(), $from.after(), paragraphType);
          dispatch(tr.scrollIntoView());
        }
        return true;
      }
      if (dispatch) {
        const tr = state.tr.setBlockType($from.before(), $from.after(), headingType, {
          level: currentLevel + 1,
        });
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    return false;
  };
}

/**
 * 插入表格（3x3，含表头行）
 */
function insertTableCommand(): Command {
  return (state, dispatch) => {
    const schema = state.schema;
    const tableType = schema.nodes.table;
    const tableRowType = schema.nodes.table_row;
    const tableHeaderRowType = schema.nodes.table_header_row;
    const tableHeaderType = schema.nodes.table_header;
    const tableCellType = schema.nodes.table_cell;
    const paragraphType = schema.nodes.paragraph;

    if (!tableType || !tableRowType || !tableCellType || !paragraphType) return false;

    if (dispatch) {
      const { $from } = state.selection;
      const parent = $from.parent;

      const headerCellType = tableHeaderType || tableCellType;
      const headerCells = [
        headerCellType.create(null, paragraphType.create()),
        headerCellType.create(null, paragraphType.create()),
        headerCellType.create(null, paragraphType.create()),
      ];
      const headerRowTypeResolved = tableHeaderRowType || tableRowType;
      const headerRow = headerRowTypeResolved.create(null, headerCells);

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
    }
    return true;
  };
}

/**
 * 插入代码块
 */
function insertCodeBlockCommand(): Command {
  return (state, dispatch) => {
    const schema = state.schema;
    const codeBlock = schema.nodes.code_block;
    if (!codeBlock) return false;

    if (dispatch) {
      const { $from } = state.selection;
      const parent = $from.parent;

      if (parent.type === schema.nodes.paragraph && parent.content.size === 0) {
        const tr = state.tr.setBlockType($from.before(), $from.after(), codeBlock);
        dispatch(tr.scrollIntoView());
      } else {
        const tr = state.tr.replaceSelectionWith(codeBlock.create());
        dispatch(tr.scrollIntoView());
      }
    }
    return true;
  };
}

/**
 * 插入数学公式块
 */
function insertMathBlockCommand(): Command {
  return (state, dispatch) => {
    const schema = state.schema;
    const mathBlock = schema.nodes.math_block;
    if (!mathBlock) return false;

    if (dispatch) {
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
    }
    return true;
  };
}

/**
 * 将当前块包裹为引用
 */
function wrapInBlockquoteCommand(): Command {
  return (state, dispatch) => {
    const schema = state.schema;
    const blockquoteType = schema.nodes.blockquote;
    const paragraphType = schema.nodes.paragraph;
    if (!blockquoteType || !paragraphType) return false;

    const { $from } = state.selection;
    const parent = $from.parent;

    // 如果已经在引用中，取消引用（lift）
    if ($from.depth >= 2) {
      const grandParent = $from.node($from.depth - 1);
      if (grandParent.type === blockquoteType) {
        if (dispatch) {
          const blockquoteStart = $from.before($from.depth - 1);
          const blockquoteEnd = $from.after($from.depth - 1);
          const tr = state.tr.replaceWith(
            blockquoteStart,
            blockquoteEnd,
            parent.copy(parent.content),
          );
          tr.setSelection(TextSelection.near(tr.doc.resolve(blockquoteStart + 1)));
          dispatch(tr.scrollIntoView());
        }
        return true;
      }
    }

    // 包裹为引用
    if (parent.type === paragraphType || parent.type === schema.nodes.heading) {
      if (dispatch) {
        const from = $from.before();
        const to = $from.after();
        const tr = state.tr.replaceWith(
          from,
          to,
          blockquoteType.create(null, parent.copy(parent.content)),
        );
        const cursorPos = from + 2;
        tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    return false;
  };
}

/**
 * 将当前块包裹为列表
 */
function wrapInListCommand(listTypeName: string): Command {
  return (state, dispatch) => {
    const schema = state.schema;
    const listType = schema.nodes[listTypeName];
    const listItem = schema.nodes.list_item;
    const paragraph = schema.nodes.paragraph;
    if (!listType || !listItem || !paragraph) return false;

    const { $from } = state.selection;
    const parent = $from.parent;

    if (parent.type === paragraph && parent.content.size === 0) {
      if (dispatch) {
        const from = $from.before();
        const to = $from.after();
        const tr = state.tr.replaceWith(
          from,
          to,
          listType.create(null, listItem.create(null, paragraph.create())),
        );
        const cursorPos = from + 3;
        tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    if (parent.type === paragraph || parent.type === schema.nodes.heading) {
      if (dispatch) {
        const from = $from.before();
        const to = $from.after();
        const tr = state.tr.replaceWith(
          from,
          to,
          listType.create(null, listItem.create(null, parent.copy(parent.content))),
        );
        const cursorPos = from + 3;
        tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
        dispatch(tr.scrollIntoView());
      }
      return true;
    }

    return false;
  };
}

// ---------------------------------------------------------------------------
// 辅助函数：Format 操作
// ---------------------------------------------------------------------------

/**
 * 切换 mark
 */
function toggleMarkByName(markName: string): Command {
  return (state, dispatch, view) => {
    const markType = state.schema.marks[markName];
    if (!markType) return false;
    return toggleMark(markType)(state, dispatch, view);
  };
}

/**
 * 清除选区中所有 marks
 */
function clearAllMarksCommand(): Command {
  return (state, dispatch) => {
    const { from, to } = state.selection;
    if (from === to) return false;

    if (dispatch) {
      let tr = state.tr;
      const marks = new Set<import('@milkdown/kit/prose/model').MarkType>();
      state.doc.nodesBetween(from, to, (node) => {
        node.marks.forEach((mark) => marks.add(mark.type));
      });
      marks.forEach((markType) => {
        tr = tr.removeMark(from, to, markType);
      });
      dispatch(tr);
    }
    return true;
  };
}

/**
 * 打开链接对话框插入超链接
 * 需要 EditorView，不能使用纯 Command，需要特殊处理
 */
function insertLinkFromKeymap(view: EditorView): boolean {
  const { state } = view;
  const linkType = state.schema.marks.link;
  if (!linkType) return false;

  const { from, to } = state.selection;
  const selectedText = state.doc.textBetween(from, to, ' ');

  // 检查选区上是否已有链接 mark
  let existingHref = '';
  state.doc.nodesBetween(from, to, (node) => {
    const linkMark = node.marks.find((m) => m.type === linkType);
    if (linkMark) {
      existingHref = linkMark.attrs.href || '';
    }
  });

  const dialog = createLinkDialog(view, selectedText, existingHref, (text, href) => {
    const { state: currentState, dispatch } = view;
    const { from: curFrom, to: curTo } = currentState.selection;

    let tr = currentState.tr;
    tr = tr.removeMark(curFrom, curTo, linkType);

    if (text !== currentState.doc.textBetween(curFrom, curTo, ' ')) {
      tr = tr.insertText(text, curFrom, curTo);
      const newTo = curFrom + text.length;
      tr = tr.addMark(curFrom, newTo, linkType.create({ href }));
    } else if (curFrom === curTo) {
      // 没有选区：插入新链接文本
      const linkMark = linkType.create({ href });
      const textNode = state.schema.text(text, [linkMark]);
      tr = tr.insert(curFrom, textNode);
    } else {
      tr = tr.addMark(curFrom, curTo, linkType.create({ href }));
    }

    dispatch(tr);
    view.focus();
  });

  document.body.appendChild(dialog);
  requestAnimationFrame(() => {
    const textInput = dialog.querySelector('[data-field="text"]') as HTMLInputElement | null;
    textInput?.focus();
  });

  return true;
}

/**
 * 插入图片
 */
function insertImageFromKeymap(view: EditorView): boolean {
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
    // 回退方式：通过 Tauri 对话框
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

  return true;
}

// ---------------------------------------------------------------------------
// Keymap 插件
// ---------------------------------------------------------------------------

/**
 * 编辑器快捷键插件
 *
 * 使用 ProseMirror keymap 注册所有 P0 快捷键。
 * 键名约定：
 * - Mod = Cmd(macOS) / Ctrl(Win/Linux)
 * - Alt = Option(macOS) / Alt(Win/Linux)
 * - Shift = Shift
 *
 * 注意：macOS 和 Windows/Linux 部分快捷键不同，
 * 同一功能需要注册多个键名来兼容双平台。
 */
export const editorKeymapPlugin = $prose(() => {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keys: Record<string, any> = {};

  // ----- 段落格式快捷键 -----

  // 标题 1~6：Mod+1~6（双平台相同）
  for (let i = 1; i <= 6; i++) {
    keys[`Mod-${i}`] = setHeading(i);
  }

  // 段落（取消标题）：Mod+0
  keys['Mod-0'] = setParagraph();

  // 增加标题级别：Mod+=
  keys['Mod-='] = increaseHeadingLevel();

  // 减小标题级别：Mod--
  // 注意：Mod-- 在某些系统中可能与浏览器缩小冲突，
  // Tauri 应用中可正常使用
  keys['Mod--'] = decreaseHeadingLevel();

  // 表格
  if (isMac) {
    keys['Mod-Alt-t'] = insertTableCommand();
  } else {
    keys['Mod-t'] = insertTableCommand();
  }

  // 代码块
  if (isMac) {
    keys['Mod-Alt-c'] = insertCodeBlockCommand();
  } else {
    keys['Mod-Shift-k'] = insertCodeBlockCommand();
  }

  // 代码块备选：Mod+Shift+`（双平台）
  keys['Mod-Shift-`'] = insertCodeBlockCommand();

  // 数学公式块
  if (isMac) {
    keys['Mod-Alt-b'] = insertMathBlockCommand();
  } else {
    keys['Mod-Shift-m'] = insertMathBlockCommand();
  }

  // 引用
  if (isMac) {
    keys['Mod-Alt-q'] = wrapInBlockquoteCommand();
  } else {
    keys['Mod-Shift-q'] = wrapInBlockquoteCommand();
  }

  // 有序列表
  if (isMac) {
    keys['Mod-Alt-o'] = wrapInListCommand('ordered_list');
  } else {
    keys['Mod-Shift-['] = wrapInListCommand('ordered_list');
  }

  // 无序列表
  if (isMac) {
    keys['Mod-Alt-u'] = wrapInListCommand('bullet_list');
  } else {
    keys['Mod-Shift-]'] = wrapInListCommand('bullet_list');
  }

  // ----- Format 快捷键 -----

  // 下划线：Mod+U
  keys['Mod-u'] = toggleMarkByName('underline');

  // 删除线
  if (isMac) {
    keys['Mod-Shift-x'] = toggleMarkByName('strike_through');
  } else {
    keys['Alt-Shift-5'] = toggleMarkByName('strike_through');
  }

  // 超链接：Mod+K（需要 EditorView，使用 handleKeyDown 风格）
  keys['Mod-k'] = (_state: import('@milkdown/kit/prose/state').EditorState, _dispatch: unknown, view: EditorView) => {
    return insertLinkFromKeymap(view);
  };

  // 图片
  if (isMac) {
    keys['Mod-Alt-i'] = (_state: import('@milkdown/kit/prose/state').EditorState, _dispatch: unknown, view: EditorView) => {
      return insertImageFromKeymap(view);
    };
  } else {
    keys['Mod-Shift-i'] = (_state: import('@milkdown/kit/prose/state').EditorState, _dispatch: unknown, view: EditorView) => {
      return insertImageFromKeymap(view);
    };
  }

  // 高亮
  if (isMac) {
    keys['Mod-Alt-h'] = toggleMarkByName('highlight');
  } else {
    keys['Mod-Shift-h'] = toggleMarkByName('highlight');
  }

  // 上标：Mod+Shift+.（与 Typora 一致）
  keys['Mod-Shift-.'] = toggleMarkByName('superscript');

  // 下标：Mod+Shift+,（与 Typora 一致）
  keys['Mod-Shift-,'] = toggleMarkByName('subscript');

  // 清除格式：Mod+\
  keys['Mod-\\'] = clearAllMarksCommand();

  return keymap(keys);
});

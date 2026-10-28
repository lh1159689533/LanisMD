/**
 * Board Style Toolbar - 文字样式能力组
 *
 * 工具栏按钮（字母 A）+ 下拉面板：
 * - 第一行：加粗（B）/ 斜体（I）/ 下划线（U）切换按钮
 * - 第二行：字号 / 字色 / 对齐（一行三个自实现下拉控件）
 *   - 字号：显示当前值（如 `14px`），点击弹出自实现字号下拉
 *   - 字色：显示「A + 下划线」，下划线颜色与当前字色一致，点击弹出取色面板
 *   - 对齐：显示当前对齐 icon，点击弹出自实现对齐下拉（左/中/右）
 *
 * 文字 mark 写操作封装在 `transforms.ts`（`applyBold`/`applyItalic`/
 * `applyUnderline`/`applyFontSize`/`applyTextColor`/`applyTextAlign`），
 * 通过 `getTextEditorsByElement` + `Editor.addMark`（mark）或
 * `Transforms.setNodes`（段落 align）落到节点主题文本。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次4：文字样式（粗/斜/字号/字色）下拉面板  | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次4 |
 * | v1.1.0 | 新增下划线/水平对齐                         | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次4 |
 * | v1.2.0 | 字号/字色/对齐改为一行自实现下拉控件         | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次4 |
 * | v1.3.0 | 新增 setVisible：画板形态下无文本语义元素隐藏本组 | REQ: 20261027-board-whiteboard-draw §3.8 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';

import { PREFIX, FONT_SIZE_OPTIONS, TEXT_ALIGN_OPTIONS, type TextAlignOption } from '../constants';
import {
  ICON_TEXT_STYLE,
  ICON_BOLD,
  ICON_ITALIC,
  ICON_UNDERLINE,
  ICON_ALIGN_LEFT,
  ICON_ALIGN_CENTER,
  ICON_ALIGN_RIGHT,
} from '../icons';
import { createColorPanel, type ColorPanelController } from '../color-panel';
import {
  applyBold,
  applyItalic,
  applyUnderline,
  applyFontSize,
  applyTextColor,
  applyTextAlign,
  resolveColor,
} from '../transforms';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 文字样式回填状态 */
export interface TextStyleState {
  bold: boolean;
  italic: boolean;
  underlined: boolean;
  fontSize: number;
  textColor: string | null;
  textAlign: TextAlignOption | null;
}

export interface TextStyleSegment {
  readonly button: HTMLElement;
  /** 更新当前文字样式回填 */
  setActiveTextStyle(state: TextStyleState): void;
  /**
   * 设置能力组显隐（隐藏时收起下拉面板）。
   *
   * 导图形态恒显示不会调用；画板形态下连线等无文本语义的元素需隐藏本组。
   */
  setVisible(visible: boolean): void;
  /** 绑定 board */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

/** 三个子浮层（字号 / 字色 / 对齐）的名称 */
type SubPanelName = 'size' | 'color' | 'align';

/** 字色无显式值时的下划线占位色 */
const DEFAULT_COLOR_PREVIEW = '#999999';

/** 对齐无显式值时的默认展示 icon（思维导图节点文字默认居中） */
const DEFAULT_ALIGN: TextAlignOption = 'center';

// ---------------------------------------------------------------------------
// 创建
// ---------------------------------------------------------------------------

export function createTextStyleSegment(): TextStyleSegment {
  let board: PlaitBoard | null = null;
  let isOpen = false;
  let activeBold = false;
  let activeItalic = false;
  let activeUnderline = false;
  let activeAlign: TextAlignOption | null = null;
  let currentColor: string | null = null;
  let currentSize = 14;
  let openSub: SubPanelName | null = null;

  // --- 工具栏按钮 ---
  const button = document.createElement('button');
  button.className = `${PREFIX}__btn ${PREFIX}__btn--text-style`;
  button.type = 'button';
  button.title = '文字样式';

  // 图标容器：与 dropdown 同为 button 子节点，便于后续按字色动态着色而不误删下拉面板
  const iconEl = document.createElement('span');
  iconEl.className = `${PREFIX}__btn-icon`;
  iconEl.innerHTML = ICON_TEXT_STYLE;
  button.appendChild(iconEl);

  // --- 下拉面板 ---
  const dropdown = document.createElement('div');
  dropdown.className = `${PREFIX}__dropdown ${PREFIX}__text-style-dropdown`;

  // 第一行：加粗 / 斜体 / 下划线
  const marksRow = document.createElement('div');
  marksRow.className = `${PREFIX}__text-marks-row`;

  // 加粗切换按钮
  const boldBtn = document.createElement('button');
  boldBtn.className = `${PREFIX}__text-toggle`;
  boldBtn.type = 'button';
  boldBtn.title = '加粗';
  boldBtn.innerHTML = ICON_BOLD;
  boldBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!board) return;
    activeBold = !activeBold;
    applyBold(board, activeBold);
    boldBtn.classList.toggle('is-active', activeBold);
  });

  // 斜体切换按钮
  const italicBtn = document.createElement('button');
  italicBtn.className = `${PREFIX}__text-toggle`;
  italicBtn.type = 'button';
  italicBtn.title = '斜体';
  italicBtn.innerHTML = ICON_ITALIC;
  italicBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!board) return;
    activeItalic = !activeItalic;
    applyItalic(board, activeItalic);
    italicBtn.classList.toggle('is-active', activeItalic);
  });

  // 下划线切换按钮
  const underlineBtn = document.createElement('button');
  underlineBtn.className = `${PREFIX}__text-toggle`;
  underlineBtn.type = 'button';
  underlineBtn.title = '下划线';
  underlineBtn.innerHTML = ICON_UNDERLINE;
  underlineBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!board) return;
    activeUnderline = !activeUnderline;
    applyUnderline(board, activeUnderline);
    underlineBtn.classList.toggle('is-active', activeUnderline);
  });

  marksRow.appendChild(boldBtn);
  marksRow.appendChild(italicBtn);
  marksRow.appendChild(underlineBtn);
  dropdown.appendChild(marksRow);

  // 第二行：字号 / 字色 / 对齐（一行）
  const styleRow = document.createElement('div');
  styleRow.className = `${PREFIX}__text-style-row`;

  // --- 字号按钮 + 下拉 ---
  const sizeWrap = document.createElement('div');
  sizeWrap.className = `${PREFIX}__sub-wrap`;

  const sizeBtn = document.createElement('button');
  sizeBtn.className = `${PREFIX}__sub-btn ${PREFIX}__text-size-btn`;
  sizeBtn.type = 'button';
  sizeBtn.title = '字号';
  sizeBtn.textContent = '14px';

  const sizeDropdown = document.createElement('div');
  sizeDropdown.className = `${PREFIX}__sub-dropdown ${PREFIX}__size-dropdown`;

  const sizeItems: HTMLElement[] = [];
  FONT_SIZE_OPTIONS.forEach((size) => {
    const item = document.createElement('button');
    item.className = `${PREFIX}__size-item`;
    item.type = 'button';
    item.setAttribute('data-size', String(size));
    item.textContent = String(size);
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      currentSize = size;
      applyFontSize(board, size);
      updateSizeState();
      setSubOpen(null);
    });
    sizeItems.push(item);
    sizeDropdown.appendChild(item);
  });

  sizeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSub('size');
  });

  sizeWrap.appendChild(sizeBtn);
  sizeWrap.appendChild(sizeDropdown);
  styleRow.appendChild(sizeWrap);

  // --- 字色按钮 + 取色浮层 ---
  const colorWrap = document.createElement('div');
  colorWrap.className = `${PREFIX}__sub-wrap`;

  const colorBtn = document.createElement('button');
  colorBtn.className = `${PREFIX}__sub-btn ${PREFIX}__text-color-btn`;
  colorBtn.type = 'button';
  colorBtn.title = '字色';

  // 字母 A，下划线颜色随当前字色动态变化
  const colorLetter = document.createElement('span');
  colorLetter.className = `${PREFIX}__text-color-btn__letter`;
  colorLetter.textContent = 'A';
  colorLetter.style.borderBottomColor = DEFAULT_COLOR_PREVIEW;
  colorBtn.appendChild(colorLetter);

  colorBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSub('color');
  });

  colorWrap.appendChild(colorBtn);
  styleRow.appendChild(colorWrap);

  // --- 对齐按钮 + 下拉 ---
  const alignWrap = document.createElement('div');
  alignWrap.className = `${PREFIX}__sub-wrap`;

  const alignBtn = document.createElement('button');
  alignBtn.className = `${PREFIX}__sub-btn ${PREFIX}__align-btn`;
  alignBtn.type = 'button';
  alignBtn.title = '水平对齐';

  const ALIGN_ICON_MAP: Record<TextAlignOption, string> = {
    left: ICON_ALIGN_LEFT,
    center: ICON_ALIGN_CENTER,
    right: ICON_ALIGN_RIGHT,
  };

  const alignDropdown = document.createElement('div');
  alignDropdown.className = `${PREFIX}__sub-dropdown ${PREFIX}__align-dropdown`;

  const alignEls: HTMLElement[] = [];
  TEXT_ALIGN_OPTIONS.forEach((opt) => {
    const item = document.createElement('button');
    item.className = `${PREFIX}__align-item`;
    item.type = 'button';
    item.setAttribute('data-align', opt.id);

    const iconSpan = document.createElement('span');
    iconSpan.className = `${PREFIX}__align-item-icon`;
    iconSpan.innerHTML = ALIGN_ICON_MAP[opt.id];
    const labelSpan = document.createElement('span');
    labelSpan.textContent = opt.label;

    item.appendChild(iconSpan);
    item.appendChild(labelSpan);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!board) return;
      activeAlign = opt.id;
      applyTextAlign(board, opt.id);
      updateAlignState();
      setSubOpen(null);
    });

    alignEls.push(item);
    alignDropdown.appendChild(item);
  });

  alignBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSub('align');
  });

  alignWrap.appendChild(alignBtn);
  alignWrap.appendChild(alignDropdown);
  styleRow.appendChild(alignWrap);

  // --- 字色取色浮层（挂在第二行下方，居中弹出） ---
  const colorPopover = document.createElement('div');
  colorPopover.className = `${PREFIX}__color-popover`;

  const colorPanel: ColorPanelController = createColorPanel((color) => {
    if (!board) return;
    const resolved = resolveColor(color);
    currentColor = resolved;
    applyTextColor(board, resolved);
    updateColorState();
  });
  colorPopover.appendChild(colorPanel.dom);
  styleRow.appendChild(colorPopover);

  dropdown.appendChild(styleRow);

  // --- 三个子浮层的统一管理（互斥 + 外点关闭） ---
  const subPanels: Record<SubPanelName, { btn: HTMLElement; panel: HTMLElement }> = {
    size: { btn: sizeBtn, panel: sizeDropdown },
    color: { btn: colorBtn, panel: colorPopover },
    align: { btn: alignBtn, panel: alignDropdown },
  };

  function setSubOpen(name: SubPanelName | null): void {
    openSub = name;
    (Object.keys(subPanels) as SubPanelName[]).forEach((key) => {
      const { btn, panel } = subPanels[key];
      const open = key === name;
      panel.classList.toggle('is-open', open);
      btn.classList.toggle('is-dropdown-open', open);
    });
    document.removeEventListener('mousedown', handleSubOutsideClick, true);
    if (name) {
      requestAnimationFrame(() => {
        document.addEventListener('mousedown', handleSubOutsideClick, true);
      });
    }
  }

  function toggleSub(name: SubPanelName): void {
    setSubOpen(openSub === name ? null : name);
  }

  function handleSubOutsideClick(e: MouseEvent): void {
    if (!openSub) return;
    const { btn, panel } = subPanels[openSub];
    if (!btn.contains(e.target as Node) && !panel.contains(e.target as Node)) {
      setSubOpen(null);
    }
  }

  button.appendChild(dropdown);

  // --- 打开/关闭 ---
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if ((e.target as HTMLElement).closest(`.${PREFIX}__dropdown`)) return;
    toggleDropdown();
  });

  function toggleDropdown(): void {
    isOpen ? closeDropdown() : openDropdown();
  }

  function openDropdown(): void {
    isOpen = true;
    dropdown.classList.add('is-open');
    button.classList.add('is-dropdown-open');
    // 每次打开下拉面板时收起所有子浮层
    setSubOpen(null);
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleOutsideClick, true);
    });
  }

  function closeDropdown(): void {
    isOpen = false;
    dropdown.classList.remove('is-open');
    button.classList.remove('is-dropdown-open');
    setSubOpen(null);
    document.removeEventListener('mousedown', handleOutsideClick, true);
  }

  function handleOutsideClick(e: MouseEvent): void {
    if (!button.contains(e.target as Node)) {
      closeDropdown();
    }
  }

  // --- 回填更新 ---
  function updateSizeState(): void {
    sizeBtn.textContent = `${currentSize}px`;
    sizeItems.forEach((el) => {
      el.classList.toggle('is-active', Number(el.getAttribute('data-size')) === currentSize);
    });
  }

  function updateColorState(): void {
    colorLetter.style.borderBottomColor = currentColor ?? DEFAULT_COLOR_PREVIEW;
  }

  function updateAlignState(): void {
    const display = activeAlign ?? DEFAULT_ALIGN;
    alignBtn.innerHTML = ALIGN_ICON_MAP[display];
    alignEls.forEach((el) => {
      const align = el.getAttribute('data-align') as TextAlignOption;
      el.classList.toggle('is-active', align === display);
    });
  }

  // --- 公开方法 ---
  function setActiveTextStyle(state: TextStyleState): void {
    activeBold = state.bold;
    activeItalic = state.italic;
    activeUnderline = state.underlined;
    activeAlign = state.textAlign;
    currentColor = state.textColor;
    currentSize = state.fontSize;
    boldBtn.classList.toggle('is-active', activeBold);
    italicBtn.classList.toggle('is-active', activeItalic);
    underlineBtn.classList.toggle('is-active', activeUnderline);
    updateSizeState();
    updateColorState();
    updateAlignState();
    colorPanel.setActiveColor(state.textColor);
  }

  function setBoard(b: PlaitBoard): void {
    board = b;
    colorPanel.setBoard(b);
  }

  function destroy(): void {
    closeDropdown();
    colorPanel.destroy();
    button.remove();
  }

  /** 设置能力组显隐：隐藏时先收起下拉，避免面板状态残留 */
  function setVisible(visible: boolean): void {
    if (!visible) {
      closeDropdown();
    }
    button.style.display = visible ? '' : 'none';
  }

  return { button, setActiveTextStyle, setVisible, setBoard, destroy };
}

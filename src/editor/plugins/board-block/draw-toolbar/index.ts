/**
 * Board Draw Toolbar - 画板创建工具条
 *
 * 浮于画板块画布左侧的竖排工具条，用于选择「待创建的元素类型」。
 * 批次 1 的工具项：选择 / 手型 / 图形（弹出网格面板）/ 连线（弹出走线面板）。
 *
 * 实现约定（与 canvas-toolbar / style-toolbar 保持一致）：
 * - 原生 DOM，不走 React：宿主把本控制器的 dom 挂到块级根容器（`this.dom`）上，
 *   不能挂到 React root 容器内——React reconcile 会移除其内部一切非托管 DOM。
 * - 根 DOM 必须带 Plait 的 `plait-board-attached` 类，否则点击工具条的瞬间
 *   Plait 的 globalPointerUp 会清空画板选中态。弹出面板作为根的后代渲染，
 *   从而继承该类，不能 portal 到 body。
 * - 所有按钮用 `mousedown` + preventDefault + stopPropagation，避免抢走编辑器
 *   焦点或触发 ProseMirror 的节点选择。
 *
 * 高亮状态有三个变更来源，三者都已覆盖：
 * 1. 用户点工具条 → `activateCreation` / `handleSelect` 主动写 `board.pointer`
 *    后立即 `sync()`
 * 2. 创建完一个元素 → Plait 自动把 pointer 回落 `selection`。该赋值本身不产生 op，
 *    但同一个事件处理器里的 `Transforms.insertNode` 会产生 op，而 Plait 的
 *    `board.onChange()` 被推迟到微任务执行（见 @plait/core 的 apply 实现），
 *    届时 pointer 已完成回落，故 `subscribe` 包装的 onChange 能读到正确值。
 * 3. 进出编辑态 → `BoardReact` 的 readonly effect 强制重设 pointer，该赋值不走
 *    op 流程、不触发 onChange → 必须由宿主在 `onPointerReset` 中调用 `sync()`。
 *
 * @changelog
 * | 版本   | 变更说明                                 | 关联                                      |
 * | v1.0.0 | 初始实现：竖排工具条 + pointer 三路同步    | REQ: 20261027-board-whiteboard-draw §3.4  |
 * | v1.0.1 | 修复：选中创建工具时同步设置 creation mode，否则拖拽画不出图形 | REQ: 20261027-board-whiteboard-draw §3.5 |
 * | v1.1.0 | 矩形替换为「图形」网格面板；新增「连线」按钮与走线面板 | REQ: 20261027-board-whiteboard-draw §3.5 / §3.6 |
 * | v1.1.1 | 图形 / 连线按钮去掉右下角 caret 小三角 | REQ: 20261027-board-whiteboard-draw §3.5 / §3.6 |
 * | v1.2.0 | 新增「矢量线」按钮（单个按钮、无面板） | REQ: 20261027-board-whiteboard-draw §3.7 |
 * | v1.3.0 | 新增「图片」按钮 + 文件选择；接线粘贴覆盖与拖入监听 | REQ: 20261027-board-whiteboard-draw §3.9 |
 * | v1.3.1 | 文件选择器收紧为白名单 MIME（accept 过滤不支持格式） | REQ: 20261027-board-whiteboard-draw §3.9 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { ATTACHED_ELEMENT_CLASS_NAME, BoardTransforms, PlaitBoard } from '@plait/core';
import { PlaitPointerType } from '@plait/core';
import { BoardCreationMode, setCreationMode } from '@plait/common';
import { getArrowLinePointers, getGeometryPointers } from '@plait/draw';

import {
  ARROW_LINE_TOOLS,
  DEFAULT_ARROW_LINE_SHAPE,
  DRAW_TOOLBAR_PREFIX,
  POINTER_TOOLS,
  VECTOR_LINE_TOOL,
} from './constants';
import { DRAW_ICONS } from './icons';
import { createShapePanel } from './shape-panel';
import { createLinePanel } from './line-panel';
import {
  bindImageDrop,
  IMAGE_ACCEPT_TYPES,
  insertImageFile,
  overrideImagePaste,
} from './image-insert';
import type { DrawToolItem, DrawToolbarCallbacks, DrawToolbarController } from './types';
import type { BoardBlockState } from '../types';

export { DRAW_TOOLBAR_PREFIX } from './constants';
export type { DrawToolbarCallbacks, DrawToolbarController } from './types';

/**
 * 创建画板创建工具条控制器。
 *
 * @param callbacks 宿主回调（当前仅指针模式变更通知）
 */
export function createDrawToolbar(callbacks: DrawToolbarCallbacks = {}): DrawToolbarController {
  let board: PlaitBoard | null = null;
  let blockState: BoardBlockState = 'preview';
  /** 还原被包装的 board.onChange */
  let unsubscribe: (() => void) | null = null;
  /** 还原图片粘贴覆盖（board.insertFragment 包装） */
  let restoreImagePaste: (() => void) | null = null;
  /** 解除图片拖入监听 */
  let removeImageDrop: (() => void) | null = null;

  /**
   * 上次使用的走线类型。
   *
   * 只有连线按钮记忆上次选择（单击即用）；图形按钮刻意不记忆，每次都必须
   * 在面板中重新选一个（PRD Q18）。
   */
  let lastLineShape: string = DEFAULT_ARROW_LINE_SHAPE;

  /** pointer 值 → 按钮 DOM，用于 sync 时刷新高亮（仅指针类工具） */
  const buttons = new Map<string, HTMLButtonElement>();

  /** 指针类工具的 pointer 值集合，用于区分「选择模式」与「创建模式」 */
  const POINTER_TOOL_VALUES = new Set(POINTER_TOOLS.map((item) => item.pointer));
  /** 图形类 pointer 集合（基础 + 流程图 + UML），用于判定「图形」按钮是否高亮 */
  const GEOMETRY_POINTER_VALUES = new Set(getGeometryPointers());
  /** 连线类 pointer 集合，用于判定「连线」按钮是否高亮 */
  const ARROW_LINE_POINTER_VALUES = new Set(getArrowLinePointers());

  // --- 根容器 ---------------------------------------------------------------
  const dom = document.createElement('div');
  dom.className = `${DRAW_TOOLBAR_PREFIX} ${ATTACHED_ELEMENT_CLASS_NAME}`;
  dom.setAttribute('data-block-state', blockState);

  // --- 指针类工具组 ---------------------------------------------------------
  dom.appendChild(createGroup('pointer', POINTER_TOOLS));

  // --- 创建类工具组（图形 / 连线，各带一个弹出面板） -------------------------
  const createGroupEl = document.createElement('div');
  createGroupEl.className = `${DRAW_TOOLBAR_PREFIX}__group ${DRAW_TOOLBAR_PREFIX}__group--create`;
  dom.appendChild(createGroupEl);

  const shapePanel = createShapePanel((pointer) => activateCreation(pointer));
  const shapeButton = createPanelButton({
    modifier: 'shapes',
    title: '图形（点击选择后在画布拖拽创建）',
    icon: DRAW_ICONS.shapes,
    panelDom: shapePanel.dom,
    // 图形：单击只弹面板，不预设 pointer —— 必须在面板里选一个才进入创建态
    onClick: () => togglePanel(shapePanel),
  });
  createGroupEl.appendChild(shapeButton);

  const linePanel = createLinePanel((pointer) => {
    lastLineShape = pointer;
    activateCreation(pointer);
  });
  const lineButton = createPanelButton({
    modifier: 'arrow-line',
    title: '连线（点击即用上次走线，面板可切换）',
    icon: DRAW_ICONS.lineStraight,
    panelDom: linePanel.dom,
    // 连线：单击立即以上次走线进入创建态，同时弹出面板供可选切换
    onClick: () => {
      activateCreation(lastLineShape);
      linePanel.setActive(lastLineShape);
      openPanel(linePanel);
    },
  });
  createGroupEl.appendChild(lineButton);

  // 矢量线：单个按钮、无面板，单击即进入创建态（创建时恒为直线段，见 4.4.1）。
  // 必须注册进 buttons Map：sync() 只遍历该 Map 切换 is-active / disabled，
  // 漏注册会导致按钮点击后永远不高亮（其余按钮均经 createGroup 注册）。
  const vectorLineButton = createButton(VECTOR_LINE_TOOL);
  buttons.set(VECTOR_LINE_TOOL.pointer, vectorLineButton);
  createGroupEl.appendChild(vectorLineButton);

  // 图片：动作按钮（非 pointer 工具），点击唤起文件选择。选中后走 base64 内联
  // 插入，与「图形/连线」的 creation mode 无关，不写 board.pointer。
  const imageFileInput = document.createElement('input');
  imageFileInput.type = 'file';
  imageFileInput.accept = IMAGE_ACCEPT_TYPES;
  imageFileInput.style.display = 'none';
  createGroupEl.appendChild(imageFileInput);
  imageFileInput.addEventListener('change', () => {
    const file = imageFileInput.files?.[0];
    if (file && board) {
      void insertImageFile(board, file);
    }
    // 清空 value，允许连续选择同一文件
    imageFileInput.value = '';
  });

  const imageButton = document.createElement('button');
  imageButton.className = `${DRAW_TOOLBAR_PREFIX}__btn ${DRAW_TOOLBAR_PREFIX}__btn--image`;
  imageButton.type = 'button';
  imageButton.title = '插入图片';
  imageButton.innerHTML = DRAW_ICONS.image;
  imageButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (imageButton.disabled) return;
    imageFileInput.click();
  });
  createGroupEl.appendChild(imageButton);

  /** 创建一个工具分组（视觉上以分隔线区隔） */
  function createGroup(modifier: string, items: readonly DrawToolItem[]): HTMLElement {
    const group = document.createElement('div');
    group.className = `${DRAW_TOOLBAR_PREFIX}__group ${DRAW_TOOLBAR_PREFIX}__group--${modifier}`;
    items.forEach((item) => {
      const btn = createButton(item);
      buttons.set(item.pointer, btn);
      group.appendChild(btn);
    });
    return group;
  }

  /** 创建一个简单工具按钮（一个按钮对应一个固定 pointer） */
  function createButton(item: DrawToolItem): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `${DRAW_TOOLBAR_PREFIX}__btn ${DRAW_TOOLBAR_PREFIX}__btn--${item.modifier}`;
    btn.type = 'button';
    btn.title = item.title;
    btn.innerHTML = item.icon;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      handleSelect(item.pointer);
    });
    return btn;
  }

  /**
   * 创建一个「带弹出面板」的工具按钮。
   *
   * 面板作为按钮的子节点渲染，以继承根容器上的 `plait-board-attached`。
   * 因此按钮自身的 mousedown 必须排除来自面板内部的冒泡，否则点面板里的
   * 任意一项都会再触发一次按钮逻辑。
   */
  function createPanelButton(config: {
    modifier: string;
    title: string;
    icon: string;
    panelDom: HTMLElement;
    onClick: () => void;
  }): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `${DRAW_TOOLBAR_PREFIX}__btn ${DRAW_TOOLBAR_PREFIX}__btn--${config.modifier}`;
    btn.type = 'button';
    btn.title = config.title;

    const icon = document.createElement('span');
    icon.className = `${DRAW_TOOLBAR_PREFIX}__btn-icon`;
    icon.innerHTML = config.icon;
    btn.appendChild(icon);

    btn.appendChild(config.panelDom);

    btn.addEventListener('mousedown', (e) => {
      // 面板内部的 mousedown 已由各项自行处理并阻断，这里再做一道兜底
      if ((e.target as HTMLElement | null)?.closest(`.${DRAW_TOOLBAR_PREFIX}__panel`)) return;
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      config.onClick();
    });

    return btn;
  }

  // -------------------------------------------------------------------------
  // 交互处理
  // -------------------------------------------------------------------------

  /**
   * 选中某个工具：写 `board.pointer` + 设置创建模式。
   *
   * **两件事必须成对做**，只写 pointer 是不够的：
   * `@plait/draw` 的创建插件（`withGeometryCreateByDrawing` /
   * `withArrowLineCreateByDraw` 等）其守卫均为「pointer 属于该类」**且**
   * 「creation mode 为 drawing」。而 creation mode 存放在 `@plait/common` 的
   * `BOARD_TO_CREATION_MODE` WeakMap 中，初始为空，且 `@plait/draw` 包内
   * 没有任何写入点——必须由宿主显式设置，否则 `isDrawingMode` 恒为 false，
   * 拖拽时创建分支全部被跳过，表现为「按钮高亮正常但画不出任何东西」。
   * 参照 `@plait/mind` 的创建流程：`updatePointerType` 与 `setCreationMode`
   * 同样是成对调用的。
   *
   * 选 `drawing` 而非 `dnd`：前者尺寸随拖拽范围（PRD §3.5 验收要求），且内置
   * 「拖动距离 < 8px 时回落默认尺寸」，顺带支持单击创建；后者恒为默认尺寸。
   *
   * `updatePointerType` 只是单纯赋值（同值时内部直接 return），不产生 op、
   * 不触发 onChange，因此必须手动 `sync()` 刷新高亮。
   */
  function handleSelect(pointer: string): void {
    if (!board) return;
    BoardTransforms.updatePointerType(board, pointer);
    // 指针类工具（选择 / 手型）不是创建行为，无需设置创建模式。
    // 这里不清除残留的 drawing 模式也是安全的：守卫的第一层「pointer 属于该类」
    // 会先行拦截（selection / hand 既不是图形也不是连线）。
    if (!POINTER_TOOL_VALUES.has(pointer)) {
      setCreationMode(board, BoardCreationMode.drawing);
    }
    closeAllPanels();
    sync();
  }

  /** 进入某个元素类型的创建态（图形 / 连线共用） */
  function activateCreation(pointer: string): void {
    handleSelect(pointer);
  }

  // -------------------------------------------------------------------------
  // 面板开合
  // -------------------------------------------------------------------------

  const panels = [shapePanel, linePanel];

  function openPanel(target: (typeof panels)[number]): void {
    panels.forEach((panel) => {
      if (panel !== target) panel.close();
    });
    target.open();
    syncPanelButtonState();
  }

  function togglePanel(target: (typeof panels)[number]): void {
    if (target.isOpen) {
      target.close();
      syncPanelButtonState();
    } else {
      openPanel(target);
    }
  }

  function closeAllPanels(): void {
    panels.forEach((panel) => panel.close());
    syncPanelButtonState();
  }

  /** 面板展开时给按钮加修饰类，供 CSS 做「按下」反馈 */
  function syncPanelButtonState(): void {
    shapeButton.classList.toggle('is-panel-open', shapePanel.isOpen);
    lineButton.classList.toggle('is-panel-open', linePanel.isOpen);
  }

  // -------------------------------------------------------------------------
  // 状态同步
  // -------------------------------------------------------------------------

  /** 读取当前 pointer；board 未就绪时回落 `selection` */
  function currentPointer(): string {
    if (!board) return PlaitPointerType.selection;
    return PlaitBoard.getPointer<string>(board);
  }

  /** 按当前 `board.pointer` 刷新按钮高亮与禁用态 */
  function sync(): void {
    const pointer = currentPointer();

    buttons.forEach((btn, value) => {
      btn.disabled = !board;
      btn.classList.toggle('is-active', value === pointer);
    });

    // 「图形」「连线」是复合按钮：高亮条件为当前 pointer 落在各自的类别集合内
    const isGeometry = GEOMETRY_POINTER_VALUES.has(pointer);
    const isArrowLine = ARROW_LINE_POINTER_VALUES.has(pointer);
    shapeButton.disabled = !board;
    shapeButton.classList.toggle('is-active', isGeometry);
    lineButton.disabled = !board;
    lineButton.classList.toggle('is-active', isArrowLine);
    imageButton.disabled = !board;

    // 面板内高亮跟随：pointer 不在本类别时清空，避免创建完回落 selection 后
    // 面板里仍残留一个「选中」的格子
    shapePanel.setActive(isGeometry ? pointer : null);
    linePanel.setActive(isArrowLine ? pointer : lastLineShape);

    // 连线按钮图标跟随当前走线类型（PRD Q19）
    updateLineButtonIcon(isArrowLine ? pointer : lastLineShape);

    callbacks.onPointerChange?.(pointer);
  }

  /** 把连线按钮的图标换成指定走线的图标 */
  function updateLineButtonIcon(shape: string): void {
    const tool = ARROW_LINE_TOOLS.find((item) => item.pointer === shape);
    if (!tool) return;
    const icon = lineButton.querySelector(`.${DRAW_TOOLBAR_PREFIX}__btn-icon`);
    if (icon) icon.innerHTML = tool.icon;
  }

  /** 切换块状态：预览态由 CSS 隐藏整条工具条 */
  function setBlockState(state: BoardBlockState): void {
    if (blockState === state) return;
    blockState = state;
    dom.setAttribute('data-block-state', state);
    // 退出编辑态时工具条被 CSS 隐藏，残留展开的面板会在下次进入时「幽灵显示」
    if (state !== 'editing') {
      closeAllPanels();
    }
    sync();
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  /**
   * 包装 `board.onChange` 以监听 pointer 的自动回落。
   *
   * 必须链式包装（保存并调用原函数）而非覆盖：canvas-toolbar 与 style-toolbar
   * 也包装了同一个钩子，直接覆盖会使它们失效。
   */
  function subscribe(target: PlaitBoard): () => void {
    const original = target.onChange;
    target.onChange = () => {
      original();
      sync();
    };
    return () => {
      target.onChange = original;
    };
  }

  function attach(next: PlaitBoard): void {
    if (board === next) {
      sync();
      return;
    }
    detach();
    board = next;
    shapePanel.setBoard(next);
    linePanel.setBoard(next);
    unsubscribe = subscribe(next);
    // 图片粘贴覆盖：board 创建完成后套在最外层，绕过内置 blob URL 粘贴路径
    restoreImagePaste = overrideImagePaste(next);
    // 图片拖入：在画布容器上监听 drop（@plait 的默认 drop 为空实现）
    removeImageDrop = bindImageDrop(PlaitBoard.getBoardContainer(next), () => board);
    sync();
  }

  function detach(): void {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    if (restoreImagePaste) {
      restoreImagePaste();
      restoreImagePaste = null;
    }
    if (removeImageDrop) {
      removeImageDrop();
      removeImageDrop = null;
    }
    board = null;
    shapePanel.setBoard(null);
    linePanel.setBoard(null);
    closeAllPanels();
    // board 置空后立即刷新，使所有按钮进入禁用态
    sync();
  }

  function destroy(): void {
    detach();
    shapePanel.destroy();
    linePanel.destroy();
    buttons.clear();
    dom.remove();
  }

  // 初始同步：board 未就绪时全部按钮禁用
  sync();

  return { dom, attach, detach, setBlockState, sync, destroy };
}

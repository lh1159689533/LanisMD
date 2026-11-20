/**
 * 块手柄 DOM 构建
 *
 * 手柄从左到右依次是：六点拖拽按钮、加号按钮。
 *
 * @changelog
 * | 版本   | 变更说明                             | 关联                                               |
 * | v1.0.0 | 初始实现：拖拽按钮                   | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * | v1.1.0 | 新增：加号按钮并调整提示文案         | REQ: 20261120-block-handle-menu TECH: 块手柄操作菜单 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { ADD_ICON, DRAG_ICON } from './icons';

export interface BlockHandleElements {
  wrapper: HTMLElement;
  addBtn: HTMLButtonElement;
  dragBtn: HTMLButtonElement;
}

/**
 * 创建手柄 DOM。
 *
 * 拖拽按钮刻意不设置 draggable、不注册 dragstart/dragend，也不在 mousedown
 * 上调用 stopPropagation：Milkdown BlockProvider 把 dragstart/dragend 挂在
 * 根元素（.milkdown-block-handle）上，并在 mousedown 时建立 NodeSelection。
 * 子元素若吞掉事件，drop 时 view.dragging 为空、dataTransfer 无有效 slice，
 * 节点就不会移动。点击事件与拖拽由浏览器天然区分（拖拽不产生 click）。
 */
export function createBlockHandle(): BlockHandleElements {
  const wrapper = document.createElement('div');
  wrapper.className = 'milkdown-block-handle';

  const dragBtn = document.createElement('button');
  dragBtn.className = 'milkdown-block-btn milkdown-block-drag';
  dragBtn.innerHTML = DRAG_ICON;
  dragBtn.type = 'button';
  dragBtn.setAttribute('aria-label', '块操作与拖拽');
  dragBtn.setAttribute('data-tooltip', '点击打开菜单，拖拽移动块');

  const addBtn = document.createElement('button');
  addBtn.className = 'milkdown-block-btn milkdown-block-add';
  addBtn.innerHTML = ADD_ICON;
  addBtn.type = 'button';
  addBtn.setAttribute('aria-label', '插入块');
  addBtn.setAttribute('data-tooltip', '点击选择要在下方插入的块');

  wrapper.appendChild(dragBtn);
  wrapper.appendChild(addBtn);

  return { wrapper, addBtn, dragBtn };
}

/**
 * Board Image Render - `board.renderImage` 宿主实现
 *
 * 背景（为什么需要本模块）：`@plait-board/react-board` 创建 board 时会应用
 * `@plait/common` 的 `withImage`，该插件把 `board.renderImage` 预设为
 * 「直接 throw」的占位实现，要求宿主自行提供渲染逻辑；react-board 只实现了
 * `renderText`，没有实现 `renderImage`。若不补上，`@plait/draw` 的
 * `ImageComponent` 初始化（`ImageGenerator.processDrawing`）会在这里抛出
 * 「No implementation for renderImage method.」，而 `@plait/core` 的
 * `list-render` 会吞掉组件初始化异常（仅 localStorage `debug:plait=true`
 * 时打印），最终表现为：图片元素已写入 `board.children`（数据正常、可持久化），
 * 但画布上不渲染且控制台无任何报错。
 *
 * 实现约定：用原生 DOM `<img>` 渲染进 `ImageGenerator` 创建的 `foreignObject`
 * 容器，尺寸由外层容器统一控制（`foreignObject` 的几何由 Plait 管理，img 只需
 * 撑满 100%），因此 `update` 仅需处理 url 变化。
 *
 * 参考 `@plait/common` 的调用契约（`ImageProps` / `ImageComponentRef`）：
 * - `renderImage(container, props)` 需返回 `{ update, destroy }`
 * - `update(props)` 在元素属性变化时被调用（`ImageGenerator.updateImage`）
 * - `destroy()` 在元素销毁时被调用（`ImageGenerator.destroy`）
 *
 * @changelog
 * | 版本   | 变更说明                                | 关联                                      |
 * | v1.0.0 | 实现 board.renderImage，修复图片静默不渲染 | REQ: 20261027-board-whiteboard-draw §3.9 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitBoard } from '@plait/core';
import type { ImageComponentRef, ImageProps, PlaitImageBoard } from '@plait/common';

/**
 * 实现图片渲染的 board 插件。
 *
 * 必须在 `@plait-board/react-board` 内置的 `withImage` 之后执行（Wrapper 的
 * 用户插件链位于其基础插件链之后，天然满足），否则会被占位实现覆盖回去。
 */
export function withImageRender(board: PlaitBoard): PlaitBoard {
  // renderImage 声明在 @plait/common 的 PlaitImageBoard 接口上（由内置 withImage
  // 预置的 throw 占位保证运行时存在），PlaitPlugin 的签名只认 PlaitBoard，此处收窄。
  const imageBoard = board as PlaitBoard & PlaitImageBoard;
  imageBoard.renderImage = (container: Element | DocumentFragment, props: ImageProps): ImageComponentRef => {
    const img = document.createElement('img');
    img.src = props.imageItem.url;
    // 禁止浏览器原生拖拽（会与 Plait 的选中/移动交互冲突并产生拖影）
    img.draggable = false;
    // 撑满 foreignObject：位置与尺寸由 ImageGenerator 统一管理
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.display = 'block';
    img.style.userSelect = 'none';
    container.appendChild(img);

    return {
      update: (next: Partial<ImageProps>) => {
        const url = next.imageItem?.url;
        if (url && url !== img.getAttribute('src')) {
          img.src = url;
        }
      },
      destroy: () => {
        img.remove();
      },
    };
  };
  return board;
}

/**
 * Image Preview - 预览层
 *
 * 全屏遮罩形式的图片查看器（原生 DOM 实现，与其余图片插件保持一致）：
 * - 打开：从编辑器内原图位置放大展开（FLIP），关闭时收回原位
 * - 缩放：滚轮 / 触控板捏合以光标为锚点；按钮与 + - 0 1 快捷键
 * - 平移：按住拖拽；双击图片在「适应窗口」与「原始尺寸」之间切换
 * - 切换：左右方向键或两侧箭头在正文图片之间切换
 * - 关闭：Esc、点击空白处、关闭按钮
 *
 * 同一时间只允许存在一个预览层，再次打开会先销毁旧实例。
 *
 * @changelog
 * | 版本   | 变更说明                                 | 关联                                   |
 * | v1.0.0 | 初始实现：遮罩层、缩放平移旋转、多图切换、FLIP 动画 | REQ: 20261113-image-preview TECH: 图片预览方案 §一~§四 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { previewIcons } from './icons';
import { ZOOM_STEP, createFitTransform, isSameScale, toCssTransform, zoomAt } from './transform';
import type { Point, PreviewItem, ViewTransform } from './types';

/** 样式类名前缀 */
const CLS = 'lanismd-image-preview';

/** 展开 / 收起 / 按钮缩放的动画时长，需与 CSS 中的过渡时长保持一致 */
const ANIMATION_MS = 220;

/** 拖拽判定阈值：位移小于该值视为点击 */
const DRAG_THRESHOLD = 4;

/** 「适应窗口」状态下双击放大的倍率（图片本身小于窗口时使用） */
const SMALL_IMAGE_DOUBLE_CLICK_SCALE = 2;

/** 滚轮缩放灵敏度：普通滚轮 / 触控板捏合（ctrlKey=true） */
const WHEEL_SENSITIVITY = 0.0015;
const PINCH_SENSITIVITY = 0.01;

/** 行模式滚轮（deltaMode=1）每行折算的像素 */
const WHEEL_LINE_HEIGHT = 16;

/** 拖拽过程中的临时状态 */
interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
  onImage: boolean;
}

/** 打开预览的参数 */
export interface ImagePreviewOptions {
  items: PreviewItem[];
  index: number;
}

let activeViewer: ImagePreviewViewer | null = null;

/**
 * 打开图片预览；已有预览层时先立即销毁
 */
export function showImagePreview(options: ImagePreviewOptions): void {
  if (options.items.length === 0) return;
  activeViewer?.destroy();
  activeViewer = new ImagePreviewViewer(options);
  activeViewer.open();
}

/**
 * 立即销毁当前预览层（无动画），用于编辑器销毁等场景
 */
export function destroyImagePreview(): void {
  activeViewer?.destroy();
}

/**
 * 当前是否存在预览层
 */
export function isImagePreviewOpen(): boolean {
  return activeViewer !== null;
}

// ---------------------------------------------------------------------------
// DOM 工具
// ---------------------------------------------------------------------------

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  return el;
}

function createIconButton(icon: string, title: string, extraClass: string): HTMLButtonElement {
  const btn = createElement('button', `${CLS}-btn ${extraClass}`);
  btn.type = 'button';
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = icon;
  return btn;
}

function isRectInViewport(rect: DOMRect): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

// ---------------------------------------------------------------------------
// 预览层
// ---------------------------------------------------------------------------

class ImagePreviewViewer {
  private readonly items: PreviewItem[];
  private readonly initialIndex: number;
  private index: number;

  private readonly root: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly img: HTMLImageElement;
  private readonly nameEl: HTMLSpanElement;
  private readonly metaEl: HTMLSpanElement;
  private readonly counterEl: HTMLSpanElement;
  private readonly zoomLabel: HTMLButtonElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;

  private transform: ViewTransform = { scale: 1, x: 0, y: 0, rotation: 0 };
  /** 是否处于「适应窗口」状态：窗口尺寸变化时据此决定是否重新适应 */
  private fitMode = true;
  private drag: DragState | null = null;
  private closing = false;
  private destroyed = false;
  private animationTimer: number | null = null;
  private readonly previousFocus: Element | null;

  constructor(options: ImagePreviewOptions) {
    this.items = options.items;
    this.index = Math.min(Math.max(options.index, 0), options.items.length - 1);
    this.initialIndex = this.index;
    this.previousFocus = document.activeElement;

    this.root = createElement('div', CLS);
    this.root.tabIndex = -1;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', '图片预览');

    this.stage = createElement('div', `${CLS}-stage`);
    this.img = createElement('img', `${CLS}-img`);
    this.img.draggable = false;
    this.img.alt = '';
    this.stage.appendChild(this.img);

    this.nameEl = createElement('span', `${CLS}-name`);
    this.metaEl = createElement('span', `${CLS}-meta`);
    this.counterEl = createElement('span', `${CLS}-counter`);
    this.zoomLabel = createElement('button', `${CLS}-btn ${CLS}-zoom-label`);
    this.zoomLabel.type = 'button';
    this.zoomLabel.title = '切换适应窗口 / 原始尺寸';
    this.prevBtn = createIconButton(previewIcons.prev, '上一张（←）', `${CLS}-nav ${CLS}-nav-prev`);
    this.nextBtn = createIconButton(previewIcons.next, '下一张（→）', `${CLS}-nav ${CLS}-nav-next`);

    this.buildLayout();
  }

  // -------------------------------------------------------------------------
  // 生命周期
  // -------------------------------------------------------------------------

  open(): void {
    document.body.appendChild(this.root);
    this.bindEvents();
    this.root.focus({ preventScroll: true });
    this.renderItem();
    this.playOpenAnimation();
    this.preloadNeighbors();
  }

  /**
   * 带动画关闭：原图仍在可视区内则收回原位，否则淡出
   */
  close(): void {
    if (this.closing || this.destroyed) return;
    this.closing = true;

    const target = this.resolveCloseTarget();
    this.root.classList.remove('is-open');
    if (target) {
      this.applyTransform(target, true);
    } else {
      this.root.classList.add('is-leaving');
    }
    window.setTimeout(() => this.destroy(), ANIMATION_MS);
  }

  /**
   * 立即销毁：解绑事件、移除 DOM、归还焦点
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unbindEvents();
    if (this.animationTimer !== null) window.clearTimeout(this.animationTimer);
    this.root.remove();
    if (activeViewer === this) activeViewer = null;

    if (this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected) {
      this.previousFocus.focus({ preventScroll: true });
    }
  }

  // -------------------------------------------------------------------------
  // 布局
  // -------------------------------------------------------------------------

  private buildLayout(): void {
    const backdrop = createElement('div', `${CLS}-backdrop`);

    const header = createElement('div', `${CLS}-header`);
    const title = createElement('div', `${CLS}-title`);
    title.append(this.nameEl, this.metaEl);
    const headerRight = createElement('div', `${CLS}-header-right`);
    const closeBtn = createIconButton(previewIcons.close, '关闭（Esc）', `${CLS}-close`);
    closeBtn.addEventListener('click', () => this.close());
    headerRight.append(this.counterEl, closeBtn);
    header.append(title, headerRight);

    this.prevBtn.addEventListener('click', () => this.go(-1));
    this.nextBtn.addEventListener('click', () => this.go(1));

    this.root.append(backdrop, this.stage, header, this.prevBtn, this.nextBtn, this.buildToolbar());

    const single = this.items.length <= 1;
    this.prevBtn.hidden = single;
    this.nextBtn.hidden = single;
    this.counterEl.hidden = single;
  }

  private buildToolbar(): HTMLDivElement {
    const toolbar = createElement('div', `${CLS}-toolbar`);
    const separator = () => createElement('span', `${CLS}-separator`);

    const zoomOut = createIconButton(previewIcons.zoomOut, '缩小（-）', '');
    const zoomIn = createIconButton(previewIcons.zoomIn, '放大（+）', '');
    const actual = createIconButton(previewIcons.actualSize, '原始尺寸（1）', '');
    const fit = createIconButton(previewIcons.fit, '适应窗口（0）', '');
    const rotate = createIconButton(previewIcons.rotate, '顺时针旋转（R）', '');

    zoomOut.addEventListener('click', () => this.zoomBy(1 / ZOOM_STEP));
    zoomIn.addEventListener('click', () => this.zoomBy(ZOOM_STEP));
    this.zoomLabel.addEventListener('click', () => this.toggleFitAndActual());
    actual.addEventListener('click', () => this.setActualSize());
    fit.addEventListener('click', () => this.fitToStage(true));
    rotate.addEventListener('click', () => this.rotate());

    toolbar.append(zoomOut, this.zoomLabel, zoomIn, separator(), actual, fit, rotate);
    return toolbar;
  }

  // -------------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------------

  private get current(): PreviewItem {
    return this.items[this.index];
  }

  /**
   * 渲染当前图片：更新地址、尺寸与头部信息，并重置为适应窗口
   */
  private renderItem(): void {
    const item = this.current;
    this.img.src = item.src;
    this.img.style.width = `${item.natural.width}px`;
    this.img.style.height = `${item.natural.height}px`;

    this.nameEl.textContent = item.name;
    this.nameEl.title = item.name;
    this.metaEl.textContent = `${Math.round(item.natural.width)} × ${Math.round(item.natural.height)}`;
    this.counterEl.textContent = `${this.index + 1} / ${this.items.length}`;
    this.prevBtn.disabled = this.index === 0;
    this.nextBtn.disabled = this.index === this.items.length - 1;

    this.fitToStage(false, 0);
  }

  private applyTransform(next: ViewTransform, animate: boolean): void {
    this.transform = next;
    this.setAnimating(animate);
    this.img.style.transform = toCssTransform(next);
    this.zoomLabel.textContent = `${Math.round(next.scale * 100)}%`;
  }

  /**
   * 切换过渡开关：开启后在动画时长结束时自动关闭，避免拖拽 / 滚轮时出现延迟感
   */
  private setAnimating(animate: boolean): void {
    if (this.animationTimer !== null) {
      window.clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    this.root.classList.toggle('is-animating', animate);
    if (animate) {
      this.animationTimer = window.setTimeout(() => {
        this.root.classList.remove('is-animating');
        this.animationTimer = null;
      }, ANIMATION_MS);
    }
  }

  // -------------------------------------------------------------------------
  // FLIP 动画
  // -------------------------------------------------------------------------

  private getStageCenter(): Point {
    const rect = this.stage.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /**
   * 将编辑器内原图的屏幕矩形换算为预览图变换，用于展开起点 / 收起终点
   */
  private rectToTransform(rect: DOMRect, rotation: number): ViewTransform {
    const center = this.getStageCenter();
    return {
      scale: rect.width / this.current.natural.width,
      x: rect.left + rect.width / 2 - center.x,
      y: rect.top + rect.height / 2 - center.y,
      rotation,
    };
  }

  private playOpenAnimation(): void {
    const fitTransform = this.transform;
    const sourceRect = this.current.source.getBoundingClientRect();

    if (isRectInViewport(sourceRect)) {
      this.applyTransform(this.rectToTransform(sourceRect, 0), false);
    } else {
      this.root.classList.add('is-leaving');
    }
    // 强制回流，确保起始状态生效后再启动过渡
    void this.root.offsetWidth;

    this.root.classList.remove('is-leaving');
    this.root.classList.add('is-open');
    this.applyTransform(fitTransform, true);
  }

  /**
   * 计算收起动画终点；切换过图片时先把对应原图滚动到可视区，
   * 让用户关闭后停留在刚刚浏览的位置
   */
  private resolveCloseTarget(): ViewTransform | null {
    const source = this.current.source;
    if (!source.isConnected) return null;

    if (this.index !== this.initialIndex && !isRectInViewport(source.getBoundingClientRect())) {
      source.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    const rect = source.getBoundingClientRect();
    if (!isRectInViewport(rect)) return null;

    // 旋转角收回到最近的整圈，避免多转一圈
    const rotation = Math.round(this.transform.rotation / 360) * 360;
    return this.rectToTransform(rect, rotation);
  }

  // -------------------------------------------------------------------------
  // 视图操作
  // -------------------------------------------------------------------------

  private fitToStage(animate: boolean, rotation = this.transform.rotation): void {
    const rect = this.stage.getBoundingClientRect();
    const viewport = { width: rect.width, height: rect.height };
    this.fitMode = true;
    this.applyTransform(createFitTransform(this.current.natural, rotation, viewport), animate);
  }

  private zoomBy(factor: number, anchor?: Point, animate = true): void {
    this.fitMode = false;
    this.applyTransform(zoomAt(this.transform, this.transform.scale * factor, anchor), animate);
  }

  private setActualSize(): void {
    this.fitMode = false;
    this.applyTransform({ ...this.transform, scale: 1, x: 0, y: 0 }, true);
  }

  /**
   * 适应窗口 <-> 原始尺寸 切换；图片本身小于窗口时改为放大到 2 倍
   */
  private toggleFitAndActual(anchor?: Point): void {
    if (!this.fitMode) {
      this.fitToStage(true);
      return;
    }
    const fitScale = this.transform.scale;
    const target = isSameScale(fitScale, 1) ? SMALL_IMAGE_DOUBLE_CLICK_SCALE : 1;
    this.fitMode = false;
    this.applyTransform(zoomAt(this.transform, target, anchor), true);
  }

  private rotate(): void {
    const rotation = this.transform.rotation + 90;
    if (this.fitMode) {
      this.fitToStage(true, rotation);
    } else {
      this.applyTransform({ ...this.transform, rotation }, true);
    }
  }

  private go(delta: number): void {
    const next = this.index + delta;
    if (next < 0 || next >= this.items.length || next === this.index) return;
    this.index = next;
    this.root.classList.add('is-switching');
    this.renderItem();
    this.preloadNeighbors();

    const reveal = () => {
      if (!this.destroyed) this.root.classList.remove('is-switching');
    };
    this.img.decode().then(reveal, reveal);
  }

  private preloadNeighbors(): void {
    [this.index - 1, this.index + 1].forEach((i) => {
      const item = this.items[i];
      if (item) new Image().src = item.src;
    });
  }

  // -------------------------------------------------------------------------
  // 事件
  // -------------------------------------------------------------------------

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('resize', this.onResize);
    this.root.addEventListener('wheel', this.onWheel, { passive: false });
    this.root.addEventListener('pointerdown', this.onPointerDown);
    this.root.addEventListener('pointermove', this.onPointerMove);
    this.root.addEventListener('pointerup', this.onPointerUp);
    this.root.addEventListener('pointercancel', this.onPointerCancel);
    this.img.addEventListener('dblclick', this.onImageDoubleClick);
    this.root.addEventListener('contextmenu', this.onContextMenu);
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('resize', this.onResize);
    this.root.removeEventListener('wheel', this.onWheel);
    this.root.removeEventListener('pointerdown', this.onPointerDown);
    this.root.removeEventListener('pointermove', this.onPointerMove);
    this.root.removeEventListener('pointerup', this.onPointerUp);
    this.root.removeEventListener('pointercancel', this.onPointerCancel);
    this.img.removeEventListener('dblclick', this.onImageDoubleClick);
    this.root.removeEventListener('contextmenu', this.onContextMenu);
  }

  /** 事件坐标转换为相对舞台中心的锚点 */
  private toAnchor(event: MouseEvent): Point {
    const center = this.getStageCenter();
    return { x: event.clientX - center.x, y: event.clientY - center.y };
  }

  /**
   * 键盘处理（window 捕获阶段）：
   * 预览层打开期间屏蔽编辑器与全局单键快捷键，避免误触；
   * 带 Cmd/Ctrl 的组合键除缩放外全部放行（如 Cmd+S 保存）。
   */
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.closing) return;
    const handled = this.handleShortcut(e);
    const withModifier = e.metaKey || e.ctrlKey || e.altKey;
    if (handled || !withModifier) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  private handleShortcut(e: KeyboardEvent): boolean {
    const withModifier = e.metaKey || e.ctrlKey || e.altKey;
    switch (e.key) {
      case '+':
      case '=':
        this.zoomBy(ZOOM_STEP);
        return true;
      case '-':
      case '_':
        this.zoomBy(1 / ZOOM_STEP);
        return true;
      case '0':
        this.fitToStage(true);
        return true;
    }
    if (withModifier) return false;

    switch (e.key) {
      case 'Escape':
        this.close();
        return true;
      case 'ArrowLeft':
        this.go(-1);
        return true;
      case 'ArrowRight':
        this.go(1);
        return true;
      case '1':
        this.setActualSize();
        return true;
      case 'r':
      case 'R':
        this.rotate();
        return true;
      default:
        return false;
    }
  }

  private readonly onResize = (): void => {
    if (this.fitMode && !this.closing) this.fitToStage(false);
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.closing) return;
    const deltaY = e.deltaMode === 1 ? e.deltaY * WHEEL_LINE_HEIGHT : e.deltaY;
    const sensitivity = e.ctrlKey ? PINCH_SENSITIVITY : WHEEL_SENSITIVITY;
    this.zoomBy(Math.exp(-deltaY * sensitivity), this.toAnchor(e), false);
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || this.closing) return;
    const target = e.target as HTMLElement;
    // 头部、工具栏、切换按钮上的操作不参与拖拽 / 点击关闭
    if (target.closest(`.${CLS}-header, .${CLS}-toolbar, .${CLS}-nav`)) return;

    e.preventDefault();
    this.drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: this.transform.x,
      originY: this.transform.y,
      moved: false,
      onImage: target === this.img,
    };
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      // 确认是拖拽后再捕获指针，保证纯点击 / 双击的事件目标不受影响
      drag.moved = true;
      this.root.setPointerCapture(e.pointerId);
      this.root.classList.add('is-dragging');
    }
    this.fitMode = false;
    this.applyTransform({ ...this.transform, x: drag.originX + dx, y: drag.originY + dy }, false);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    this.endDrag(e.pointerId);
    // 未发生拖拽且点在图片以外的空白处：关闭
    if (!drag.moved && !drag.onImage) this.close();
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (this.drag?.pointerId === e.pointerId) this.endDrag(e.pointerId);
  };

  private endDrag(pointerId: number): void {
    this.drag = null;
    this.root.classList.remove('is-dragging');
    if (this.root.hasPointerCapture(pointerId)) this.root.releasePointerCapture(pointerId);
  }

  private readonly onImageDoubleClick = (e: MouseEvent): void => {
    e.preventDefault();
    if (!this.closing) this.toggleFitAndActual(this.toAnchor(e));
  };

  /** 预览层内不弹出系统右键菜单 */
  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };
}

/**
 * Board Draw Toolbar - 图片插入
 *
 * 白板块的图片插入能力，三条入口（工具条按钮 / 剪贴板粘贴 / 文件拖入）共用：
 * - `insertImageFile`：校验 → 压缩 → base64 内联 → 插入 PlaitImage → 累计体积检查
 * - `overrideImagePaste`：包装 `board.insertFragment`，把粘贴图片从 Plait 默认的
 *   blob URL（会话结束后失效，不可持久化）替换为 base64 内联
 * - `bindImageDrop`：在画布容器上监听文件拖入
 *
 * 与 Plait 内置 `buildImage` 的关键差异：内置实现用 `URL.createObjectURL` 生成
 * blob URL，仅会话内有效；PRD §3.9 要求图片以 base64 data URL 内联进
 * `PlaitImage.url`，随 `BoardPayload` 一并持久化，故三条入口都必须绕过内置的
 * 上传 / 粘贴逻辑，统一走本模块。
 *
 * 体积防护（PRD §3.9，阈值已拍板）：
 * - 单图原始体积 ≤ 500KB，超限直接拒绝并提示（不做二次压缩尝试）
 * - 插入前按最长边 1920px 等比压缩，统一转 WebP（质量 0.8）降低 base64 膨胀
 * - 单画板内图片累计体积 > 5MB 时给出警示
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                                      |
 * | v1.0.0 | 初始实现：图片校验/压缩/内联/累计 + 粘贴包装 + 拖入监听 | REQ: 20261027-board-whiteboard-draw §3.9 |
 * | v1.1.0 | 无鼠标锚点时按视口正中心插入 + 导出文件选择器 accept 常量 | REQ: 20261027-board-whiteboard-draw §3.9 |
 * | v1.2.0 | 修复视口居中：改用 origination 算法（toViewBoxPoint 与滚动脱节致错位）；accept 改扩展名 | REQ: 20261027-board-whiteboard-draw §3.9 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { PlaitBoard, getViewportOrigination } from '@plait/core';
import type { PlaitElement, Point } from '@plait/core';
import { DrawTransforms, PlaitDrawElement } from '@plait/draw';

import { useUIStore } from '@/stores/ui-store';

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 单图原始体积上限（500KB），超限直接拒绝 */
const MAX_IMAGE_FILE_BYTES = 500 * 1024;
/** 插入前压缩的最长边阈值（px） */
const MAX_IMAGE_EDGE_PX = 1920;
/** 单画板内图片累计体积阈值（5MB），超限警示 */
const MAX_TOTAL_IMAGE_BYTES = 5 * 1024 * 1024;
/** WebP 压缩质量（0~1） */
const WEBP_QUALITY = 0.8;
/** 图片插入后的显示宽度上限（与 @plait/draw 的 DEFAULT_IMAGE_WIDTH 对齐） */
const DISPLAY_MAX_WIDTH = 1000;

/**
 * 支持的光栅图片 MIME 白名单。
 *
 * 刻意排除 SVG：SVG 转 canvas 压缩存在 taint 风险，且 PRD 关注的「截图 / 照片」
 * 均为光栅格式。`file.type` 由浏览器按内容嗅探得出，不信任扩展名。
 */
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

/**
 * 文件选择器 `accept` 值（与 {@link SUPPORTED_IMAGE_TYPES} 白名单保持一致）。
 *
 * 刻意用扩展名而非 MIME：Tauri 的 WKWebView 对 MIME 列表的置灰过滤支持不完整，
 * 而扩展名在 macOS 系统文件面板（NSOpenPanel）里能稳定映射并置灰不匹配文件。
 *
 * 仅收紧选择器层过滤：用户仍可在「所有文件」里强选不支持的格式，此时继续走
 * `isSupportedImageFile` 的静默忽略，不做二次提示。
 */
export const IMAGE_ACCEPT_TYPES = '.png,.jpg,.jpeg,.webp,.gif,.bmp';

/** `DrawTransforms.insertImage` 期望的图片项结构（对齐 @plait/common 的 CommonImageItem） */
export interface ImageInsertItem {
  url: string;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 判断文件是否为支持的光栅图片（按真实 MIME，不信任扩展名） */
function isSupportedImageFile(file: File): boolean {
  const type = file.type?.toLowerCase() ?? '';
  return SUPPORTED_IMAGE_TYPES.has(type);
}

/** 把字节数格式化为可读文本（用于提示文案） */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

/** 用 FileReader 读文件为 data URL */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

/** 加载图片元素（等待解码完成） */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片解码失败'));
    img.src = src;
  });
}

/** 把 canvas 转为 WebP data URL；环境不支持 WebP 编码时降级 JPEG */
function toWebpDataURL(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * 统计元素树中所有图片的累计内联体积（data URL 字符串长度近似字节数）。
 *
 * 图片以 base64 data URL 存于 `PlaitImage.url`，其字符长度即最终进 ` ```plait `
 * 围栏（`base64(JSON)`）前的近似存储开销，直接求和即可作为体积阈值比较基准。
 */
export function getImageAccumulatedBytes(elements: PlaitElement[]): number {
  let total = 0;
  elements.forEach((element) => {
    if (PlaitDrawElement.isImage(element)) {
      total += (element as { url: string }).url.length;
    }
  });
  return total;
}

// ---------------------------------------------------------------------------
// 压缩与插入
// ---------------------------------------------------------------------------

/**
 * 将图片文件压缩为内联 WebP 图片项。
 *
 * 尺寸换算分两层：
 * - **像素层**：最长边超过 1920px 时等比缩到 1920，再转 WebP（降低 base64 膨胀）
 * - **显示层**：显示宽度超过 1000 时等比缩到 1000，作为 `points` 的几何尺寸，
 *   避免大图以原始像素尺寸铺满甚至超出画布（与 Plait 内置 `buildImage` 对齐）
 */
async function compressToImageItem(file: File): Promise<ImageInsertItem> {
  const source = await readFileAsDataURL(file);
  const img = await loadImage(source);

  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    throw new Error('图片尺寸无效');
  }

  // 像素层压缩：按最长边等比缩放
  const maxEdge = Math.max(naturalWidth, naturalHeight);
  const pixelScale = maxEdge > MAX_IMAGE_EDGE_PX ? MAX_IMAGE_EDGE_PX / maxEdge : 1;
  const compressedWidth = Math.max(1, Math.round(naturalWidth * pixelScale));
  const compressedHeight = Math.max(1, Math.round(naturalHeight * pixelScale));

  const canvas = document.createElement('canvas');
  canvas.width = compressedWidth;
  canvas.height = compressedHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前环境不支持 canvas');
  // 透明通道保留：WebP 支持 alpha，PNG 截图等透明图不会变黑底
  ctx.drawImage(img, 0, 0, compressedWidth, compressedHeight);
  const url = toWebpDataURL(canvas, WEBP_QUALITY);

  // 显示层缩放：限制显示宽度，等比得到高度
  const displayScale =
    compressedWidth > DISPLAY_MAX_WIDTH ? DISPLAY_MAX_WIDTH / compressedWidth : 1;
  const width = Math.max(1, Math.round(compressedWidth * displayScale));
  const height = Math.max(1, Math.round(compressedHeight * displayScale));

  return { url, width, height };
}

/**
 * 计算「图片中心落在当前视口正中心」的左上角锚点（board 坐标）。
 *
 * 不用 `DrawTransforms.insertImage` 内置的缺省居中：其实现把画布容器的
 * `clientWidth/2` 误当作窗口坐标再套 `toHostPoint` 减去 host 的页面偏移，
 * 视口中心会被算错，图片落到可视区域之外。
 *
 * 也不能用 `toViewBoxPoint` 换算容器中心：它的基准是 svg viewBox **属性**的
 * x/y（内容边界，随内容增长），而视口的实际位置由 `viewport.origination`
 * 加上 viewport-container 的滚动共同决定，两者脱节（诊断日志实锤：偏差恰好
 * 等于滚动偏移）。这里采用与 `@plait/core` 官方 `updateZoom` 一致的算法：
 * `视口中心 = origination + 容器尺寸/2/zoom`，再回退半个图片尺寸。
 *
 * @param board     目标画板实例
 * @param imageItem 待插入图片项（用于按尺寸回退左上角）
 */
function getViewportCenterStartPoint(board: PlaitBoard, imageItem: ImageInsertItem): Point {
  const zoom = board.viewport.zoom;
  // board 初始化后 origination 必有值（initializeViewportOffset 保证），兜底仅满足类型
  const origination: Point = getViewportOrigination(board) ?? [0, 0];
  const container = PlaitBoard.getBoardContainer(board);
  const center: Point = [
    origination[0] + container.clientWidth / 2 / zoom,
    origination[1] + container.clientHeight / 2 / zoom,
  ];
  return [center[0] - imageItem.width / 2, center[1] - imageItem.height / 2];
}

/**
 * 校验并插入一张图片文件。
 *
 * 流程：MIME 校验 → 体积上限校验 → 压缩为 WebP base64 → 插入 → 累计体积检查。
 * 所有提示（超限拒绝 / 累计警示 / 处理失败）都在此内置，调用方无需额外处理。
 *
 * @param board      目标画板实例
 * @param file       待插入的图片文件
 * @param startPoint 插入锚点（viewBox 坐标）；缺省时居中于当前视口正中心
 */
export async function insertImageFile(
  board: PlaitBoard,
  file: File,
  startPoint?: Point,
): Promise<void> {
  // 非图片文件：静默忽略（PRD 验收「非图片文件拖入时不插入、不报错」）
  if (!isSupportedImageFile(file)) return;

  // 体积上限：超限直接拒绝，不做二次压缩尝试
  if (file.size > MAX_IMAGE_FILE_BYTES) {
    useUIStore.getState().addToast({
      type: 'warning',
      message: `图片体积 ${formatBytes(file.size)} 超过 500KB 上限，已拒绝插入`,
    });
    return;
  }

  let imageItem: ImageInsertItem;
  try {
    imageItem = await compressToImageItem(file);
  } catch {
    useUIStore.getState().addToast({
      type: 'warning',
      message: '图片处理失败，请重试',
    });
    return;
  }

  DrawTransforms.insertImage(board, imageItem, startPoint ?? getViewportCenterStartPoint(board, imageItem));

  // 累计体积警示：插入后统计全画板图片总体积
  const totalBytes = getImageAccumulatedBytes(board.children);
  if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
    useUIStore.getState().addToast({
      type: 'warning',
      message:
        `画板内图片累计体积已达 ${formatBytes(totalBytes)}，超过 5MB 阈值。` +
        '图片以 base64 内联会再膨胀约 1.78 倍，建议压缩或减少图片。',
    });
  }
}

// ---------------------------------------------------------------------------
// 粘贴包装
// ---------------------------------------------------------------------------

/**
 * 覆盖 `board.insertFragment` 中的图片粘贴路径。
 *
 * `@plait/draw` 的 `withDrawFragment` 在收到 `clipboardData.files` 时会用内置
 * `buildImage` 生成 blob URL 插入图片，该 URL 会话结束后失效。这里在插件链
 * 之外再包一层：检测到图片文件时改走 `insertImageFile`（base64 内联），否则
 * 原样转交原 `insertFragment`，保证图形 / 连线 / 文本粘贴不受影响。
 *
 * 调用时机必须在 board 创建完成之后（`onBoardReady`），此时 `board.insertFragment`
 * 已是插件链的最终版本，本包装套在最外层、逻辑最先执行。
 *
 * @returns 还原函数（恢复原 insertFragment）
 */
export function overrideImagePaste(board: PlaitBoard): () => void {
  const originalInsertFragment = board.insertFragment;

  board.insertFragment = (clipboardData, targetPoint, operationType) => {
    const files = clipboardData?.files;
    if (files?.length && isSupportedImageFile(files[0] as File)) {
      void insertImageFile(board, files[0] as File, targetPoint);
      return;
    }
    originalInsertFragment(clipboardData, targetPoint, operationType);
  };

  return () => {
    board.insertFragment = originalInsertFragment;
  };
}

// ---------------------------------------------------------------------------
// 拖入监听
// ---------------------------------------------------------------------------

/**
 * 在画布容器上监听文件拖入，插入图片文件。
 *
 * `@plait/core` 的默认 `drop` 为空实现（`return false`），`withDraw` 也未覆盖，
 * 因此文件拖入必须由宿主自行接线。这里在 `dragover` 阶段对图片文件放行
 * （`preventDefault` 以允许 drop），`drop` 阶段校验并插入。
 *
 * @param host     画布容器（接收 drop 事件的元素）
 * @param getBoard 延迟取 board 实例（drop 发生时 board 可能已变化）
 * @returns 清理函数（解除两个监听）
 */
export function bindImageDrop(
  host: HTMLElement,
  getBoard: () => PlaitBoard | null,
): () => void {
  const onDragOver = (event: DragEvent): void => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (isSupportedImageFile(file)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDrop = (event: DragEvent): void => {
    const file = event.dataTransfer?.files?.[0];
    const board = getBoard();
    if (!file) return;
    // 拖入任意文件都要阻止浏览器默认「打开文件」行为
    event.preventDefault();
    if (!board || !isSupportedImageFile(file)) return;
    event.stopPropagation();
    void insertImageFile(board, file);
  };

  host.addEventListener('dragover', onDragOver);
  host.addEventListener('drop', onDrop);
  return () => {
    host.removeEventListener('dragover', onDragOver);
    host.removeEventListener('drop', onDrop);
  };
}

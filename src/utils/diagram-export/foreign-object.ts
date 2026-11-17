/**
 * 图表导出 - foreignObject 扁平化
 *
 * 背景：Mermaid（htmlLabels）与 Plait（Slate 文本 / 图片）都把文字渲染在
 * `<foreignObject>` 内的 HTML 中。WebKit（macOS 上的 Tauri WebView）只要 SVG 图像中
 * 含有 foreignObject，就会把绘制它的 canvas 标记为「被污染」，此后
 * toDataURL / toBlob 抛出 SecurityError，PNG 导出因此必然失败。另外 foreignObject
 * 内的 HTML 依赖页面 CSS，脱离页面后样式丢失，且多数设计软件不支持 foreignObject。
 *
 * 做法：以「仍挂在页面上、已完成排版」的源 SVG 为测量依据，把克隆树中的每个
 * foreignObject 替换为等价的原生 SVG 图元：
 * - 有背景色的 HTML 元素 → `<rect>`
 * - `<img>` → `<image>`
 * - 文本节点 → 按行拆分的 `<text>`（位置取自 Range 的逐字符排版矩形）
 * 同时移除源树中不可见（display:none / visibility:hidden / opacity:0）的元素，
 * 避免脱离页面 CSS 后原本隐藏的元素被画出来。
 *
 * 坐标换算：排版矩形是屏幕坐标，用 foreignObject 的 getScreenCTM() 逆矩阵换回其
 * 用户坐标系。测量前临时去掉祖先上的旋转类 transform，使逐字符矩形与文字方向一致；
 * 克隆树保留原 transform，旋转在输出中依然生效。
 *
 * @changelog
 * | 版本   | 变更说明                                       | 关联                       |
 * | v1.0.0 | 初始实现：foreignObject 转原生 SVG 图元           | FEAT: 文本绘图/导图/画板导出 |
 * /@changelog
 *
 * @author hhhuilli
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** 零宽字符（Slate 空行占位等），不参与输出 */
const INVISIBLE_CHARS = /^[\u200B\u200C\u200D\uFEFF]+$/;

/** 不参与渲染、computed display 恒为 none 的 SVG 容器，跳过可见性判断 */
const NON_RENDERED_TAGS = new Set([
  'defs',
  'style',
  'script',
  'title',
  'desc',
  'metadata',
  'marker',
  'clippath',
  'mask',
  'pattern',
  'symbol',
  'filter',
  'lineargradient',
  'radialgradient',
]);

/** 可能带旋转 / 斜切分量的 transform */
const ROTATING_TRANSFORM = /rotate|matrix|skew/i;

/** 一段同行连续文本的屏幕排版信息 */
interface TextRun {
  text: string;
  left: number;
  right: number;
  top: number;
  height: number;
}

/**
 * 把 cloneRoot 中的 foreignObject 替换为原生 SVG 图元，并移除不可见元素。
 *
 * @param sourceRoot 已挂载在页面且完成排版的源节点（只读测量，结束后原样恢复）
 * @param cloneRoot sourceRoot 的深克隆（结构必须与源一致），原地修改
 */
export function flattenForeignObjects(sourceRoot: Element, cloneRoot: Element): void {
  const sources = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll('*'))];
  const clones = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll('*'))];
  if (sources.length !== clones.length) {
    console.warn('[diagram-export] 源节点与克隆节点结构不一致，跳过扁平化');
    return;
  }

  // 先收集再统一修改：边遍历边替换会让下标错位
  const mutations: Array<() => void> = [];
  for (let i = 1; i < sources.length; i++) {
    const source = sources[i];
    const clone = clones[i];
    // foreignObject 内部由下方整体快照处理
    if (source.parentElement?.closest('foreignObject')) continue;
    if (isInsideNonRendered(source, sourceRoot)) continue;

    if (isHidden(source)) {
      mutations.push(() => clone.remove());
      continue;
    }
    if (source.localName === 'foreignObject') {
      const snapshot = withoutRotation(source, sourceRoot, () =>
        snapshotForeignObject(source as SVGForeignObjectElement),
      );
      mutations.push(() => clone.replaceWith(snapshot));
    }
  }
  mutations.forEach((mutate) => mutate());

  // 兜底：任何残留的 foreignObject 都会污染 canvas，直接移除
  cloneRoot.querySelectorAll('foreignObject').forEach((node) => node.remove());
}

// ---------------------------------------------------------------------------
// 可见性
// ---------------------------------------------------------------------------

function isInsideNonRendered(element: Element, root: Element): boolean {
  let current: Element | null = element;
  while (current && current !== root) {
    if (NON_RENDERED_TAGS.has(current.localName.toLowerCase())) return true;
    current = current.parentElement;
  }
  return false;
}

function isHidden(element: Element): boolean {
  const style = getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0;
}

function isTransparent(color: string): boolean {
  if (!color || color === 'transparent') return true;
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return false;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length === 4 && Number(parts[3]) === 0;
}

// ---------------------------------------------------------------------------
// 旋转处理
// ---------------------------------------------------------------------------

/**
 * 测量期间临时去掉 element 到 root 之间祖先上的旋转类 transform。
 * 测量为同步过程，期间不会发生绘制，用户无感知。
 */
function withoutRotation<T>(element: Element, root: Element, measure: () => T): T {
  const restored: Array<[Element, string]> = [];
  let current = element.parentElement;
  while (current) {
    const transform = current.getAttribute('transform');
    if (transform && ROTATING_TRANSFORM.test(transform)) {
      restored.push([current, transform]);
      current.removeAttribute('transform');
    }
    if (current === root) break;
    current = current.parentElement;
  }
  try {
    return measure();
  } finally {
    restored.forEach(([node, transform]) => node.setAttribute('transform', transform));
  }
}

// ---------------------------------------------------------------------------
// foreignObject 快照
// ---------------------------------------------------------------------------

/** 将单个 foreignObject 的可视内容转为 `<g>`（背景 → 图片 → 文字 的绘制顺序） */
function snapshotForeignObject(foreignObject: SVGForeignObjectElement): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g');
  const ctm = foreignObject.getScreenCTM();
  if (!ctm) return group;
  const inverse = ctm.inverse();
  const toUser = (x: number, y: number) => new DOMPoint(x, y).matrixTransform(inverse);

  const descendants = Array.from(foreignObject.querySelectorAll('*')).filter(
    (node) => !node.closest('[data-slate-placeholder]') && !isHidden(node),
  );

  for (const node of descendants) {
    const background = getComputedStyle(node).backgroundColor;
    if (!isTransparent(background)) {
      appendRect(group, node.getBoundingClientRect(), background, toUser);
    }
  }

  for (const node of descendants) {
    if (node instanceof HTMLImageElement) appendImage(group, node, toUser);
  }

  const walker = document.createTreeWalker(foreignObject, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    const parent = text.parentElement;
    if (!parent || parent.closest('[data-slate-placeholder]') || isHidden(parent)) continue;
    const style = getComputedStyle(parent);
    for (const run of collectRuns(text)) {
      group.appendChild(createTextElement(run, style, toUser));
    }
  }
  return group;
}

type ToUser = (x: number, y: number) => DOMPoint;

function appendRect(group: SVGGElement, rect: DOMRect, fill: string, toUser: ToUser): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const start = toUser(rect.left, rect.top);
  const end = toUser(rect.right, rect.bottom);
  const element = document.createElementNS(SVG_NS, 'rect');
  element.setAttribute('x', format(Math.min(start.x, end.x)));
  element.setAttribute('y', format(Math.min(start.y, end.y)));
  element.setAttribute('width', format(Math.abs(end.x - start.x)));
  element.setAttribute('height', format(Math.abs(end.y - start.y)));
  element.setAttribute('style', `fill: ${fill}; stroke: none`);
  group.appendChild(element);
}

function appendImage(group: SVGGElement, image: HTMLImageElement, toUser: ToUser): void {
  const src = image.currentSrc || image.src;
  const rect = image.getBoundingClientRect();
  if (!src || rect.width <= 0 || rect.height <= 0) return;
  const start = toUser(rect.left, rect.top);
  const end = toUser(rect.right, rect.bottom);
  const element = document.createElementNS(SVG_NS, 'image');
  element.setAttribute('x', format(Math.min(start.x, end.x)));
  element.setAttribute('y', format(Math.min(start.y, end.y)));
  element.setAttribute('width', format(Math.abs(end.x - start.x)));
  element.setAttribute('height', format(Math.abs(end.y - start.y)));
  element.setAttribute('preserveAspectRatio', 'none');
  element.setAttribute('href', src);
  // 兼容只认 xlink:href 的旧版查看器
  element.setAttributeNS(XLINK_NS, 'xlink:href', src);
  group.appendChild(element);
}

// ---------------------------------------------------------------------------
// 文本
// ---------------------------------------------------------------------------

/**
 * 逐字符测量文本节点的排版矩形，按「同一行且水平连续」合并为若干段。
 * 被折叠的空白没有矩形（或宽度为 0），自然被跳过；自动换行处另起一段。
 */
function collectRuns(textNode: Text): TextRun[] {
  const data = textNode.data;
  const range = document.createRange();
  const runs: TextRun[] = [];
  let current: TextRun | null = null;

  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    // 代理对（emoji 等）作为一个整体测量
    const length = code >= 0xd800 && code <= 0xdbff && i + 1 < data.length ? 2 : 1;
    const chars = data.slice(i, i + length).replace(/[\n\r\t]/g, ' ');
    range.setStart(textNode, i);
    range.setEnd(textNode, i + length);
    i += length - 1;
    if (INVISIBLE_CHARS.test(chars)) continue;

    const rect = Array.from(range.getClientRects()).find((r) => r.width > 0);
    if (!rect) continue;

    const sameLine =
      current !== null &&
      Math.abs(rect.top - current.top) < rect.height / 2 &&
      rect.left >= current.right - rect.width / 2 - 1;
    if (current && sameLine) {
      current.text += chars;
      current.right = rect.right;
    } else {
      if (current) runs.push(current);
      current = {
        text: chars,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        height: rect.height,
      };
    }
  }
  if (current) runs.push(current);
  range.detach();
  return runs.filter((run) => run.text.trim().length > 0);
}

function createTextElement(
  run: TextRun,
  style: CSSStyleDeclaration,
  toUser: ToUser,
): SVGTextElement {
  const baseline = run.top + run.height * getAscentRatio(style);
  const start = toUser(run.left, baseline);
  const end = toUser(run.right, baseline);

  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', format(start.x));
  text.setAttribute('y', format(start.y));
  // 样式必须写进内联 style：SVG 自带的 <style>（如 Mermaid 的 `text { text-anchor: middle }`）
  // 优先级高于展示属性，写成 fill / text-anchor 属性会被覆盖导致文字错位、变色
  const declarations = [
    `font-family: ${style.fontFamily}`,
    `font-size: ${style.fontSize}`,
    `font-weight: ${style.fontWeight}`,
    `font-style: ${style.fontStyle}`,
    `fill: ${style.color}`,
    'stroke: none',
    'text-anchor: start',
    'dominant-baseline: alphabetic',
    // 保留空格
    'white-space: pre',
  ];
  if (style.letterSpacing && style.letterSpacing !== 'normal') {
    declarations.push(`letter-spacing: ${style.letterSpacing}`);
  }
  const decoration = style.textDecorationLine;
  if (decoration && decoration !== 'none') {
    declarations.push(`text-decoration: ${decoration}`);
  }
  text.setAttribute('style', declarations.join('; '));
  text.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  // 让各查看器在字体有差异时也按原宽度排布
  const width = end.x - start.x;
  if (run.text.length > 1 && width > 0) {
    text.setAttribute('textLength', format(width));
    text.setAttribute('lengthAdjust', 'spacing');
  }
  text.textContent = run.text;
  return text;
}

/** 字体 ascent 占 (ascent + descent) 的比例，用于由字符矩形顶部推算基线 */
const ascentRatioCache = new Map<string, number>();
let measureContext: CanvasRenderingContext2D | null = null;

function getAscentRatio(style: CSSStyleDeclaration): number {
  // 注意：canvas 的 font 不支持 var()，这里使用的是 computed 后的真实字体栈
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const cached = ascentRatioCache.get(font);
  if (cached !== undefined) return cached;

  let ratio = 0.8;
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (measureContext) {
    measureContext.font = font;
    const metrics = measureContext.measureText('Hg');
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent;
    if (ascent > 0 && descent >= 0) ratio = ascent / (ascent + descent);
  }
  ascentRatioCache.set(font, ratio);
  return ratio;
}

function format(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * @changelog
 * | 版本   | 变更说明                                                              | 关联 |
 * | v1.0.0 | 初始实现：LanisMD 标题「重力字母」字符沙粒特效（Canvas 粒子引擎）    | REQ: 重力字母特效 |
 * | v1.1.0 | 修复：字体栈、坐标换算、静止锁定、散落范围、错峰返回                  | REQ: 重力字母特效 |
 * | v1.2.0 | 范围扩展：画布铺满欢迎页容器，粒子可在整个右侧区域内散落与堆积        | REQ: 重力字母特效 |
 * | v1.3.0 | 范围扩展：Portal 到 .lanis-app 根容器，覆盖整个应用窗口，交互改为 document 级 | REQ: 重力字母特效 |
 * | v1.4.0 | 返回时机改为落地后触发：粒子落地等待约 1s 再返回，不再因停止交互而提前返回 | REQ: 重力字母特效 |
 * | v1.5.0 | 新增入场动画：应用启动时粒子从视口四周汇聚成标题 | REQ: 重力字母特效 |
 * | v1.6.0 | 修复：resize 时画布清空与重绘跨帧导致标题闪烁，改为 rAF 内统一同步布局 | REQ: 重力字母特效 |
 * | v1.7.0 | 调整：加粗标题首字母 L 的竖线（垂直笔画），底部横线与其他字母不变      | REQ: 重力字母特效 |
 * | v1.7.1 | 修复：竖线定位误命中 i 的圆点（dot 顶高于字帽顶），改为全局最左墨迹列；幅度调至 0.8 | REQ: 重力字母特效 |
 * | v1.7.2 | 调整：缩小标题占位底部留白（BOTTOM_PAD 110 → 48），减小与下方标语的间距      | REQ: 重力字母特效 |
 * | v1.8.0 | 新增自动掉落动画：空闲 5-10s 随机掉落 1-3 个粒子，纯重力下落堆积后返回 | REQ: 重力字母特效 |
 * | v1.8.1 | 修复：入场动画仅在应用启动时的欢迎页播放，新增 playIntro 控制，重新挂载时直接显示 | REQ: 重力字母特效 |
 * /@changelog
 *
 * @author hhhuilli
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../../../styles/layout/gravity-letters.css';

/** 组成标题的随机字符沙粒池（大写字母 + 数字，贴近 ASCII 拼字风格） */
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** 采样步长：决定沙粒密度（需与 GRAIN_SIZE 匹配，过小会导致字符重叠发糊） */
const SAMPLE_STEP = 2;
/** 单个沙粒字符的绘制字号 */
const GRAIN_SIZE = 7;
/** 标题字重（加粗使字形轮廓更明显） */
const FONT_WEIGHT = 500;
/** 标题字体栈（canvas 的 font 属性不支持 CSS 变量，必须用真实字体栈） */
const TITLE_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";
/** 沙粒字符字体栈（等宽字体，小字号下更整齐） */
const GRAIN_FONT_FAMILY = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";

/** L 竖线加粗比例（相对竖线原始宽度，预览后可微调） */
const L_STEM_THICKEN_RATIO = 0.4;

/** 占位高度中保留的底部留白（控制标题与下方标语的间距） */
const BOTTOM_PAD = 0;
/** 堆积地面距窗口底部的间距 */
const GROUND_INSET = 12;

/** 物理参数 */
const GRAVITY = 0.32;
/** 水平阻尼：散落后横向速度衰减（值越小横向越克制） */
const FRICTION = 0.9;
/** 鼠标吹散影响半径（固定，不随速度放大，避免鼠标前方提前散落） */
const INFLUENCE_RADIUS = 14;
/** 鼠标移动矢量到沙粒初速度的放大系数 */
const BLOW_STRENGTH = 1.1;

/** 粒子落地后等待多久再返回（毫秒） */
const SETTLE_DELAY = 1000;
/** 落地后额外随机错峰幅度（毫秒），避免同时落地的粒子一起返回 */
const RETURN_STAGGER_MAX = 600;

/** 自动掉落动画：空闲后触发间隔范围（毫秒，随机） */
const AUTO_DROP_INTERVAL_MIN = 5000;
const AUTO_DROP_INTERVAL_MAX = 10000;
/** 每次自动掉落的粒子数量范围(随机) */
const AUTO_DROP_COUNT_MIN = 1;
const AUTO_DROP_COUNT_MAX = 8;

type GrainState = 'idle' | 'scattered' | 'settled' | 'returning';

interface Grain {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  char: string;
  state: GrainState;
  /** 落地堆积时所在的列，用于返回时回填高度场 */
  pileCol: number;
  /** 落地后的绝对返回时间戳，0 表示尚未落地等待 */
  returnAt: number;
  /** 返回缓动系数（随机，产生个体速度差异） */
  ease: number;
}

interface GravityLettersProps {
  /** 要渲染为沙粒的标题文本 */
  text: string;
  /** 标题逻辑字号（决定沙粒分布尺寸） */
  fontSize?: number;
  /** 附加到画布上的类名 */
  className?: string;
  /** 是否播放入场汇聚动画（仅应用启动时的欢迎页播放，其余直接显示原位） */
  playIntro?: boolean;
}

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const randomChar = (): string => CHARSET[Math.floor(Math.random() * CHARSET.length)];

/**
 * 在视口边缘外随机取一个起点，用于入场时「从四面八方汇聚」。
 */
function randomEdgePosition(w: number, h: number): { x: number; y: number } {
  const margin = 80;
  const edge = Math.floor(Math.random() * 4);
  switch (edge) {
    case 0:
      return { x: Math.random() * w, y: -margin };
    case 1:
      return { x: w + margin, y: Math.random() * h };
    case 2:
      return { x: Math.random() * w, y: h + margin };
    default:
      return { x: -margin, y: Math.random() * h };
  }
}

/**
 * 读取当前主题下的强调色（accent），供沙粒染色。
 */
function readGrainColor(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--lanismd-accent')
    .trim();
  return value || '#7aa2f7';
}

/**
 * 加粗标题首字母「L」的竖线（垂直笔画）。
 *
 * 在离屏绘制出文本像素后、生成粒子点之前，对 L 竖线区域的墨迹做水平方向膨胀，
 * 使竖线更粗；底部横线与其他字符不受影响。加粗幅度由 L_STEM_THICKEN_RATIO 控制。
 */
function thickenLStem(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  fontSize: number,
): void {
  const isInk = (x: number, y: number): boolean => data[(y * width + x) * 4 + 3] > 128;

  // 定位 L 竖线左边缘：取全局最左侧的墨迹列（L 为首字符，其竖线是整串文本最左的笔画）。
  // 不能用「首个墨迹像素」定位：i 的圆点顶部高于 L 的字帽顶端，逐行扫描会先命中 i，
  // 导致竖线区域错误地落在 i 上、误加粗 i 而 L 不变。
  let minX = width;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < minX; x++) {
      if (isInk(x, y)) {
        minX = x;
        break;
      }
    }
  }
  if (minX >= width) return;

  // 检测竖线右边缘：只看上半部（排除底部横线的干扰），从 minX 起扫描连续墨迹列。
  // 竖线宽度存在上限，超过则视为已扫到后续字符，避免误加粗。
  const topLimit = Math.floor(height * 0.55);
  const maxStemWidth = Math.max(3, Math.round(fontSize * 0.2));
  let stemRight = minX;
  let blankRun = 0;
  for (let x = minX + 1; x < width && x <= minX + maxStemWidth; x++) {
    let hasInk = false;
    for (let y = 0; y < topLimit; y++) {
      if (isInk(x, y)) {
        hasInk = true;
        break;
      }
    }
    if (hasInk) {
      stemRight = x;
      blankRun = 0;
    } else {
      blankRun += 1;
      if (blankRun >= 2) break; // 连续 2 列空白视为竖线结束
    }
  }

  const stemWidth = stemRight - minX + 1;
  const extraPx = Math.max(1, Math.round(stemWidth * L_STEM_THICKEN_RATIO));

  // 对竖线区域的墨迹向右膨胀 extraPx 列，使竖线变粗
  for (let y = 0; y < height; y++) {
    for (let x = minX; x <= stemRight; x++) {
      if (!isInk(x, y)) continue;
      for (let d = 1; d <= extraPx; d++) {
        const nx = x + d;
        if (nx < width) {
          data[(y * width + nx) * 4 + 3] = 255;
        }
      }
    }
  }
}

/**
 * 离屏采样：把标题文本绘制到临时 canvas，返回有墨迹的像素点。
 */
function sampleText(
  text: string,
  fontSize: number,
): { points: Array<{ x: number; y: number }>; width: number; height: number } {
  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true });
  if (!octx) {
    return { points: [], width: 0, height: 0 };
  }

  const font = `${FONT_WEIGHT} ${fontSize}px ${TITLE_FONT_FAMILY}`;
  octx.font = font;
  const metrics = octx.measureText(text);

  // 固定上下留白，水平垂直居中绘制，避免字形 ascender/descender 被裁切
  const width = Math.ceil(metrics.width) + 16;
  const height = Math.ceil(fontSize * 1.6);

  off.width = width;
  off.height = height;
  octx.font = font;
  octx.textBaseline = 'middle';
  octx.textAlign = 'center';
  octx.fillStyle = '#000';
  octx.fillText(text, width / 2, height / 2);

  const imageData = octx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 加粗首字母 L 的竖线（垂直笔画）
  thickenLStem(data, width, height, fontSize);

  const points: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < height; y += SAMPLE_STEP) {
    for (let x = 0; x < width; x += SAMPLE_STEP) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 128) {
        points.push({ x, y });
      }
    }
  }
  return { points, width, height };
}

/**
 * 重力字母特效组件。
 *
 * 标题由大量随机字符沙粒组成，鼠标划过处沙粒沿移动方向被吹散、受重力下落，
 * 在整个应用窗口底部堆积成沙丘，停止交互后错峰飞回原位重组。
 *
 * 画布通过 Portal 挂载到 .lanis-app 根容器，fixed 铺满整个应用窗口；
 * pointer-events: none 不拦截交互，散落交互通过 document 级 mousemove 监听。
 */
export function GravityLetters({
  text,
  fontSize = 80,
  className,
  playIntro = true,
}: GravityLettersProps) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  // 查找 .lanis-app 根容器作为画布挂载目标
  useEffect(() => {
    setPortalTarget(document.querySelector<HTMLElement>('.lanis-app'));
  }, []);

  useEffect(() => {
    const placeholder = placeholderRef.current;
    const canvas = canvasRef.current;
    if (!placeholder || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 欢迎页容器：用于监听尺寸变化触发重排
    const container = placeholder.closest('.lanismd-welcome-minimal');

    // 采样文字形状并建立粒子（home 坐标先取采样点，布局同步时再加占位偏移）
    const { points, width: sampleW, height: sampleH } = sampleText(text, fontSize);
    if (points.length === 0) return;

    // 占位元素在 flex 布局中撑起原标题区域（标题 + 底部留白）
    placeholder.style.width = `${sampleW}px`;
    placeholder.style.height = `${sampleH + BOTTOM_PAD}px`;

    // 播放入场：初始位置散布在视口四周外侧，状态设为 returning，形成汇聚入场动画；
    // 不播放：直接置于原位静止（syncLayout 会把 idle 粒子同步到加上偏移后的原位）
    const grains: Grain[] = points.map((p) => {
      const start = playIntro
        ? randomEdgePosition(window.innerWidth, window.innerHeight)
        : { x: p.x, y: p.y };
      return {
        homeX: p.x,
        homeY: p.y,
        x: start.x,
        y: start.y,
        vx: 0,
        vy: 0,
        char: randomChar(),
        state: playIntro ? 'returning' : 'idle',
        pileCol: 0,
        returnAt: 0,
        ease: rand(0.06, 0.14),
      };
    });

    // 底部堆积高度场（按足够大的宽度预分配，列号访问时做边界收敛）
    const pileHeights = new Float32Array(8192);

    let color = readGrainColor();
    let prevMouseX: number | null = null;
    let prevMouseY: number | null = null;
    let rafId = 0;
    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let logicalW = 0;
    let logicalH = 0;
    let groundY = 0;
    let offset = { x: 0, y: 0 };
    // 布局脏位：resize 时只标记，在 rAF 循环开头统一同步，避免清空画布与重绘跨帧造成闪烁
    let needsLayoutSync = false;
    // 自动掉落动画：空闲计时起点与下一次掉落间隔
    let lastInteractionAt = performance.now();
    let nextDropDelay = rand(AUTO_DROP_INTERVAL_MIN, AUTO_DROP_INTERVAL_MAX);

    /**
     * 同步窗口尺寸、占位视口坐标与粒子原位坐标（挂载与尺寸变化时调用）。
     */
    const syncLayout = (): void => {
      const canvasRect = canvas.getBoundingClientRect();
      if (canvasRect.width < 1 || canvasRect.height < 1) return;

      const phRect = placeholder.getBoundingClientRect();
      const newOffset = {
        x: phRect.left - canvasRect.left,
        y: phRect.top - canvasRect.top,
      };
      logicalW = canvasRect.width;
      logicalH = canvasRect.height;
      groundY = logicalH - GROUND_INSET;

      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(logicalW * dpr);
      canvas.height = Math.round(logicalH * dpr);

      // 布局变化时，把偏移增量应用到所有粒子的原位坐标
      const dx = newOffset.x - offset.x;
      const dy = newOffset.y - offset.y;
      if (dx !== 0 || dy !== 0) {
        for (const g of grains) {
          g.homeX += dx;
          g.homeY += dy;
          if (g.state === 'idle') {
            g.x = g.homeX;
            g.y = g.homeY;
          }
        }
      }
      offset = newOffset;
    };

    syncLayout();

    /**
     * 将鼠标视口坐标转换为画布逻辑坐标（按显示尺寸与逻辑尺寸的比例换算）。
     */
    const toLocal = (e: MouseEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = logicalW / rect.width;
      const scaleY = logicalH / rect.height;
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    /**
     * 将处于原位/返回中/堆积状态的粒子吹散，速度方向跟随鼠标移动矢量。
     * 返回本次是否实际吹散了粒子（用于判定是否重置汇聚计时）。
     */
    const blowGrains = (mx: number, my: number, dx: number, dy: number): void => {
      const radiusSq = INFLUENCE_RADIUS * INFLUENCE_RADIUS;

      for (const g of grains) {
        if (g.state === 'scattered') continue;
        const distSq = (g.x - mx) ** 2 + (g.y - my) ** 2;
        if (distSq > radiusSq) continue;

        if (g.state === 'settled') {
          // 吹起已堆积的沙粒时，回填高度场
          pileHeights[g.pileCol] = Math.max(0, pileHeights[g.pileCol] - 1);
        }

        g.state = 'scattered';
        g.returnAt = 0;
        g.vx = dx * BLOW_STRENGTH + rand(-0.6, 0.6);
        g.vy = dy * BLOW_STRENGTH - rand(0, 2);
      }
    };

    /**
     * 自动掉落：随机选取 1-3 个处于原位的粒子，使其纯重力自然下落。
     * 初速度置零，只受重力加速，落地后复用 scattered → settled → returning 流程。
     */
    const dropRandomGrains = (): void => {
      const idleIndices: number[] = [];
      for (let i = 0; i < grains.length; i++) {
        if (grains[i].state === 'idle') idleIndices.push(i);
      }
      if (idleIndices.length === 0) return;

      const count = Math.min(
        idleIndices.length,
        Math.floor(rand(AUTO_DROP_COUNT_MIN, AUTO_DROP_COUNT_MAX + 1)),
      );
      // 原地洗牌后取前 count 个，保证随机选取
      for (let i = idleIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = idleIndices[i];
        idleIndices[i] = idleIndices[j];
        idleIndices[j] = tmp;
      }
      for (let k = 0; k < count; k++) {
        const g = grains[idleIndices[k]];
        g.state = 'scattered';
        g.vx = 0;
        g.vy = 0;
        g.returnAt = 0;
      }
    };

    const onMouseMove = (e: MouseEvent): void => {
      const { x, y } = toLocal(e);
      if (prevMouseX === null || prevMouseY === null) {
        prevMouseX = x;
        prevMouseY = y;
        return;
      }
      const dx = x - prevMouseX;
      const dy = y - prevMouseY;
      prevMouseX = x;
      prevMouseY = y;
      if (dx === 0 && dy === 0) return;

      // 用户一旦移动鼠标，重置自动掉落计时
      lastInteractionAt = performance.now();
      blowGrains(x, y, dx, dy);
    };

    const frame = (now: number): void => {
      // resize 触发的布局同步统一在此帧执行，确保清空画布与重绘在同一帧内完成
      if (needsLayoutSync) {
        needsLayoutSync = false;
        syncLayout();
      }

      // 自动掉落：空闲超过随机间隔则掉落 1-3 个粒子，并重置计时
      if (now - lastInteractionAt >= nextDropDelay) {
        dropRandomGrains();
        lastInteractionAt = now;
        nextDropDelay = rand(AUTO_DROP_INTERVAL_MIN, AUTO_DROP_INTERVAL_MAX);
      }

      // 更新粒子状态
      for (const g of grains) {
        switch (g.state) {
          case 'idle': {
            // 静止状态：位置锁定原位，不做任何位移
            g.x = g.homeX;
            g.y = g.homeY;
            break;
          }
          case 'scattered': {
            g.vy += GRAVITY;
            g.vx *= FRICTION;
            g.x += g.vx;
            g.y += g.vy;
            if (g.y >= groundY) {
              g.y = groundY;
              g.state = 'settled';
              const col = Math.min(pileHeights.length - 1, Math.max(0, Math.floor(g.x)));
              pileHeights[col] += 1;
              g.pileCol = col;
              // 沙粒落在已堆积的沙丘顶部
              g.y = groundY - pileHeights[col] * GRAIN_SIZE * 0.55;
              // 落地后等待一段时间再返回（含随机错峰）
              g.returnAt = now + SETTLE_DELAY + rand(0, RETURN_STAGGER_MAX);
            }
            break;
          }
          case 'settled': {
            // 错峰时间到，从堆积中离开并回填高度场
            if (g.returnAt !== 0 && now >= g.returnAt) {
              pileHeights[g.pileCol] = Math.max(0, pileHeights[g.pileCol] - 1);
              g.state = 'returning';
            }
            break;
          }
          case 'returning': {
            g.x += (g.homeX - g.x) * g.ease;
            g.y += (g.homeY - g.y) * g.ease;
            if (Math.abs(g.homeX - g.x) < 0.6 && Math.abs(g.homeY - g.y) < 0.6) {
              g.x = g.homeX;
              g.y = g.homeY;
              g.vx = 0;
              g.vy = 0;
              g.returnAt = 0;
              g.state = 'idle';
            }
            break;
          }
        }
      }

      // 绘制
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, logicalW, logicalH);
      ctx.font = `${GRAIN_SIZE}px ${GRAIN_FONT_FAMILY}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      for (const g of grains) {
        ctx.fillText(g.char, g.x, g.y);
      }

      rafId = requestAnimationFrame(frame);
    };

    // 监听欢迎页容器尺寸变化，同步画布与粒子原位
    const resizeObserver = new ResizeObserver(() => {
      needsLayoutSync = true;
    });
    if (container) {
      resizeObserver.observe(container);
    }

    // 监听主题切换（.dark / .theme-dark），刷新沙粒颜色
    const themeObserver = new MutationObserver(() => {
      color = readGrainColor();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });

    const onWindowResize = (): void => {
      needsLayoutSync = true;
    };

    document.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onWindowResize);
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onWindowResize);
      resizeObserver.disconnect();
      themeObserver.disconnect();
    };
  }, [text, fontSize, portalTarget, playIntro]);

  return (
    <>
      <div ref={placeholderRef} className="lanismd-gravity-letters-placeholder" />
      {portalTarget &&
        createPortal(
          <canvas
            ref={canvasRef}
            className={`lanismd-gravity-letters-canvas ${className ?? ''}`}
            aria-label={text}
          />,
          portalTarget,
        )}
    </>
  );
}

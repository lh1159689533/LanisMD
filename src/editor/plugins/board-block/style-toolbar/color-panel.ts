/**
 * Board Style Toolbar - 取色面板
 *
 * 纯 DOM 实现的颜色选择面板，包含：
 * - 两个 Tab：「主题配色」「默认配色」（胶囊式切换）
 * - 主题配色：无色 + 黑 + 白 + 当前主题 branchColors（10色），2 行色块
 * - 默认配色：固定的淡色行 + 饱和色行，2 行色块
 * - 色彩梯度：选中某色后在下方展开 6 级 HSL 明度插值
 *
 * 面板由各能力组（fill / stroke）按需创建并挂入下拉面板，
 * 选色回调由调用方提供。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                                                        |
 * | v1.0.0 | 批次2：取色面板（主题/默认 Tab + 色彩梯度）  | REQ: 20260826-board-style-toolbar TECH: board-style-toolbar-技术方案 §四批次2 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { MindThemeColors } from '@plait/mind';
import type { PlaitBoard } from '@plait/core';
import { getMindThemeColor } from '@plait/mind';

import {
  PREFIX,
  COLOR_NONE,
  THEME_BASE_COLORS,
  DEFAULT_COLORS_LIGHT,
  DEFAULT_COLORS_DARK,
  GRADIENT_STEPS,
  GRADIENT_LIGHTNESS,
  COLORS_PER_ROW,
} from './constants';
import { ICON_NO_COLOR, ICON_CHECK } from './icons';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 选色回调：传入色值字符串（或 COLOR_NONE 表示清除） */
export type ColorSelectHandler = (color: string) => void;

// ---------------------------------------------------------------------------
// HSL 工具函数
// ---------------------------------------------------------------------------

/** 将十六进制颜色转为 HSL 数组 [h, s, l]（h: 0~360, s/l: 0~1） */
function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let hue = 0;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / d + 2) / 6;
  else hue = ((r - g) / d + 4) / 6;

  return [hue * 360, s, l];
}

/** HSL 转十六进制颜色 */
function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h / 360 + 1 / 3);
    g = hue2rgb(p, q, h / 360);
    b = hue2rgb(p, q, h / 360 - 1 / 3);
  }

  const toHex = (v: number) => {
    const hex = Math.round(v * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** 为指定颜色生成 N 级明度梯度 */
function generateGradient(baseColor: string): string[] {
  const [h, s] = hexToHsl(baseColor);
  return GRADIENT_LIGHTNESS.map((l) => hslToHex(h, s, l));
}

// ---------------------------------------------------------------------------
// 色块 DOM 创建
// ---------------------------------------------------------------------------

/** 创建单个圆形色块 */
function createSwatch(
  color: string,
  isActive: boolean,
  onClick: () => void,
): HTMLElement {
  const swatch = document.createElement('button');
  swatch.className = `${PREFIX}__color-swatch`;
  swatch.type = 'button';
  swatch.setAttribute('data-color', color);

  if (color === COLOR_NONE) {
    // 无颜色：斜线圆圈
    swatch.classList.add('is-no-color');
    swatch.innerHTML = ICON_NO_COLOR;
  } else {
    swatch.style.backgroundColor = color;
    // 浅色色块加边框以便在白色背景上可辨
    const [, , l] = hexToHsl(color);
    if (l > 0.85) {
      swatch.classList.add('is-light');
    }
  }

  if (isActive) {
    swatch.classList.add('is-active');
  }

  swatch.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  return swatch;
}

/** 创建梯度色块（带勾号标识选中） */
function createGradientSwatch(
  color: string,
  isActive: boolean,
  onClick: () => void,
): HTMLElement {
  const swatch = createSwatch(color, isActive, onClick);
  swatch.classList.add('is-gradient');
  if (isActive) {
    // 梯度区用勾号标识选中
    const check = document.createElement('span');
    check.className = `${PREFIX}__color-check`;
    check.innerHTML = ICON_CHECK;
    swatch.appendChild(check);
  }
  return swatch;
}

// ---------------------------------------------------------------------------
// 取色面板
// ---------------------------------------------------------------------------

export interface ColorPanelController {
  /** 面板根 DOM */
  readonly dom: HTMLElement;
  /** 更新当前激活颜色（用于回填） */
  setActiveColor(color: string | null): void;
  /** 更新 board 引用（用于读取当前主题色） */
  setBoard(board: PlaitBoard): void;
  /** 销毁 */
  destroy(): void;
}

/**
 * 创建取色面板。
 *
 * @param onSelect 选色回调（传入原始色值字符串，COLOR_NONE 表示清除）
 */
export function createColorPanel(onSelect: ColorSelectHandler): ColorPanelController {
  let currentBoard: PlaitBoard | null = null;
  let activeColor: string | null = null;
  let activeTab: 'theme' | 'default' = 'theme';
  /** 当前展开梯度的基色（null = 未展开） */
  let gradientBaseColor: string | null = null;

  // --- 根容器 ---
  const dom = document.createElement('div');
  dom.className = `${PREFIX}__color-panel`;

  // --- Tab 切换 ---
  const tabBar = document.createElement('div');
  tabBar.className = `${PREFIX}__color-tabs`;

  const tabTheme = document.createElement('button');
  tabTheme.className = `${PREFIX}__color-tab is-active`;
  tabTheme.type = 'button';
  tabTheme.textContent = '主题配色';

  const tabDefault = document.createElement('button');
  tabDefault.className = `${PREFIX}__color-tab`;
  tabDefault.type = 'button';
  tabDefault.textContent = '默认配色';

  tabBar.appendChild(tabTheme);
  tabBar.appendChild(tabDefault);
  dom.appendChild(tabBar);

  // --- 色块网格容器 ---
  const grid = document.createElement('div');
  grid.className = `${PREFIX}__color-grid`;
  dom.appendChild(grid);

  // --- 梯度区容器 ---
  const gradientSection = document.createElement('div');
  gradientSection.className = `${PREFIX}__color-gradient`;
  gradientSection.style.display = 'none';
  dom.appendChild(gradientSection);

  // --- Tab 切换事件 ---
  tabTheme.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTab === 'theme') return;
    activeTab = 'theme';
    tabTheme.classList.add('is-active');
    tabDefault.classList.remove('is-active');
    render();
  });

  tabDefault.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTab === 'default') return;
    activeTab = 'default';
    tabDefault.classList.add('is-active');
    tabTheme.classList.remove('is-active');
    render();
  });

  // --- 获取当前主题的 branchColors ---
  function getThemeBranchColors(): string[] {
    if (currentBoard) {
      try {
        const theme = getMindThemeColor(currentBoard);
        return theme.branchColors ?? [];
      } catch {
        // 降级：取默认主题
      }
    }
    // 降级：取 MindThemeColors 第一个主题的 branchColors
    return MindThemeColors[0]?.branchColors ?? [];
  }

  // --- 渲染色块网格 ---
  function render(): void {
    grid.innerHTML = '';
    gradientSection.style.display = 'none';
    gradientSection.innerHTML = '';

    let colors: string[];
    if (activeTab === 'theme') {
      const branchColors = getThemeBranchColors();
      colors = [...THEME_BASE_COLORS, ...branchColors];
    } else {
      colors = [...DEFAULT_COLORS_LIGHT, ...DEFAULT_COLORS_DARK];
    }

    // 渲染色块
    colors.forEach((c) => {
      const isActive = c === COLOR_NONE
        ? activeColor === null
        : activeColor?.toLowerCase() === c.toLowerCase();
      const swatch = createSwatch(c, isActive, () => handleSwatchClick(c));
      grid.appendChild(swatch);
    });

    // 如果有展开的梯度且基色在当前 Tab 的色板中，渲染梯度
    if (gradientBaseColor && colors.includes(gradientBaseColor)) {
      renderGradient(gradientBaseColor);
    }
  }

  // --- 色块点击处理 ---
  function handleSwatchClick(color: string): void {
    if (color === COLOR_NONE) {
      // 无颜色：清除
      activeColor = null;
      gradientBaseColor = null;
      onSelect(COLOR_NONE);
      render();
      return;
    }

    // 黑/白等无色相色不展开梯度
    const [, s] = hexToHsl(color);
    if (s < 0.05) {
      activeColor = color;
      gradientBaseColor = null;
      onSelect(color);
      render();
      return;
    }

    // 有色相色：展开/切换梯度
    gradientBaseColor = color;
    activeColor = color;
    onSelect(color);
    render();
  }

  // --- 渲染梯度 ---
  function renderGradient(baseColor: string): void {
    gradientSection.innerHTML = '';
    gradientSection.style.display = '';

    const label = document.createElement('div');
    label.className = `${PREFIX}__color-gradient-label`;
    label.textContent = '色彩梯度';
    gradientSection.appendChild(label);

    const gradientGrid = document.createElement('div');
    gradientGrid.className = `${PREFIX}__color-gradient-grid`;

    const steps = generateGradient(baseColor);
    steps.forEach((c) => {
      const isActive = activeColor?.toLowerCase() === c.toLowerCase();
      const swatch = createGradientSwatch(c, isActive, () => {
        activeColor = c;
        onSelect(c);
        render();
      });
      gradientGrid.appendChild(swatch);
    });

    gradientSection.appendChild(gradientGrid);
  }

  // --- 公开方法 ---
  function setActiveColor(color: string | null): void {
    activeColor = color;
    // 如果当前色能匹配到某个基色的梯度，自动展开
    gradientBaseColor = null;
    if (color) {
      const [h, s] = hexToHsl(color);
      if (s >= 0.05) {
        // 尝试匹配色板中的基色
        const branchColors = getThemeBranchColors();
        const allColors = activeTab === 'theme'
          ? [...THEME_BASE_COLORS, ...branchColors]
          : [...DEFAULT_COLORS_LIGHT, ...DEFAULT_COLORS_DARK];

        for (const base of allColors) {
          if (base === COLOR_NONE) continue;
          const [bh, bs] = hexToHsl(base);
          // 色相接近且饱和度接近 → 认为属于该基色的梯度
          if (Math.abs(bh - h) < 15 && Math.abs(bs - s) < 0.3) {
            gradientBaseColor = base;
            break;
          }
        }
      }
    }
    render();
  }

  function setBoard(board: PlaitBoard): void {
    currentBoard = board;
    render();
  }

  function destroy(): void {
    dom.remove();
  }

  // 初始渲染
  render();

  return { dom, setActiveColor, setBoard, destroy };
}

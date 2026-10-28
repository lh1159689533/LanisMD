/**
 * Board Block - 数据编解码
 *
 * 在 `board_block.attrs.data`（内联于 Markdown 的字符串）与 Plait 画板元素之间转换。
 * MVP 采用 `base64(JSON)` 明文编码（不压缩），中文文本走 UTF-8 正确编解码。
 *
 * @changelog
 * | 版本   | 变更说明                          | 关联                                                 |
 * | v1.0.0 | 初始实现：base64(JSON) 编解码往返  | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * | v1.1.0 | 编解码画板主题（缺失时回落默认主题） | REQ: 20261026-board-canvas-toolbar TECH: 画布级工具栏方案 §六 |
 * | v1.2.0 | encode 改 options 签名；mode 编解码与空数据兜底分流 | REQ: 20261027-board-whiteboard-draw §3.1 / §4.3 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitElement, ThemeColorMode, Viewport } from '@plait/core';
import { SCHEMA_VERSION, createDefaultMindmap } from './constants';
import { DEFAULT_THEME_MODE, THEME_OPTIONS } from './canvas-toolbar/constants';
import type { BoardMode, BoardPayload, DecodedBoard } from './types';

// ---------------------------------------------------------------------------
// UTF-8 安全的 base64 编解码
// ---------------------------------------------------------------------------

/**
 * 将 UTF-8 字符串编码为 base64。
 *
 * 直接使用 `btoa` 会在遇到非 Latin1 字符（如中文）时抛异常，
 * 因此先用 `TextEncoder` 转字节流，再按字节构造 Latin1 字符串交给 `btoa`。
 */
function utf8ToBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000; // 分块拼接，避免超大字符串导致的调用栈溢出
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * 将 base64 解码为 UTF-8 字符串。
 *
 * 与 `utf8ToBase64` 对称：先 `atob` 得到 Latin1 字节串，再用 `TextDecoder` 还原 UTF-8。
 */
function base64ToUtf8(input: string): string {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// 编码
// ---------------------------------------------------------------------------

/** `encode` 的可选参数 */
export interface EncodeOptions {
  /** 视口信息（缩放、平移） */
  viewport?: Viewport;
  /** 画板主题；不传则不写入该字段，解码侧回落默认主题 */
  theme?: ThemeColorMode;
  /**
   * 画板形态。
   *
   * 不传则不写入该字段，解码侧回落 `'mindmap'`。因此导图块可以不传，
   * 但画板块**必须显式传入** `'board'`，否则重开后会被解码成导图块。
   */
  mode?: BoardMode;
}

/**
 * 将 Plait 画板元素编码为持久化字符串（`base64(JSON)`）。
 *
 * @param elements Plait 画板元素树
 * @param options 视口 / 主题 / 形态（均可选）
 * @returns base64 编码串，写入 `board_block.attrs.data`
 */
export function encode(elements: PlaitElement[], options?: EncodeOptions): string {
  const payload: BoardPayload = {
    v: SCHEMA_VERSION,
    mode: options?.mode,
    children: elements,
    viewport: options?.viewport,
    theme: options?.theme,
  };
  return utf8ToBase64(JSON.stringify(payload));
}

// ---------------------------------------------------------------------------
// 解码
// ---------------------------------------------------------------------------

/**
 * 将持久化字符串解码为 Plait 画板元素。
 *
 * 解码策略（逐级兜底，保证任何输入都不抛出未捕获异常）：
 * 1. 当前格式：`base64(JSON)` → 解析 `{ v, mode, children, viewport }`
 * 2. 兼容旧数据：直接按明文 JSON 解析
 * 3. 彻底失败：返回默认思维导图（空画板兜底，不崩溃）
 *
 * @param text `board_block.attrs.data` 的原始字符串
 * @returns 归一化的解码结果；`mode` 必填，`elements` 必为数组
 *          （导图形态非空，画板形态可为空）
 */
export function decode(text: string): DecodedBoard {
  // 彻底解码失败时无从得知原始形态，统一回落导图 + 默认内容，与本期之前一致
  const fallback = (): DecodedBoard => ({
    version: SCHEMA_VERSION,
    mode: 'mindmap',
    elements: createDefaultMindmap(),
    viewport: undefined,
    theme: DEFAULT_THEME_MODE,
  });

  if (!text || !text.trim()) {
    return fallback();
  }

  // 1. 当前格式：base64(JSON)
  try {
    const json = base64ToUtf8(text.trim());
    const parsed = JSON.parse(json) as Partial<BoardPayload>;
    return normalize(parsed);
  } catch {
    // 继续尝试下一种格式
  }

  // 2. 兼容明文 JSON（可能是直接手写或旧版本数据）
  try {
    const parsed = JSON.parse(text) as Partial<BoardPayload>;
    return normalize(parsed);
  } catch {
    // 继续兜底
  }

  // 3. 彻底失败：返回默认空画板
  return fallback();
}

/**
 * 将解析出的原始对象归一化为 `DecodedBoard`。
 *
 * 文档是用户可直接手改的明文载体，因此 `mode` / `theme` 都必须做合法性校验，
 * 把非法字符串原样交给下游会导致插件注册错位或主题色查表失败。
 */
function normalize(parsed: Partial<BoardPayload>): DecodedBoard {
  const mode = normalizeMode(parsed.mode);
  const raw = Array.isArray(parsed.children) ? (parsed.children as PlaitElement[]) : [];

  // 空数据兜底必须按形态分流：
  // - 导图：空画板无意义（没有根节点就无法新建任何节点），回落默认思维导图
  // - 画板：空画布是合法状态（插入即空），绝不能兜底成一个思维导图根节点
  const elements = raw.length > 0 ? raw : mode === 'board' ? [] : createDefaultMindmap();

  return {
    version: typeof parsed.v === 'number' ? parsed.v : SCHEMA_VERSION,
    mode,
    elements,
    viewport: parsed.viewport,
    theme: normalizeTheme(parsed.theme),
  };
}

/** 校验画板形态合法性；缺失或非法时回落 `'mindmap'`，保证旧文档零迁移 */
function normalizeMode(raw: unknown): BoardMode {
  return raw === 'board' ? 'board' : 'mindmap';
}

/** 校验主题标识合法性，非法或缺失时回落默认主题 */
function normalizeTheme(raw: unknown): ThemeColorMode {
  const matched = THEME_OPTIONS.find((option) => option.mode === raw);
  return matched ? matched.mode : DEFAULT_THEME_MODE;
}

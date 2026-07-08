/**
 * Board Block - 数据编解码
 *
 * 在 `board_block.attrs.data`（内联于 Markdown 的字符串）与 Plait 画板元素之间转换。
 * MVP 采用 `base64(JSON)` 明文编码（不压缩），中文文本走 UTF-8 正确编解码。
 *
 * @changelog
 * | 版本   | 变更说明                          | 关联                                                 |
 * | v1.0.0 | 初始实现：base64(JSON) 编解码往返  | REQ: 20260702-board-block-mindmap TECH: 画板插件技术方案 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { PlaitElement, Viewport } from '@plait/core';
import { SCHEMA_VERSION, createDefaultMindmap } from './constants';
import type { BoardPayload, DecodedBoard } from './types';

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

/**
 * 将 Plait 画板元素编码为持久化字符串（`base64(JSON)`）。
 *
 * @param elements Plait 画板元素树
 * @param viewport 视口信息（可选）
 * @returns base64 编码串，写入 `board_block.attrs.data`
 */
export function encode(elements: PlaitElement[], viewport?: Viewport): string {
  const payload: BoardPayload = {
    v: SCHEMA_VERSION,
    children: elements,
    viewport,
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
 * 1. 当前格式：`base64(JSON)` → 解析 `{ v, children, viewport }`
 * 2. 兼容旧数据：直接按明文 JSON 解析
 * 3. 彻底失败：返回默认思维导图（空画板兜底，不崩溃）
 *
 * @param text `board_block.attrs.data` 的原始字符串
 * @returns 归一化的解码结果，`elements` 一定为非空数组
 */
export function decode(text: string): DecodedBoard {
  const fallback = (): DecodedBoard => ({
    version: SCHEMA_VERSION,
    elements: createDefaultMindmap(),
    viewport: undefined,
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
 * 校验 `children` 是否为合法数组；非法时回落默认思维导图。
 */
function normalize(parsed: Partial<BoardPayload>): DecodedBoard {
  const elements =
    Array.isArray(parsed.children) && parsed.children.length > 0
      ? (parsed.children as PlaitElement[])
      : createDefaultMindmap();

  return {
    version: typeof parsed.v === 'number' ? parsed.v : SCHEMA_VERSION,
    elements,
    viewport: parsed.viewport,
  };
}

/**
 * Board Block - 全屏窗口通信协议
 *
 * 主窗口（NodeView）与全屏子窗口之间的事件契约。两侧共享本文件，
 * 保证事件名与 payload 结构单点定义。
 *
 * 设计要点：
 * - 画板数据为 base64(JSON)，体积可能较大，不能走 URL query 传递。
 *   改用「握手」模式：URL 仅携带 label/state/theme，子窗口挂载完成后
 *   emit `ready`，主窗口再通过 `emitTo(label, init)` 定向下发数据。
 * - 所有 payload 均携带 label，使同一文档内多个画板块各自隔离。
 *
 * @changelog
 * | 版本   | 变更说明                         | 关联                                                      |
 * | v1.0.0 | 初始实现：全屏窗口事件契约与 URL 构造 | REQ: 20261026-board-fullscreen TECH: 画板全屏窗口方案 §三    |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { BoardBlockState } from '../types';

// ---------------------------------------------------------------------------
// 路由与窗口标识
// ---------------------------------------------------------------------------

/** 全屏窗口的前端路由路径（由 App.tsx 依据 pathname 分发） */
export const BOARD_FULLSCREEN_ROUTE = '/board-fullscreen';

/**
 * 全屏窗口 label 前缀。
 *
 * 必须与 `src-tauri/capabilities/default.json` 中 `windows` 白名单的
 * `board-fullscreen-*` 通配项保持一致，否则子窗口将不具备任何 API 权限。
 */
export const BOARD_FULLSCREEN_LABEL_PREFIX = 'board-fullscreen-';

/**
 * 生成一个全屏窗口 label。
 *
 * label 仅在运行期有效（不写入文档），因此用时间戳 + 随机串即可保证唯一。
 * 字符集限定在 Tauri 允许的 `[a-zA-Z0-9-_/:]` 范围内。
 */
export function createFullscreenLabel(): string {
  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${BOARD_FULLSCREEN_LABEL_PREFIX}${seed}`;
}

// ---------------------------------------------------------------------------
// 事件名
// ---------------------------------------------------------------------------

/** 主窗口与全屏子窗口之间的事件名集合 */
export const BOARD_FS_EVENT = {
  /** 子 -> 主：子窗口已挂载，请求下发初始数据 */
  ready: 'board-fullscreen:ready',
  /** 主 -> 子（定向 emitTo）：下发初始画板数据 */
  init: 'board-fullscreen:init',
  /** 子 -> 主：画板内容变更（防抖后） */
  change: 'board-fullscreen:change',
  /** 子 -> 主：编辑/预览态变更 */
  state: 'board-fullscreen:state',
  /** 子 -> 主：窗口即将关闭，附带最终数据与状态 */
  closed: 'board-fullscreen:closed',
} as const;

// ---------------------------------------------------------------------------
// Payload 类型
// ---------------------------------------------------------------------------

/** 所有事件 payload 的公共部分 */
interface BoardFsBasePayload {
  /** 全屏窗口 label，用于多实例路由 */
  label: string;
}

/** `ready` 事件 payload */
export type BoardFsReadyPayload = BoardFsBasePayload;

/** `init` 事件 payload */
export interface BoardFsInitPayload extends BoardFsBasePayload {
  /** base64(JSON) 编码的画板数据 */
  data: string;
}

/** `change` 事件 payload */
export interface BoardFsChangePayload extends BoardFsBasePayload {
  /** base64(JSON) 编码的画板数据 */
  data: string;
}

/** `state` 事件 payload */
export interface BoardFsStatePayload extends BoardFsBasePayload {
  /** 子窗口当前的显示状态 */
  state: BoardBlockState;
}

/** `closed` 事件 payload */
export interface BoardFsClosedPayload extends BoardFsBasePayload {
  /** 关闭前的最终画板数据 */
  data: string;
  /** 关闭前的最终状态，主窗口据此恢复 */
  state: BoardBlockState;
}

// ---------------------------------------------------------------------------
// URL 构造与解析
// ---------------------------------------------------------------------------

/** 构造全屏窗口 URL 所需的参数 */
export interface BoardFullscreenUrlParams {
  /** 窗口 label */
  label: string;
  /** 初始状态（继承主窗口） */
  state: BoardBlockState;
  /** 当前主题标识，供子窗口复用 usePreviewTheme 同步 */
  theme: string;
}

/** 构造全屏窗口的加载 URL */
export function buildFullscreenUrl({ label, state, theme }: BoardFullscreenUrlParams): string {
  const query = new URLSearchParams({ label, state, theme });
  return `${BOARD_FULLSCREEN_ROUTE}?${query.toString()}`;
}

/**
 * 在子窗口中解析自身 URL 参数。
 *
 * label 缺失属于异常情况（非法直接访问），调用方需据此降级处理。
 */
export function parseFullscreenUrl(): { label: string; state: BoardBlockState } {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state') === 'editing' ? 'editing' : 'preview';
  return { label: params.get('label') ?? '', state };
}

/**
 * AI 对话持久化
 *
 * 对话可能携带整篇文档作为参考内容，体积远大于 AI 指令历史，
 * localStorage（约 5MB）容易写满，因此桌面端保存到应用数据目录的 JSON 文件
 * （tauri-plugin-store）；浏览器模式下回退到 localStorage。
 *
 * 写入做防抖：流式生成期间每个增量都会更新对话，不能每次都落盘。
 *
 * @changelog
 * | 版本   | 变更说明                    | 关联           |
 * | v1.0.0 | 初始实现：对话加载与防抖保存 | REQ: AI 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { load, type Store } from '@tauri-apps/plugin-store';

import type { AiConversation } from '@/types/ai';
import { isTauri } from '@/utils/platform';

/** 需要持久化的对话状态 */
export interface PersistedChatState {
  conversations: AiConversation[];
  openTabIds: string[];
  activeId: string | null;
}

const STORE_FILE = 'ai-chats.json';
const STORE_KEY = 'state';
const LOCAL_STORAGE_KEY = 'lanismd-ai-chats';
/** 保存防抖间隔（毫秒） */
const SAVE_DEBOUNCE_MS = 800;

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load(STORE_FILE, { defaults: {}, autoSave: false });
  return storePromise;
}

/** 校验并规范化读取到的数据，结构不符时返回 null */
function normalize(raw: unknown): PersistedChatState | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<PersistedChatState>;
  if (!Array.isArray(value.conversations)) return null;
  return {
    conversations: value.conversations.filter((c): c is AiConversation =>
      Boolean(c && typeof c.id === 'string' && Array.isArray(c.turns)),
    ),
    openTabIds: Array.isArray(value.openTabIds) ? value.openTabIds : [],
    activeId: typeof value.activeId === 'string' ? value.activeId : null,
  };
}

/** 读取已保存的对话状态；不存在或读取失败时返回 null */
export async function loadChatState(): Promise<PersistedChatState | null> {
  try {
    if (isTauri()) {
      const store = await getStore();
      return normalize(await store.get(STORE_KEY));
    }
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch (err) {
    console.error('[ai-chat] 读取对话记录失败', err);
    return null;
  }
}

async function writeChatState(state: PersistedChatState): Promise<void> {
  try {
    if (isTauri()) {
      const store = await getStore();
      await store.set(STORE_KEY, state);
      await store.save();
      return;
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('[ai-chat] 保存对话记录失败', err);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: PersistedChatState | null = null;

/** 防抖保存：短时间内多次调用只写入最后一次的状态 */
export function scheduleSaveChatState(state: PersistedChatState): void {
  pendingState = state;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const next = pendingState;
    pendingState = null;
    if (next) void writeChatState(next);
  }, SAVE_DEBOUNCE_MS);
}

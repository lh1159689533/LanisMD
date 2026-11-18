/**
 * AI 对话状态
 *
 * - conversations：全部对话（含历史），按需持久化（见 services/ai/chat-persistence.ts）
 * - openTabIds / activeId：对话面板中打开的 Tab 与当前 Tab
 * - drafts：各对话输入区的草稿（输入文本 + 待发送的参考内容），不持久化
 * - runningIds：正在生成回复的对话
 *
 * 空对话（尚未发送任何消息）只作为 Tab 存在，不进入历史、不持久化。
 *
 * @changelog
 * | 版本   | 变更说明                    | 关联           |
 * | v1.0.0 | 初始实现：对话、Tab 与草稿状态 | REQ: AI 对话框 |
 * | v1.1.0 | 对话启用技能                    | REQ: AI 技能   |
 * | v1.2.0 | 技能改为按消息启用（草稿级）    | REQ: AI 技能   |
 * | v1.3.0 | 历史对话由条数上限改为按保存天数清理 | REQ: AI 历史按时间保存 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { create } from 'zustand';

import { loadChatState, scheduleSaveChatState } from '@/services/ai/chat-persistence';
import { getHistoryCutoff, onRetentionDaysChange } from '@/services/ai/history-retention';
import type { AiChatAttachment, AiChatTurn, AiConversation } from '@/types/ai';

/** 输入区草稿 */
export interface AiChatDraft {
  input: string;
  attachments: AiChatAttachment[];
  /**
   * 本条消息启用的技能 id；undefined 表示使用默认技能（设置中「默认启用」的技能）。
   * 技能只对本次发送生效，发送后草稿清空即回到默认状态。
   */
  skillIds?: string[];
}

const EMPTY_DRAFT: AiChatDraft = { input: '', attachments: [] };

interface AiChatState {
  conversations: AiConversation[];
  openTabIds: string[];
  activeId: string | null;
  drafts: Record<string, AiChatDraft>;
  runningIds: Record<string, true>;
  /** 面板内历史侧栏是否展开 */
  historyOpen: boolean;
  /** 是否已从磁盘加载 */
  loaded: boolean;

  hydrate: () => Promise<void>;
  /** 新建对话并打开为当前 Tab，返回对话 id */
  createConversation: (modelId?: string) => string;
  /** 以给定消息新建对话（如从指令历史继续对话） */
  createConversationWithTurns: (title: string, turns: AiChatTurn[], modelId?: string) => string;
  /** 打开（或切换到）对话 Tab */
  openConversation: (id: string) => void;
  /** 关闭 Tab；空对话随之删除 */
  closeTab: (id: string) => void;
  setActive: (id: string) => void;
  /** 确保存在当前 Tab，返回其 id */
  ensureActive: (modelId?: string) => string;
  deleteConversation: (id: string) => void;
  /** 清空全部历史对话（正在生成的对话除外） */
  clearConversations: () => void;
  /** 清理超过保存天数的历史对话（打开中、生成中的除外） */
  pruneExpired: () => void;
  setModel: (id: string, modelId: string) => void;
  setTitle: (id: string, title: string) => void;
  /** 设置输入区草稿启用的技能 */
  setDraftSkills: (id: string, skillIds: string[]) => void;

  setDraftInput: (id: string, input: string) => void;
  /** 向对话草稿添加参考内容；同一文件的整篇文档只保留最新一份 */
  addAttachment: (id: string, attachment: AiChatAttachment) => void;
  removeAttachment: (id: string, attachmentId: string) => void;
  clearDraft: (id: string) => void;

  appendTurns: (id: string, turns: AiChatTurn[]) => void;
  updateTurn: (id: string, turnId: string, patch: Partial<AiChatTurn>) => void;
  removeTurn: (id: string, turnId: string) => void;
  setRunning: (id: string, running: boolean) => void;

  toggleHistory: () => void;
  setHistoryOpen: (open: boolean) => void;
}

function newConversation(modelId = '', title = '新对话', turns: AiChatTurn[] = []): AiConversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title,
    modelId,
    turns,
    createdAt: now,
    updatedAt: now,
  };
}

/** 修改单个对话并刷新更新时间 */
function patchConversation(
  list: AiConversation[],
  id: string,
  fn: (c: AiConversation) => Partial<AiConversation>,
  touch = true,
): AiConversation[] {
  return list.map((c) =>
    c.id === id ? { ...c, ...fn(c), ...(touch ? { updatedAt: Date.now() } : {}) } : c,
  );
}

/**
 * 丢弃超过保存天数（按最后更新时间）的对话。
 * 已打开的 Tab 与正在生成的对话不清理，避免用户眼前的内容突然消失。
 */
function dropExpired(
  list: AiConversation[],
  openIds: string[],
  runningIds: Record<string, true>,
): AiConversation[] {
  const cutoff = getHistoryCutoff();
  return list.filter((c) => c.updatedAt >= cutoff || openIds.includes(c.id) || runningIds[c.id]);
}

export const useAiChatStore = create<AiChatState>()((set, get) => ({
  conversations: [],
  openTabIds: [],
  activeId: null,
  drafts: {},
  runningIds: {},
  historyOpen: false,
  loaded: false,

  hydrate: async () => {
    if (get().loaded) return;
    const saved = await loadChatState();
    set((state) => {
      if (!saved) return { loaded: true };
      // 加载期间可能已新建了对话（例如启动后立即右键添加内容），与磁盘数据合并
      const existing = new Set(state.conversations.map((c) => c.id));
      const conversations = [
        ...state.conversations,
        ...saved.conversations
          // 上次退出时仍在生成的回复标记为已中断
          .map((c) => ({
            ...c,
            turns: c.turns.map((t) =>
              t.status === 'streaming' ? { ...t, status: 'canceled' as const } : t,
            ),
          }))
          .filter((c) => !existing.has(c.id)),
      ];
      const ids = new Set(conversations.map((c) => c.id));
      const openTabIds = [
        ...saved.openTabIds.filter((id) => ids.has(id) && !state.openTabIds.includes(id)),
        ...state.openTabIds,
      ];
      const activeId =
        state.activeId ?? (saved.activeId && ids.has(saved.activeId) ? saved.activeId : null);
      return {
        loaded: true,
        // 打开的 Tab 与当前对话不清理，因此 openTabIds / activeId 引用的对话都会保留
        conversations: dropExpired(
          conversations,
          activeId ? [...openTabIds, activeId] : openTabIds,
          state.runningIds,
        ),
        openTabIds,
        activeId: activeId ?? openTabIds[openTabIds.length - 1] ?? null,
      };
    });
  },

  createConversation: (modelId) => {
    const conversation = newConversation(modelId);
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      openTabIds: [...state.openTabIds, conversation.id],
      activeId: conversation.id,
    }));
    return conversation.id;
  },

  createConversationWithTurns: (title, turns, modelId) => {
    const conversation = newConversation(modelId, title, turns);
    set((state) => ({
      conversations: dropExpired(
        [conversation, ...state.conversations],
        [...state.openTabIds, conversation.id],
        state.runningIds,
      ),
      openTabIds: [...state.openTabIds, conversation.id],
      activeId: conversation.id,
      historyOpen: false,
    }));
    return conversation.id;
  },

  openConversation: (id) =>
    set((state) => {
      if (!state.conversations.some((c) => c.id === id)) return state;
      const openTabIds = state.openTabIds.includes(id)
        ? state.openTabIds
        : [...state.openTabIds, id];
      return { openTabIds, activeId: id };
    }),

  closeTab: (id) =>
    set((state) => {
      const index = state.openTabIds.indexOf(id);
      if (index < 0) return state;
      const openTabIds = state.openTabIds.filter((t) => t !== id);
      const activeId =
        state.activeId === id
          ? (openTabIds[Math.min(index, openTabIds.length - 1)] ?? null)
          : state.activeId;
      const target = state.conversations.find((c) => c.id === id);
      const isEmpty = target ? target.turns.length === 0 : false;
      const drafts = { ...state.drafts };
      if (isEmpty) delete drafts[id];
      return {
        openTabIds,
        activeId,
        drafts,
        conversations: isEmpty
          ? state.conversations.filter((c) => c.id !== id)
          : state.conversations,
      };
    }),

  setActive: (id) => set({ activeId: id }),

  ensureActive: (modelId) => {
    const { activeId, openTabIds } = get();
    if (activeId && openTabIds.includes(activeId)) return activeId;
    return get().createConversation(modelId);
  },

  deleteConversation: (id) =>
    set((state) => {
      if (state.runningIds[id]) return state;
      const openTabIds = state.openTabIds.filter((t) => t !== id);
      const drafts = { ...state.drafts };
      delete drafts[id];
      return {
        conversations: state.conversations.filter((c) => c.id !== id),
        openTabIds,
        drafts,
        activeId:
          state.activeId === id ? (openTabIds[openTabIds.length - 1] ?? null) : state.activeId,
      };
    }),

  clearConversations: () =>
    set((state) => {
      // 保留正在生成的对话与尚未发送消息的空 Tab
      const keep = state.conversations.filter(
        (c) => state.runningIds[c.id] || c.turns.length === 0,
      );
      const ids = new Set(keep.map((c) => c.id));
      const openTabIds = state.openTabIds.filter((id) => ids.has(id));
      return {
        conversations: keep,
        openTabIds,
        activeId:
          state.activeId && ids.has(state.activeId)
            ? state.activeId
            : (openTabIds[openTabIds.length - 1] ?? null),
      };
    }),

  setModel: (id, modelId) =>
    set((state) => ({
      conversations: patchConversation(state.conversations, id, () => ({ modelId }), false),
    })),

  pruneExpired: () =>
    set((state) => {
      const keepIds = state.activeId ? [...state.openTabIds, state.activeId] : state.openTabIds;
      const conversations = dropExpired(state.conversations, keepIds, state.runningIds);
      return conversations.length === state.conversations.length ? state : { conversations };
    }),

  setDraftSkills: (id, skillIds) =>
    set((state) => ({
      drafts: { ...state.drafts, [id]: { ...(state.drafts[id] ?? EMPTY_DRAFT), skillIds } },
    })),

  setTitle: (id, title) =>
    set((state) => ({
      conversations: patchConversation(state.conversations, id, () => ({ title }), false),
    })),

  setDraftInput: (id, input) =>
    set((state) => ({
      drafts: { ...state.drafts, [id]: { ...(state.drafts[id] ?? EMPTY_DRAFT), input } },
    })),

  addAttachment: (id, attachment) =>
    set((state) => {
      const draft = state.drafts[id] ?? EMPTY_DRAFT;
      const others =
        attachment.kind === 'document'
          ? draft.attachments.filter(
              (a) =>
                !(
                  a.kind === 'document' &&
                  a.filePath === attachment.filePath &&
                  a.fileName === attachment.fileName
                ),
            )
          : draft.attachments;
      return {
        drafts: { ...state.drafts, [id]: { ...draft, attachments: [...others, attachment] } },
      };
    }),

  removeAttachment: (id, attachmentId) =>
    set((state) => {
      const draft = state.drafts[id];
      if (!draft) return state;
      return {
        drafts: {
          ...state.drafts,
          [id]: { ...draft, attachments: draft.attachments.filter((a) => a.id !== attachmentId) },
        },
      };
    }),

  clearDraft: (id) => set((state) => ({ drafts: { ...state.drafts, [id]: EMPTY_DRAFT } })),

  appendTurns: (id, turns) =>
    set((state) => ({
      conversations: dropExpired(
        patchConversation(state.conversations, id, (c) => ({ turns: [...c.turns, ...turns] })),
        state.openTabIds,
        state.runningIds,
      ),
    })),

  updateTurn: (id, turnId, patch) =>
    set((state) => ({
      conversations: patchConversation(state.conversations, id, (c) => ({
        turns: c.turns.map((t) => (t.id === turnId ? { ...t, ...patch } : t)),
      })),
    })),

  removeTurn: (id, turnId) =>
    set((state) => ({
      conversations: patchConversation(state.conversations, id, (c) => ({
        turns: c.turns.filter((t) => t.id !== turnId),
      })),
    })),

  setRunning: (id, running) =>
    set((state) => {
      if (Boolean(state.runningIds[id]) === running) return state;
      const runningIds = { ...state.runningIds };
      if (running) runningIds[id] = true;
      else delete runningIds[id];
      return { runningIds };
    }),

  toggleHistory: () => set((state) => ({ historyOpen: !state.historyOpen })),
  setHistoryOpen: (open) => set({ historyOpen: open }),
}));

// 对话、Tab 变化时防抖落盘（空对话不保存）
useAiChatStore.subscribe((state, prev) => {
  if (!state.loaded) return;
  if (
    state.conversations === prev.conversations &&
    state.openTabIds === prev.openTabIds &&
    state.activeId === prev.activeId
  ) {
    return;
  }
  const conversations = state.conversations.filter((c) => c.turns.length > 0);
  const saved = new Set(conversations.map((c) => c.id));
  scheduleSaveChatState({
    conversations,
    openTabIds: state.openTabIds.filter((id) => saved.has(id)),
    activeId: state.activeId && saved.has(state.activeId) ? state.activeId : null,
  });
});

void useAiChatStore.getState().hydrate();

// 设置页调整保存天数后立即清理
onRetentionDaysChange(() => useAiChatStore.getState().pruneExpired());

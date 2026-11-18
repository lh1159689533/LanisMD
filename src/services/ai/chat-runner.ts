/**
 * AI 对话执行：发送消息、流式更新回复、停止与重新生成
 *
 * 每个对话持有独立的 AiSession，多个 Tab 可同时生成互不影响；
 * 会话生命周期（全局取消登记、过期事件丢弃、错误文案）复用 createAiSession。
 *
 * @changelog
 * | 版本   | 变更说明                        | 关联           |
 * | v1.0.0 | 初始实现：对话发送、停止与重试 | REQ: AI 对话框 |
 * | v1.1.0 | 请求附带对话启用的技能         | REQ: AI 技能   |
 * | v1.2.0 | 技能提醒；记录消息实际使用的技能 | REQ: AI 技能   |
 * | v1.3.0 | 记录思考耗时                     | REQ: AI 技能   |
 * | v1.4.0 | 技能按消息生效，发送后恢复默认   | REQ: AI 技能   |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useAiChatStore } from '@/stores/ai-chat-store';
import { useFileStore } from '@/stores/file-store';
import { useUIStore } from '@/stores/ui-store';
import type {
  AiChatActionId,
  AiChatAttachment,
  AiChatAttachmentKind,
  AiChatTurn,
} from '@/types/ai';

import {
  buildChatMessages,
  chatGenerationFor,
  deriveConversationTitle,
  getChatAction,
} from './chat';
import { resolveAiRuntime, type AiRuntime, type AiRuntimeUnavailableReason } from './runtime';
import { createAiSession, type AiSession } from './session';
import { defaultSkillIds, renderSkillsPrompt, renderSkillsReminder, resolveSkills } from './skills';

/** 单个参考内容的最大保存长度（字符），超出部分截断 */
const MAX_ATTACHMENT_CHARS = 120_000;

/** 对话 id -> 进行中的会话 */
const sessions = new Map<string, AiSession>();

const UNAVAILABLE_MESSAGES: Record<AiRuntimeUnavailableReason, string> = {
  disabled: 'AI 助手未启用，请前往 设置 -> AI 助手 开启',
  no_model: '尚未配置模型，请前往 设置 -> AI 助手 添加模型',
  no_key: '所选模型的 API Key 不可用，请前往 设置 -> AI 助手 检查',
};

/** 轻提示（自动消失） */
function notify(message: string): void {
  useUIStore.getState().addToast({ type: 'info', message });
}

function findConversation(id: string) {
  return useAiChatStore.getState().conversations.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// 参考内容
// ---------------------------------------------------------------------------

/**
 * 把编辑器中的内容添加到当前对话（必要时新建对话），并打开对话面板。
 *
 * @param kind - selection：选中片段；document：整篇文档
 * @param content - Markdown 内容
 */
export function attachToChat(kind: AiChatAttachmentKind, content: string): void {
  if (!content.trim()) {
    notify(kind === 'document' ? '当前文档为空' : '选中内容为空');
    return;
  }
  const file = useFileStore.getState().currentFile;
  const truncated = content.length > MAX_ATTACHMENT_CHARS;
  const attachment: AiChatAttachment = {
    id: crypto.randomUUID(),
    kind,
    fileName: file?.fileName || '未命名',
    filePath: file?.filePath ?? null,
    content: truncated ? content.slice(0, MAX_ATTACHMENT_CHARS) : content,
    truncated: truncated || undefined,
  };

  const store = useAiChatStore.getState();
  const id = store.ensureActive();
  store.addAttachment(id, attachment);
  store.setHistoryOpen(false);
  useUIStore.getState().openAiChat();
  if (truncated) notify('内容过长，已截取前 12 万字作为参考');
}

// ---------------------------------------------------------------------------
// 发送与生成
// ---------------------------------------------------------------------------

/**
 * 解析对话使用的模型；不可用时提示原因（附「前往设置」）并返回 null。
 * 所选模型已被删除时会回退到当前模型，并同步回对话，避免界面与实际不一致。
 */
async function prepareRuntime(conversationId: string): Promise<AiRuntime | null> {
  const conversation = findConversation(conversationId);
  if (!conversation) return null;
  const result = await resolveAiRuntime(conversation.modelId || undefined);
  if (!result.ok) {
    useUIStore.getState().addToast({
      type: 'warning',
      message: UNAVAILABLE_MESSAGES[result.reason],
      actions: [
        {
          label: '前往设置',
          primary: true,
          onClick: () => useUIStore.getState().openSettings('ai'),
        },
      ],
    });
    return null;
  }
  if (conversation.modelId !== result.runtime.profileId) {
    useAiChatStore.getState().setModel(conversationId, result.runtime.profileId);
  }
  return result.runtime;
}

/**
 * 在发起请求前占用对话（标记为生成中），防止解析模型的异步间隙内重复发送；
 * 返回 false 表示对话已在生成。
 */
function acquire(conversationId: string): boolean {
  const store = useAiChatStore.getState();
  if (store.runningIds[conversationId]) return false;
  store.setRunning(conversationId, true);
  return true;
}

function release(conversationId: string): void {
  sessions.delete(conversationId);
  useAiChatStore.getState().setRunning(conversationId, false);
}

/** 为对话中最后一条用户消息生成回复（调用方需已 acquire） */
async function generateReply(conversationId: string, runtime: AiRuntime): Promise<void> {
  const conversation = findConversation(conversationId);
  const lastUser = conversation && [...conversation.turns].reverse().find((t) => t.role === 'user');
  if (!conversation || !lastUser) {
    release(conversationId);
    return;
  }

  const generation = chatGenerationFor(lastUser);
  // 技能只对所属的那条提问生效；重新生成时沿用该提问当时启用的技能
  const skills = resolveSkills(lastUser.skillIds);
  const messages = buildChatMessages(
    conversation.turns,
    runtime.contextLength,
    generation.maxTokens,
    {
      prompt: renderSkillsPrompt(skills),
      reminder: renderSkillsReminder(skills),
    },
  );
  const skillNames = skills.length > 0 ? skills.map((s) => s.name) : undefined;

  const reply: AiChatTurn = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    status: 'streaming',
    modelName: runtime.name,
    skillNames,
    createdAt: Date.now(),
  };
  useAiChatStore.getState().appendTurns(conversationId, [reply]);

  const update = (patch: Partial<AiChatTurn>) =>
    useAiChatStore.getState().updateTurn(conversationId, reply.id, patch);

  let reasoning = '';
  let reasoningMs: number | undefined;
  /** 有思考内容时，在输出第一段正文（或结束）时记录思考耗时 */
  const markReasoningEnd = (): Partial<AiChatTurn> => {
    if (!reasoning || reasoningMs !== undefined) return {};
    reasoningMs = Date.now() - reply.createdAt;
    return { reasoningMs };
  };
  const session = createAiSession(runtime, {
    onDelta: (_delta, full) => update({ content: full, ...markReasoningEnd() }),
    onReasoning: (delta) => {
      reasoning += delta;
      update({ reasoning });
    },
    onDone: (full, _info, usage) => {
      release(conversationId);
      update({ content: full, status: 'done', usage, ...markReasoningEnd() });
    },
    onError: (message) => {
      release(conversationId);
      update({ status: 'error', error: message });
    },
    onCanceled: () => {
      release(conversationId);
      update({ status: 'canceled' });
    },
  });

  sessions.set(conversationId, session);
  await session.start(messages, generation);
}

/**
 * 发送一条用户消息（携带草稿中的参考内容）并生成回复。
 *
 * @param actionId - 快捷操作；不传为普通提问
 */
export async function sendChatMessage(
  conversationId: string,
  text: string,
  actionId?: AiChatActionId,
): Promise<void> {
  const store = useAiChatStore.getState();
  const conversation = findConversation(conversationId);
  if (!conversation || store.runningIds[conversationId]) return;

  const draft = store.drafts[conversationId];
  const attachments = draft?.attachments ?? [];
  const skills = resolveSkills(draft?.skillIds ?? defaultSkillIds());
  const input = text.trim();
  const action = getChatAction(actionId);

  if (!action) {
    if (!input) {
      notify('请输入问题，或点击上方的快捷操作');
      return;
    }
  } else if (
    attachments.length === 0 &&
    !hasPriorContext(conversationId) &&
    !(action.allowDescriptionOnly && input)
  ) {
    notify(
      action.allowDescriptionOnly
        ? `请输入描述，或在文档中右键添加内容后再「${action.label}」`
        : `请先在文档中右键添加内容，再使用「${action.label}」`,
    );
    return;
  }

  if (!acquire(conversationId)) return;
  const runtime = await prepareRuntime(conversationId);
  if (!runtime) {
    // 模型不可用时保留草稿，便于用户修正设置后直接重发
    release(conversationId);
    return;
  }

  const turn: AiChatTurn = {
    id: crypto.randomUUID(),
    role: 'user',
    content: input,
    attachments: attachments.length > 0 ? attachments : undefined,
    actionId,
    skillIds: skills.length > 0 ? skills.map((s) => s.id) : undefined,
    skillNames: skills.length > 0 ? skills.map((s) => s.name) : undefined,
    createdAt: Date.now(),
  };
  if (conversation.turns.length === 0) {
    store.setTitle(conversationId, deriveConversationTitle(turn));
  }
  store.appendTurns(conversationId, [turn]);
  store.clearDraft(conversationId);
  await generateReply(conversationId, runtime);
}

/** 对话中是否已有可供快捷操作引用的内容（之前添加过参考内容或有过回复） */
function hasPriorContext(conversationId: string): boolean {
  const conversation = findConversation(conversationId);
  return Boolean(
    conversation?.turns.some(
      (t) => (t.attachments?.length ?? 0) > 0 || (t.role === 'assistant' && t.content.trim()),
    ),
  );
}

/** 停止生成 */
export function stopChat(conversationId: string): void {
  sessions.get(conversationId)?.cancel();
}

/** 重新生成最后一条回复（最后一条是未得到回复的提问时直接生成） */
export async function regenerateLastReply(conversationId: string): Promise<void> {
  if (!acquire(conversationId)) return;
  const runtime = await prepareRuntime(conversationId);
  const conversation = findConversation(conversationId);
  const last = conversation?.turns[conversation.turns.length - 1];
  if (!runtime || !last) {
    release(conversationId);
    return;
  }
  if (last.role === 'assistant') useAiChatStore.getState().removeTurn(conversationId, last.id);
  await generateReply(conversationId, runtime);
}

/**
 * AI 对话：快捷操作定义与请求消息构造（纯函数，无 IO）
 *
 * - 快捷操作：翻译、解释、润色、总结、生成图表、生成公式，作用于用户添加的参考内容
 * - 消息构造：system + 历史消息；参考内容以带标签的引用块拼入所属的用户消息
 * - 上下文裁剪：始终保留最新一轮，从新到旧回填历史消息直到触达预算，
 *   避免长对话或整篇文档超出模型上下文窗口
 *
 * @changelog
 * | 版本   | 变更说明                                  | 关联            |
 * | v1.0.0 | 初始实现：快捷操作、消息构造与上下文裁剪 | REQ: AI 对话框  |
 * | v1.1.0 | 上下文用量估算                            | REQ: AI 对话框  |
 * | v1.2.0 | system prompt 支持附加技能指令            | REQ: AI 技能    |
 * | v1.3.0 | 最新用户消息附加技能提醒                  | REQ: AI 技能    |
 * | v1.4.0 | 提问复制文本（含技能、引用、操作）        | REQ: AI 对话框  |
 * /@changelog
 *
 * @author hhhuilli
 */

import type {
  AiChatActionId,
  AiChatAttachment,
  AiChatMessage,
  AiChatTurn,
  AiGeneration,
} from '@/types/ai';

import { DEFAULT_GENERATION, proportionalOutput } from './generation';
import { DEFAULT_CONTEXT_LENGTH, estimateTokens, keepHead } from './token-budget';

// ---------------------------------------------------------------------------
// 快捷操作
// ---------------------------------------------------------------------------

/** 对话快捷操作 */
export interface AiChatAction {
  id: AiChatActionId;
  label: string;
  /** 发送给模型的指令 */
  instruction: string;
  /** 输出相对参考内容的膨胀倍数（用于估算输出上限） */
  outputFactor: number;
  temperature: number;
  /** 无参考内容时是否允许仅凭输入描述执行（如生成图表、公式） */
  allowDescriptionOnly: boolean;
}

export const AI_CHAT_ACTIONS: AiChatAction[] = [
  {
    id: 'translate',
    label: '翻译',
    instruction:
      '请翻译参考内容：中文译为英文，其他语言译为中文。保留原有 Markdown 格式，代码、链接地址与公式保持原样。只输出译文。',
    outputFactor: 3,
    temperature: 0.3,
    allowDescriptionOnly: false,
  },
  {
    id: 'explain',
    label: '解释',
    instruction:
      '请用通俗易懂、简洁的中文解释参考内容。如果是代码，解释它做什么；如果是概念，解释它是什么，并结合上下文语境。',
    outputFactor: 1,
    temperature: 0.5,
    allowDescriptionOnly: false,
  },
  {
    id: 'polish',
    label: '润色',
    instruction:
      '请润色参考内容：保持原意，让表达更通顺自然。保留原有 Markdown 标记与结构。只输出润色后的内容，不要解释。',
    outputFactor: 1.5,
    temperature: 0.5,
    allowDescriptionOnly: false,
  },
  {
    id: 'summarize',
    label: '总结',
    instruction: '请提炼参考内容的核心要点，用简洁的条目列出，最后用一句话概括。',
    outputFactor: 0.6,
    temperature: 0.4,
    allowDescriptionOnly: false,
  },
  {
    id: 'mermaid',
    label: '生成图表',
    instruction:
      '请根据参考内容（或描述）生成一个最合适的 Mermaid 图表，放在 ```mermaid 代码块中输出。节点文本含括号、引号等特殊字符时用双引号包裹。代码块之后可用一两句话说明图表含义。',
    outputFactor: 1,
    temperature: 0.2,
    allowDescriptionOnly: true,
  },
  {
    id: 'latex',
    label: '生成公式',
    instruction:
      '请根据参考内容（或描述）写出对应的 LaTeX 数学公式，使用 $$ 包裹为块级公式输出，确保可被 KaTeX 渲染。公式之后可用一两句话说明各符号含义。',
    outputFactor: 1,
    temperature: 0.2,
    allowDescriptionOnly: true,
  },
];

/** 按 id 取快捷操作 */
export function getChatAction(id?: AiChatActionId): AiChatAction | undefined {
  return id ? AI_CHAT_ACTIONS.find((a) => a.id === id) : undefined;
}

// ---------------------------------------------------------------------------
// 消息构造
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  '你是 LanisMD（Markdown 编辑器）内置的写作助手，帮助用户阅读、理解和改进文档。',
  '用户可能附带文档中的片段或整篇文档作为参考内容，参考内容位于「参考内容」标记之间。',
  '回答使用简体中文（除非用户要求或任务需要其他语言），使用 Markdown 排版；',
  '数学公式使用 $...$ 或 $$...$$，图表使用 ```mermaid 代码块。',
].join('\n');

/** 发送请求时的技能上下文（见 services/ai/skills.ts） */
export interface ChatSkillContext {
  /** 放入 system prompt 的技能指令 */
  prompt: string;
  /** 附加在最新用户消息末尾的提醒 */
  reminder: string;
}

/** 组合 system prompt：基础提示 + 启用的技能指令 */
export function buildSystemPrompt(skillsPrompt = ''): string {
  return skillsPrompt ? `${SYSTEM_PROMPT}\n\n${skillsPrompt}` : SYSTEM_PROMPT;
}

/** 单个参考内容的标签 */
export function attachmentLabel(att: AiChatAttachment): string {
  return att.kind === 'document' ? `整篇文档《${att.fileName}》` : `《${att.fileName}》中的片段`;
}

/** 把参考内容渲染为引用块；`maxTokens` 用于对超长内容截断 */
function renderAttachment(att: AiChatAttachment, index: number, maxTokens?: number): string {
  let content = att.content;
  let truncated = att.truncated ?? false;
  if (maxTokens !== undefined) {
    const head = keepHead(content, maxTokens);
    content = head.text;
    truncated = truncated || head.truncated;
  }
  const note = truncated ? '\n……（内容过长，后文已省略）' : '';
  return `---参考内容 ${index + 1}：${attachmentLabel(att)}---\n${content}${note}\n---参考内容 ${index + 1} 结束---`;
}

/** 渲染一条用户消息的完整文本（参考内容 + 操作指令 + 输入） */
function renderUserTurn(turn: AiChatTurn, attachmentBudget?: number): string {
  const parts: string[] = [];
  const attachments = turn.attachments ?? [];
  const perAttachment =
    attachmentBudget !== undefined && attachments.length > 0
      ? Math.floor(attachmentBudget / attachments.length)
      : undefined;
  attachments.forEach((att, i) => parts.push(renderAttachment(att, i, perAttachment)));

  const action = getChatAction(turn.actionId);
  if (action) {
    // 本条消息未附带参考内容时，快捷操作作用于上文（之前的参考内容或回复）
    parts.push(
      attachments.length > 0
        ? action.instruction
        : action.instruction.replace(/参考内容/g, '上文内容'),
    );
  }
  if (turn.content.trim()) parts.push(action ? `补充要求：${turn.content}` : turn.content);
  return parts.join('\n\n');
}

/** 消息是否应进入请求上下文（失败、取消且无内容的助手消息会被跳过） */
function isUsableTurn(turn: AiChatTurn): boolean {
  if (turn.role === 'user') return true;
  return turn.status !== 'streaming' && turn.content.trim().length > 0;
}

/**
 * 由对话消息构造请求消息，按模型上下文窗口裁剪。
 *
 * 最新一条用户消息必定保留：其参考内容超出预算时截断；更早的消息从新到旧回填，
 * 放不下时整体丢弃更早的部分（不在单条消息中间截断，避免语义残缺）。
 *
 * @param turns - 截至最新用户消息的全部消息（不含正在生成的助手消息）
 * @param skills - 启用技能的指令与提醒；技能指令始终完整保留
 */
export function buildChatMessages(
  turns: AiChatTurn[],
  contextLength: number | undefined,
  maxOutputTokens: number,
  skills?: ChatSkillContext,
): AiChatMessage[] {
  const usable = turns.filter(isUsableTurn);
  const windowSize = contextLength && contextLength > 0 ? contextLength : DEFAULT_CONTEXT_LENGTH;
  const system = buildSystemPrompt(skills?.prompt);
  const reminder = skills?.reminder ? `\n\n${skills.reminder}` : '';
  let budget = windowSize - maxOutputTokens - estimateTokens(system + reminder) - 200;

  const last = usable[usable.length - 1];
  const history: AiChatMessage[] = [];
  if (last) {
    let text = renderUserTurn(last);
    let cost = estimateTokens(text);
    if (cost > budget) {
      // 给指令与输入预留空间，剩余全部分给参考内容
      const reserved = estimateTokens(renderUserTurn({ ...last, attachments: [] })) + 100;
      text = renderUserTurn(last, Math.max(budget - reserved, 200));
      cost = estimateTokens(text);
    }
    budget -= cost;
    history.push({ role: last.role, content: text + reminder });
  }

  for (let i = usable.length - 2; i >= 0; i--) {
    const turn = usable[i];
    const content = turn.role === 'user' ? renderUserTurn(turn) : turn.content;
    const cost = estimateTokens(content);
    if (cost > budget) break;
    budget -= cost;
    history.unshift({ role: turn.role, content });
  }

  // 首条必须是用户消息，避免部分服务商拒绝以 assistant 开头的上下文
  while (history.length > 0 && history[0].role !== 'user') history.shift();

  return [{ role: 'system', content: system }, ...history];
}

// ---------------------------------------------------------------------------
// 上下文用量
// ---------------------------------------------------------------------------

/** 上下文用量（输入区的用量指示器使用） */
export interface ChatContextUsage {
  /** 已使用（含待发送草稿）的 token 数 */
  used: number;
  /** 上下文窗口大小 */
  limit: number;
  /** 模型配置是否声明了上下文长度（未声明时按默认值估算） */
  limitDeclared: boolean;
}

/** 单条消息的 token 估算缓存：消息对象不可变，流式更新只会替换正在生成的那一条 */
const turnTokenCache = new WeakMap<AiChatTurn, number>();

function turnTokens(turn: AiChatTurn): number {
  const cached = turnTokenCache.get(turn);
  if (cached !== undefined) return cached;
  const tokens = estimateTokens(turn.role === 'user' ? renderUserTurn(turn) : turn.content);
  turnTokenCache.set(turn, tokens);
  return tokens;
}

/**
 * 估算对话已占用的上下文（不含草稿）。
 *
 * 优先以最近一条带用量的回复为基准：服务商返回的输入 token 加上回复正文（思考过程不会再次发送），
 * 其后的消息按字数估算；没有用量时整体估算。
 *
 * @param skillsPrompt - 启用的技能指令；有用量基准时视为已包含在输入 token 中
 */
export function estimateTurnsTokens(turns: AiChatTurn[], skillsPrompt = ''): number {
  const usable = turns.filter(isUsableTurn);
  let anchor = -1;
  for (let i = usable.length - 1; i >= 0; i--) {
    if (usable[i].role === 'assistant' && usable[i].usage) {
      anchor = i;
      break;
    }
  }

  let total: number;
  let start: number;
  if (anchor >= 0) {
    total = usable[anchor].usage!.promptTokens + turnTokens(usable[anchor]);
    start = anchor + 1;
  } else {
    // 尚未发送时也计入技能指令，让用户在发送前就能看到技能占用的上下文
    total = usable.length > 0 || skillsPrompt ? estimateTokens(buildSystemPrompt(skillsPrompt)) : 0;
    start = 0;
  }
  for (let i = start; i < usable.length; i++) total += turnTokens(usable[i]);
  // 正在生成的回复也计入（isUsableTurn 会跳过它）
  const streaming = turns.find((t) => t.status === 'streaming');
  if (streaming) total += estimateTokens(streaming.content);
  return total;
}

/** 估算待发送草稿（输入 + 参考内容）占用的 token */
export function estimateDraftTokens(input: string, attachments: AiChatAttachment[]): number {
  if (!input.trim() && attachments.length === 0) return 0;
  return estimateTokens(
    renderUserTurn({ id: '', role: 'user', content: input.trim(), attachments, createdAt: 0 }),
  );
}

/** 组合为上下文用量；`contextLength` 为模型配置声明的窗口（0 / 未声明时按默认值） */
export function toContextUsage(used: number, contextLength?: number): ChatContextUsage {
  const declared = Boolean(contextLength && contextLength > 0);
  return {
    used,
    limit: declared ? contextLength! : DEFAULT_CONTEXT_LENGTH,
    limitDeclared: declared,
  };
}

/** 本轮生成参数：按快捷操作与参考内容长度估算 */
export function chatGenerationFor(turn: AiChatTurn): AiGeneration {
  const action = getChatAction(turn.actionId);
  const reference = (turn.attachments ?? []).map((a) => a.content).join('\n');
  const estimated = proportionalOutput(reference, action?.outputFactor ?? 1);
  return {
    temperature: action?.temperature ?? DEFAULT_GENERATION.temperature,
    maxTokens: Math.max(estimated, DEFAULT_GENERATION.maxTokens),
  };
}

// ---------------------------------------------------------------------------
// 复制
// ---------------------------------------------------------------------------

/** 复制时引用片段的最大长度（字符），整篇文档只复制文件名 */
const COPY_SELECTION_MAX = 2000;

/**
 * 提问的复制文本：技能、引用、快捷操作与正文一并复制。
 *
 * 选中片段以引用块附带内容；整篇文档可能很长，只写文件名。
 */
export function formatUserTurnForCopy(turn: AiChatTurn): string {
  const lines: string[] = [];
  if (turn.skillNames?.length) lines.push(`技能：${turn.skillNames.join('、')}`);
  for (const att of turn.attachments ?? []) {
    if (att.kind === 'document') {
      lines.push(`引用：${att.fileName}（整篇文档）`);
      continue;
    }
    lines.push(`引用：${att.fileName}（片段）`);
    const chars = Array.from(att.content);
    const body =
      chars.length > COPY_SELECTION_MAX
        ? `${chars.slice(0, COPY_SELECTION_MAX).join('')}…`
        : att.content;
    lines.push(
      body
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n'),
    );
  }
  const action = getChatAction(turn.actionId);
  if (action) lines.push(`操作：${action.label}`);
  const head = lines.join('\n');
  const text = turn.content.trim();
  return [head, text].filter(Boolean).join('\n\n');
}

// ---------------------------------------------------------------------------
// 标题
// ---------------------------------------------------------------------------

/** 标题最大长度（字符） */
const TITLE_MAX_LENGTH = 24;

/** 由首条用户消息生成对话标题 */
export function deriveConversationTitle(turn: AiChatTurn): string {
  const action = getChatAction(turn.actionId);
  const text = turn.content.replace(/\s+/g, ' ').trim();
  const firstAttachment = turn.attachments?.[0];

  let title: string;
  if (action) {
    let target = text;
    if (!target && firstAttachment) {
      target =
        firstAttachment.kind === 'document'
          ? firstAttachment.fileName
          : firstAttachment.content.replace(/\s+/g, ' ');
    }
    title = target ? `${action.label}：${target}` : action.label;
  } else if (text) {
    title = text;
  } else if (firstAttachment) {
    title = attachmentLabel(firstAttachment);
  } else {
    title = '新对话';
  }
  const chars = Array.from(title);
  return chars.length > TITLE_MAX_LENGTH ? `${chars.slice(0, TITLE_MAX_LENGTH).join('')}…` : title;
}

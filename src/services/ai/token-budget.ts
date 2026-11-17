/**
 * AI 请求的 token 预算工具（纯函数，无 IO）
 *
 * 目的：防止「完整文档上下文」等场景把整篇长文档塞进 prompt，超出模型上下文窗口。
 * 不引入真实 tokenizer（体积大且各家不同），用保守估算：
 * - CJK 字符约 1 token / 字（多数中文模型实际 0.6~0.8，此处取上界）
 * - 其他字符约 1 token / 3.5 字符
 *
 * @changelog
 * | 版本   | 变更说明                        | 关联                               |
 * | v1.0.0 | 初始实现：token 估算与上下文裁剪 | REQ: AI 功能修复#5 TECH: 本文件头 |
 * /@changelog
 *
 * @author hhhuilli
 */

/** 配置文件未声明 contextLength 时的保守默认值 */
export const DEFAULT_CONTEXT_LENGTH = 16000;

/** 单次文档上下文的绝对上限：即使模型窗口很大，也不必把超长文档全部发送（成本与延迟） */
export const DOC_CONTEXT_TOKEN_CAP = 16000;

/** system prompt 模板、角色标记等固定开销的预留 */
const PROMPT_OVERHEAD_TOKENS = 800;

/** 文档上下文可用 token 低于该值时不再附带文档上下文 */
const MIN_USEFUL_CONTEXT_TOKENS = 200;

const CJK_RE = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** 估算单个字符的 token 数 */
function charTokens(ch: string): number {
  return CJK_RE.test(ch) ? 1 : 1 / 3.5;
}

/** 估算文本的 token 数（向上取整） */
export function estimateTokens(text: string): number {
  let total = 0;
  for (const ch of text) total += charTokens(ch);
  return Math.ceil(total);
}

/**
 * 计算可分配给「文档上下文」的 token 预算。
 *
 * 预算 = min(模型窗口 - 输出预留 - 固定开销 - 选区占用, DOC_CONTEXT_TOKEN_CAP)
 * 返回 0 表示空间不足，不应附带文档上下文。
 */
export function computeContextBudget(params: {
  contextLength?: number;
  maxOutputTokens?: number;
  reservedText?: string;
}): number {
  const windowSize =
    params.contextLength && params.contextLength > 0
      ? params.contextLength
      : DEFAULT_CONTEXT_LENGTH;
  const output = params.maxOutputTokens ?? 2000;
  const reserved = params.reservedText ? estimateTokens(params.reservedText) : 0;
  const budget = Math.min(
    windowSize - output - PROMPT_OVERHEAD_TOKENS - reserved,
    DOC_CONTEXT_TOKEN_CAP,
  );
  return budget >= MIN_USEFUL_CONTEXT_TOKENS ? budget : 0;
}

/**
 * 保留文本末尾不超过 `maxTokens` 的部分（用于选区之前的内容：越靠近选区越重要）。
 * 截断点向后对齐到换行，避免从半句话开始。
 */
export function keepTail(text: string, maxTokens: number): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= maxTokens) return { text, truncated: false };
  const chars = Array.from(text);
  let used = 0;
  let start = chars.length;
  while (start > 0) {
    const cost = charTokens(chars[start - 1]);
    if (used + cost > maxTokens) break;
    used += cost;
    start--;
  }
  let result = chars.slice(start).join('');
  const nl = result.indexOf('\n');
  if (nl >= 0 && nl < result.length - 1) result = result.slice(nl + 1);
  return { text: result, truncated: true };
}

/**
 * 保留文本开头不超过 `maxTokens` 的部分（用于选区之后的内容）。
 * 截断点向前对齐到换行，避免停在半句话。
 */
export function keepHead(text: string, maxTokens: number): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= maxTokens) return { text, truncated: false };
  const chars = Array.from(text);
  let used = 0;
  let end = 0;
  while (end < chars.length) {
    const cost = charTokens(chars[end]);
    if (used + cost > maxTokens) break;
    used += cost;
    end++;
  }
  let result = chars.slice(0, end).join('');
  const nl = result.lastIndexOf('\n');
  if (nl > 0) result = result.slice(0, nl);
  return { text: result, truncated: true };
}

/**
 * 在预算内拼装「选区前文 + 位置标记 + 选区后文」。
 *
 * 分配策略：前文优先拿 60%，后文 40%；任一侧用不完的额度让给另一侧。
 */
export function fitSurroundingContext(params: {
  before: string;
  after: string;
  marker: string;
  budget: number;
}): string {
  const { before, after, marker, budget } = params;
  const beforeCost = estimateTokens(before);
  const afterCost = estimateTokens(after);

  let beforeBudget = Math.floor(budget * 0.6);
  let afterBudget = budget - beforeBudget;
  if (beforeCost < beforeBudget) {
    afterBudget += beforeBudget - beforeCost;
    beforeBudget = beforeCost;
  } else if (afterCost < afterBudget) {
    beforeBudget += afterBudget - afterCost;
    afterBudget = afterCost;
  }

  const head = keepTail(before, beforeBudget);
  const tail = keepHead(after, afterBudget);

  const parts: string[] = [];
  if (head.truncated) parts.push('……（前文已省略）');
  if (head.text) parts.push(head.text);
  parts.push(marker);
  if (tail.text) parts.push(tail.text);
  if (tail.truncated) parts.push('……（后文已省略）');
  return parts.join('\n\n');
}

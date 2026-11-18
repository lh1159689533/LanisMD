/**
 * 对话消息的应用内剪贴板
 *
 * 系统剪贴板只能放纯文本，技能、引用等标签会丢失。复制提问时在内存中记住
 * 「复制出的文本 -> 原消息」，粘贴到对话输入框时若剪贴板文本与之一致，
 * 就还原为标签 + 正文；粘贴到其他应用时仍是可读的纯文本。
 *
 * @changelog
 * | 版本   | 变更说明                          | 关联           |
 * | v1.0.0 | 初始实现：复制提问后粘贴还原引用 | REQ: AI 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { AiChatTurn } from '@/types/ai';

let lastCopied: { text: string; turn: AiChatTurn } | null = null;

/** 统一换行与首尾空白，避免系统剪贴板改写换行导致比对失败 */
function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n').trim();
}

/** 复制提问：写入系统剪贴板，并记住对应的消息 */
export async function copyUserTurn(turn: AiChatTurn, text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  lastCopied = { text: normalize(text), turn };
}

/** 粘贴时查找对应的消息；剪贴板内容已被其他复制覆盖时返回 null */
export function matchCopiedTurn(pasted: string): AiChatTurn | null {
  if (!lastCopied || !pasted) return null;
  return normalize(pasted) === lastCopied.text ? lastCopied.turn : null;
}

/**
 * 组装一次指令的 prompt 输入：选区 + 写作背景 + 标题 + （按需）完整文档
 *
 * 各入口（右键、浮层、斜杠弹窗、快捷键）共用，保证同一指令在不同入口拿到相同的上下文。
 *
 * @changelog
 * | 版本   | 变更说明                    | 关联                    |
 * | v1.0.0 | 初始实现：统一 prompt 输入 | REQ: AI 体验短板-上下文 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { AiRuntime } from '@/services/ai/runtime';
import type { AiCommand, AiPromptInput } from '@/types/ai';

import type { AiRunContext } from '../types';
import { buildDocumentContext } from './document';
import { resolveDocumentTitle } from './writing-context';

export function buildPromptInput(
  target: Omit<AiRunContext, 'command'>,
  command: AiCommand,
  runtime: AiRuntime,
  extra?: Partial<AiPromptInput>,
  withDocumentContext = false,
): AiPromptInput {
  const input: AiPromptInput = {
    selection: target.selection,
    context: target.context,
    title: resolveDocumentTitle(target.view),
    ...extra,
  };
  if (withDocumentContext || command.needsDocument) {
    // 预算不足时返回 undefined，prompt 自动退化为不带文档的模式
    input.fullDocument = buildDocumentContext(
      target.view,
      target.from,
      target.to,
      target.selection,
      runtime,
    );
  }
  return input;
}

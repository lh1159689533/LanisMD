/**
 * 自定义指令：把设置中的 CustomPrompt 转换为 AiCommand
 *
 * 此前转换逻辑写在斜杠菜单内部，只能从斜杠菜单使用。现在自定义指令可以出现在
 * 斜杠菜单 / 划词浮层 / 右键菜单，统一由这里解析。
 *
 * 兼容性：模板未使用任何变量的旧指令保持原有行为——system 为模板原文，
 * user 消息依次取「输入描述 > 选中内容 > 写作背景 > 默认提示」。
 *
 * @changelog
 * | 版本   | 变更说明                                                  | 关联                         |
 * | v1.0.0 | 从 slash-menu 抽出；支持模板变量、插入方式、位置与生成参数 | REQ: AI 体验短板-自定义指令 |
 * | v1.1.0 | 图标统一为 AI 助手指令弹窗图标                             | REQ: AI 图标统一            |
 * /@changelog
 *
 * @author hhhuilli
 */

import { aiIconSvg } from '@/constants/ai-icon';
import { useSettingsStore } from '@/stores/settings-store';
import type {
  AiChatMessage,
  AiCommand,
  AiGeneration,
  AiPromptInput,
  CustomPrompt,
  CustomPromptPlacement,
} from '@/types/ai';

import { DEFAULT_GENERATION, MAX_OUTPUT_TOKENS } from './generation';
import { collectTemplateVariables, renderTemplate, type TemplateVariable } from './prompt-template';

/** 自定义指令在 AiCommand.id 中的前缀，避免与内置指令重名 */
export const CUSTOM_COMMAND_PREFIX = 'custom_';

/** 旧配置未声明位置时的默认值 */
const DEFAULT_PLACEMENTS: CustomPromptPlacement[] = ['slash'];

/** 温度取值范围 */
export const TEMPERATURE_RANGE = { min: 0, max: 2 } as const;

/** AI 图标（全局统一，见 constants/ai-icon.ts） */
const ICON_CUSTOM = aiIconSvg(16);

/** 读取设置中的全部自定义指令 */
export function getCustomPrompts(): CustomPrompt[] {
  return useSettingsStore.getState().config.ai?.customPrompts ?? [];
}

/** 指令的实际出现位置（兼容旧配置） */
export function placementsOf(prompt: CustomPrompt): CustomPromptPlacement[] {
  return prompt.placements && prompt.placements.length > 0 ? prompt.placements : DEFAULT_PLACEMENTS;
}

/** 出现在指定位置的自定义指令 */
export function customPromptsFor(placement: CustomPromptPlacement): CustomPrompt[] {
  return getCustomPrompts().filter((p) => placementsOf(p).includes(placement));
}

/** 指令设置优先，未设置的项使用默认值 */
function generationOf(prompt: CustomPrompt): AiGeneration {
  const temperature =
    typeof prompt.temperature === 'number' && Number.isFinite(prompt.temperature)
      ? Math.min(Math.max(prompt.temperature, TEMPERATURE_RANGE.min), TEMPERATURE_RANGE.max)
      : DEFAULT_GENERATION.temperature;
  const maxTokens =
    typeof prompt.maxTokens === 'number' && prompt.maxTokens > 0
      ? Math.min(Math.round(prompt.maxTokens), MAX_OUTPUT_TOKENS * 4)
      : DEFAULT_GENERATION.maxTokens;
  return { temperature, maxTokens };
}

/** 旧行为：模板原文作为 system，内容作为 user */
function buildLegacyMessages(template: string, input: AiPromptInput): AiChatMessage[] {
  const userContent = input.arg || input.selection || input.context || '请根据上述指令生成内容。';
  return [
    { role: 'system', content: template },
    { role: 'user', content: userContent },
  ];
}

/**
 * 变量模式：渲染模板作为 system；user 消息只补充模板中未引用的内容，避免重复发送。
 */
function buildTemplateMessages(
  template: string,
  used: Set<TemplateVariable>,
  input: AiPromptInput,
): AiChatMessage[] {
  const system = renderTemplate(template, {
    selection: input.selection,
    context: input.context,
    document: input.fullDocument,
    title: input.title,
    input: input.arg,
  });

  let userContent = '请按上述要求直接输出结果，不要额外解释。';
  if (input.arg && !used.has('input')) userContent = input.arg;
  else if (input.selection && !used.has('selection')) userContent = input.selection;

  return [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ];
}

/** 将一条自定义指令转换为 AiCommand */
export function buildCustomCommand(prompt: CustomPrompt): AiCommand {
  const used = collectTemplateVariables(prompt.prompt);
  const generation = generationOf(prompt);

  return {
    id: `${CUSTOM_COMMAND_PREFIX}${prompt.id}` as AiCommand['id'],
    label: prompt.label,
    icon: ICON_CUSTOM,
    keywords: [prompt.label],
    insertMode: prompt.insertMode ?? 'insert-after',
    needsDocument: used.has('document'),
    generation: () => generation,
    buildPrompt: (input) =>
      used.size > 0
        ? buildTemplateMessages(prompt.prompt, used, input)
        : buildLegacyMessages(prompt.prompt, input),
  };
}

/** 按 AiCommand.id（custom_ 前缀）解析自定义指令 */
export function resolveCustomCommand(commandId: string): AiCommand | null {
  if (!commandId.startsWith(CUSTOM_COMMAND_PREFIX)) return null;
  const promptId = commandId.slice(CUSTOM_COMMAND_PREFIX.length);
  const prompt = getCustomPrompts().find((p) => p.id === promptId);
  return prompt ? buildCustomCommand(prompt) : null;
}

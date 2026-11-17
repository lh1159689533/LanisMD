/**
 * AI 生成提交说明：读取变更 diff（后端截断至 8KB）后调用当前 AI 服务商
 *
 * @changelog
 * | 版本   | 变更说明                  | 关联                            |
 * | v1.0.0 | 初始实现：AI 生成 commit message | REQ: Git 改造 TECH: 提交弹窗 AI |
 * /@changelog
 *
 * @author hhhuilli
 */

import { startAiStream } from '@/services/ai-service';
import { gitService } from '@/services/tauri/git-service';
import { useAiStore } from '@/stores/ai-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { FileEntryRequest } from '@/types/git';

const SYSTEM_PROMPT = [
  '你是一名资深工程师，负责根据 git diff 撰写提交说明。',
  '要求：',
  '1. 使用 Conventional Commits 格式，类型取 feat/fix/docs/refactor/style/chore 之一；',
  '2. 使用与变更内容一致的语言，默认中文；首行不超过 50 个字；',
  '3. 变更较多时空一行后用 "- " 列出最多 5 条要点；',
  '4. 只输出提交说明本身，不要解释，不要使用代码块。',
].join('\n');

/** 当前是否可用 AI（已开启且当前服务商已配置 Key 与模型） */
export async function isAiCommitAvailable(): Promise<boolean> {
  const { config } = useSettingsStore.getState();
  if (!config.ai?.enabled) return false;
  await useAiStore.getState().refreshKeyStatus();
  const providerId = config.ai.currentProvider;
  const model = config.ai.selectedModels?.[providerId];
  return Boolean(useAiStore.getState().keyStatus[providerId] && model);
}

/** 去掉模型可能附带的代码块包裹与首尾空白 */
function cleanMessage(raw: string): string {
  return raw
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/, '')
    .trim();
}

/**
 * 生成提交说明。
 * @param onDelta 流式回调，用于在输入框中实时展示
 */
export async function generateCommitMessage(
  repoPath: string,
  files: FileEntryRequest[],
  onDelta?: (text: string) => void,
): Promise<string> {
  const { config } = useSettingsStore.getState();
  const providerId = config.ai.currentProvider;
  const model = config.ai.selectedModels?.[providerId] ?? '';
  const diff = await gitService.diffText(repoPath, files);
  const fileList = files.map((f) => `${f.status}\t${f.path}`).join('\n');

  return new Promise<string>((resolve, reject) => {
    let text = '';
    startAiStream(
      {
        providerId,
        model,
        temperature: 0.3,
        maxTokens: 300,
        customBaseUrl: providerId === 'custom' ? config.ai.customBaseUrl : undefined,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `变更文件：\n${fileList}\n\nDiff：\n${diff}` },
        ],
      },
      {
        onDelta: (delta) => {
          text += delta;
          onDelta?.(cleanMessage(text));
        },
        onDone: () => resolve(cleanMessage(text)),
        onError: (err) => reject(new Error(err.message)),
      },
    ).catch(reject);
  });
}

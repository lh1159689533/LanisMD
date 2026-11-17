/**
 * AI 生成的代码类结果校验（Mermaid / LaTeX）
 *
 * 生成完成后先在本地解析一遍：失败时把报错回传给模型自动修复（由 generate 模式控制次数），
 * 避免用户插入后才发现图表 / 公式渲染失败。
 *
 * @changelog
 * | 版本   | 变更说明                                  | 关联                        |
 * | v1.0.0 | 初始实现：mermaid.parse / katex 严格校验 | REQ: AI 体验短板-输出校验 |
 * /@changelog
 *
 * @author hhhuilli
 */

import katex from 'katex';
import mermaid from 'mermaid';

import type { AiInsertMode } from '@/types/ai';

/** 自动修复的最大次数 */
export const MAX_REPAIR_ATTEMPTS = 2;

/** 报错回传给模型时的最大长度 */
const MAX_ERROR_LENGTH = 600;

export type ValidationKind = 'mermaid' | 'latex';

/** 需要校验的插入方式 -> 校验类型 */
export function validationKindOf(mode: AiInsertMode): ValidationKind | null {
  if (mode === 'insert-as-mermaid') return 'mermaid';
  if (mode === 'insert-as-latex') return 'latex';
  return null;
}

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw.trim() || '未知错误';
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH)}...` : text;
}

/**
 * 校验生成结果。
 *
 * @param code - 已清理（去掉围栏 / 分隔符）的代码
 * @returns 通过时返回 null，否则返回报错信息
 */
export async function validateGenerated(
  kind: ValidationKind,
  code: string,
): Promise<string | null> {
  if (!code.trim()) return '输出为空';
  try {
    if (kind === 'mermaid') {
      await mermaid.parse(code);
    } else {
      katex.renderToString(code, { throwOnError: true, displayMode: true });
    }
    return null;
  } catch (err) {
    return errorText(err);
  }
}

/** 构造回传给模型的修复指令 */
export function buildRepairInstruction(kind: ValidationKind, error: string): string {
  const name = kind === 'mermaid' ? 'Mermaid 图表代码' : 'LaTeX 公式（KaTeX 渲染）';
  const output =
    kind === 'mermaid'
      ? '只输出修正后的完整 Mermaid 代码，不要包裹 ``` 标记，不要任何解释。'
      : '只输出修正后的完整公式（不要 $$ 或 $ 包裹），不要任何解释。';
  return `上面的${name}无法通过语法校验，报错信息如下：\n${error}\n\n请修正错误，${output}`;
}

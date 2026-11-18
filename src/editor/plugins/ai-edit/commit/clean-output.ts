/**
 * AI 原始输出清理：去掉模型多余的围栏包裹、公式分隔符等
 *
 * @changelog
 * | 版本   | 变更说明                          | 关联               |
 * | v1.0.0 | 从 generator.ts 抽出输出清理逻辑 | REQ: AI 架构改造#3 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { AiInsertMode } from '@/types/ai';

/** 模型常把整段输出包进 ```markdown 围栏，以下语言标记视为"外层包裹"而非真正的代码块 */
const WRAPPER_FENCE_LANGS = new Set(['', 'markdown', 'md', 'text', 'plaintext']);

/** 按插入方式清理 AI 输出 */
export function cleanOutput(mode: AiInsertMode, raw: string): string {
  let text = raw.trim();

  if (mode === 'insert-as-mermaid' || mode === 'insert-as-latex') {
    // 代码型输出：任何围栏都是多余包裹
    text = text
      .replace(/^```[a-zA-Z]*\n?/, '')
      .replace(/```\s*$/, '')
      .trim();
    if (mode === 'insert-as-latex') {
      text = text
        .replace(/^\${1,2}/, '')
        .replace(/\${1,2}$/, '')
        .trim();
    }
    return text;
  }

  // Markdown 型输出：仅当整段被单个"包裹型"围栏包住时才剥离，
  // 避免误删以代码块开头/结尾的正常 Markdown 内容
  const fence = text.match(/^```([a-zA-Z]*)\n([\s\S]*?)\n?```$/);
  if (fence && WRAPPER_FENCE_LANGS.has(fence[1].toLowerCase()) && !fence[2].includes('```')) {
    text = fence[2].trim();
  }
  return text;
}

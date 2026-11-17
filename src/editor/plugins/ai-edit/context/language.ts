/**
 * 翻译源语言识别：决定默认目标语言
 *
 * 规则：原文以中文为主 -> 译为英文；其余任何语言 -> 译为中文。
 * 采用轻量字符统计而非引入语言检测库，翻译场景只需区分"是否中文"。
 *
 * @changelog
 * | 版本   | 变更说明                         | 关联                  |
 * | v1.0.0 | 初始实现：按中文占比选择目标语言 | REQ: AI 弹窗体验优化 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { TranslateLanguageId } from '../ui/ai-popup';

const HAN_RE = /\p{Script=Han}/gu;
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const HANGUL_RE = /\p{Script=Hangul}/gu;
/** 拉丁/西里尔等字母组成的单词 */
const WORD_RE = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]+/gu;

/** 去掉不参与翻译的 Markdown 片段（代码、链接地址、公式），避免干扰统计 */
function stripNonProse(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, ' ');
}

function countMatches(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

/**
 * 判断文本是否以中文为主。
 *
 * 一个汉字约等于一个词，因此用"汉字数"对比"西文单词数 + 韩文字符数"；
 * 假名占比明显时视为日文（日文同样含汉字）。
 */
export function isMainlyChinese(text: string): boolean {
  const prose = stripNonProse(text);
  const hanCount = countMatches(prose, HAN_RE);
  if (hanCount === 0) return false;

  const kanaCount = countMatches(prose, KANA_RE);
  if (kanaCount * 5 >= hanCount) return false;

  const otherCount = countMatches(prose, WORD_RE) + countMatches(prose, HANGUL_RE);
  return hanCount >= otherCount;
}

/** 根据原文选择默认翻译目标语言：中文 -> 英文，其他 -> 中文 */
export function detectTargetLanguage(text: string): TranslateLanguageId {
  return isMainlyChinese(text) ? 'en' : 'zh';
}

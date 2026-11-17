/**
 * 翻译目标语言解析
 *
 * 规则：
 * 1. 优先使用上次在翻译弹窗中选择的语言（记在 config.ai.translateLang）；
 *    若原文恰好就是该语言（例如记住了「英语」而原文是英文），则改走自动判断
 * 2. 无记录时按中文字符占比判断：超过 30% 译为英文，否则译为中文
 *
 * 采用轻量字符统计而非引入语言检测库，翻译场景只需区分"是否中文"。
 *
 * @changelog
 * | 版本   | 变更说明                                     | 关联                      |
 * | v1.0.0 | 初始实现：按中文占比选择目标语言             | REQ: AI 弹窗体验优化     |
 * | v2.0.0 | 记住上次选择的语言；自动判断改为字符占比 30% | REQ: AI 体验短板-翻译方向 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useSettingsStore } from '@/stores/settings-store';

import { TRANSLATE_LANGUAGES, type TranslateLanguageId } from '../ui/ai-popup';

/** 中文字符占比超过该值时视为中文原文 */
const CHINESE_RATIO_THRESHOLD = 0.3;

const HAN_RE = /\p{Script=Han}/gu;
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const HANGUL_RE = /\p{Script=Hangul}/gu;
const LATIN_RE = /\p{Script=Latin}/gu;
/** 参与占比统计的字符：各种文字的字母（不含空白、标点、数字） */
const LETTER_RE = /\p{L}/gu;

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
 * 判断文本是否以中文为主：汉字占全部字母类字符的比例超过 30%。
 * 假名占比明显时视为日文（日文同样含汉字）。
 */
export function isMainlyChinese(text: string): boolean {
  const prose = stripNonProse(text);
  const hanCount = countMatches(prose, HAN_RE);
  if (hanCount === 0) return false;

  const kanaCount = countMatches(prose, KANA_RE);
  if (kanaCount * 5 >= hanCount) return false;

  const letterCount = countMatches(prose, LETTER_RE);
  return letterCount > 0 && hanCount / letterCount > CHINESE_RATIO_THRESHOLD;
}

/** 根据原文自动选择目标语言：中文 -> 英文，其他 -> 中文 */
export function detectTargetLanguage(text: string): TranslateLanguageId {
  return isMainlyChinese(text) ? 'en' : 'zh';
}

function isLanguageId(value: unknown): value is TranslateLanguageId {
  return TRANSLATE_LANGUAGES.some((l) => l.id === value);
}

/** 读取记住的目标语言 */
export function getRememberedLanguage(): TranslateLanguageId | undefined {
  const value = useSettingsStore.getState().config.ai?.translateLang;
  return isLanguageId(value) ? value : undefined;
}

/** 记住用户选择的目标语言 */
export function rememberLanguage(langId: TranslateLanguageId): void {
  useSettingsStore.getState().setNestedConfig('ai.translateLang', langId);
}

/**
 * 粗略判断原文语种，仅用于避免「译成原文自身的语言」：
 * 中文 / 日文（含假名）/ 韩文（谚文）/ 其他拉丁字母文字按英语处理
 */
function detectSourceLanguage(text: string): TranslateLanguageId | undefined {
  if (isMainlyChinese(text)) return 'zh';
  const prose = stripNonProse(text);
  const letters = countMatches(prose, LETTER_RE);
  if (letters === 0) return undefined;
  if (countMatches(prose, KANA_RE) > 0) return 'ja';
  if (countMatches(prose, HANGUL_RE) / letters > CHINESE_RATIO_THRESHOLD) return 'ko';
  if (countMatches(prose, LATIN_RE) / letters > 0.7) return 'en';
  return undefined;
}

/** 解析本次翻译的目标语言 */
export function resolveTargetLanguage(text: string): TranslateLanguageId {
  const remembered = getRememberedLanguage();
  // 记住的语言恰好是原文语种时（如记住英语、原文也是英文），翻译无意义，改走自动判断
  if (remembered && remembered !== detectSourceLanguage(text)) return remembered;
  return detectTargetLanguage(text);
}

/** 语言 id -> 展示名称 */
export function getLanguageLabel(langId: TranslateLanguageId): string {
  return TRANSLATE_LANGUAGES.find((l) => l.id === langId)?.label ?? langId;
}

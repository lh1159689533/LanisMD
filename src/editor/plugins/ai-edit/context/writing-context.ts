/**
 * 写作背景：front-matter 的标题/标签 + 当前位置的标题路径 + 当前章节内容
 *
 * 此前的上下文只是光标前约 600 个字符的纯文本，模型既不知道文档讲什么，
 * 也不知道当前段落处于哪个章节。这里改为结构化背景，并统一按 token 预算裁剪：
 * 章节内容以选区为中心保留前后文，用标记指出选区 / 光标所在位置。
 *
 * @changelog
 * | 版本   | 变更说明                                   | 关联                       |
 * | v1.0.0 | 初始实现：结构化写作背景与文档标题解析 | REQ: AI 体验短板-上下文 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';

import { proportionalOutput } from '@/services/ai/generation';
import type { AiRuntime } from '@/services/ai/runtime';
import { computeContextBudget, fitSurroundingContext } from '@/services/ai/token-budget';
import { useFileStore } from '@/stores/file-store';

import { serializeRangeToMarkdown } from '../commit/markdown-bridge';

/** 写作背景是每次请求都携带的，上限明显小于「完整上下文」 */
const WRITING_CONTEXT_TOKEN_CAP = 1500;

/** 章节内容中标记选区 / 光标位置 */
export const POSITION_MARKER = '[[当前位置]]';

/** front-matter 中解析出的元信息 */
interface FrontMatterMeta {
  title?: string;
  tags: string[];
}

interface HeadingInfo {
  level: number;
  text: string;
  /** 标题节点在文档中的起始位置 */
  pos: number;
  /** 标题节点之后的位置（章节正文起点） */
  end: number;
}

// ---------------------------------------------------------------------------
// front-matter
// ---------------------------------------------------------------------------

function unquote(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

/** 解析 tags / keywords：支持 `[a, b]`、`a, b` 与多行 `- a` 三种写法 */
function parseListField(yaml: string, field: string): string[] {
  const lines = yaml.split('\n');
  const idx = lines.findIndex((l) => new RegExp(`^${field}\\s*:`, 'i').test(l));
  if (idx < 0) return [];

  const inline = lines[idx].replace(new RegExp(`^${field}\\s*:`, 'i'), '').trim();
  if (inline) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(/[,，]/)
      .map(unquote)
      .filter(Boolean);
  }

  const items: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s+(.+)$/);
    if (!m) break;
    items.push(unquote(m[1]));
  }
  return items.filter(Boolean);
}

/** 轻量解析 YAML front-matter 中的 title 与 tags（不引入 YAML 库） */
function parseFrontMatter(yaml: string): FrontMatterMeta {
  const titleLine = yaml.match(/^title\s*:\s*(.+)$/im);
  const tags = parseListField(yaml, 'tags');
  return {
    title: titleLine ? unquote(titleLine[1]) || undefined : undefined,
    tags: tags.length > 0 ? tags : parseListField(yaml, 'keywords'),
  };
}

function readFrontMatter(doc: ProseNode): FrontMatterMeta {
  const first = doc.firstChild;
  if (!first || first.type.name !== 'front_matter') return { tags: [] };
  return parseFrontMatter(first.textContent);
}

// ---------------------------------------------------------------------------
// 标题与章节
// ---------------------------------------------------------------------------

function collectHeadings(doc: ProseNode): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  doc.forEach((node, offset) => {
    if (node.type.name !== 'heading') return;
    const text = node.textContent.trim();
    if (!text) return;
    headings.push({
      level: Number(node.attrs.level) || 1,
      text,
      pos: offset,
      end: offset + node.nodeSize,
    });
  });
  return headings;
}

/** 位于 `pos` 之前的标题路径（如 一级 > 二级 > 三级） */
function headingPathAt(headings: HeadingInfo[], pos: number): HeadingInfo[] {
  const stack: HeadingInfo[] = [];
  for (const h of headings) {
    if (h.pos >= pos) break;
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push(h);
  }
  return stack;
}

/** 正文起点：跳过 front-matter */
function bodyStart(doc: ProseNode): number {
  const first = doc.firstChild;
  return first && first.type.name === 'front_matter' ? first.nodeSize : 0;
}

/**
 * 当前章节范围：从最近的上一个标题之后，到下一个同级或更高级标题之前。
 * 选区本身跨越标题时，以选区为准向外扩展。
 */
function sectionRange(
  doc: ProseNode,
  headings: HeadingInfo[],
  path: HeadingInfo[],
  to: number,
): { start: number; end: number } {
  const current = path[path.length - 1];
  const start = current ? current.end : bodyStart(doc);
  const level = current?.level ?? 0;
  const next = headings.find((h) => h.pos >= to && (level === 0 || h.level <= level));
  return { start, end: next ? next.pos : doc.content.size };
}

// ---------------------------------------------------------------------------
// 对外接口
// ---------------------------------------------------------------------------

/** 文件名去掉扩展名 */
function fileTitle(): string | undefined {
  const name = useFileStore.getState().currentFile?.fileName;
  if (!name || name === '未命名') return undefined;
  return name.replace(/\.(md|markdown|mdx|txt)$/i, '');
}

/** 文档标题：front-matter title > 首个一级标题 > 文件名 */
export function resolveDocumentTitle(view: EditorView): string | undefined {
  const { doc } = view.state;
  const meta = readFrontMatter(doc);
  if (meta.title) return meta.title;
  const h1 = collectHeadings(doc).find((h) => h.level === 1);
  return h1?.text ?? fileTitle();
}

/**
 * 构造写作背景文本。
 *
 * @param selection - 当前选区（Markdown），用于预留 token
 * @returns 背景文本；无有效信息时返回空串
 */
export function buildWritingContext(
  view: EditorView,
  from: number,
  to: number,
  selection: string,
  runtime?: AiRuntime,
): string {
  try {
    const { doc } = view.state;
    const meta = readFrontMatter(doc);
    const headings = collectHeadings(doc);
    const path = headingPathAt(headings, from);
    const title = meta.title ?? headings.find((h) => h.level === 1)?.text ?? fileTitle();

    const lines: string[] = [];
    if (title) lines.push(`文档标题：${title}`);
    if (meta.tags.length > 0) lines.push(`标签：${meta.tags.join('、')}`);
    if (path.length > 0) lines.push(`当前位置：${path.map((h) => h.text).join(' > ')}`);

    const header = lines.join('\n');
    const budget = computeContextBudget({
      contextLength: runtime?.contextLength,
      maxOutputTokens: proportionalOutput(selection, 1.5),
      reservedText: `${header}${selection}`,
      cap: WRITING_CONTEXT_TOKEN_CAP,
    });

    const range = sectionRange(doc, headings, path, to);
    const before = from > range.start ? serializeRangeToMarkdown(view, range.start, from) : '';
    const after = range.end > to ? serializeRangeToMarkdown(view, to, range.end) : '';

    if (budget > 0 && (before.trim() || after.trim())) {
      const section = fitSurroundingContext({
        before: before.trim(),
        after: after.trim(),
        marker: POSITION_MARKER,
        budget,
      });
      lines.push(`当前章节内容（${POSITION_MARKER} 标记了选中内容或光标所在位置）：\n${section}`);
    }
    return lines.join('\n');
  } catch (err) {
    console.warn('[ai-edit] 构造写作背景失败', err);
    return '';
  }
}

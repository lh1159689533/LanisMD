/**
 * 行内 diff 渲染器（润色）
 *
 * 在选区位置就地展示润色前后的差异，并按改动处分块：
 * - 每一处改动（删除 + 新增）可单独接受或拒绝，再次点击已选项回到待定
 * - 待定的改动在最终应用时视为接受
 * - 新增文本可直接编辑
 * - 最终结果 = 未改动部分 + 每处按选择取新文本或原文本
 *
 * diff 挂载在润色弹窗的遮罩层内（fixed 定位覆盖原文）：遮罩会拦截编辑器区域的点击，
 * 挂在编辑器内部的元素无法交互。遮罩期间编辑区不可滚动，fixed 坐标保持对齐。
 *
 * @changelog
 * | 版本   | 变更说明                                         | 关联                  |
 * | v2.0.0 | 按改动处分块，逐处接受 / 拒绝；挂载到遮罩层可交互 | REQ: AI 体验短板-润色 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { EditorView } from '@milkdown/kit/prose/view';

export interface InlineDiffOptions {
  view: EditorView;
  /** 选区起始位置 */
  from: number;
  /** 选区结束位置 */
  to: number;
  /** 原文 */
  original: string;
  /** 润色后文本 */
  revised: string;
  /** 挂载容器（润色弹窗遮罩层） */
  mountTo: HTMLElement;
  /** 接受回调：参数为按各处选择拼出的最终文本 */
  onAccept: (finalText: string) => void;
  /** 拒绝回调 */
  onReject: () => void;
  /** 各处取舍变化时回调 */
  onDecisionChange?: (summary: DiffSummary) => void;
}

/** 改动处取舍统计 */
export interface DiffSummary {
  total: number;
  accepted: number;
  rejected: number;
}

/** diff 操作类型 */
interface DiffOp {
  type: 'keep' | 'delete' | 'insert';
  text: string;
}

/** 渲染单元：未改动片段，或一处改动 */
type DiffSegment =
  { kind: 'keep'; text: string } | { kind: 'hunk'; deleted: string; inserted: string };

type HunkDecision = 'pending' | 'accepted' | 'rejected';

interface HunkView {
  el: HTMLSpanElement;
  deleted: string;
  insertedEl: HTMLSpanElement | null;
  decision: HunkDecision;
}

/** InlineDiff 句柄，供外部控制 */
export interface InlineDiffHandle {
  /** 按各处选择应用结果 */
  accept: () => void;
  /** 拒绝全部（恢复原文） */
  reject: () => void;
  /** 销毁 diff 展示（不触发回调） */
  destroy: () => void;
  /** 改动处统计 */
  summary: () => DiffSummary;
  /** diff 内容所在的 DOM 容器 */
  container: HTMLElement;
}

/** 两处改动之间不超过该长度的未改动片段会被并入同一处，避免改动被切得过碎 */
const MERGE_GAP_CHARS = 2;

const ICON_ACCEPT =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICON_REJECT =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

/**
 * 展示行内 diff。
 */
export function showInlineDiff(options: InlineDiffOptions): InlineDiffHandle {
  const { view, original, revised, onAccept, onReject, onDecisionChange } = options;

  const segments = buildSegments(computeDiff(original, revised));

  const container = document.createElement('div');
  container.className = 'lanismd-ai-diff-container';

  const diffContent = document.createElement('div');
  diffContent.className = 'lanismd-ai-diff-content';
  container.appendChild(diffContent);

  const hunks: HunkView[] = [];
  /** 按渲染顺序记录：未改动文本或改动处 */
  const order: Array<string | HunkView> = [];

  for (const seg of segments) {
    if (seg.kind === 'keep') {
      const span = document.createElement('span');
      span.className = 'lanismd-ai-diff-keep';
      span.textContent = seg.text;
      diffContent.appendChild(span);
      order.push(seg.text);
    } else {
      const hunk = createHunk(seg.deleted, seg.inserted);
      hunks.push(hunk);
      order.push(hunk);
      diffContent.appendChild(hunk.el);
    }
  }

  function summary(): DiffSummary {
    return {
      total: hunks.length,
      accepted: hunks.filter((h) => h.decision === 'accepted').length,
      rejected: hunks.filter((h) => h.decision === 'rejected').length,
    };
  }

  function setDecision(hunk: HunkView, next: HunkDecision) {
    // 再次点击已选项 -> 回到待定
    hunk.decision = hunk.decision === next ? 'pending' : next;
    hunk.el.dataset.decision = hunk.decision;
    onDecisionChange?.(summary());
  }

  function createHunk(deleted: string, inserted: string): HunkView {
    const el = document.createElement('span');
    el.className = 'lanismd-ai-diff-hunk';
    el.dataset.decision = 'pending';

    if (deleted) {
      const del = document.createElement('span');
      del.className = 'lanismd-ai-diff-deleted';
      del.textContent = deleted;
      el.appendChild(del);
    }

    let insertedEl: HTMLSpanElement | null = null;
    if (inserted) {
      insertedEl = document.createElement('span');
      insertedEl.className = 'lanismd-ai-diff-inserted';
      insertedEl.textContent = inserted;
      insertedEl.contentEditable = 'true';
      insertedEl.spellcheck = false;
      // 阻止 ProseMirror 与弹窗快捷键捕获输入；Enter 应用、Esc 交给弹窗处理
      insertedEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') return;
        e.stopPropagation();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleAccept();
        }
      });
      el.appendChild(insertedEl);
    }

    const controls = document.createElement('span');
    controls.className = 'lanismd-ai-diff-controls';
    controls.contentEditable = 'false';
    const hunk: HunkView = { el, deleted, insertedEl, decision: 'pending' };
    controls.appendChild(
      createControl(ICON_ACCEPT, '接受此处', 'accept', () => setDecision(hunk, 'accepted')),
    );
    controls.appendChild(
      createControl(ICON_REJECT, '拒绝此处', 'reject', () => setDecision(hunk, 'rejected')),
    );
    el.appendChild(controls);
    return hunk;
  }

  options.mountTo.appendChild(container);
  copyTextStyle(view, options.from, container);
  const reposition = () => positionOverOriginal(view, container, options.from, options.to);
  reposition();
  window.addEventListener('resize', reposition);

  /** 按各处选择拼出最终文本（待定视为接受；新增文本可能被用户编辑过） */
  function composeResult(): string {
    let text = '';
    for (const item of order) {
      if (typeof item === 'string') text += item;
      else if (item.decision === 'rejected') text += item.deleted;
      else text += item.insertedEl?.textContent ?? '';
    }
    return text;
  }

  function handleAccept() {
    const finalText = composeResult();
    destroy();
    onAccept(finalText);
  }

  function handleReject() {
    destroy();
    onReject();
  }

  function destroy() {
    window.removeEventListener('resize', reposition);
    container.remove();
  }

  return {
    accept: handleAccept,
    reject: handleReject,
    destroy,
    summary,
    container,
  };
}

function createControl(
  icon: string,
  title: string,
  variant: 'accept' | 'reject',
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `lanismd-ai-diff-control lanismd-ai-diff-control-${variant}`;
  btn.title = title;
  btn.innerHTML = icon;
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

// ---------------------------------------------------------------------------
// 分块
// ---------------------------------------------------------------------------

/**
 * 把 diff 操作序列整理为「未改动 / 改动处」片段：
 * 连续的删除与新增合并为一处；两处之间过短的未改动片段（不含换行）并入两侧，
 * 避免「改了一个字、留一个标点、又改一个字」被拆成多处。
 */
function buildSegments(ops: DiffOp[]): DiffSegment[] {
  const raw: DiffSegment[] = [];
  for (const op of ops) {
    const last = raw[raw.length - 1];
    if (op.type === 'keep') {
      raw.push({ kind: 'keep', text: op.text });
    } else if (last && last.kind === 'hunk') {
      if (op.type === 'delete') last.deleted += op.text;
      else last.inserted += op.text;
    } else {
      raw.push(
        op.type === 'delete'
          ? { kind: 'hunk', deleted: op.text, inserted: '' }
          : { kind: 'hunk', deleted: '', inserted: op.text },
      );
    }
  }

  const merged: DiffSegment[] = [];
  for (let i = 0; i < raw.length; i++) {
    const seg = raw[i];
    const prev = merged[merged.length - 1];
    const next = raw[i + 1];
    const isShortGap =
      seg.kind === 'keep' &&
      prev?.kind === 'hunk' &&
      next?.kind === 'hunk' &&
      seg.text.length <= MERGE_GAP_CHARS &&
      !seg.text.includes('\n');
    if (isShortGap && prev.kind === 'hunk' && next.kind === 'hunk') {
      prev.deleted += seg.text + next.deleted;
      prev.inserted += seg.text + next.inserted;
      i++;
      continue;
    }
    if (seg.kind === 'hunk' && prev?.kind === 'hunk') {
      prev.deleted += seg.deleted;
      prev.inserted += seg.inserted;
      continue;
    }
    merged.push({ ...seg });
  }
  return merged;
}

// ---------------------------------------------------------------------------
// diff 算法（基于 LCS）
// ---------------------------------------------------------------------------

/**
 * 计算两段文本的 diff：中文逐字，英文连续字母数字为一词，空白与标点独立。
 */
function computeDiff(original: string, revised: string): DiffOp[] {
  const oldTokens = tokenize(original);
  const newTokens = tokenize(revised);
  const lcs = longestCommonSubsequence(oldTokens, newTokens);

  const ops: DiffOp[] = [];
  let oldIdx = 0;
  let newIdx = 0;
  for (const token of lcs) {
    while (oldIdx < oldTokens.length && oldTokens[oldIdx] !== token) {
      pushOp(ops, 'delete', oldTokens[oldIdx++]);
    }
    while (newIdx < newTokens.length && newTokens[newIdx] !== token) {
      pushOp(ops, 'insert', newTokens[newIdx++]);
    }
    pushOp(ops, 'keep', token);
    oldIdx++;
    newIdx++;
  }
  while (oldIdx < oldTokens.length) pushOp(ops, 'delete', oldTokens[oldIdx++]);
  while (newIdx < newTokens.length) pushOp(ops, 'insert', newTokens[newIdx++]);
  return ops;
}

/** 将连续同类型的操作合并为一个 */
function pushOp(ops: DiffOp[], type: DiffOp['type'], text: string) {
  const last = ops[ops.length - 1];
  if (last && last.type === type) {
    last.text += text;
  } else {
    ops.push({ type, text });
  }
}

function isAsciiWordChar(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/** 文本分词：中文逐字，英文连续字母数字为一词，空白和标点独立 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (isAsciiWordChar(text.charCodeAt(i))) {
      let j = i;
      while (j < text.length && isAsciiWordChar(text.charCodeAt(j))) j++;
      tokens.push(text.slice(i, j));
      i = j;
    } else {
      tokens.push(text[i]);
      i++;
    }
  }
  return tokens;
}

/** 计算最长公共子序列（动态规划，O(m*n)；过长时退化为贪心近似） */
function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  if (m * n > 1000000) return approximateLCS(a, b);

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result.reverse();
}

/** 近似 LCS：对长文本使用贪心策略 */
function approximateLCS(a: string[], b: string[]): string[] {
  const result: string[] = [];
  let j = 0;
  for (let i = 0; i < a.length && j < b.length; i++) {
    const idx = b.indexOf(a[i], j);
    if (idx !== -1) {
      result.push(a[i]);
      j = idx + 1;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 定位
// ---------------------------------------------------------------------------

/** diff 挂在编辑区之外，需要复制原文所在块的文字样式，视觉上才像就地替换 */
function copyTextStyle(view: EditorView, pos: number, el: HTMLElement) {
  try {
    const { node } = view.domAtPos(pos);
    const host = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
    if (!host) return;
    const style = getComputedStyle(host);
    el.style.fontFamily = style.fontFamily;
    el.style.fontSize = style.fontSize;
    el.style.lineHeight = style.lineHeight;
    el.style.letterSpacing = style.letterSpacing;
    el.style.color = style.color;
  } catch {
    // 取样失败时使用默认样式
  }
}

/** 视口边缘留白 */
const EDGE_MARGIN = 16;

/**
 * 将 diff 容器以 fixed 定位覆盖到原文起始位置，宽度延伸到编辑区右边缘；
 * 内容超出视口时在容器内部滚动。
 */
function positionOverOriginal(view: EditorView, el: HTMLElement, from: number, to: number) {
  try {
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);
    const editorRect = view.dom.getBoundingClientRect();
    const top = Math.max(start.top, EDGE_MARGIN);
    el.style.position = 'fixed';
    el.style.left = `${start.left}px`;
    el.style.top = `${top}px`;
    el.style.maxWidth = `${Math.max(editorRect.right - start.left, 200)}px`;
    el.style.minWidth = '200px';
    el.style.maxHeight = `${Math.max(window.innerHeight - top - EDGE_MARGIN - 64, 120)}px`;
    // 至少覆盖原文区域，避免原文从下方露出
    el.style.minHeight = `${Math.max(end.bottom - top, 0)}px`;
  } catch {
    // 定位失败不影响功能
  }
}

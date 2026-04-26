/**
 * 行内 diff 渲染器
 *
 * 在编辑器选区位置就地展示润色前后的差异：
 * - 直接在原文位置 replace 为 diff 内容（删除线 + 高亮新增）
 * - 接受：应用润色结果，拒绝：恢复原文
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
  /** 接受回调：参数为最终文本（用户可能编辑过） */
  onAccept: (finalText: string) => void;
  /** 拒绝回调 */
  onReject: () => void;
}

/** diff 操作类型 */
interface DiffOp {
  type: 'keep' | 'delete' | 'insert';
  text: string;
}

/** InlineDiff 句柄，供外部控制 */
export interface InlineDiffHandle {
  /** 接受润色结果 */
  accept: () => void;
  /** 拒绝润色结果（恢复原文） */
  reject: () => void;
  /** 销毁 diff 展示（不触发回调） */
  destroy: () => void;
  /** diff 内容所在的 DOM 容器 */
  container: HTMLElement;
}

/**
 * 展示行内 diff。
 *
 * 新方案：直接在原文位置替换为 diff DOM，
 * 使用 overlay 浮层但精确对齐到原文位置，视觉上看起来是"替换"。
 */
export function showInlineDiff(options: InlineDiffOptions): InlineDiffHandle {
  const { view, original, revised, onAccept, onReject } = options;

  // 1. 计算字符级 diff
  const ops = computeCharDiff(original, revised);

  // 2. 创建 diff 内容 DOM
  const container = document.createElement('div');
  container.className = 'lanismd-ai-diff-container';

  // diff 内容区
  const diffContent = document.createElement('div');
  diffContent.className = 'lanismd-ai-diff-content';

  // 收集所有可编辑的 inserted 片段引用
  const insertedSpans: HTMLSpanElement[] = [];

  for (const op of ops) {
    if (op.type === 'keep') {
      const span = document.createElement('span');
      span.className = 'lanismd-ai-diff-keep';
      span.textContent = op.text;
      diffContent.appendChild(span);
    } else if (op.type === 'delete') {
      const span = document.createElement('span');
      span.className = 'lanismd-ai-diff-deleted';
      span.textContent = op.text;
      diffContent.appendChild(span);
    } else if (op.type === 'insert') {
      const span = document.createElement('span');
      span.className = 'lanismd-ai-diff-inserted';
      span.textContent = op.text;
      span.contentEditable = 'true';
      span.spellcheck = false;
      // 阻止 ProseMirror 捕获键盘事件
      span.addEventListener('keydown', (e) => {
        e.stopPropagation();
        // Enter 键接受
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleAccept();
        }
        // Esc 键拒绝
        if (e.key === 'Escape') {
          e.preventDefault();
          handleReject();
        }
      });
      insertedSpans.push(span);
      diffContent.appendChild(span);
    }
  }

  container.appendChild(diffContent);

  // 3. 挂载到 overlay 容器
  const overlayContainer = findOverlayContainer(view);
  overlayContainer.appendChild(container);

  // 4. 精确定位：覆盖原文位置
  positionOverOriginal(view, container, options.from, options.to);

  // 5. 事件处理
  function handleAccept() {
    // 从 diff 内容中提取最终文本：保留 keep + 用户可能编辑过的 inserted
    let finalText = '';
    for (const child of Array.from(diffContent.children)) {
      const el = child as HTMLElement;
      if (el.classList.contains('lanismd-ai-diff-deleted')) {
        // 跳过删除部分
        continue;
      }
      finalText += el.textContent ?? '';
    }
    destroy();
    onAccept(finalText);
  }

  function handleReject() {
    destroy();
    onReject();
  }

  // 6. 销毁函数
  function destroy() {
    if (container.parentElement) {
      container.parentElement.removeChild(container);
    }
  }

  return {
    accept: handleAccept,
    reject: handleReject,
    destroy,
    container,
  };
}

// ---------------------------------------------------------------------------
// 简单的字符级 diff 算法（基于 LCS）
// ---------------------------------------------------------------------------

/**
 * 计算两段文本的字符级 diff。
 * 中文按字符处理，英文按字符处理。
 * 使用 Myers diff 算法的简化实现。
 */
function computeCharDiff(original: string, revised: string): DiffOp[] {
  // 按"词"拆分：中文逐字，英文连续字母/数字作为一个词，标点单独
  const oldTokens = tokenize(original);
  const newTokens = tokenize(revised);

  // 计算 LCS
  const lcs = longestCommonSubsequence(oldTokens, newTokens);

  // 根据 LCS 生成 diff 操作
  const ops: DiffOp[] = [];
  let oldIdx = 0;
  let newIdx = 0;
  let lcsIdx = 0;

  while (oldIdx < oldTokens.length || newIdx < newTokens.length) {
    if (
      lcsIdx < lcs.length &&
      oldIdx < oldTokens.length &&
      oldTokens[oldIdx] === lcs[lcsIdx] &&
      newIdx < newTokens.length &&
      newTokens[newIdx] === lcs[lcsIdx]
    ) {
      // 公共部分
      pushOp(ops, 'keep', lcs[lcsIdx]);
      oldIdx++;
      newIdx++;
      lcsIdx++;
    } else if (
      lcsIdx < lcs.length &&
      newIdx < newTokens.length &&
      newTokens[newIdx] === lcs[lcsIdx] &&
      (oldIdx >= oldTokens.length || oldTokens[oldIdx] !== lcs[lcsIdx])
    ) {
      // 旧文本中有但 LCS 中没有 -> 删除
      pushOp(ops, 'delete', oldTokens[oldIdx]);
      oldIdx++;
    } else if (
      lcsIdx < lcs.length &&
      oldIdx < oldTokens.length &&
      oldTokens[oldIdx] === lcs[lcsIdx] &&
      (newIdx >= newTokens.length || newTokens[newIdx] !== lcs[lcsIdx])
    ) {
      // 新文本中有但不在公共部分 -> 插入
      pushOp(ops, 'insert', newTokens[newIdx]);
      newIdx++;
    } else {
      // 两边都不是 LCS 中的下一个
      if (oldIdx < oldTokens.length) {
        pushOp(ops, 'delete', oldTokens[oldIdx]);
        oldIdx++;
      }
      if (newIdx < newTokens.length) {
        pushOp(ops, 'insert', newTokens[newIdx]);
        newIdx++;
      }
    }
  }

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

/**
 * 文本分词：中文逐字，英文连续字母数字为一词，空白和标点独立
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const code = ch.charCodeAt(0);

    // ASCII 字母或数字：连续取
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      let word = '';
      while (i < text.length) {
        const c = text.charCodeAt(i);
        if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
          word += text[i];
          i++;
        } else {
          break;
        }
      }
      tokens.push(word);
    } else {
      // 其他字符（中文、标点、空白等）逐个作为 token
      tokens.push(ch);
      i++;
    }
  }
  return tokens;
}

/**
 * 计算最长公共子序列（LCS）
 * 使用动态规划，时间复杂度 O(m*n)
 */
function longestCommonSubsequence(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // 优化：如果文本很长，使用近似算法避免内存爆炸
  if (m * n > 1000000) {
    return approximateLCS(a, b);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯 LCS
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * 近似 LCS：对长文本使用贪心策略
 */
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
// DOM 工具
// ---------------------------------------------------------------------------

/** 查找或创建 overlay 容器 */
function findOverlayContainer(view: EditorView): HTMLElement {
  const editorDom = view.dom;
  const parent = editorDom.parentElement;
  if (!parent) return document.body;

  let overlay = parent.querySelector('.lanismd-ai-overlay') as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'lanismd-ai-overlay';
    parent.appendChild(overlay);
  }
  return overlay;
}

/**
 * 将 diff 容器精确定位到原文位置，视觉上"替换"原文
 *
 * 计算原文所在的 DOM 区域（from ~ to），让 diff 容器完全覆盖该区域。
 */
function positionOverOriginal(
  view: EditorView,
  el: HTMLElement,
  from: number,
  to: number,
) {
  try {
    const startCoords = view.coordsAtPos(from);
    const endCoords = view.coordsAtPos(to);
    const container = el.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();

    // diff 容器定位到原文起始位置
    el.style.position = 'absolute';
    el.style.left = `${startCoords.left - containerRect.left}px`;
    el.style.top = `${startCoords.top - containerRect.top}px`;

    // 宽度覆盖到行尾（取编辑器内容区宽度）
    const editorRect = view.dom.getBoundingClientRect();
    const availWidth = editorRect.right - startCoords.left;
    el.style.maxWidth = `${availWidth}px`;
    el.style.minWidth = '200px';

    // 添加背景遮盖原文
    el.style.background = 'var(--lanismd-editor-bg, #fff)';
    // 高度设为 auto 让内容撑开，最小覆盖原文区域
    const originalHeight = endCoords.bottom - startCoords.top;
    el.style.minHeight = `${originalHeight}px`;
  } catch {
    // 定位失败不影响功能
  }
}

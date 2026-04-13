/**
 * 模糊匹配工具 - 子序列匹配（subsequence match）
 * 输入 "rme" 能匹配 "README.md"，输入 "abc" 能匹配 "a-big-cat.md"
 */

export interface FuzzyMatchResult {
  /** 是否匹配 */
  matched: boolean;
  /** 匹配得分（越高越好） */
  score: number;
  /** 匹配字符在目标字符串中的索引位置 */
  indices: number[];
}

/**
 * 子序列模糊匹配
 * @param query 用户输入的搜索词（会自动转小写）
 * @param target 目标字符串
 * @returns 匹配结果，包含是否匹配、得分和匹配位置
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatchResult {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  if (queryLower.length === 0) {
    return { matched: true, score: 0, indices: [] };
  }

  if (queryLower.length > targetLower.length) {
    return { matched: false, score: 0, indices: [] };
  }

  const indices: number[] = [];
  let score = 0;
  let queryIdx = 0;
  let lastMatchIdx = -1;

  for (let i = 0; i < targetLower.length && queryIdx < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIdx]) {
      indices.push(i);

      // 连续匹配加分
      if (lastMatchIdx >= 0 && i === lastMatchIdx + 1) {
        score += 10;
      }

      // 首字符匹配加分
      if (i === 0) {
        score += 8;
      }

      // 分隔符后的字符匹配加分（如 '-'、'_'、'.'、' '、'/'）
      if (i > 0 && isSeparator(targetLower[i - 1])) {
        score += 7;
      }

      // 大小写边界匹配加分（camelCase）
      if (i > 0 && target[i] !== target[i].toLowerCase() && target[i - 1] === target[i - 1].toLowerCase()) {
        score += 5;
      }

      // 基础匹配得分
      score += 1;

      // 靠前的匹配位置加分
      score += Math.max(0, 5 - i);

      lastMatchIdx = i;
      queryIdx++;
    }
  }

  // 所有查询字符都匹配上了
  const matched = queryIdx === queryLower.length;

  if (!matched) {
    return { matched: false, score: 0, indices: [] };
  }

  // 完全匹配（目标等于查询）额外加分
  if (targetLower === queryLower) {
    score += 100;
  }

  // 前缀匹配加分
  if (targetLower.startsWith(queryLower)) {
    score += 50;
  }

  // 匹配紧凑度加分（匹配字符分布越紧凑越好）
  if (indices.length > 1) {
    const span = indices[indices.length - 1] - indices[0];
    const compactness = Math.max(0, 20 - span);
    score += compactness;
  }

  return { matched, score, indices };
}

/**
 * 判断字符是否为分隔符
 */
function isSeparator(char: string): boolean {
  return '-_./\\ '.includes(char);
}

/**
 * 将匹配结果中的目标字符串拆分为高亮/非高亮片段
 * 用于 React 渲染匹配高亮
 */
export interface HighlightSegment {
  text: string;
  highlight: boolean;
}

export function getHighlightSegments(text: string, indices: number[]): HighlightSegment[] {
  if (indices.length === 0) {
    return [{ text, highlight: false }];
  }

  const segments: HighlightSegment[] = [];
  const indexSet = new Set(indices);
  let currentText = '';
  let currentHighlight = false;

  for (let i = 0; i < text.length; i++) {
    const isHighlighted = indexSet.has(i);

    if (i === 0) {
      currentHighlight = isHighlighted;
      currentText = text[i];
    } else if (isHighlighted === currentHighlight) {
      currentText += text[i];
    } else {
      segments.push({ text: currentText, highlight: currentHighlight });
      currentText = text[i];
      currentHighlight = isHighlighted;
    }
  }

  if (currentText) {
    segments.push({ text: currentText, highlight: currentHighlight });
  }

  return segments;
}

import type { OutlineItem } from '@/types';

/**
 * Parse markdown text to generate outline items (headings)
 */
export function parseOutline(markdown: string): OutlineItem[] {
  const lines = markdown.split('\n');
  const root: OutlineItem[] = [];
  const stack: OutlineItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);

    if (!match) continue;

    const level = match[1].length;
    const text = match[2].replace(/[*_`~\[\]]/g, '').trim();
    if (!text) continue;

    const anchor = text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
      .replace(/\s+/g, '-');

    const item: OutlineItem = {
      id: `heading-${i}`,
      level,
      text,
      anchor,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(item);
    } else {
      stack[stack.length - 1].children.push(item);
    }

    stack.push(item);
  }

  return root;
}

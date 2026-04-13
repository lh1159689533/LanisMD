export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  anchor: string;
  /** 在文档所有标题中的序号索引（从 0 开始），用于精准匹配重复标题 */
  index: number;
  children: OutlineItem[];
}

export interface EditorState {
  mode: 'wysiwyg' | 'source';
  focusMode: boolean;
  typewriterMode: boolean;
  wordCount: number;
  charCount: number;
  lineCount: number;
  readingTime: number;
  outline: OutlineItem[];
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface OutlineItem {
  id: string;
  level: number;
  text: string;
  anchor: string;
  children: OutlineItem[];
}

export interface EditorState {
  mode: "wysiwyg" | "source";
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

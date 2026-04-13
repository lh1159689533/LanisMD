/**
 * Outline Sync Plugin
 *
 * 从 ProseMirror 文档实时解析 heading 节点，驱动大纲面板数据。
 * 同时监听滚动和光标变化，实时更新当前激活的标题高亮。
 *
 * 设计要点：
 * - 通过遍历 ProseMirror doc 树获取 heading 节点（而非正则解析 markdown），
 *   这样能拿到精确的节点位置信息，便于跳转和滚动同步。
 * - 使用 index 字段精准匹配重复标题，解决 DOM 查询歧义。
 * - 滚动监听使用节流，避免频繁更新。
 */

import { $prose } from '@milkdown/kit/utils';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { OutlineItem } from '@/types';
import { useEditorStore } from '@/stores/editor-store';

const OUTLINE_SYNC_KEY = new PluginKey('outline-sync');

/** 节流间隔（毫秒） */
const SCROLL_THROTTLE_MS = 100;

/** 扁平化大纲标题信息（内部使用） */
interface FlatHeading {
  id: string;
  level: number;
  text: string;
  index: number;
  /** 在 ProseMirror doc 中的起始位置 */
  pos: number;
}

/**
 * 从 ProseMirror 文档中提取所有 heading 节点，生成扁平列表
 */
function extractHeadings(view: EditorView): FlatHeading[] {
  const headings: FlatHeading[] = [];
  let headingIndex = 0;

  view.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = node.attrs.level as number;
      const text = node.textContent.trim();
      if (text) {
        headings.push({
          id: `heading-${headingIndex}`,
          level,
          text,
          index: headingIndex,
          pos,
        });
        headingIndex++;
      }
    }
  });

  return headings;
}

/**
 * 将扁平 heading 列表构建为嵌套树结构
 */
function buildOutlineTree(flatHeadings: FlatHeading[]): OutlineItem[] {
  const root: OutlineItem[] = [];
  const stack: OutlineItem[] = [];

  for (const h of flatHeadings) {
    const anchor = h.text
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff-]/g, '')
      .replace(/\s+/g, '-');

    const item: OutlineItem = {
      id: h.id,
      level: h.level,
      text: h.text,
      anchor,
      index: h.index,
      children: [],
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
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

/**
 * 从 editorView 向上查找真正的滚动容器（overflow: auto/scroll）
 */
function findScrollContainerOf(view: EditorView): HTMLElement | null {
  let el: HTMLElement | null = view.dom.parentElement;
  while (el) {
    const { overflow, overflowY } = getComputedStyle(el);
    if (overflow === 'auto' || overflow === 'scroll' ||
        overflowY === 'auto' || overflowY === 'scroll') {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * 根据滚动位置确定当前激活的标题
 * 策略：找到视口顶部上方（或紧邻）的最后一个标题
 *
 * 注意：必须使用真正的滚动容器（overflow:auto/scroll）来计算
 * relativeTop，而不是 view.dom.parentElement（milkdown 容器），
 * 因为后者会随内容一起被推出视口，导致计算结果错误。
 */
function findActiveHeadingByScroll(view: EditorView, flatHeadings: FlatHeading[]): string | null {
  if (flatHeadings.length === 0) return null;

  const scrollContainer = findScrollContainerOf(view);
  if (!scrollContainer) return null;

  // 当滚动容器已滚动到顶部时，直接激活第一个标题
  // 解决：标题前有间距导致 relativeTop > bufferPx 而不会高亮的问题
  if (scrollContainer.scrollTop <= 5) {
    return flatHeadings[0].id;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const bufferPx = 20;

  let activeId: string | null = null;

  for (const heading of flatHeadings) {
    try {
      const domPos = view.domAtPos(heading.pos + 1);
      const headingEl = domPos.node instanceof HTMLElement
        ? domPos.node
        : domPos.node.parentElement;

      if (!headingEl) continue;

      const rect = headingEl.getBoundingClientRect();
      // 标题相对于滚动容器视口顶部的距离
      const relativeTop = rect.top - containerRect.top;

      if (relativeTop <= bufferPx) {
        activeId = heading.id;
      } else {
        break;
      }
    } catch {
      // domAtPos 可能抛出异常（如位置超出范围），跳过
      continue;
    }
  }

  return activeId;
}

/**
 * 根据光标位置确定当前所在标题
 * 策略：找到光标位置之前的最近一个标题
 */
function findActiveHeadingByCursor(view: EditorView, flatHeadings: FlatHeading[]): string | null {
  if (flatHeadings.length === 0) return null;

  const cursorPos = view.state.selection.from;
  let activeId: string | null = null;

  for (const heading of flatHeadings) {
    if (heading.pos <= cursorPos) {
      activeId = heading.id;
    } else {
      break;
    }
  }

  return activeId;
}

/**
 * 创建节流函数
 */
function throttle<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRun = 0;

  return ((...args: unknown[]) => {
    const now = Date.now();
    const remaining = delay - (now - lastRun);

    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastRun = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastRun = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

/** 滚动状态冷却时间（毫秒），滚动期间及结束后该时间内，光标同步不会覆盖激活标题 */
const SCROLL_COOLDOWN_MS = 300;

/**
 * 大纲同步 ProseMirror 插件
 */
export const outlineSyncPlugin = $prose(() => {
  return new Plugin({
    key: OUTLINE_SYNC_KEY,

    view(editorView) {
      let flatHeadings: FlatHeading[] = [];
      /** 标记用户是否正在滚动（含冷却期） */
      let isScrolling = false;
      let scrollCooldownTimer: ReturnType<typeof setTimeout> | null = null;
      /** 上一次 selection（用于判断光标是否真的发生了移动） */
      let lastSelectionFrom = editorView.state.selection.from;

      /** 更新大纲数据到 store */
      const syncOutline = () => {
        flatHeadings = extractHeadings(editorView);
        const tree = buildOutlineTree(flatHeadings);
        useEditorStore.getState().updateOutline(tree);
      };

      /** 标记滚动开始，并在冷却期结束后重置 */
      const markScrolling = () => {
        isScrolling = true;
        if (scrollCooldownTimer) {
          clearTimeout(scrollCooldownTimer);
        }
        scrollCooldownTimer = setTimeout(() => {
          isScrolling = false;
          scrollCooldownTimer = null;
        }, SCROLL_COOLDOWN_MS);
      };

      /** 更新激活标题（基于滚动位置） */
      const syncActiveByScroll = throttle(() => {
        markScrolling();
        const activeId = findActiveHeadingByScroll(editorView, flatHeadings);
        useEditorStore.getState().setActiveHeadingId(activeId);
      }, SCROLL_THROTTLE_MS);

      /** 更新激活标题（基于光标位置） */
      const syncActiveByCursor = () => {
        // 滚动期间不让光标逻辑覆盖滚动逻辑的激活标题
        if (isScrolling) return;
        const activeId = findActiveHeadingByCursor(editorView, flatHeadings);
        useEditorStore.getState().setActiveHeadingId(activeId);
      };

      let scrollContainer: HTMLElement | null = null;

      // 延迟绑定滚动事件（等 DOM 稳定后）
      const bindScrollTimer = setTimeout(() => {
        scrollContainer = findScrollContainerOf(editorView);
        if (scrollContainer) {
          scrollContainer.addEventListener('scroll', syncActiveByScroll, { passive: true });
          // 初始执行一次滚动同步，确保加载后即可高亮第一个标题
          const activeId = findActiveHeadingByScroll(editorView, flatHeadings);
          useEditorStore.getState().setActiveHeadingId(activeId);
        }
      }, 100);

      // 初始化：解析大纲
      syncOutline();

      return {
        update(view) {
          // 文档变化时重新解析大纲
          flatHeadings = extractHeadings(view);
          const tree = buildOutlineTree(flatHeadings);
          useEditorStore.getState().updateOutline(tree);

          // 仅当光标真正移动时才同步激活标题（避免滚动触发的 update 覆盖）
          const currentFrom = view.state.selection.from;
          if (currentFrom !== lastSelectionFrom) {
            lastSelectionFrom = currentFrom;
            syncActiveByCursor();
          }
        },
        destroy() {
          clearTimeout(bindScrollTimer);
          if (scrollCooldownTimer) {
            clearTimeout(scrollCooldownTimer);
          }
          if (scrollContainer) {
            scrollContainer.removeEventListener('scroll', syncActiveByScroll);
          }
        },
      };
    },
  });
});

/**
 * 在 WYSIWYG 模式下，根据标题索引跳转到对应位置
 * @param index 标题在所有标题中的序号索引
 */
export function scrollToHeadingByIndex(index: number): void {
  const editorRoot = document.querySelector('.milkdown-editor-root .ProseMirror');
  if (!editorRoot) return;

  const headings = editorRoot.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const target = headings[index];

  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * 在源码模式（CodeMirror）下，根据标题索引跳转到对应位置。
 * 通过 store 中存储的 CodeMirror EditorView 实例，直接使用 API 滚动到指定行，
 * 避免 DOM 虚拟化导致查询 .cm-line 失败。
 * @param targetIndex 标题在所有标题中的序号索引
 */
export function scrollToHeadingInSource(targetIndex: number): void {
  const view = useEditorStore.getState().sourceView;
  if (!view) return;

  const doc = view.state.doc;
  let headingCount = 0;

  // 遍历文档所有行，找到第 targetIndex 个标题行
  for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
    const line = doc.line(lineNum);
    if (/^#{1,6}\s+.+$/.test(line.text)) {
      if (headingCount === targetIndex) {
        // 先设置光标位置（不使用 scrollIntoView，因为它操作的是 cm-scroller）
        view.dispatch({
          selection: { anchor: line.from },
        });
        // 使用外层滚动容器来滚动
        requestAnimationFrame(() => {
          const coords = view.coordsAtPos(line.from);
          if (coords) {
            // 向上查找真正的滚动容器
            let scrollContainer: HTMLElement | null = view.dom.parentElement;
            while (scrollContainer) {
              const { overflow, overflowY } = getComputedStyle(scrollContainer);
              if (overflow === 'auto' || overflow === 'scroll' ||
                  overflowY === 'auto' || overflowY === 'scroll') {
                break;
              }
              scrollContainer = scrollContainer.parentElement;
            }
            if (scrollContainer) {
              const containerRect = scrollContainer.getBoundingClientRect();
              const offset = coords.top - containerRect.top;
              scrollContainer.scrollBy({ top: offset - 20, behavior: 'smooth' });
            }
          }
        });
        return;
      }
      headingCount++;
    }
  }
}

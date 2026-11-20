import {
  Editor,
  rootCtx,
  defaultValueCtx,
  editorViewCtx,
  parserCtx,
  serializerCtx,
} from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import { EditorState } from '@milkdown/kit/prose/state';
import { Fragment, type Node as ProseNode } from '@milkdown/kit/prose/model';
import { commonmark, headingIdGenerator, headingSchema } from '@milkdown/kit/preset/commonmark';
import {
  remarkGFMPlugin,
  schema as gfmSchema,
  inputRules as gfmInputRules,
  pasteRules as gfmPasteRules,
  keymap as gfmKeymap,
  commands as gfmCommands,
  plugins as gfmPlugins,
  strikethroughSchema,
  wrapInTaskListInputRule,
} from '@milkdown/kit/preset/gfm';
import { markRule } from '@milkdown/kit/prose';
import { $inputRule } from '@milkdown/kit/utils';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx, key as listenerPluginKey } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { cursor } from '@milkdown/kit/plugin/cursor';
import { indent } from '@milkdown/kit/plugin/indent';
import { trailing } from '@milkdown/kit/plugin/trailing';
import { upload } from '@milkdown/plugin-upload';
import { listItemBlockConfig } from '@milkdown/kit/component/list-item-block';
import { imageInlineComponent } from '@milkdown/kit/component/image-inline';
import { listItemBlockComponent } from './plugins/list-item-block';
import { taskListInputRule } from './plugins/task-list-input-rule';
import { slash, configureSlash } from './plugins/slash-menu';
import { block, configureBlock } from './plugins/block-handle';
import { tooltip, configureTooltip } from './plugins/tooltip-toolbar';
import {
  linkInputRulePlugin,
  linkBlurPlugin,
  linkPastePlugin,
  linkTooltip,
  configureLinkTooltip,
  linkClickPlugin,
  linkContextMenuPlugin,
} from './plugins/link';
import { underlineMarkSchema, remarkUnderlinePlugin } from './plugins/underline-mark';
import {
  highlightMarkSchema,
  remarkHighlightPlugin,
  highlightInputRulePlugin,
} from './plugins/highlight-mark';
import {
  superscriptMarkSchema,
  remarkSuperscriptPlugin,
  superscriptInputRulePlugin,
} from './plugins/superscript-mark';
import {
  subscriptMarkSchema,
  remarkSubscriptPlugin,
  subscriptInputRulePlugin,
} from './plugins/subscript-mark';
import {
  imageBlockComponent,
  configureImageBlock,
  extendedImageBlockSchema,
  remarkHtmlImagePlugin,
  imageBlockPastePlugin,
  imageBlockToolbarPlugin,
  imageBlockContextMenuPlugin,
  imageUploadProgressPlugin,
  imageInputRulePlugin,
  imageResizePlugin,
  imageBlockClickPlugin,
  openImageDialog,
} from './plugins/image-block';
import {
  configureImageInline,
  imageInlineToolbarPlugin,
  imageInlineResizePlugin,
  imageInlineClickPlugin,
  setOpenImageDialogForInlineEdit,
} from './plugins/image-inline';
import { imagePreviewPlugin } from './plugins/image-preview';
import { codeBlockComponent, configureCodeBlock } from './plugins/code-block';
import { tableHandlePlugin, extendedTableSchema } from './plugins/table-block';
import { remarkGfmAlertPlugin, gfmAlertSchema } from './plugins/gfm-alert';
import { mermaidBlockPlugin } from './plugins/mermaid-block';
import {
  remarkMathInline,
  mathInlineSchema,
  mathInlineView,
  mathInlineInputRulePlugin,
  mathInlineSelectionPlugin,
  mathInlineKeymapPlugin,
  mathInlineDollarTriggerPlugin,
} from './plugins/math-inline';
import {
  remarkMathBlock,
  mathBlockSchema,
  mathBlockView,
  mathBlockGuardPlugin,
} from './plugins/math-block';
import {
  remarkFrontMatter,
  frontMatterSchema,
  frontMatterView,
  frontMatterGuardPlugin,
} from './plugins/front-matter';
import {
  remarkTocPlugin,
  tocBlockSchema,
  tocBlockView,
  tocUpdatePlugin,
  tocInputRulePlugin,
} from './plugins/toc-block';
import {
  fileBlockSchema,
  fileBlockView,
  fileBlockRemarkPlugin,
} from './plugins/file-block';
import {
  boardBlockSchema,
  remarkBoardPlugin,
  boardBlockView,
} from './plugins/board-block';
import { placeholderPlugin } from './plugins/placeholder';
import { searchHighlightPlugin } from './plugins/search-highlight';
import { outlineSyncPlugin } from './plugins/outline-sync';
import { editorKeymapPlugin } from './plugins/editor-keymap';
import { focusModePlugin } from './plugins/focus-mode';
import { typewriterPlugin } from './plugins/typewriter-mode';
import { aiKeymapPlugin, aiMarkdownBridgePlugin } from './plugins/ai-edit';
import '@milkdown/kit/prose/view/style/prosemirror.css';
import 'katex/dist/katex.min.css';
import type { EditorView } from '@milkdown/kit/prose/view';

// ---------------------------------------------------------------------------
// 自定义删除线 InputRule：仅匹配双波浪线 ~~text~~
// ---------------------------------------------------------------------------
// GFM 自带的 strikethroughInputRule 使用 ~{1,2} 同时匹配单/双波浪线，
// 与下标插件的 ~text~ 语法冲突。此处替换为仅匹配 ~~text~~ 的版本。
// remarkGFMPlugin 的 singleTilde: false 仅影响 remark 解析层，
// 不影响 ProseMirror InputRule 层，因此必须在 InputRule 层也做限制。
const strikethroughDoubleTildeInputRule = $inputRule((ctx) => {
  return markRule(/(?<![\w:/])~~(.+?)~~$/, strikethroughSchema.type(ctx));
});

// 组合 GFM 插件：
// - 排除 markInputRules，用仅匹配 ~~text~~ 的自定义版本替代
// - 排除官方 wrapInTaskListInputRule：它只在已有列表项内生效，无法从普通段落一步生成任务列表
const gfm = [
  gfmSchema,
  gfmInputRules.filter((rule) => rule !== wrapInTaskListInputRule),
  gfmPasteRules,
  [strikethroughDoubleTildeInputRule],
  taskListInputRule,
  gfmKeymap,
  gfmCommands,
  gfmPlugins,
].flat();

export type EditorListener = {
  onMarkdownUpdated?: (markdown: string, prevMarkdown: string) => void;
  /** 在同一次防抖回调中先于 onMarkdownUpdated 触发，doc 即本次将被序列化的文档 */
  onDocUpdated?: (doc: ProseNode) => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

// SVG icons for the list-item-block component (checkbox & bullet)
const bulletIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`;
const checkBoxCheckedIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8.29 13.29a.996.996 0 0 1-1.41 0L5.71 12.7a.996.996 0 1 1 1.41-1.41L10 14.17l6.88-6.88a.996.996 0 1 1 1.41 1.41l-7.58 7.59z"/></svg>`;
const checkBoxUncheckedIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M18 19H6c-.55 0-1-.45-1-1V6c0-.55.45-1 1-1h12c.55 0 1 .45 1 1v12c0 .55-.45 1-1 1zM19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/></svg>`;

// Register the inline image edit dialog function
// This reuses the same dialog as image-block, but updates inline image nodes

async function openImageDialogForInlineEdit(
  view: EditorView,
  nodePos: number,
): Promise<void> {
  const result = await openImageDialog();
  if (!result || !result.src) return;

  const { state, dispatch } = view;
  try {
    const resolvedPos = state.doc.resolve(nodePos);
    const node = resolvedPos.nodeAfter;
    if (node && node.type.name === 'image') {
      // Use setNodeAttribute for inline nodes
      const tr = state.tr.setNodeMarkup(nodePos, undefined, {
        ...node.attrs,
        src: result.src,
      });
      dispatch(tr);
    }
  } catch (e) {
    console.warn('Failed to update inline image:', e);
  }
  view.focus();
}

// 将函数注册到工具栏插件
setOpenImageDialogForInlineEdit(openImageDialogForInlineEdit);

export function createEditor(root: HTMLElement, defaultValue: string) {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root);
      ctx.set(defaultValueCtx, defaultValue);
      // Configure list-item-block rendering (checkbox icons for task lists)
      ctx.set(listItemBlockConfig.key, {
        renderLabel: ({ label, listType, checked }) => {
          if (checked == null) {
            if (listType === 'bullet') return bulletIcon;
            return label;
          }
          if (checked) return checkBoxCheckedIcon;
          return checkBoxUncheckedIcon;
        },
      });
      // 禁用 GFM strikethrough 的 singleTilde，使 ~text~ 不被当作删除线解析。
      // 删除线仅使用 ~~text~~（双波浪线），为 subscript 下标语法 ~text~ 让出空间。
      ctx.set(remarkGFMPlugin.options.key, { singleTilde: false });
    })
    .config(configureSlash)
    .config(configureBlock)
    .config(configureTooltip)
    .config(configureLinkTooltip)
    .config(configureImageBlock)
    .config(configureImageInline)
    .config(configureCodeBlock)
    .use(commonmark)
    .use(gfm)
    .use(frontMatterSchema)
    .use(remarkFrontMatter)
    .use(frontMatterView)
    .use(frontMatterGuardPlugin)
    .use(tocBlockSchema)
    .use(remarkTocPlugin)
    .use(tocBlockView)
    .use(tocUpdatePlugin)
    .use(tocInputRulePlugin)
    .use(underlineMarkSchema)
    .use(remarkUnderlinePlugin)
    .use(highlightMarkSchema)
    .use(remarkHighlightPlugin)
    .use(highlightInputRulePlugin)
    .use(superscriptMarkSchema)
    .use(remarkSuperscriptPlugin)
    .use(superscriptInputRulePlugin)
    .use(subscriptMarkSchema)
    .use(remarkSubscriptPlugin)
    .use(subscriptInputRulePlugin)
    .use(gfmAlertSchema)
    .use(remarkGfmAlertPlugin)
    .use(listItemBlockComponent)
    .use(imageBlockComponent)
    .use(imageInlineComponent)
    .use(extendedImageBlockSchema)
    .use(remarkHtmlImagePlugin)
    .use(linkPastePlugin)
    .use(imageBlockPastePlugin)
    .use(imageBlockToolbarPlugin)
    .use(imageBlockContextMenuPlugin)
    .use(imageUploadProgressPlugin)
    .use(imageInputRulePlugin)
    .use(linkInputRulePlugin)
    .use(linkBlurPlugin)
    .use(linkClickPlugin)
    .use(linkContextMenuPlugin)
    .use(imageResizePlugin)
    .use(imageBlockClickPlugin)
    .use(imageInlineToolbarPlugin)
    .use(imageInlineResizePlugin)
    .use(imagePreviewPlugin)
    .use(imageInlineClickPlugin)
    .use(codeBlockComponent)
    .use(extendedTableSchema)
    .use(tableHandlePlugin)
    .use(mermaidBlockPlugin)
    .use(mathInlineSchema)
    .use(remarkMathInline)
    .use(mathInlineView)
    .use(mathInlineInputRulePlugin)
    .use(mathInlineDollarTriggerPlugin)
    .use(mathInlineSelectionPlugin)
    .use(mathInlineKeymapPlugin)
    .use(mathBlockSchema)
    .use(remarkMathBlock)
    .use(mathBlockView)
    .use(mathBlockGuardPlugin)
    .use(fileBlockSchema)
    .use(fileBlockRemarkPlugin)
    .use(fileBlockView)
    .use(boardBlockSchema)
    .use(remarkBoardPlugin)
    .use(boardBlockView)
    .use(placeholderPlugin)
    .use(searchHighlightPlugin)
    .use(outlineSyncPlugin)
    .use(editorKeymapPlugin)
    .use(focusModePlugin)
    .use(typewriterPlugin)
    .use(aiMarkdownBridgePlugin)
    .use(aiKeymapPlugin)
    .use(history)
    .use(listener)
    .use(clipboard)
    .use(cursor)
    .use(indent)
    .use(trailing)
    .use(upload)
    .use(slash)
    .use(block)
    .use(tooltip)
    .use(linkTooltip);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setupEditorListeners(
  editor: { action: (fn: (ctx: any) => void) => void },
  listeners?: EditorListener,
) {
  editor.action((ctx) => {
    const manager = ctx.get(listenerCtx);
    if (!manager) return;

    manager
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .markdownUpdated((_ctx: any, markdown: string, prevMarkdown: string) => {
        listeners?.onMarkdownUpdated?.(markdown, prevMarkdown);
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .updated((_ctx: any, doc: ProseNode) => {
        listeners?.onDocUpdated?.(doc);
      })
      .focus(() => {
        listeners?.onFocus?.();
      })
      .blur(() => {
        listeners?.onBlur?.();
      });
  });
}

/**
 * 预先为文档中的标题写入 id 属性，返回新文档（无变化时返回原文档）
 *
 * 为什么需要：commonmark 预设的 syncHeadingIdPlugin 会在每次文档变化后遍历全文，
 * 对 id 不一致的标题逐个 setNodeMarkup 再 dispatch。新解析出的文档所有标题 id 都为空，
 * 大文档切换时这次额外 dispatch 会再做一轮完整 DOM diff + 强制布局（实测 400ms+）。
 * 在建 State 之前一次性重建节点树写入 id，插件随后校验时发现一致便不会再 dispatch。
 *
 * 逻辑与 syncHeadingIdPlugin 保持一致：文档先序遍历、空标题跳过、重复 id 追加 `-#n`。
 */
function assignHeadingIds(ctx: Ctx, doc: ProseNode): ProseNode {
  const getId = ctx.get(headingIdGenerator.key);
  const headingType = headingSchema.type(ctx);
  const idMap: Record<string, number> = {};

  const visit = (node: ProseNode): ProseNode => {
    if (node.type === headingType) {
      if (node.textContent.trim().length === 0) return node;
      let id = getId(node);
      if (idMap[id]) {
        idMap[id] += 1;
        id += `-#${idMap[id]}`;
      } else {
        idMap[id] = 1;
      }
      if (node.attrs.id === id) return node;
      return node.type.create({ ...node.attrs, id }, node.content, node.marks);
    }
    // 文本块内部不可能再嵌套标题，无需深入
    if (node.isTextblock || node.isLeaf) return node;

    let changed = false;
    const children: ProseNode[] = [];
    node.forEach((child) => {
      const next = visit(child);
      if (next !== child) changed = true;
      children.push(next);
    });
    return changed ? node.copy(Fragment.fromArray(children)) : node;
  };

  return visit(doc);
}

/** 解析结果缓存容量：用户常在少数几个文件间来回切换 */
const PARSED_DOC_CACHE_SIZE = 4;
/** 小于该长度的文档解析很快，不值得占用缓存 */
const PARSED_DOC_CACHE_MIN_LENGTH = 10_000;

/**
 * 按编辑器实例缓存 markdown -> ProseMirror doc 的解析结果（LRU）
 *
 * ProseMirror 节点不可变且与 schema 绑定，同一编辑器实例内可安全复用；
 * 以完整内容字符串为键，内容一旦变化自然不会命中。编辑器销毁后随 WeakMap 回收。
 */
const parsedDocCache = new WeakMap<Editor, Map<string, ProseNode>>();

function parseWithCache(editor: Editor, ctx: Ctx, markdown: string): ProseNode {
  const parse = () => assignHeadingIds(ctx, ctx.get(parserCtx)(markdown));
  if (markdown.length < PARSED_DOC_CACHE_MIN_LENGTH) return parse();

  let cache = parsedDocCache.get(editor);
  if (!cache) {
    cache = new Map();
    parsedDocCache.set(editor, cache);
  }
  const cached = cache.get(markdown);
  if (cached) {
    // 重新插入以刷新 LRU 顺序
    cache.delete(markdown);
    cache.set(markdown, cached);
    return cached;
  }
  const doc = parse();
  cache.set(markdown, doc);
  if (cache.size > PARSED_DOC_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  return doc;
}

/** switchDocument 的返回信息，供调用方处理 listener 相关的边界情况 */
export interface SwitchDocumentResult {
  /** 切换前（旧文件）的文档对象，用于识别旧文件遗留的防抖回调 */
  previousDoc: ProseNode;
  /** 新文件解析出的文档对象 */
  nextDoc: ProseNode;
  /**
   * 是否跳过了 listener 插件的状态初始化。
   * 为 true 时 listener 内部的 prevMarkdown 仍是旧文件的内容，
   * 调用方需要自行以 nextDoc 的序列化结果作为“未修改”基线。
   */
  listenerInitSkipped: boolean;
}

/**
 * 切换文档内容（不销毁/重建编辑器实例）
 *
 * 原理：创建全新的 EditorState（含新文档 + 空 undo 历史），
 * 通过 view.updateState() 替换，ProseMirror 会 diff 新旧 DOM 做最小更新。
 *
 * 性能处理：
 * - 大文档解析结果按内容做 LRU 缓存，来回切换时免去 remark 解析
 * - 预先写入标题 id，避免 syncHeadingIdPlugin 触发第二轮全量更新
 * - 跳过 listener 插件 state.init 中对整篇文档的同步序列化（大文档 100~200ms），
 *   基线序列化推迟到第一次 markdownUpdated 回调时再按需计算
 *
 * @param editor Milkdown Editor 实例
 * @param newMarkdown 新文件的 markdown 内容
 */
export function switchDocument(editor: Editor, newMarkdown: string): SwitchDocumentResult {
  let result: SwitchDocumentResult | null = null;

  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const previousDoc = view.state.doc;

    // 1. 将 markdown 解析为 ProseMirror doc（已预先写入标题 id，命中缓存时跳过解析）
    const doc = parseWithCache(editor, ctx, newMarkdown);

    // 2. 创建全新的 EditorState（复用当前插件集，重置 history）
    //    创建期间临时替换 listener 插件的 state.init（其原实现只做全文序列化并缓存到闭包中）
    const listenerStateSpec = view.state.plugins.find(
      (plugin) => plugin.spec.key === listenerPluginKey,
    )?.spec.state;
    const originalInit = listenerStateSpec?.init;
    const listenerInitSkipped = !!listenerStateSpec && !!originalInit;
    if (listenerStateSpec && originalInit) {
      listenerStateSpec.init = () => undefined;
    }
    let newState: EditorState;
    try {
      newState = EditorState.create({ doc, plugins: view.state.plugins });
    } finally {
      if (listenerStateSpec && originalInit) {
        listenerStateSpec.init = originalInit;
      }
    }

    // 3. 替换 EditorView 的 State
    view.updateState(newState);

    // 4. 触发一次空事务，让依赖 dispatch 的插件（如大纲、占位符）刷新一次
    //    （updateState 不走 dispatchTransaction）
    view.dispatch(view.state.tr);

    result = { previousDoc, nextDoc: doc, listenerInitSkipped };
  });

  if (!result) throw new Error('switchDocument: editor is not ready');
  return result;
}

/** 使用编辑器的序列化器把指定文档转为 markdown */
export function serializeDoc(editor: Editor, doc: ProseNode): string {
  let markdown = '';
  editor.action((ctx) => {
    markdown = ctx.get(serializerCtx)(doc);
  });
  return markdown;
}

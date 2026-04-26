/**
 * AI 流式生成器：负责调用 ai-service，按 insertMode 分发到不同交互模式。
 *
 * 支持 7 种 insertMode：
 * - `replace-selection`：用生成结果覆盖原选区
 * - `insert-after`：在所选块之后插入新段落
 * - `insert-as-mermaid`：插入 language="mermaid" 的 code_block
 * - `insert-as-latex`：插入 math_block 节点
 * - `inline-diff`：润色行内 diff 展示
 * - `popup-translate`：翻译就地弹窗
 * - `popup-explain`：解释就地弹窗
 */

import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';

import { aiService } from '@/services';
import { useAiStore } from '@/stores/ai-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { AiChatMessage, AiChatParams, AiCommand, AiInsertMode, AiPromptInput } from '@/types/ai';

import { setMermaidAutoEdit } from '../mermaid-block';
import { createPlaceholder } from './placeholder';
import { showInlineDiff } from './inline-diff';
import { createPolishPopup } from './polish-popup';
import { createAiPopup, TRANSLATE_LANGUAGES } from './ai-popup';
import type { TranslateLanguageId } from './ai-popup';
import { createGeneratorPopup } from './generator-popup';
import type { GeneratorPopupType } from './generator-popup';
import { showFirstUseGuide } from './first-use-guide';
import type { AiRunContext } from './types';

// ---------------------------------------------------------------------------
// 对外入口
// ---------------------------------------------------------------------------

/**
 * 执行一个 AI 指令。
 *
 * @param view - ProseMirror EditorView
 * @param command - 指令元数据
 * @param extra - 额外输入（如参数型指令的 arg、fullDocument 等）
 */
export async function runAiCommand(
  view: EditorView,
  command: AiCommand,
  extra?: Partial<AiPromptInput>,
): Promise<void> {
  const ctx = buildRunContext(view, command);

  // 指令要求必须有选中文本
  if (command.requireSelection && !ctx.selection.trim()) {
    window.alert('请先选中一段文本再使用此指令');
    return;
  }

  // Key 未配置时弹出引导对话框
  await useAiStore.getState().refreshKeyStatus();
  const { config } = useSettingsStore.getState();
  const providerId = config.ai?.currentProvider ?? 'zhipu';
  const hasKey = useAiStore.getState().keyStatus[providerId];
  if (!hasKey) {
    void showFirstUseGuide();
    return;
  }

  const model =
    config.ai?.selectedModels?.[providerId] ??
    (providerId === 'zhipu' ? 'glm-4-flash' : '');
  if (!model) {
    void showFirstUseGuide();
    return;
  }

  // 合并 extra 参数到 prompt input
  const promptInput: AiPromptInput = {
    selection: ctx.selection,
    context: ctx.context,
    ...extra,
  };

  const messages: AiChatMessage[] = command.buildPrompt(promptInput);

  const params: AiChatParams = {
    providerId,
    model,
    messages,
    temperature: config.ai?.temperature,
    maxTokens: config.ai?.maxTokens,
    customBaseUrl:
      providerId === 'custom' ? config.ai?.customBaseUrl : undefined,
  };

  await runStreaming(ctx, params, extra);
}

// ---------------------------------------------------------------------------
// 运行上下文构造
// ---------------------------------------------------------------------------

function buildRunContext(view: EditorView, command: AiCommand): AiRunContext {
  const { state } = view;
  const { from, to } = state.selection;

  let selection = '';
  if (from !== to) {
    selection = state.doc.textBetween(from, to, '\n', '\n');
  }

  // 取光标所在段落及其之前最多 3 段的文本作为上下文
  let context = '';
  try {
    const $pos = state.doc.resolve(from);
    const blockStart = $pos.start($pos.depth);
    const startPos = Math.max(0, blockStart - 600);
    context = state.doc.textBetween(startPos, from, '\n', '\n');
  } catch {
    // 定位失败则留空
  }

  return {
    view,
    command,
    from,
    to,
    selection,
    context,
  };
}

// ---------------------------------------------------------------------------
// 流式运行核心 - 按 insertMode 分发
// ---------------------------------------------------------------------------

async function runStreaming(
  ctx: AiRunContext,
  params: AiChatParams,
  extra?: Partial<AiPromptInput>,
): Promise<void> {
  const { command } = ctx;

  switch (command.insertMode) {
    case 'inline-diff':
      return runPolishWithDiff(ctx, params);
    case 'popup-translate':
      return runTranslatePopup(ctx, params, extra);
    case 'popup-explain':
      return runExplainPopup(ctx, params);
    case 'insert-as-mermaid':
      return runWithGeneratorPopup(ctx, params, 'mermaid', extra);
    case 'insert-as-latex':
      return runWithGeneratorPopup(ctx, params, 'latex', extra);
    default:
      return runWithPlaceholder(ctx, params);
  }
}

// ---------------------------------------------------------------------------
// 润色：行内 diff 模式
// ---------------------------------------------------------------------------

async function runPolishWithDiff(ctx: AiRunContext, params: AiChatParams): Promise<void> {
  const { view, command } = ctx;

  let accumulated = '';
  let finished = false;
  let cancelFn: (() => Promise<void>) | null = null;
  // diff 句柄，润色完成后创建
  let diffHandle: ReturnType<typeof showInlineDiff> | null = null;

  // 创建润色弹窗（和编辑区等宽，在选区下方）
  const popup = createPolishPopup({
    view,
    from: ctx.from,
    to: ctx.to,
    onAccept: () => {
      // 接受：应用 diff 中的最终文本
      if (diffHandle) {
        diffHandle.accept();
      }
    },
    onReject: () => {
      // 拒绝：销毁 diff，不做任何修改
      if (diffHandle) {
        diffHandle.destroy();
      }
      // 取消可能还在进行的请求
      if (cancelFn && !finished) void cancelFn();
    },
  });

  try {
    const handle = await aiService.startAiStream(params, {
      onDelta: (delta) => {
        accumulated += delta;
        popup.setStreaming();
      },
      onDone: () => {
        if (finished) return;
        finished = true;
        useAiStore.getState().untrackRequest(handle.requestId);

        const revisedText = cleanOutput(command.insertMode, accumulated);

        // 在编辑器原文位置展示 diff
        diffHandle = showInlineDiff({
          view,
          from: ctx.from,
          to: ctx.to,
          original: ctx.selection,
          revised: revisedText,
          onAccept: (finalText) => {
            replaceSelectionWithText(view, ctx.from, ctx.to, finalText);
            recordAiHistory(command, accumulated, ctx.selection);
          },
          onReject: () => {
            // 拒绝：不做任何操作，恢复原状
          },
        });

        // 弹窗显示"已完成"
        popup.setDone();
      },
      onError: (err) => {
        if (finished) return;
        finished = true;
        useAiStore.getState().untrackRequest(handle.requestId);
        if (err.code === 'canceled') {
          popup.destroy();
          return;
        }
        const errorMsg = getErrorMessage(err.code, err.message);
        popup.setError(errorMsg);
      },
    });

    cancelFn = handle.cancel;
    useAiStore.getState().trackRequest({
      requestId: handle.requestId,
      cancel: handle.cancel,
    });
  } catch (e) {
    finished = true;
    const msg = e instanceof Error ? e.message : String(e);
    popup.setError(getErrorMessage('unknown', msg));
  }
}

// ---------------------------------------------------------------------------
// 翻译：就地弹窗模式
// ---------------------------------------------------------------------------

async function runTranslatePopup(
  ctx: AiRunContext,
  params: AiChatParams,
  extra?: Partial<AiPromptInput>,
): Promise<void> {
  const { view, command } = ctx;

  /** 当前活跃的取消函数 */
  let cancelFn: (() => Promise<void>) | null = null;
  /** 当前请求 ID */
  let currentRequestId: string | null = null;

  const popup = createAiPopup({
    view,
    from: ctx.from,
    to: ctx.to,
    mode: 'translate',
    onReplace: (text) => {
      replaceSelectionWithText(view, ctx.from, ctx.to, text);
      recordAiHistory(command, text, ctx.selection);
    },
    onInsertAfter: (text) => {
      insertAfterBlock(view, ctx.to, text);
      recordAiHistory(command, text, ctx.selection);
    },
    onClose: () => {
      // 取消正在进行的请求
      if (cancelFn) void cancelFn();
    },
    onLanguageChange: (langId: TranslateLanguageId) => {
      // 取消当前进行中的请求
      if (cancelFn) {
        void cancelFn();
        cancelFn = null;
      }
      if (currentRequestId) {
        useAiStore.getState().untrackRequest(currentRequestId);
        currentRequestId = null;
      }

      // 用新语言重新构建 prompt 并发起请求
      const langLabel = TRANSLATE_LANGUAGES.find((l) => l.id === langId)?.label ?? '英语';
      const newPromptInput: AiPromptInput = {
        selection: ctx.selection,
        ...extra,
        options: { ...(extra?.options ?? {}), targetLang: langLabel },
      };
      const newMessages = command.buildPrompt(newPromptInput);
      const newParams: AiChatParams = { ...params, messages: newMessages };

      popup.resetContent();
      void startTranslateStream(newParams);
    },
  });

  /** 启动翻译流式请求 */
  async function startTranslateStream(streamParams: AiChatParams) {
    try {
      const handle = await aiService.startAiStream(streamParams, {
        onDelta: (delta) => {
          popup.appendContent(delta);
        },
        onDone: () => {
          popup.setDone();
          if (currentRequestId) {
            useAiStore.getState().untrackRequest(currentRequestId);
            currentRequestId = null;
          }
        },
        onError: (err) => {
          if (currentRequestId) {
            useAiStore.getState().untrackRequest(currentRequestId);
            currentRequestId = null;
          }
          if (err.code === 'canceled') return;
          popup.setError(getErrorMessage(err.code, err.message));
        },
      });

      cancelFn = handle.cancel;
      currentRequestId = handle.requestId;
      useAiStore.getState().trackRequest({
        requestId: handle.requestId,
        cancel: handle.cancel,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      popup.setError(getErrorMessage('unknown', msg));
    }
  }

  // 初次启动
  await startTranslateStream(params);
}

// ---------------------------------------------------------------------------
// 解释：就地弹窗模式（仅关闭）
// ---------------------------------------------------------------------------

async function runExplainPopup(ctx: AiRunContext, params: AiChatParams): Promise<void> {
  const { command } = ctx;

  let cancelFn: (() => Promise<void>) | null = null;
  let accumulated = '';

  const popup = createAiPopup({
    view: ctx.view,
    from: ctx.from,
    to: ctx.to,
    mode: 'explain',
    onClose: () => {
      if (cancelFn) void cancelFn();
    },
  });

  try {
    const handle = await aiService.startAiStream(params, {
      onDelta: (delta) => {
        accumulated += delta;
        popup.appendContent(delta);
      },
      onDone: () => {
        popup.setDone();
        useAiStore.getState().untrackRequest(handle.requestId);
        recordAiHistory(command, accumulated, ctx.selection);
      },
      onError: (err) => {
        useAiStore.getState().untrackRequest(handle.requestId);
        if (err.code === 'canceled') {
          popup.destroy();
          return;
        }
        popup.setError(getErrorMessage(err.code, err.message));
      },
    });

    cancelFn = handle.cancel;
    useAiStore.getState().trackRequest({
      requestId: handle.requestId,
      cancel: handle.cancel,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    popup.setError(getErrorMessage('unknown', msg));
  }
}

// ---------------------------------------------------------------------------
// 转图表/转公式：generator-popup 弹窗模式
// ---------------------------------------------------------------------------

async function runWithGeneratorPopup(
  ctx: AiRunContext,
  params: AiChatParams,
  popupType: GeneratorPopupType,
  extra?: Partial<AiPromptInput>,
): Promise<void> {
  const { view, command } = ctx;

  let cancelFn: (() => Promise<void>) | null = null;
  let currentRequestId: string | null = null;
  let finished = false;
  /** 记录用户最近一次输入的自然语言描述，用于写入历史记录 */
  let lastUserArg = '';

  /** 启动流式生成 */
  async function startStream(arg: string) {
    finished = false;

    // 用 arg 重新构建 prompt
    const promptInput: AiPromptInput = {
      selection: ctx.selection,
      context: ctx.context,
      ...extra,
      arg,
    };
    const messages: AiChatMessage[] = command.buildPrompt(promptInput);
    const streamParams: AiChatParams = { ...params, messages };

    try {
      const handle = await aiService.startAiStream(streamParams, {
        onDelta: (delta) => {
          popup.appendContent(delta);
        },
        onDone: () => {
          if (finished) return;
          finished = true;
          popup.setDone();
          if (currentRequestId) {
            useAiStore.getState().untrackRequest(currentRequestId);
            currentRequestId = null;
          }
        },
        onError: (err) => {
          if (finished) return;
          finished = true;
          if (currentRequestId) {
            useAiStore.getState().untrackRequest(currentRequestId);
            currentRequestId = null;
          }
          if (err.code === 'canceled') return;
          popup.setError(getErrorMessage(err.code, err.message));
        },
      });

      cancelFn = handle.cancel;
      currentRequestId = handle.requestId;
      useAiStore.getState().trackRequest({
        requestId: handle.requestId,
        cancel: handle.cancel,
      });
    } catch (e) {
      finished = true;
      const msg = e instanceof Error ? e.message : String(e);
      popup.setError(getErrorMessage('unknown', msg));
    }
  }

  /** 取消当前正在进行的请求 */
  function cancelCurrent() {
    if (cancelFn && !finished) void cancelFn();
    if (currentRequestId) {
      useAiStore.getState().untrackRequest(currentRequestId);
      currentRequestId = null;
    }
    cancelFn = null;
  }

  const popup = createGeneratorPopup({
    view,
    pos: ctx.from,
    type: popupType,
    onStart: (arg) => {
      lastUserArg = arg;
      popup.switchToResult();
      void startStream(arg);
    },
    onAccept: (result) => {
      cancelCurrent();
      const cleanedText = cleanOutput(command.insertMode, result);
      commitResult(ctx, cleanedText);
      // 转图表/转公式没有选区原文，用用户输入的自然语言描述作为 originalText
      recordAiHistory(command, result, lastUserArg || undefined);
    },
    onReject: () => {
      cancelCurrent();
    },
    onRetry: (arg) => {
      lastUserArg = arg;
      // 取消当前请求，用修改后的输入重新生成
      cancelCurrent();
      void startStream(arg);
    },
    onClose: () => {
      cancelCurrent();
    },
  });

  // 如果 extra.arg 已存在（从 slash menu 直接传参数的场景），跳过阶段 1 直接生成
  if (extra?.arg) {
    lastUserArg = extra.arg;
    popup.switchToResult();
    void startStream(extra.arg);
  }
}

// ---------------------------------------------------------------------------
// 占位符模式（通用）
// ---------------------------------------------------------------------------

async function runWithPlaceholder(ctx: AiRunContext, params: AiChatParams): Promise<void> {
  const { view, command } = ctx;

  const placeholder = createPlaceholder(view, ctx.to);

  let accumulated = '';
  let finished = false;
  let cancelFn: (() => Promise<void>) | null = null;

  const onCancel = () => {
    if (cancelFn) void cancelFn();
  };

  placeholder.setCancelHandler(onCancel);

  placeholder.setCommitHandler(() => {
    placeholder.destroy();
    const cleanedText = cleanOutput(command.insertMode, accumulated);
    commitResult(ctx, cleanedText);
    recordAiHistory(command, accumulated, ctx.selection);
  });

  placeholder.setRetryHandler(() => {
    placeholder.destroy();
    void runWithPlaceholder(ctx, params);
  });

  try {
    const handle = await aiService.startAiStream(params, {
      onDelta: (delta) => {
        accumulated += delta;
        placeholder.setStatus('streaming');
        placeholder.textEl.appendChild(document.createTextNode(delta));
      },
      onDone: () => {
        if (finished) return;
        finished = true;
        placeholder.setStatus('done');
        useAiStore.getState().untrackRequest(handle.requestId);
      },
      onError: (err) => {
        if (finished) return;
        finished = true;
        useAiStore.getState().untrackRequest(handle.requestId);
        if (err.code === 'canceled') {
          placeholder.destroy();
          return;
        }
        placeholder.setStatus('error');
        const errorMsg = getErrorMessage(err.code, err.message);
        placeholder.textEl.textContent = errorMsg;
      },
    });

    cancelFn = handle.cancel;
    useAiStore.getState().trackRequest({
      requestId: handle.requestId,
      cancel: handle.cancel,
    });
  } catch (e) {
    finished = true;
    placeholder.setStatus('error');
    const msg = e instanceof Error ? e.message : String(e);
    placeholder.textEl.textContent = getErrorMessage('unknown', msg);
  }
}

// ---------------------------------------------------------------------------
// 最终结果写入文档
// ---------------------------------------------------------------------------

/**
 * 根据 insertMode 将最终的 AI 文本写入文档。
 */
function commitResult(ctx: AiRunContext, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  const { view, command } = ctx;
  const mode = command.insertMode;

  if (mode === 'replace-selection') {
    replaceSelectionWithText(view, ctx.from, ctx.to, trimmed);
    return;
  }

  if (mode === 'insert-as-mermaid') {
    insertAsMermaid(view, ctx.to, trimmed);
    return;
  }

  if (mode === 'insert-as-latex') {
    insertAsLatex(view, ctx.to, trimmed);
    return;
  }

  // insert-after
  insertAfterBlock(view, ctx.to, trimmed);
}

/**
 * 将 [from, to] 范围替换为纯文本。
 */
function replaceSelectionWithText(
  view: EditorView,
  from: number,
  to: number,
  text: string,
): void {
  const { state, dispatch } = view;
  const schema = state.schema;
  const hardBreak = schema.nodes.hard_break;

  const lines = text.split('\n');
  const nodes: ProseNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0 && hardBreak) nodes.push(hardBreak.create());
    if (line.length > 0) nodes.push(schema.text(line));
  });

  if (nodes.length === 0) return;
  const tr = state.tr.replaceWith(from, to, nodes);
  const newPos = from + nodes.reduce((acc, n) => acc + n.nodeSize, 0);
  tr.setSelection(TextSelection.near(tr.doc.resolve(newPos)));
  dispatch(tr.scrollIntoView());
  view.focus();
}

/**
 * 在 `to` 所在块之后插入一个新段落。
 */
function insertAfterBlock(view: EditorView, pos: number, text: string): void {
  const { state, dispatch } = view;
  const schema = state.schema;
  const paragraph = schema.nodes.paragraph;
  if (!paragraph) return;

  let insertPos = pos;
  try {
    const $pos = state.doc.resolve(pos);
    insertPos = $pos.after($pos.depth);
  } catch {
    insertPos = pos;
  }

  const lines = text.split('\n');
  const paragraphs = lines.map((line) => {
    const inline = line.length > 0 ? [schema.text(line)] : [];
    return paragraph.create(null, inline);
  });

  if (paragraphs.length === 0) return;

  const tr = state.tr.insert(insertPos, paragraphs);
  const firstPos = insertPos + 1;
  tr.setSelection(TextSelection.near(tr.doc.resolve(firstPos)));
  dispatch(tr.scrollIntoView());
  view.focus();
}

/**
 * 插入 language="mermaid" 的 code_block。
 */
function insertAsMermaid(view: EditorView, pos: number, text: string): void {
  const { state, dispatch } = view;
  const schema = state.schema;
  const codeBlock = schema.nodes.code_block;
  if (!codeBlock) {
    insertAfterBlock(view, pos, text);
    return;
  }

  let insertPos = pos;
  try {
    const $pos = state.doc.resolve(pos);
    insertPos = $pos.after($pos.depth);
  } catch {
    insertPos = pos;
  }

  const mermaidNode = codeBlock.create(
    { language: 'mermaid' },
    text.length > 0 ? [schema.text(text)] : undefined,
  );

  setMermaidAutoEdit();

  const tr = state.tr.insert(insertPos, mermaidNode);
  const cursorPos = insertPos + 1;
  tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
  dispatch(tr.scrollIntoView());
  view.focus();
}

/**
 * 插入 math_block 节点。
 */
function insertAsLatex(view: EditorView, pos: number, text: string): void {
  const { state, dispatch } = view;
  const schema = state.schema;
  const mathBlock = schema.nodes.math_block;
  if (!mathBlock) {
    insertAfterBlock(view, pos, text);
    return;
  }

  let insertPos = pos;
  try {
    const $pos = state.doc.resolve(pos);
    insertPos = $pos.after($pos.depth);
  } catch {
    insertPos = pos;
  }

  const mathNode = mathBlock.create(
    { autoEdit: true },
    text.length > 0 ? [schema.text(text)] : undefined,
  );

  const tr = state.tr.insert(insertPos, mathNode);
  const cursorPos = insertPos + 1;
  tr.setSelection(TextSelection.near(tr.doc.resolve(cursorPos)));
  dispatch(tr.scrollIntoView());
  view.focus();
}

// ---------------------------------------------------------------------------
// 输出清理
// ---------------------------------------------------------------------------

function cleanOutput(mode: AiInsertMode, raw: string): string {
  let text = raw.trim();
  text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();

  if (mode === 'insert-as-latex') {
    text = text.replace(/^\${1,2}/, '').replace(/\${1,2}$/, '').trim();
  }

  return text;
}

// ---------------------------------------------------------------------------
// 错误分类与友好提示
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  no_key: '未配置 API Key，请前往 设置 -> AI 助手 填入 Key。',
  auth_failed: 'API Key 无效或已过期，请检查后重试。',
  rate_limit: '请求过于频繁，请稍候再试。',
  network: '网络连接失败，请检查网络后重试。',
  canceled: '',
};

function getErrorMessage(code: string, message: string): string {
  const friendly = ERROR_MESSAGES[code];
  if (friendly !== undefined) {
    return friendly || '操作已取消';
  }
  return `AI 生成失败：${message}`;
}

// ---------------------------------------------------------------------------
// AI 结果历史记录
// ---------------------------------------------------------------------------

function recordAiHistory(command: AiCommand, result: string, originalText?: string): void {
  useAiStore.getState().addHistory({
    commandId: command.id,
    commandLabel: command.label,
    result: result.slice(0, 500),
    originalText: originalText ? originalText.slice(0, 500) : undefined,
    timestamp: Date.now(),
  });
}

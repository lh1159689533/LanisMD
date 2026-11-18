/**
 * 对话输入区：参考内容、快捷操作、输入框、模型选择、发送 / 停止
 *
 * Enter 发送，Shift+Enter 换行；输入法组字期间的 Enter 不触发发送。
 *
 * @changelog
 * | 版本   | 变更说明                | 关联           |
 * | v1.0.0 | 初始实现：对话输入区 | REQ: AI 对话框 |
 * | v1.1.0 | 显示上下文用量       | REQ: AI 对话框 |
 * | v1.2.0 | 技能选择与 / 快速选择 | REQ: AI 技能   |
 * | v1.3.0 | 标签行内显示，紧跟其后输入 | REQ: AI 技能 |
 * | v1.4.0 | 输入框支持拖动调整高度       | REQ: AI 对话框 |
 * | v1.5.0 | 粘贴还原引用；任意位置键入 / 触发技能 | REQ: AI 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  RiArrowUpLine,
  RiCloseLine,
  RiFileTextLine,
  RiStopFill,
  RiTextBlock,
} from 'react-icons/ri';

import {
  AI_CHAT_ACTIONS,
  estimateDraftTokens,
  estimateTurnsTokens,
  toContextUsage,
} from '@/services/ai/chat';
import { sendChatMessage, stopChat } from '@/services/ai/chat-runner';
import { renderSkillsPrompt, resolveSkills } from '@/services/ai/skills';
import { useAiChatStore, type AiChatDraft } from '@/stores/ai-chat-store';
import { useAiStore } from '@/stores/ai-store';
import { useUIStore } from '@/stores/ui-store';
import type { AiChatActionId, AiChatAttachment, AiChatTurn, AiSkill } from '@/types/ai';
import { cn } from '@/utils/cn';

import { ContextMeter } from './ContextMeter';
import { matchCopiedTurn } from './chat-clipboard';
import { ModelSelect } from './ModelSelect';
import { SkillButton, SkillChip, SkillSlashMenu, filterSkills, useSkills } from './SkillPicker';

const EMPTY_DRAFT: AiChatDraft = { input: '', attachments: [] };
/** 自适应模式下输入框最大高度（px） */
const MAX_TEXTAREA_HEIGHT = 180;
/** 手动调整时输入框的最小高度（两行） */
const MIN_RESIZE_HEIGHT = 44;
/** 手动调整时输入框高度占对话面板的最大比例 */
const MAX_RESIZE_RATIO = 0.6;
/** 输入框行高（px），与标签高度对齐 */
const LINE_HEIGHT = 22;
/** 标签后剩余宽度小于该值时，文本另起一行 */
const MIN_TEXT_SPACE = 80;

/**
 * 计算行内标签之后文本的起始位置：
 * 标签绝对定位覆盖在输入框左上角，输入框通过 padding-top 跳过标签的整行、
 * 通过 text-indent 让首行文本紧跟最后一个标签，换行后从最左侧开始。
 */
function measureInlineOffset(chips: HTMLElement | null): { indent: number; top: number } {
  const last = chips?.lastElementChild as HTMLElement | null;
  if (!chips || !last) return { indent: 0, top: 0 };
  const indent = last.offsetLeft + last.offsetWidth + 8;
  if (chips.clientWidth - indent < MIN_TEXT_SPACE) {
    return { indent: 0, top: last.offsetTop + LINE_HEIGHT + 4 };
  }
  return { indent, top: last.offsetTop };
}

interface ChatComposerProps {
  conversationId: string;
  modelId: string;
  running: boolean;
  /** 对话消息（用于估算上下文用量） */
  turns: AiChatTurn[];
}

/** 参考内容标签 */
export function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: AiChatAttachment;
  onRemove?: () => void;
}) {
  const isDoc = attachment.kind === 'document';
  const preview = attachment.content.slice(0, 300);
  return (
    <span
      className="lanismd-ai-chat-chip"
      title={`${isDoc ? '整篇文档' : '选中片段'}（${attachment.content.length} 字）\n${preview}`}
    >
      {isDoc ? <RiFileTextLine size={12} /> : <RiTextBlock size={12} />}
      <span className="lanismd-ai-chat-chip-label">
        {isDoc ? attachment.fileName : `${attachment.fileName} · 片段`}
      </span>
      {onRemove && (
        <button
          type="button"
          className="lanismd-ai-chat-chip-remove"
          onClick={onRemove}
          title="移除"
        >
          <RiCloseLine size={12} />
        </button>
      )}
    </span>
  );
}

/** 光标处的「/检索词」 */
interface SlashToken {
  /** 「/」在输入中的位置 */
  start: number;
  /** 光标位置（检索词结束处） */
  end: number;
  query: string;
}

/**
 * 光标前紧邻「/检索词」且「/」位于开头或空白之后时视为技能快速选择。
 * 只看光标之前的文本，因此在已有内容的开头或中间键入「/」同样可以触发；
 * 「/」前紧跟其他字符（如 URL、路径中的 a/b）时不触发。
 */
function slashTokenAt(input: string, caret: number): SlashToken | null {
  const before = input.slice(0, caret);
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(before);
  if (!match) return null;
  return { start: caret - match[1].length - 1, end: caret, query: match[1] };
}

export function ChatComposer({ conversationId, modelId, running, turns }: ChatComposerProps) {
  const draft = useAiChatStore((s) => s.drafts[conversationId] ?? EMPTY_DRAFT);
  const setDraftInput = useAiChatStore((s) => s.setDraftInput);
  const removeAttachment = useAiChatStore((s) => s.removeAttachment);
  const addAttachment = useAiChatStore((s) => s.addAttachment);
  const setModel = useAiChatStore((s) => s.setModel);
  const setDraftSkills = useAiChatStore((s) => s.setDraftSkills);
  /** 设置本条消息启用的技能（发送后草稿清空，自动恢复为默认技能） */
  const setSkills = (id: string, ids: string[]) => setDraftSkills(id, ids);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const [inlineOffset, setInlineOffset] = useState({ indent: 0, top: 0 });

  // 技能：已启用列表 + 「/」快速选择
  const allSkills = useSkills();
  const draftSkillIds = draft.skillIds;
  const activeSkills = useMemo(
    () =>
      resolveSkills(
        draftSkillIds ?? allSkills.filter((s) => s.defaultEnabled).map((s) => s.id),
        allSkills,
      ),
    [draftSkillIds, allSkills],
  );
  const activeSkillIds = useMemo(() => activeSkills.map((s) => s.id), [activeSkills]);
  const skillsPrompt = useMemo(() => renderSkillsPrompt(activeSkills), [activeSkills]);
  const [caret, setCaret] = useState(0);
  const slashToken = slashTokenAt(draft.input, Math.min(caret, draft.input.length));
  const slashQuery = slashToken?.query ?? null;
  /** 检索词所在位置也纳入比对：同一检索词出现在不同位置时视为新的触发 */
  const slashKey = slashToken ? `${slashToken.start}:${slashToken.query}` : '';
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const slashItems = useMemo(
    () => (slashQuery === null ? [] : filterSkills(allSkills, slashQuery)),
    [allSkills, slashQuery],
  );
  const slashOpen = slashQuery !== null && !slashDismissed && allSkills.length > 0;

  // 检索词变化时重置高亮项与「已按 Esc 关闭」状态
  useEffect(() => {
    setSlashIndex(0);
    setSlashDismissed(false);
  }, [slashKey]);

  /** 记录光标位置（输入、点击、方向键移动都会触发 select 事件） */
  const syncCaret = (el: HTMLTextAreaElement) => setCaret(el.selectionStart ?? 0);

  /** 把文本中 [from, to) 替换为 insert，并把光标放到插入内容之后 */
  const replaceInput = (from: number, to: number, insert: string) => {
    const next = draft.input.slice(0, from) + insert + draft.input.slice(to);
    const pos = from + insert.length;
    setDraftInput(conversationId, next);
    setCaret(pos);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const pickSlashSkill = (skill: AiSkill) => {
    if (!activeSkillIds.includes(skill.id))
      setSkills(conversationId, [...activeSkillIds, skill.id]);
    // 只移除「/检索词」，保留输入框中的其他内容
    if (slashToken) replaceInput(slashToken.start, slashToken.end, '');
  };

  /** 粘贴从对话中复制的提问：还原技能、引用标签，正文插入到光标处 */
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const turn = matchCopiedTurn(e.clipboardData.getData('text/plain'));
    if (!turn) return;
    e.preventDefault();

    const ids =
      turn.skillIds ??
      (turn.skillNames ?? [])
        .map((name) => allSkills.find((s) => s.name === name)?.id)
        .filter((id): id is string => Boolean(id));
    const restored = ids.filter((id) => allSkills.some((s) => s.id === id));
    const merged = [...activeSkillIds, ...restored.filter((id) => !activeSkillIds.includes(id))];
    if (merged.length !== activeSkillIds.length) setSkills(conversationId, merged);

    for (const att of turn.attachments ?? []) {
      addAttachment(conversationId, { ...att, id: crypto.randomUUID() });
    }

    const el = e.currentTarget;
    replaceInput(el.selectionStart ?? 0, el.selectionEnd ?? 0, turn.content);
  };

  // 与 ModelSelect 相同的回退规则：所选模型 > 当前模型 > 第一个模型
  const contextLength = useAiStore((s) => {
    const profile =
      s.models.find((m) => m.id === modelId) ??
      s.models.find((m) => m.id === s.currentModelId) ??
      s.models[0];
    return profile ? profile.contextLength : undefined;
  });
  const hasModel = useAiStore((s) => s.models.length > 0);
  // 分开缓存：输入时只重新估算输入文本，不重复遍历历史消息与参考内容
  const turnsTokens = useMemo(
    () => estimateTurnsTokens(turns, skillsPrompt),
    [turns, skillsPrompt],
  );
  const attachmentTokens = useMemo(
    () => estimateDraftTokens('', draft.attachments),
    [draft.attachments],
  );
  const inputTokens = useMemo(() => estimateDraftTokens(draft.input, []), [draft.input]);
  const usage = toContextUsage(turnsTokens + attachmentTokens + inputTokens, contextLength);

  // 标签变化或输入框宽度变化时，重新计算文本起始位置
  const chipCount = activeSkills.length + draft.attachments.length;
  useLayoutEffect(() => {
    const chips = chipsRef.current;
    const update = () =>
      setInlineOffset((prev) => {
        const next = measureInlineOffset(chipsRef.current);
        return prev.indent === next.indent && prev.top === next.top ? prev : next;
      });
    update();
    if (!chips) return;
    const observer = new ResizeObserver(update);
    observer.observe(chips);
    return () => observer.disconnect();
  }, [chipCount, activeSkills, draft.attachments]);

  // 输入框高度：未手动调整时随内容增长（上限 MAX_TEXTAREA_HEIGHT）；
  // 拖动顶部手柄后固定为指定高度，内容超出时在框内滚动
  const inputHeight = useUIStore((s) => s.aiChatInputHeight);
  const setInputHeight = useUIStore((s) => s.setAiChatInputHeight);
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (inputHeight > 0) {
      el.style.height = `${inputHeight}px`;
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [draft.input, inlineOffset, inputHeight]);

  /** 拖动输入框顶部手柄调整高度：向上拖动变高 */
  const startResize = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = textareaRef.current;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = el.offsetHeight;
    const panel = el.closest('.lanismd-ai-chat-view') as HTMLElement | null;
    const maxHeight = Math.max(
      MIN_RESIZE_HEIGHT,
      (panel?.clientHeight ?? window.innerHeight) * MAX_RESIZE_RATIO,
    );
    let latest = startHeight;
    const onMove = (ev: MouseEvent) => {
      latest = Math.min(Math.max(startHeight + startY - ev.clientY, MIN_RESIZE_HEIGHT), maxHeight);
      // 拖动过程中直接改 DOM，结束时再写入 store，避免每帧触发渲染
      el.style.height = `${latest}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('lanismd-ai-chat-resizing');
      setInputHeight(latest);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.classList.add('lanismd-ai-chat-resizing');
  };

  /** 光标位于开头时按退格删除最后一个标签（与常见的标签输入框一致） */
  const removeLastChip = (): boolean => {
    const lastAttachment = draft.attachments[draft.attachments.length - 1];
    if (lastAttachment) {
      removeAttachment(conversationId, lastAttachment.id);
      return true;
    }
    const lastSkill = activeSkillIds[activeSkillIds.length - 1];
    if (lastSkill) {
      setSkills(conversationId, activeSkillIds.slice(0, -1));
      return true;
    }
    return false;
  };

  // 切换 Tab 或新增参考内容后聚焦输入框
  useEffect(() => {
    textareaRef.current?.focus();
  }, [conversationId, draft.attachments.length]);

  const send = useCallback(
    (actionId?: AiChatActionId) => {
      if (running) return;
      void sendChatMessage(conversationId, draft.input, actionId);
    },
    [conversationId, draft.input, running],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      const count = slashItems.length;
      if (e.key === 'ArrowDown' && count > 0) {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % count);
        return;
      }
      if (e.key === 'ArrowUp' && count > 0) {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + count) % count);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && count > 0) {
        e.preventDefault();
        pickSlashSkill(slashItems[Math.min(slashIndex, count - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }
    if (e.key === 'Backspace' && !e.nativeEvent.isComposing) {
      const el = e.currentTarget;
      if (el.selectionStart === 0 && el.selectionEnd === 0 && removeLastChip()) {
        e.preventDefault();
        return;
      }
    }
    // keyCode 229：WKWebView 中输入法确认候选词的 Enter 可能不带 isComposing
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    send();
  };

  const canSend = draft.input.trim().length > 0;

  return (
    <div className="lanismd-ai-chat-composer">
      <div className="lanismd-ai-chat-actions">
        {AI_CHAT_ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className="lanismd-ai-chat-action"
            disabled={running}
            onClick={() => send(action.id)}
            title={draft.input.trim() ? `${action.label}（附带输入框中的要求）` : action.label}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="lanismd-ai-chat-inputbox">
        <div
          className="lanismd-ai-chat-resizer"
          onMouseDown={startResize}
          onDoubleClick={() => setInputHeight(0)}
          title="拖动调整输入框高度，双击恢复自动高度"
        />
        {slashOpen && (
          <SkillSlashMenu
            items={slashItems}
            selectedIds={activeSkillIds}
            activeIndex={slashIndex}
            onPick={pickSlashSkill}
          />
        )}
        <div className="lanismd-ai-chat-editor">
          {chipCount > 0 && (
            <div ref={chipsRef} className="lanismd-ai-chat-editor-chips">
              {activeSkills.map((skill) => (
                <SkillChip
                  key={skill.id}
                  name={skill.name}
                  description={skill.description}
                  onRemove={() =>
                    setSkills(
                      conversationId,
                      activeSkillIds.filter((id) => id !== skill.id),
                    )
                  }
                />
              ))}
              {draft.attachments.map((att) => (
                <AttachmentChip
                  key={att.id}
                  attachment={att}
                  onRemove={() => removeAttachment(conversationId, att.id)}
                />
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="lanismd-ai-chat-textarea"
            rows={2}
            style={{
              textIndent: chipCount > 0 ? inlineOffset.indent : 0,
              paddingTop: chipCount > 0 ? inlineOffset.top : 0,
            }}
            value={draft.input}
            placeholder={
              draft.attachments.length > 0
                ? '针对参考内容提问…'
                : activeSkills.length > 0
                  ? '输入内容…'
                  : allSkills.length > 0
                    ? '输入问题，键入 / 选择技能，Enter 发送'
                    : '输入问题，Enter 发送，Shift+Enter 换行'
            }
            onChange={(e) => {
              setDraftInput(conversationId, e.target.value);
              syncCaret(e.target);
            }}
            onSelect={(e) => syncCaret(e.currentTarget)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="lanismd-ai-chat-inputbar">
          <div className="lanismd-ai-chat-inputbar-start">
            <ModelSelect
              value={modelId}
              onChange={(id) => setModel(conversationId, id)}
              disabled={running}
            />
            <SkillButton
              selectedIds={activeSkillIds}
              onChange={(ids) => setSkills(conversationId, ids)}
            />
          </div>
          <div className="lanismd-ai-chat-inputbar-end">
            {hasModel && <ContextMeter usage={usage} />}
            {running ? (
              <button
                type="button"
                className="lanismd-ai-chat-send is-stop"
                onClick={() => stopChat(conversationId)}
                title="停止生成"
              >
                <RiStopFill size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="lanismd-ai-chat-send"
                disabled={!canSend}
                onClick={() => send()}
                title="发送（Enter）"
              >
                <RiArrowUpLine size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

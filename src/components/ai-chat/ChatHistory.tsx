/**
 * 对话面板内的历史视图（打开时铺满对话区域，替代当前对话视图显示）
 *
 * 按天分组展示两类记录：
 * - 对话：AI 对话面板中的历史对话，点击在 Tab 中打开
 * - 指令：编辑器内的润色、翻译、解释、生成图表、公式等指令结果，点击展开详情，
 *   可「继续对话」把该记录转为一次新对话继续追问
 *
 * @changelog
 * | 版本   | 变更说明                                      | 关联           |
 * | v1.0.0 | 初始实现：替代原 AI 历史面板，按天分组历史 | REQ: AI 对话框 |
 * | v1.1.0 | 记录图标统一为 AI 图标，类型用标签区分；铺满对话视图 | REQ: AI 图标统一 |
 * | v1.2.0 | 打开时清理超过保存天数的记录                   | REQ: AI 历史按时间保存 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RiChat3Line,
  RiCloseLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiSearchLine,
} from 'react-icons/ri';

import { AiIcon } from '@/components/common/AiIcon';
import { useAiChatStore } from '@/stores/ai-chat-store';
import { useAiStore, type AiHistoryEntry } from '@/stores/ai-store';
import { useUIStore } from '@/stores/ui-store';
import type { AiChatActionId, AiChatTurn, AiConversation } from '@/types/ai';
import { cn } from '@/utils/cn';

import { formatClock, groupByDay } from './day-groups';

type HistoryFilter = 'all' | 'chat' | 'command';

const FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'chat', label: '对话' },
  { id: 'command', label: '指令' },
];

type HistoryItem =
  | { kind: 'chat'; id: string; time: number; conversation: AiConversation }
  | { kind: 'command'; id: string; time: number; entry: AiHistoryEntry };

/** 指令记录 id -> 对话快捷操作 */
const COMMAND_ACTIONS: Record<string, AiChatActionId> = {
  polish: 'polish',
  translate: 'translate',
  explain: 'explain',
  mermaid: 'mermaid',
  latex: 'latex',
};

/** 生成图表 / 公式记录的 originalText 是用户输入的描述，而非选中原文 */
function isDescriptionCommand(commandId: string): boolean {
  return commandId === 'mermaid' || commandId === 'latex';
}

/** 列表预览：去掉常见 Markdown 标记后截断 */
function preview(text: string, max = 80): string {
  const cleaned = text
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/[*_`>#|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function matches(item: HistoryItem, keyword: string): boolean {
  if (!keyword) return true;
  const k = keyword.toLowerCase();
  if (item.kind === 'chat') {
    const { conversation: c } = item;
    return (
      c.title.toLowerCase().includes(k) || c.turns.some((t) => t.content.toLowerCase().includes(k))
    );
  }
  const { entry: e } = item;
  return [e.commandLabel, e.result, e.originalText ?? ''].some((s) => s.toLowerCase().includes(k));
}

/** 把指令记录转为对话消息 */
function turnsFromCommand(entry: AiHistoryEntry): AiChatTurn[] {
  const now = Date.now();
  const original = entry.originalText ?? '';
  const describe = isDescriptionCommand(entry.commandId);
  const actionId = COMMAND_ACTIONS[entry.commandId];
  const user: AiChatTurn = {
    id: crypto.randomUUID(),
    role: 'user',
    content: describe ? original : actionId ? '' : entry.commandLabel,
    actionId,
    attachments:
      !describe && original
        ? [
            {
              id: crypto.randomUUID(),
              kind: 'selection',
              fileName: '指令记录',
              filePath: null,
              content: original,
            },
          ]
        : undefined,
    createdAt: entry.timestamp,
  };
  const assistant: AiChatTurn = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: entry.result,
    status: 'done',
    createdAt: now,
  };
  return [user, assistant];
}

function ChatHistoryItem({
  conversation,
  active,
}: {
  conversation: AiConversation;
  active: boolean;
}) {
  const openConversation = useAiChatStore((s) => s.openConversation);
  const setHistoryOpen = useAiChatStore((s) => s.setHistoryOpen);
  const deleteConversation = useAiChatStore((s) => s.deleteConversation);
  const running = useAiChatStore((s) => Boolean(s.runningIds[conversation.id]));
  const lastReply = [...conversation.turns].reverse().find((t) => t.role === 'assistant');

  return (
    <div
      className={cn('lanismd-ai-chat-history-item', active && 'is-active')}
      onClick={() => {
        openConversation(conversation.id);
        setHistoryOpen(false);
      }}
    >
      <div className="lanismd-ai-chat-history-item-head">
        <AiIcon size={14} className="lanismd-ai-chat-history-icon" />
        <span className="lanismd-ai-chat-history-badge is-chat">对话</span>
        <span className="lanismd-ai-chat-history-item-title">{conversation.title}</span>
        <span className="lanismd-ai-chat-history-item-time">
          {formatClock(conversation.updatedAt)}
        </span>
      </div>
      {lastReply?.content && (
        <div className="lanismd-ai-chat-history-item-preview">{preview(lastReply.content)}</div>
      )}
      {!running && (
        <button
          type="button"
          className="lanismd-ai-chat-history-item-delete"
          title="删除对话"
          onClick={(e) => {
            e.stopPropagation();
            deleteConversation(conversation.id);
          }}
        >
          <RiDeleteBinLine size={12} />
        </button>
      )}
    </div>
  );
}

function CommandHistoryItem({ entry }: { entry: AiHistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const removeHistory = useAiStore((s) => s.removeHistory);
  const createConversationWithTurns = useAiChatStore((s) => s.createConversationWithTurns);
  const describe = isDescriptionCommand(entry.commandId);

  const continueChat = () => {
    const title = `${entry.commandLabel}：${preview(entry.originalText || entry.result, 16)}`;
    createConversationWithTurns(title, turnsFromCommand(entry));
  };

  const copyResult = () => {
    void navigator.clipboard.writeText(entry.result).then(() => {
      useUIStore.getState().addToast({ type: 'success', message: '已复制结果', duration: 1500 });
    });
  };

  return (
    <div
      className={cn('lanismd-ai-chat-history-item is-command', expanded && 'is-expanded')}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="lanismd-ai-chat-history-item-head">
        <AiIcon size={14} className="lanismd-ai-chat-history-icon" />
        <span className="lanismd-ai-chat-history-badge">{entry.commandLabel}</span>
        <span className="lanismd-ai-chat-history-item-title">
          {preview(entry.originalText || entry.result, 40)}
        </span>
        <span className="lanismd-ai-chat-history-item-time">{formatClock(entry.timestamp)}</span>
      </div>
      {!expanded && (
        <div className="lanismd-ai-chat-history-item-preview">{preview(entry.result)}</div>
      )}
      {expanded && (
        <div className="lanismd-ai-chat-history-detail" onClick={(e) => e.stopPropagation()}>
          {entry.originalText && (
            <>
              <div className="lanismd-ai-chat-history-detail-label">
                {describe ? '描述' : '原文'}
              </div>
              <div className="lanismd-ai-chat-history-detail-text">{entry.originalText}</div>
            </>
          )}
          <div className="lanismd-ai-chat-history-detail-label">结果</div>
          <div className="lanismd-ai-chat-history-detail-text">{entry.result}</div>
          <div className="lanismd-ai-chat-history-detail-actions">
            <button type="button" onClick={continueChat}>
              <RiChat3Line size={12} />
              继续对话
            </button>
            <button type="button" onClick={copyResult}>
              <RiFileCopyLine size={12} />
              复制结果
            </button>
            <button type="button" className="is-danger" onClick={() => removeHistory(entry.id)}>
              <RiDeleteBinLine size={12} />
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatHistory() {
  const conversations = useAiChatStore((s) => s.conversations);
  const activeId = useAiChatStore((s) => s.activeId);
  const setHistoryOpen = useAiChatStore((s) => s.setHistoryOpen);
  const clearConversations = useAiChatStore((s) => s.clearConversations);
  const commandHistory = useAiStore((s) => s.history);
  const clearCommandHistory = useAiStore((s) => s.clearHistory);

  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  // 应用可能长时间不重启，打开历史视图时清理一次已过期的记录
  useEffect(() => {
    useAiChatStore.getState().pruneExpired();
    useAiStore.getState().pruneHistory();
  }, []);

  const groups = useMemo(() => {
    const items: HistoryItem[] = [];
    if (filter !== 'command') {
      for (const c of conversations) {
        if (c.turns.length > 0)
          items.push({ kind: 'chat', id: c.id, time: c.updatedAt, conversation: c });
      }
    }
    if (filter !== 'chat') {
      for (const e of commandHistory)
        items.push({ kind: 'command', id: e.id, time: e.timestamp, entry: e });
    }
    const k = keyword.trim();
    return groupByDay(
      items.filter((item) => matches(item, k)),
      (item) => item.time,
    );
  }, [conversations, commandHistory, filter, keyword]);

  const isEmpty = groups.length === 0;

  // 二次确认：首次点击进入确认态，3 秒内再次点击才清空
  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      confirmTimer.current = setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmClear(false);
    if (filter !== 'command') clearConversations();
    if (filter !== 'chat') clearCommandHistory();
  };

  return (
    <div className="lanismd-ai-chat-history">
      <div className="lanismd-ai-chat-history-header">
        <span className="lanismd-ai-chat-history-title">历史记录</span>
        <button
          type="button"
          className="lanismd-ai-chat-icon-btn"
          title="返回对话"
          onClick={() => setHistoryOpen(false)}
        >
          <RiCloseLine size={15} />
        </button>
      </div>

      <div className="lanismd-ai-chat-history-tools">
        <div className="lanismd-ai-chat-history-filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={cn('lanismd-ai-chat-history-filter', filter === f.id && 'is-active')}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="lanismd-ai-chat-history-search">
          <RiSearchLine size={13} />
          <input
            value={keyword}
            placeholder="搜索历史"
            onChange={(e) => setKeyword(e.target.value)}
          />
        </label>
      </div>

      <div className="lanismd-ai-chat-history-body">
        {isEmpty ? (
          <div className="lanismd-ai-chat-history-empty">
            {keyword ? '没有匹配的记录' : '暂无历史记录'}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="lanismd-ai-chat-history-group">
              <div className="lanismd-ai-chat-history-group-label">{group.label}</div>
              {group.items.map((item) =>
                item.kind === 'chat' ? (
                  <ChatHistoryItem
                    key={item.id}
                    conversation={item.conversation}
                    active={item.id === activeId}
                  />
                ) : (
                  <CommandHistoryItem key={item.id} entry={item.entry} />
                ),
              )}
            </div>
          ))
        )}
      </div>

      {!isEmpty && !keyword && (
        <div className="lanismd-ai-chat-history-footer">
          <button
            type="button"
            className={cn('lanismd-ai-chat-history-clear', confirmClear && 'is-confirm')}
            onClick={handleClear}
          >
            <RiDeleteBinLine size={12} />
            {confirmClear ? '再次点击确认清空' : filter === 'all' ? '清空全部历史' : '清空当前分类'}
          </button>
        </div>
      )}
    </div>
  );
}

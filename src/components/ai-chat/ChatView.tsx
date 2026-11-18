/**
 * 单个对话视图：消息列表 + 输入区
 *
 * 生成过程中若用户停留在底部则自动跟随滚动；用户向上翻阅时不打断。
 *
 * @changelog
 * | 版本   | 变更说明              | 关联           |
 * | v1.0.0 | 初始实现：对话视图 | REQ: AI 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { useEffect, useLayoutEffect, useRef } from 'react';

import { AiIcon } from '@/components/common/AiIcon';
import { useAiChatStore } from '@/stores/ai-chat-store';
import type { AiConversation } from '@/types/ai';

import { ChatComposer } from './ChatComposer';
import { ChatMessage } from './ChatMessage';

/** 距底部小于该值视为「停留在底部」 */
const STICK_THRESHOLD = 48;

function EmptyState() {
  return (
    <div className="lanismd-ai-chat-empty">
      <AiIcon size={32} />
      <div className="lanismd-ai-chat-empty-title">有什么可以帮你？</div>
      <ul className="lanismd-ai-chat-empty-tips">
        <li>在文档中选中内容，右键「添加到 AI 对话」</li>
        <li>未选中时右键可「添加当前文档到 AI 对话」</li>
        <li>添加后可直接提问，或使用翻译、解释、润色等快捷操作</li>
        <li>点击「技能」或键入 / 为本条消息启用自定义技能</li>
      </ul>
    </div>
  );
}

export function ChatView({ conversation }: { conversation: AiConversation }) {
  const running = useAiChatStore((s) => Boolean(s.runningIds[conversation.id]));
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  };

  // 切换对话时滚动到底部
  useEffect(() => {
    stickRef.current = true;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation.id]);

  // 内容增长时跟随到底部
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [conversation.turns]);

  const { turns } = conversation;

  return (
    <div className="lanismd-ai-chat-view">
      <div ref={listRef} className="lanismd-ai-chat-list" onScroll={handleScroll}>
        {turns.length === 0 ? (
          <EmptyState />
        ) : (
          turns.map((turn, i) => (
            <ChatMessage
              key={turn.id}
              conversationId={conversation.id}
              turn={turn}
              isLast={i === turns.length - 1}
              running={running}
            />
          ))
        )}
      </div>
      <ChatComposer
        conversationId={conversation.id}
        modelId={conversation.modelId}
        running={running}
        turns={turns}
      />
    </div>
  );
}

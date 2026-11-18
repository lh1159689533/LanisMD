/**
 * 对话消息
 *
 * - 用户消息：参考内容标签 + 快捷操作标签 + 输入内容
 * - 助手消息：Markdown 回复；思考过程可折叠；底部为模型、用量与操作
 *   （复制 / 插入到文档 / 替换选区 / 重新生成）
 *
 * @changelog
 * | 版本   | 变更说明              | 关联           |
 * | v1.0.0 | 初始实现：对话消息 | REQ: AI 对话框 |
 * | v1.1.0 | 提问行内展示标签；回复展示技能与思考过程步骤 | REQ: AI 技能 |
 * /@changelog
 *
 * @author hhhuilli
 */

import { memo, useState } from 'react';
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiFileCopyLine,
  RiFlashlightLine,
  RiLightbulbLine,
  RiInputCursorMove,
  RiRefreshLine,
  RiReplyLine,
} from 'react-icons/ri';

import { AiIcon } from '@/components/common/AiIcon';
import { writeChatResultToEditor } from '@/editor/plugins/ai-edit';
import { formatUserTurnForCopy, getChatAction } from '@/services/ai/chat';
import { regenerateLastReply } from '@/services/ai/chat-runner';
import { formatTokenUsage } from '@/services/ai/usage';
import type { AiChatTurn } from '@/types/ai';

import { AttachmentChip } from './ChatComposer';
import { copyUserTurn } from './chat-clipboard';
import { formatClock } from './day-groups';
import { SkillChip, useSkills } from './SkillPicker';
import { ChatMarkdown } from './ChatMarkdown';

interface ChatMessageProps {
  conversationId: string;
  turn: AiChatTurn;
  /** 是否为最后一条消息（仅最后一条回复可重新生成） */
  isLast: boolean;
  /** 对话是否正在生成 */
  running: boolean;
}

function UserMessage({ turn }: { turn: AiChatTurn }) {
  const action = getChatAction(turn.actionId);
  const skills = useSkills();
  const [copied, setCopied] = useState(false);

  // 技能、引用、快捷操作与正文一起复制
  const copyText = formatUserTurnForCopy(turn);
  const copy = () => {
    // 同时记住原消息：粘贴回对话输入框时还原技能与引用标签
    void copyUserTurn(turn, copyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="lanismd-ai-chat-msg is-user">
      {/* 技能、参考内容、快捷操作与文本在同一段落中行内排列，与输入时一致 */}
      <div className="lanismd-ai-chat-bubble">
        {turn.skillNames?.map((name) => (
          <SkillChip
            key={`skill-${name}`}
            name={name}
            description={skills.find((s) => s.name === name)?.description}
          />
        ))}
        {turn.attachments?.map((att) => (
          <AttachmentChip key={att.id} attachment={att} />
        ))}
        {action && <span className="lanismd-ai-chat-action-tag">{action.label}</span>}
        {turn.content}
      </div>
      <div className="lanismd-ai-chat-user-footer">
        <span>{formatClock(turn.createdAt)}</span>
        {copyText && (
          <button type="button" onClick={copy} title="复制（含技能与引用）">
            {copied ? <RiCheckLine size={13} /> : <RiFileCopyLine size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

/** 思考耗时文案 */
function formatDuration(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** 回复的处理过程：使用的技能 + 思考过程，均可折叠 */
function ProcessSteps({ turn, hasContent }: { turn: AiChatTurn; hasContent: boolean }) {
  const skills = useSkills();
  const [showSkills, setShowSkills] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const streaming = turn.status === 'streaming';
  const skillNames = turn.skillNames ?? [];
  if (skillNames.length === 0 && !turn.reasoning) return null;

  let reasoningLabel = '思考过程';
  if (streaming && !hasContent) reasoningLabel = '思考中…';
  else if (turn.reasoningMs) reasoningLabel = `已思考 ${formatDuration(turn.reasoningMs)}`;

  return (
    <div className="lanismd-ai-chat-steps">
      {skillNames.length > 0 && (
        <div className="lanismd-ai-chat-step">
          <button
            type="button"
            className="lanismd-ai-chat-step-toggle"
            onClick={() => setShowSkills((v) => !v)}
          >
            <RiFlashlightLine size={13} className="lanismd-ai-chat-step-icon is-skill" />
            <span>使用技能</span>
            <span className="lanismd-ai-chat-step-name">{skillNames.join('、')}</span>
            {showSkills ? <RiArrowDownSLine size={14} /> : <RiArrowRightSLine size={14} />}
          </button>
          {showSkills && (
            <div className="lanismd-ai-chat-step-detail">
              {skillNames.map((name) => {
                const skill = skills.find((s) => s.name === name);
                return (
                  <div key={name} className="lanismd-ai-chat-step-skill">
                    <span className="lanismd-ai-chat-step-skill-name">{name}</span>
                    <span>{skill ? skill.description || '（无说明）' : '（技能已删除）'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {turn.reasoning && (
        <div className="lanismd-ai-chat-step">
          <button
            type="button"
            className="lanismd-ai-chat-step-toggle"
            onClick={() => setShowReasoning((v) => !v)}
          >
            <RiLightbulbLine size={13} className="lanismd-ai-chat-step-icon" />
            <span>{reasoningLabel}</span>
            {showReasoning ? <RiArrowDownSLine size={14} /> : <RiArrowRightSLine size={14} />}
          </button>
          {showReasoning && <div className="lanismd-ai-chat-reasoning-text">{turn.reasoning}</div>}
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ conversationId, turn, isLast, running }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const streaming = turn.status === 'streaming';
  const hasContent = turn.content.trim().length > 0;

  const copy = () => {
    void navigator.clipboard.writeText(turn.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="lanismd-ai-chat-msg is-assistant">
      <div className="lanismd-ai-chat-avatar">
        <AiIcon size={16} />
      </div>
      <div className="lanismd-ai-chat-assistant-body">
        <ProcessSteps turn={turn} hasContent={hasContent} />

        {hasContent && <ChatMarkdown content={turn.content} streaming={streaming} />}
        {streaming && !hasContent && !turn.reasoning && !turn.skillNames?.length && (
          <div className="lanismd-ai-chat-pending">正在生成…</div>
        )}
        {turn.status === 'error' && (
          <div className="lanismd-ai-chat-error">{turn.error ?? '生成失败'}</div>
        )}
        {turn.status === 'canceled' && <div className="lanismd-ai-chat-canceled">已停止生成</div>}

        {!streaming && (
          <div className="lanismd-ai-chat-msg-footer">
            <span className="lanismd-ai-chat-msg-meta">
              {turn.modelName}
              {turn.usage && ` · ${formatTokenUsage(turn.usage)}`}
            </span>
            <span className="lanismd-ai-chat-msg-tools">
              {hasContent && (
                <>
                  <button type="button" onClick={copy} title="复制">
                    {copied ? <RiCheckLine size={13} /> : <RiFileCopyLine size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => writeChatResultToEditor(turn.content, 'insert')}
                    title="插入到文档（光标所在段落之后）"
                  >
                    <RiInputCursorMove size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => writeChatResultToEditor(turn.content, 'replace')}
                    title="替换文档中的选中内容（无选中时插入到光标处）"
                  >
                    <RiReplyLine size={13} />
                  </button>
                </>
              )}
              {isLast && !running && (
                <button
                  type="button"
                  onClick={() => void regenerateLastReply(conversationId)}
                  title="重新生成"
                >
                  <RiRefreshLine size={13} />
                </button>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage(props: ChatMessageProps) {
  return props.turn.role === 'user' ? (
    <UserMessage turn={props.turn} />
  ) : (
    <AssistantMessage {...props} />
  );
});

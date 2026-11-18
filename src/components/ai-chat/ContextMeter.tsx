/**
 * 上下文用量指示器：环形进度 + 悬停提示「31.9% · 318.6K / 1000.0K 上下文已使用」
 *
 * 用量包含已发送的消息与输入区中待发送的内容（输入文本 + 参考内容）。
 * 超过 80% 显示警示色，超过 100% 显示危险色并提示较早的消息将被省略。
 *
 * @changelog
 * | 版本   | 变更说明                    | 关联           |
 * | v1.0.0 | 初始实现：上下文用量指示器 | REQ: AI 对话框 |
 * /@changelog
 *
 * @author hhhuilli
 */

import type { ChatContextUsage } from '@/services/ai/chat';
import { cn } from '@/utils/cn';

/** 环形半径与周长 */
const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 警示阈值 */
const WARN_RATIO = 0.8;

/** 格式化为 K（一位小数），与常见模型窗口的标注方式一致 */
function formatK(tokens: number): string {
  return `${(tokens / 1000).toFixed(1)}K`;
}

export function ContextMeter({ usage }: { usage: ChatContextUsage }) {
  const ratio = usage.limit > 0 ? usage.used / usage.limit : 0;
  const level = ratio >= 1 ? 'is-danger' : ratio >= WARN_RATIO ? 'is-warn' : '';
  const offset = CIRCUMFERENCE * (1 - Math.min(ratio, 1));
  const summary = `${(ratio * 100).toFixed(1)}% · ${formatK(usage.used)} / ${formatK(usage.limit)} 上下文已使用`;

  return (
    <div className={cn('lanismd-ai-chat-context', level)} aria-label={summary}>
      <svg width="18" height="18" viewBox="0 0 18 18" className="lanismd-ai-chat-context-ring">
        <circle cx="9" cy="9" r={RADIUS} className="lanismd-ai-chat-context-track" />
        <circle
          cx="9"
          cy="9"
          r={RADIUS}
          className="lanismd-ai-chat-context-bar"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 9 9)"
        />
      </svg>
      <div className="lanismd-ai-chat-context-tip" role="tooltip">
        <div>{summary}</div>
        {ratio >= 1 && (
          <div className="lanismd-ai-chat-context-tip-sub">
            已超出上下文窗口，较早的消息将不会发送
          </div>
        )}
        {!usage.limitDeclared && (
          <div className="lanismd-ai-chat-context-tip-sub">
            模型未声明上下文长度，按 {formatK(usage.limit)} 估算
          </div>
        )}
      </div>
    </div>
  );
}

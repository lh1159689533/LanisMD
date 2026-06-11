/**
 * AI 渐变图标组件
 *
 * 使用蓝紫粉渐变文字 "AI"，与 slash-menu 中的 AI 入口图标保持视觉一致。
 * 统一用于所有 AI 相关的图标展示位置。
 */

interface AiGradientIconProps {
  /** 图标尺寸（宽高一致），默认 14 */
  size?: number;
  /** 额外 className */
  className?: string;
}

/** 渐变 ID 计数器，确保同页面多个实例不冲突 */
let gradientIdCounter = 0;

export function AiGradientIcon({ size = 14, className }: AiGradientIconProps) {
  const gradientId = `lanismd-ai-grad-${gradientIdCounter++}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <text
        x="12"
        y="13"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="system-ui, -apple-system, Segoe UI, sans-serif"
        fontSize="22"
        fontWeight="600"
        fill={`url(#${gradientId})`}
        letterSpacing="-0.5"
      >
        AI
      </text>
    </svg>
  );
}
